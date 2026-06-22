import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";

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
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const body = await req.json();
        const { lat, lng } = body;

        if (lat === undefined || lng === undefined) {
            return NextResponse.json({ success: false, message: "Missing lat or lng" }, { status: 400 });
        }

        const locationStr = JSON.stringify({ lat, lng });

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

        return NextResponse.json({ success: true, message: "Hub location updated" });
    } catch (error) {
        console.error("Error updating hub location:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
