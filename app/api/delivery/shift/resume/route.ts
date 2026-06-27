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

        if (shiftStatus !== 'PAUSED') {
            return NextResponse.json(
                { success: false, message: `Cannot resume shift. Current status is: ${shiftStatus}.` },
                { status: 400 }
            );
        }

        // Update RouteShift → ACTIVE
        await query(
            `UPDATE "RouteShift" SET "status" = 'ACTIVE', "resumedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
            [routeShiftId]
        );

        // Log to ShiftLog + AuditLog
        await query(
            `INSERT INTO "ShiftLog" ("id", "routeShiftId", "action", "actorId", "actorType", "createdAt")
             VALUES ($1, $2, 'RESUME_SHIFT', $3, 'DELIVERY_BOY', NOW())`,
            [crypto.randomUUID(), routeShiftId, deliveryBoyId]
        );

        logAction({
            actorId: deliveryBoyId,
            actorType: 'DELIVERY_BOY',
            entity: 'ROUTE_SHIFT',
            entityId: routeShiftId,
            action: 'RESUME_SHIFT',
            newData: { status: 'ACTIVE', routeId },
            description: `Delivery staff resumed shift for route: ${serviceRouteName}`
        });

        return NextResponse.json({ success: true, message: "Shift resumed. You can update orders again.", shiftStatus: 'ACTIVE' });

    } catch (error) {
        console.error("Error in POST /api/delivery/shift/resume:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
