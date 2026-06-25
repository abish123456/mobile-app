import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "edit_routes"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }
        const adminId = await getAdminIdFromRequest(req);
        if (!adminId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { routeId, action, routeName, newStaffName } = body;

        if (!routeId || !action || !routeName) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            );
        }

        let description = '';
        if (action === 'UPDATE') {
            description = `Route delivery staff was changed.\nRoute Name : ${routeName}\nDelivery staff : ${newStaffName || 'Unknown'}`;
        } else if (action === 'DELETE') {
            description = `Route delivery staff was removed.\nRoute Name : ${routeName}`;
        } else {
            return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
        }

        // Fetch all pending orders for this route
        const ordersRes = await query<{ orderId: string }>(
            `SELECT "orderId" FROM "RouteOrder" WHERE "routeId" = $1 AND "deliveryStatus" = 'PENDING'`,
            [routeId]
        );

        if (ordersRes.rows.length === 0) {
            return NextResponse.json({ success: true, message: "No pending orders to update" });
        }

        const createdAt = new Date();

        // Batch insert an AuditLog for each pending order
        for (const row of ordersRes.rows) {
            await query(
                `INSERT INTO "AuditLog" ("id", "actorId", "actorType", "entity", "entityId", "action", "description", "createdAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    crypto.randomUUID(),
                    adminId,
                    'ADMIN',
                    'ORDER',
                    row.orderId,
                    'UPDATE',
                    description,
                    createdAt
                ]
            );
        }

        return NextResponse.json({
            success: true,
            message: `Updated tracking history for ${ordersRes.rows.length} orders`
        });

    } catch (error) {
        console.error("Error in POST /api/admin/audit-logs/route-orders:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
