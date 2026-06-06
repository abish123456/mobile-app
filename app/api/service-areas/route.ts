import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../lib/db";

export async function GET(req: NextRequest) {
    try {
        const result = await query(
            `SELECT pincode, "areaName" FROM "ServiceArea" WHERE active = true ORDER BY "pincode" ASC`
        );

        return NextResponse.json({
            success: true,
            serviceAreas: result.rows
        });
    } catch (error) {
        console.error("Error in GET /api/service-areas:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
