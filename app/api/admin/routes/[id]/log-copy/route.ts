import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../../lib/db";
import crypto from "crypto";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../../lib/admin-auth";

/**
 * POST /api/admin/routes/[id]/log-copy
 * Logs a "COPIED" action for a specific route link.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
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

        // 2. Log the copy action
        await query(
            `INSERT INTO "RouteTokenLog" ("id", "routeId", "token", "action", "generatedAt")
             VALUES ($1, $2, $3, 'COPIED', NOW())`,
            [`rtl_${crypto.randomUUID()}`, id, token]
        );

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
