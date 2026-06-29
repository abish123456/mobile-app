import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { getAdminIdFromRequest } from "../../../../../lib/admin-auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const adminId = await getAdminIdFromRequest(req);
        if (!adminId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const historyRes = await query(`
            SELECT "id", "actorName", "description", "newData", "createdAt"
            FROM "AuditLog"
            WHERE "entity" = 'SYSTEM_CONFIG' AND "entityId" = 'SHIFT_START_TIME'
            ORDER BY "createdAt" DESC
        `);

        return NextResponse.json({
            success: true,
            history: historyRes.rows
        });

    } catch (error) {
        console.error("Error in GET /api/admin/shift-start-time/history:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
