import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";

export async function GET(req: NextRequest) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const configsRes = await query<{ key: string; value: string }>(
            'SELECT "key", "value" FROM "SystemConfig"'
        );

        // Convert to a more usable object format
        const configs = configsRes.rows.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {} as Record<string, string>);

        return NextResponse.json({ success: true, configs });
    } catch (error) {
        console.error("Error fetching settings:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { key, value } = await req.json();

        if (!key || value === undefined) {
            return NextResponse.json({ success: false, message: "Key and value are required" }, { status: 400 });
        }

        await query(
            `INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
       VALUES ($1, $2, NOW())
       ON CONFLICT ("key") DO UPDATE SET "value" = $2, "updatedAt" = NOW()`,
            [key, String(value)]
        );

        return NextResponse.json({ success: true, message: "Setting updated successfully" });
    } catch (error) {
        console.error("Error updating setting:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
