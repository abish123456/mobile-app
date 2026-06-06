import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../../lib/db";
import crypto from "crypto";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../../lib/admin-auth";
import { getEndOfDayIST } from "../../../../../../lib/timezone";

// POST /api/admin/routes/[id]/generate-token - Rotate route token and log it
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
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
