import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../../lib/db";
import crypto from "crypto";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../../lib/admin-auth";
import { getEndOfDayIST } from "../../../../../../lib/timezone";
import { logAction } from "../../../../../../lib/audit";

// POST /api/admin/routes/[id]/generate-token - Rotate route token and log it
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "generate_route_links"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const { id } = await params;

        // 1. Fetch route to get its date (to set expiry)
        const routeRes = await query<{ date: Date }>(
            `SELECT "date" FROM "Route" WHERE "id" = $1`,
            [id]
        );

        if (routeRes.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Route not found" },
                { status: 404 }
            );
        }

        const { date } = routeRes.rows[0];
        const newToken = crypto.randomBytes(32).toString("hex");
        const newExpiresAt = getEndOfDayIST(new Date(date));

        // 2. Use transaction to update route and log token
        await withTransaction(async (client) => {
            // Update Route token
            await client.query(
                `UPDATE "Route" 
         SET "token" = $1, "tokenExpiresAt" = $2, "updatedAt" = NOW()
         WHERE "id" = $3`,
                [newToken, newExpiresAt, id]
            );

            // Log the token generation
            await client.query(
                `INSERT INTO "RouteTokenLog" ("id", "routeId", "token", "action", "generatedAt")
         VALUES ($1, $2, $3, 'GENERATED', NOW())`,
                [`rtl_${crypto.randomUUID()}`, id, newToken]
            );
        });

        // 3. Fetch all orders assigned to this route and log action
        const ordersRes = await query<{ orderId: string, currentStatus: string }>(
            `SELECT ro."orderId", o."status" as "currentStatus" 
             FROM "RouteOrder" ro
             JOIN "Order" o ON ro."orderId" = o."id"
             WHERE ro."routeId" = $1 AND ro."deliveryStatus" = 'PENDING'`,
            [id]
        );

        const adminId = await getAdminIdFromRequest(req);

        // Log the Route-level action
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'ROUTE',
            entityId: id,
            action: 'UPDATE',
            newData: { action: 'TOKEN_GENERATED' },
            description: "Generated route link"
        });

        for (const row of ordersRes.rows) {
            // Actually update the Order status in the database
            await query(`UPDATE "Order" SET "status" = 'OUT_FOR_DELIVERY', "updatedAt" = NOW() WHERE "id" = $1`, [row.orderId]);

            logAction({
                actorId: adminId,
                actorType: 'ADMIN',
                entity: 'ORDER',
                entityId: row.orderId,
                action: 'UPDATE',
                oldData: { status: row.currentStatus },
                newData: { status: 'OUT_FOR_DELIVERY' },
                description: "Route link generated. Delivery in progress."
            });
        }

        return NextResponse.json({
            success: true,
            message: "New link generated and logged",
            token: newToken
        });

    } catch (error) {
        console.error("Error in POST /api/admin/routes/[id]/generate-token:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
