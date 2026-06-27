import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../../lib/db";
import { getAdminIdFromRequest } from "../../../../../../lib/admin-auth";
import { optimizeRoute, RouteStop } from "../../../../../../lib/route-optimizer";
import { logAction } from "../../../../../../lib/audit";
import crypto from "crypto";

/**
 * POST /api/admin/routes/[id]/re-optimize
 * Admin re-optimises the delivery sequence for a route that is currently PAUSED.
 * Allowed only when shift is PAUSED (so staff is not mid-delivery).
 */
export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
    const adminId = await getAdminIdFromRequest(req);
    if (!adminId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

        const routeId = params.id;

        // 1. Verify the route exists and its RouteShift status
        const routeRes = await query<{ id: string; shiftStatus: string | null; routeShiftId: string | null; serviceRouteName: string }>(
            `SELECT r."id", rs."status" as "shiftStatus", rs."id" as "routeShiftId", sr."name" as "serviceRouteName"
             FROM "Route" r
             LEFT JOIN "RouteShift" rs ON rs."routeId" = r."id"
             INNER JOIN "ServiceRoute" sr ON sr."id" = r."serviceRouteId"
             WHERE r."id" = $1`,
            [routeId]
        );

        if (routeRes.rows.length === 0) {
            return NextResponse.json({ success: false, message: "Route not found." }, { status: 404 });
        }

        const { shiftStatus, routeShiftId, serviceRouteName } = routeRes.rows[0];

        // Only allow re-optimisation when shift is PAUSED (staff is stationary)
        if (shiftStatus !== 'PAUSED') {
            return NextResponse.json(
                {
                    success: false,
                    message: shiftStatus
                        ? `Re-optimisation is only allowed when the shift is PAUSED. Current status: ${shiftStatus}.`
                        : "This route does not have a shift record. Use the standard Optimise Route button."
                },
                { status: 400 }
            );
        }

        // 2. Fetch pending orders with GPS coordinates
        const ordersRes = await query<{ id: string; orderNumber: string; latitude: number | null; longitude: number | null }>(
            `SELECT ro."id", o."orderNumber", a."latitude", a."longitude"
             FROM "RouteOrder" ro
             JOIN "Order" o ON o."id" = ro."orderId"
             JOIN "Address" a ON a."id" = o."addressId"
             WHERE ro."routeId" = $1
               AND ro."deliveryStatus" = 'PENDING'
               AND o."status" != 'CANCELLED'`,
            [routeId]
        );

        const withGps = ordersRes.rows.filter(o => o.latitude !== null && o.longitude !== null);

        if (withGps.length < 2) {
            return NextResponse.json(
                { success: false, message: "Not enough pending orders with GPS coordinates to optimise." },
                { status: 400 }
            );
        }

        // 3. Get hub location from SystemConfig
        const configRes = await query<{ value: string }>(`SELECT value FROM "SystemConfig" WHERE key = 'HUB_LOCATION'`);
        let baseLocation = { lat: withGps[0].latitude!, lng: withGps[0].longitude! };
        if (configRes.rows.length > 0) {
            try {
                const parsed = JSON.parse(configRes.rows[0].value);
                if (parsed?.lat && parsed?.lng) baseLocation = { lat: parsed.lat, lng: parsed.lng };
            } catch { /* use first order as fallback */ }
        }

        // 4. Run optimisation
        const stops: RouteStop[] = withGps.map(o => ({
            id: o.id,
            orderNumber: o.orderNumber,
            lat: o.latitude!,
            lng: o.longitude!
        }));

        const optimizedStops = await optimizeRoute(baseLocation, stops);

        // 5. Apply new sequence in a transaction
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

        // 6. Log to ShiftLog + AuditLog
        if (routeShiftId) {
            await query(
                `INSERT INTO "ShiftLog" ("id", "routeShiftId", "action", "actorId", "actorType", "metadata", "createdAt")
                 VALUES ($1, $2, 'RE_OPTIMISED', $3, 'ADMIN', $4, NOW())`,
                [
                    crypto.randomUUID(),
                    routeShiftId,
                    adminId,
                    JSON.stringify({ optimizedCount: optimizedStops.length })
                ]
            );
        }

        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'ROUTE',
            entityId: routeId,
            action: 'RE_OPTIMISE',
            newData: { optimizedCount: optimizedStops.length },
            description: `Admin re-optimised route "${serviceRouteName}" while shift was paused. ${optimizedStops.length} orders resequenced.`
        });

        return NextResponse.json({
            success: true,
            message: `Route re-optimised successfully. ${optimizedStops.length} orders resequenced.`,
            optimizedCount: optimizedStops.length
        });

    } catch (error) {
        console.error("Error in POST /api/admin/routes/[id]/re-optimize:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
