import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, verifyAdminAuthWithPermission, getAdminAuthErrorResponse, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";

export async function GET(req: NextRequest) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const res = await query<{ value: string }>(
            `SELECT value FROM "SystemConfig" WHERE key = $1`,
            ['HUB_LOCATION']
        );

        if (res.rows.length > 0) {
            return NextResponse.json({ success: true, location: JSON.parse(res.rows[0].value) });
        }

        return NextResponse.json({ success: true, location: null });
    } catch (error) {
        console.error("Error fetching hub location:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "set_hub_location"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const body = await req.json();
        const { lat, lng } = body;

        if (lat === undefined || lng === undefined) {
            return NextResponse.json({ success: false, message: "Missing lat or lng" }, { status: 400 });
        }

        const locationStr = JSON.stringify({ lat, lng });

        // Fetch old location for audit
        const oldLocationRes = await query<{ value: string }>(
            `SELECT value FROM "SystemConfig" WHERE key = $1`,
            ['HUB_LOCATION']
        );
        const oldLocation = oldLocationRes.rows.length > 0 ? JSON.parse(oldLocationRes.rows[0].value) : null;

        // Upsert the HUB_LOCATION key
        await query(
            `
            INSERT INTO "SystemConfig" (key, value, "updatedAt") 
            VALUES ($1, $2, NOW()) 
            ON CONFLICT (key) 
            DO UPDATE SET value = $2, "updatedAt" = NOW()
            `,
            ['HUB_LOCATION', locationStr]
        );

        // Audit Log
        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'SYSTEM_CONFIG',
            entityId: 'HUB_LOCATION',
            action: 'UPDATE',
            oldData: oldLocation ? { hubLocation: oldLocation } : null,
            newData: { hubLocation: { lat, lng } },
            description: `Updated delivery hub starting coordinates`,
        });

        return NextResponse.json({ success: true, message: "Hub location updated" });
    } catch (error) {
        console.error("Error updating hub location:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
