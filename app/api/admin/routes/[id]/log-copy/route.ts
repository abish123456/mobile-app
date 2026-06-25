import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../../lib/db";
import crypto from "crypto";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../../lib/admin-auth";
import { logAction } from "../../../../../../lib/audit";

/**
 * POST /api/admin/routes/[id]/log-copy
 * Logs a "COPIED" action for a specific route link.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "copy_route_links"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const { id } = await params;

        // 1. Fetch current token for the route
        const routeRes = await query<{ token: string }>(
            `SELECT "token" FROM "Route" WHERE "id" = $1`,
            [id]
        );

        if (routeRes.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Route not found" },
                { status: 404 }
            );
        }

        const { token } = routeRes.rows[0];

        if (!token) {
            return NextResponse.json(
                { success: false, message: "No token exists for this route" },
                { status: 400 }
            );
        }

        // 2. Log the copy action in old table
        await query(
            `INSERT INTO "RouteTokenLog" ("id", "routeId", "token", "action", "generatedAt")
             VALUES ($1, $2, $3, 'COPIED', NOW())`,
            [`rtl_${crypto.randomUUID()}`, id, token]
        );

        // 3. Log to new AuditLog system
        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'ROUTE',
            entityId: id,
            action: 'READ',
            newData: { action: 'TOKEN_COPIED' },
            description: "Copied route link"
        });

        return NextResponse.json({
            success: true,
            message: "Link copy logged"
        });

    } catch (error) {
        console.error("Error in POST /api/admin/routes/[id]/log-copy:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
