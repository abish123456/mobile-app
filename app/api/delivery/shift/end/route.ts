import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { getTodayIST } from "../../../../../lib/timezone";
import { logAction } from "../../../../../lib/audit";
import { authenticateDelivery } from "../../../../../lib/delivery-auth";
import crypto from "crypto";


export async function POST(req: NextRequest) {
    try {
        const user = authenticateDelivery(req);
        if (!user?.deliveryBoyId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }
        const { deliveryBoyId } = user;

        const body = await req.json().catch(() => ({}));
        const todayIST = getTodayIST();

        const shiftRes = await query<{ routeShiftId: string; shiftStatus: string; routeId: string; serviceRouteName: string }>(
            `SELECT rs."id" as "routeShiftId", rs."status" as "shiftStatus", r."id" as "routeId", sr."name" as "serviceRouteName"
             FROM "RouteShift" rs
             JOIN "Route" r ON r."id" = rs."routeId"
             JOIN "ServiceRoute" sr ON sr."id" = r."serviceRouteId"
             WHERE r."deliveryBoyId" = $1
               AND (r."date" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = $2::date
               ${body.routeId ? `AND r."id" = '${body.routeId}'` : ''}
             LIMIT 1`,
            [deliveryBoyId, todayIST]
        );

        if (shiftRes.rows.length === 0) {
            return NextResponse.json({ success: false, message: "No shift found for today." }, { status: 404 });
        }

        const { routeShiftId, shiftStatus, routeId, serviceRouteName } = shiftRes.rows[0];

        if (!['ACTIVE', 'PAUSED'].includes(shiftStatus)) {
            return NextResponse.json(
                { success: false, message: `Cannot end shift. Current status is: ${shiftStatus}.` },
                { status: 400 }
            );
        }

        // Count pending orders for summary
        const pendingRes = await query<{ count: string }>(
            `SELECT COUNT(*)::int as count FROM "RouteOrder" WHERE "routeId" = $1 AND "deliveryStatus" = 'PENDING'`,
            [routeId]
        );
        const deliveredRes = await query<{ count: string }>(
            `SELECT COUNT(*)::int as count FROM "RouteOrder" WHERE "routeId" = $1 AND "deliveryStatus" = 'DELIVERED'`,
            [routeId]
        );
        const notDeliveredRes = await query<{ count: string }>(
            `SELECT COUNT(*)::int as count FROM "RouteOrder" WHERE "routeId" = $1 AND "deliveryStatus" = 'NOT_DELIVERED'`,
            [routeId]
        );

        const pendingCount = parseInt(pendingRes.rows[0]?.count || '0');
        const deliveredCount = parseInt(deliveredRes.rows[0]?.count || '0');
        const notDeliveredCount = parseInt(notDeliveredRes.rows[0]?.count || '0');

        // Update RouteShift → ENDED, also mark route as submitted
        await query(
            `UPDATE "RouteShift" SET "status" = 'ENDED', "endedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
            [routeShiftId]
        );
        await query(
            `UPDATE "Route" SET "isSubmitted" = true, "submittedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
            [routeId]
        );

        // Log to ShiftLog + AuditLog
        await query(
            `INSERT INTO "ShiftLog" ("id", "routeShiftId", "action", "actorId", "actorType", "metadata", "createdAt")
             VALUES ($1, $2, 'END_SHIFT', $3, 'DELIVERY_BOY', $4, NOW())`,
            [
                crypto.randomUUID(),
                routeShiftId,
                deliveryBoyId,
                JSON.stringify({ deliveredCount, notDeliveredCount, pendingCount })
            ]
        );

        logAction({
            actorId: deliveryBoyId,
            actorType: 'DELIVERY_BOY',
            entity: 'ROUTE_SHIFT',
            entityId: routeShiftId,
            action: 'END_SHIFT',
            newData: { status: 'ENDED', routeId, deliveredCount, notDeliveredCount, pendingCount },
            description: `Delivery staff ended shift for route: ${serviceRouteName}. Delivered: ${deliveredCount}, Not Delivered: ${notDeliveredCount}, Still Pending: ${pendingCount}`
        });

        return NextResponse.json({
            success: true,
            message: "Shift ended successfully.",
            shiftStatus: 'ENDED',
            summary: { deliveredCount, notDeliveredCount, pendingCount }
        });

    } catch (error) {
        console.error("Error in POST /api/delivery/shift/end:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
