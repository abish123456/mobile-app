import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { authenticateDelivery } from "../../../../../lib/delivery-auth";

// GET active attendance locations for mobile staff app
export async function GET(req: NextRequest) {
    const user = authenticateDelivery(req);
    if (!user?.deliveryBoyId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await query(`
            SELECT id, name, latitude, longitude, "radiusMeters"
            FROM "AttendanceLocation"
            WHERE active = true
            ORDER BY name ASC
        `);

        return NextResponse.json({ success: true, locations: result.rows });
    } catch (error) {
        console.error("[Delivery AttendanceLocations GET] Error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch locations" }, { status: 500 });
    }
}
