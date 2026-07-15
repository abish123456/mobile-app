import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../lib/db";
import { getTodayIST, getNowIST } from "../../../../../lib/timezone";
import { logAction } from "../../../../../lib/audit";
import { optimizeRoute, RouteStop } from "../../../../../lib/route-optimizer";
import { authenticateDelivery } from "../../../../../lib/delivery-auth";
import crypto from "crypto";

// Helper: get today's effective shift start time from SystemConfig
async function getShiftStartTime(): Promise<{ hour: number; minute: number; displayTime: string }> {
    const configRes = await query<{ key: string; value: string }>(
        `SELECT "key", "value" FROM "SystemConfig"
         WHERE "key" IN ('SHIFT_START_HOUR', 'SHIFT_START_MINUTE', 'SHIFT_START_OVERRIDE_DATE', 'SHIFT_START_OVERRIDE_HOUR', 'SHIFT_START_OVERRIDE_MINUTE')`
    );
    const cfg: Record<string, string> = {};
    configRes.rows.forEach(r => { cfg[r.key] = r.value; });

    const todayIST = getTodayIST(); // "YYYY-MM-DD"
    let hour = parseInt(cfg['SHIFT_START_HOUR'] || '8');
    let minute = parseInt(cfg['SHIFT_START_MINUTE'] || '0');

    // Check if there's a today-specific override
    if (cfg['SHIFT_START_OVERRIDE_DATE'] === todayIST && cfg['SHIFT_START_OVERRIDE_HOUR'] !== '') {
        hour = parseInt(cfg['SHIFT_START_OVERRIDE_HOUR']);
        minute = parseInt(cfg['SHIFT_START_OVERRIDE_MINUTE'] || '0');
    }

    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    const displayTime = `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
    return { hour, minute, displayTime };
}

export async function POST(req: NextRequest) {
    try {
        const user = authenticateDelivery(req);
        if (!user?.deliveryBoyId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }
        const { deliveryBoyId } = user;

        // 1. Check shift start time gate
        const { hour, minute, displayTime } = await getShiftStartTime();
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const nowHour = nowIST.getHours();
        const nowMinute = nowIST.getMinutes();
        const canStart = nowHour > hour || (nowHour === hour && nowMinute >= minute);

        if (!canStart) {
            return NextResponse.json(
                { success: false, message: `Shift is not open yet. It opens at ${displayTime}.`, shiftStartTime: displayTime },
                { status: 403 }
            );
        }

        // 2. Find today's Route(s) for this delivery boy
        const todayIST = getTodayIST();
        const routeRes = await query<{
            routeId: string;
            routeShiftId: string | null;
            shiftStatus: string | null;
            serviceRouteName: string;
            deliveryBoyName: string;
        }>(
            `SELECT r."id" as "routeId", rs."id" as "routeShiftId", rs."status" as "shiftStatus", sr."name" as "serviceRouteName", db."name" as "deliveryBoyName"
             FROM "Route" r
             INNER JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
             INNER JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
             LEFT JOIN "RouteShift" rs ON rs."routeId" = r."id"
             WHERE r."deliveryBoyId" = $1
               AND (r."date" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
            [deliveryBoyId, todayIST]
        );

        // Body may specify which routeId to start (for multi-route staff)
        const body = await req.json().catch(() => ({}));
        const targetRouteId = body.routeId;
        const coworkers = body.coworkers;

        const targetRoute = targetRouteId
            ? routeRes.rows.find(r => r.routeId === targetRouteId)
            : routeRes.rows[0];

        if (!targetRoute) {
            return NextResponse.json({ success: false, message: "No route found for today." }, { status: 404 });
        }

        if (!targetRoute.routeShiftId) {
            return NextResponse.json({ success: false, message: "Route shift record not found. Please contact admin." }, { status: 404 });
        }

        if (targetRoute.shiftStatus !== 'NOT_STARTED') {
            return NextResponse.json(
                { success: false, message: `Shift is already ${targetRoute.shiftStatus}.` },
                { status: 400 }
            );
        }

        const { routeId, routeShiftId } = targetRoute;

        // 3. Auto-optimize pending orders
        const ordersRes = await query<{ id: string; orderNumber: string; latitude: number | null; longitude: number | null; sequence: number }>(
            `SELECT ro."id", o."orderNumber", a."latitude", a."longitude", ro."sequence"
             FROM "RouteOrder" ro
             JOIN "Order" o ON o."id" = ro."orderId"
             JOIN "Address" a ON a."id" = o."addressId"
             WHERE ro."routeId" = $1
               AND ro."deliveryStatus" = 'PENDING'
               AND o."status" != 'CANCELLED'`,
            [routeId]
        );

        const pendingWithGps = ordersRes.rows.filter(o => o.latitude !== null && o.longitude !== null);

        if (pendingWithGps.length > 0) {
            const configRes = await query<{ value: string }>(`SELECT value FROM "SystemConfig" WHERE key = 'HUB_LOCATION'`);
            let baseLocation = { lat: pendingWithGps[0].latitude!, lng: pendingWithGps[0].longitude! };
            if (configRes.rows.length > 0) {
                try {
                    const parsed = JSON.parse(configRes.rows[0].value);
                    if (parsed?.lat && parsed?.lng) baseLocation = { lat: parsed.lat, lng: parsed.lng };
                } catch { /* use first order as fallback */ }
            }

            const stops: RouteStop[] = pendingWithGps.map(o => ({
                id: o.id,
                orderNumber: o.orderNumber,
                lat: o.latitude!,
                lng: o.longitude!
            }));

            try {
                const optimizedStops = await optimizeRoute(baseLocation, stops);
                await withTransaction(async (client) => {
                    for (let i = 0; i < optimizedStops.length; i++) {
                        await client.query(
                            `UPDATE "RouteOrder" SET "sequence" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
                            [i + 1, optimizedStops[i].id]
                        );
                    }
                    await client.query(
                        `UPDATE "Route" SET "isAutoOptimized" = true, "updatedAt" = NOW() WHERE "id" = $1`,
                        [routeId]
                    );
                });

                // Log auto-optimisation in ShiftLog (before shift is ACTIVE, so we log after)
                await query(
                    `INSERT INTO "ShiftLog" ("id", "routeShiftId", "action", "actorId", "actorType", "metadata", "createdAt")
                     VALUES ($1, $2, 'AUTO_OPTIMISED', $3, 'SYSTEM', $4, NOW())`,
                    [
                        crypto.randomUUID(),
                        routeShiftId,
                        deliveryBoyId,
                        JSON.stringify({ optimizedCount: optimizedStops.length })
                    ]
                );
            } catch (optErr) {
                console.error("[StartShift] Auto-optimize failed, continuing without optimization:", optErr);
            }
        }

        // 4. Set all pending orders to OUT_FOR_DELIVERY
        const updateRes = await query<{ id: string }>(
            `UPDATE "Order" SET "status" = 'OUT_FOR_DELIVERY', "updatedAt" = NOW()
             WHERE "id" IN (
               SELECT o."id" FROM "RouteOrder" ro
               JOIN "Order" o ON o."id" = ro."orderId"
               WHERE ro."routeId" = $1 AND ro."deliveryStatus" = 'PENDING' AND o."status" != 'CANCELLED'
             ) RETURNING "id"`,
            [routeId]
        );

        if (updateRes.rows.length > 0) {
            for (const row of updateRes.rows) {
                await query(
                    `INSERT INTO "OrderActivityLog" ("id", "orderId", "action", "description", "metadata", "createdAt")
                     VALUES ($1, $2, 'OUT_FOR_DELIVERY', 'Order is out for delivery. Shift started.', $3, $4)`,
                    [crypto.randomUUID(), row.id, JSON.stringify({ serviceRoute: targetRoute.serviceRouteName, deliveryBoy: targetRoute.deliveryBoyName }), new Date()]
                );

                logAction({
                    actorId: deliveryBoyId,
                    actorType: 'DELIVERY_BOY',
                    entity: 'ORDER',
                    entityId: row.id,
                    action: 'STATUS_CHANGE',
                    newData: { 
                        status: 'OUT_FOR_DELIVERY',
                        serviceRoute: targetRoute.serviceRouteName,
                        deliveryBoy: targetRoute.deliveryBoyName 
                    },
                    description: `Order status changed to OUT FOR DELIVERY (Shift started)`
                });
            }
        }

        // 5. Update RouteShift → ACTIVE
        await query(
            `UPDATE "RouteShift" SET "status" = 'ACTIVE', "startedAt" = NOW(), "coworkers" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
            [routeShiftId, coworkers ? JSON.stringify(coworkers) : null]
        );

        // 6. Log to ShiftLog + AuditLog
        await query(
            `INSERT INTO "ShiftLog" ("id", "routeShiftId", "action", "actorId", "actorType", "createdAt")
             VALUES ($1, $2, 'START_SHIFT', $3, 'DELIVERY_BOY', NOW())`,
            [crypto.randomUUID(), routeShiftId, deliveryBoyId]
        );

        logAction({
            actorId: deliveryBoyId,
            actorType: 'DELIVERY_BOY',
            entity: 'ROUTE_SHIFT',
            entityId: routeShiftId,
            action: 'START_SHIFT',
            newData: { status: 'ACTIVE', routeId },
            description: `Delivery staff started shift for route: ${targetRoute.serviceRouteName}`
        });

        return NextResponse.json({
            success: true,
            message: "Shift started. Orders are optimised and out for delivery.",
            shiftStatus: 'ACTIVE'
        });

    } catch (error) {
        console.error("Error in POST /api/delivery/shift/start:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
