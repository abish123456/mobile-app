import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { authenticateDelivery } from "../../../../../lib/delivery-auth";

// GET - Get today's attendance status for the authenticated staff
export async function GET(req: NextRequest) {
    const user = authenticateDelivery(req);
    if (!user?.deliveryBoyId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    try {
        // Get today's date (IST)
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const todayStr = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, '0')}-${String(nowIST.getDate()).padStart(2, '0')}`;

        const result = await query(`
            SELECT al."punchType", al."punchedAt", al."isLate",
                   loc.name as "locationName"
            FROM "AttendanceLog" al
            LEFT JOIN "AttendanceLocation" loc ON al."attendanceLocationId" = loc.id
            WHERE al."deliveryBoyId" = $1 AND al.date = $2::date
            ORDER BY al."punchedAt" ASC
        `, [user.deliveryBoyId, todayStr]);

        const checkIn = result.rows.find((r: any) => r.punchType === 'CHECK_IN');
        const checkOut = result.rows.find((r: any) => r.punchType === 'CHECK_OUT');

        return NextResponse.json({
            success: true,
            status: {
                checkIn: checkIn ? { time: checkIn.punchedAt, location: checkIn.locationName, isLate: checkIn.isLate } : null,
                checkOut: checkOut ? { time: checkOut.punchedAt, location: checkOut.locationName } : null
            }
        });
    } catch (error) {
        console.error("[Delivery AttendanceStatus GET] Error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch attendance status" }, { status: 500 });
    }
}
