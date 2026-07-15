import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { authenticateDelivery } from "../../../../../lib/delivery-auth";

// Haversine formula to calculate distance between two GPS points (in meters)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Get shift start time from SystemConfig
async function getShiftStartTime(): Promise<{ hour: number; minute: number }> {
    const configRes = await query<{ key: string; value: string }>(
        `SELECT "key", "value" FROM "SystemConfig"
         WHERE "key" IN ('SHIFT_START_HOUR', 'SHIFT_START_MINUTE')`
    );
    const cfg: Record<string, string> = {};
    configRes.rows.forEach(r => { cfg[r.key] = r.value; });
    return {
        hour: parseInt(cfg['SHIFT_START_HOUR'] || '9'),
        minute: parseInt(cfg['SHIFT_START_MINUTE'] || '0')
    };
}

// POST - Mark attendance punch (Check-in or Check-out)
export async function POST(req: NextRequest) {
    const user = authenticateDelivery(req);
    if (!user?.deliveryBoyId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const latitude = parseFloat(body?.latitude);
        const longitude = parseFloat(body?.longitude);
        const locationId = (body?.locationId || "").toString().trim();
        const deviceInfo = (body?.deviceInfo || "").toString().trim() || null;

        if (isNaN(latitude) || isNaN(longitude)) {
            return NextResponse.json({ success: false, message: "Valid coordinates are required" }, { status: 400 });
        }
        if (!locationId) {
            return NextResponse.json({ success: false, message: "Location ID is required" }, { status: 400 });
        }

        // Verify the location exists and is active
        const locRes = await query(`
            SELECT id, name, latitude, longitude, "radiusMeters"
            FROM "AttendanceLocation"
            WHERE id = $1 AND active = true
        `, [locationId]);

        if (locRes.rows.length === 0) {
            return NextResponse.json({ success: false, message: "Attendance location not found or inactive" }, { status: 404 });
        }

        const loc = locRes.rows[0];

        // Server-side verification: check if staff is within the geofence radius
        const distance = haversineDistance(latitude, longitude, loc.latitude, loc.longitude);
        if (distance > loc.radiusMeters) {
            return NextResponse.json({
                success: false,
                message: `You are ${Math.round(distance)}m away from "${loc.name}". You must be within ${loc.radiusMeters}m.`
            }, { status: 400 });
        }

        // Look up Employee via DeliveryBoy → Admin → Employee
        let employeeId: string | null = null;
        let employeeCode: string | null = null;
        let employeeName: string | null = null;

        const empRes = await query(`
            SELECT e.id, e."employeeCode", e.name
            FROM "DeliveryBoy" db
            JOIN "Admin" a ON db."adminId" = a.id
            JOIN "Employee" e ON e."adminId" = a.id
            WHERE db.id = $1
        `, [user.deliveryBoyId]);

        if (empRes.rows.length > 0) {
            employeeId = empRes.rows[0].id;
            employeeCode = empRes.rows[0].employeeCode;
            employeeName = empRes.rows[0].name;
        } else {
            // Fallback: use DeliveryBoy name if no Employee record
            const dbRes = await query(`SELECT name FROM "DeliveryBoy" WHERE id = $1`, [user.deliveryBoyId]);
            if (dbRes.rows.length > 0) {
                employeeName = dbRes.rows[0].name;
            }
        }

        // Get today's date (IST)
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const todayStr = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, '0')}-${String(nowIST.getDate()).padStart(2, '0')}`;

        // Check existing punches for today
        const todayPunches = await query(`
            SELECT id, "punchType", "punchedAt"
            FROM "AttendanceLog"
            WHERE "deliveryBoyId" = $1 AND date = $2::date
            ORDER BY "punchedAt" ASC
        `, [user.deliveryBoyId, todayStr]);

        const hasCheckIn = todayPunches.rows.some((p: any) => p.punchType === 'CHECK_IN');
        const hasCheckOut = todayPunches.rows.some((p: any) => p.punchType === 'CHECK_OUT');

        // Determine punch type
        let punchType: string;
        if (!hasCheckIn) {
            punchType = 'CHECK_IN';
        } else if (!hasCheckOut) {
            punchType = 'CHECK_OUT';
        } else {
            return NextResponse.json({
                success: false,
                message: "You have already checked in and checked out today."
            }, { status: 400 });
        }

        // Check for duplicate punch within last 30 seconds
        const recentRes = await query(`
            SELECT id FROM "AttendanceLog"
            WHERE "deliveryBoyId" = $1 AND "punchedAt" > NOW() - interval '30 seconds'
            LIMIT 1
        `, [user.deliveryBoyId]);

        if (recentRes.rows.length > 0) {
            return NextResponse.json({
                success: false,
                message: "Please wait a moment before punching again."
            }, { status: 429 });
        }

        // Detect late check-in
        let isLate = false;
        if (punchType === 'CHECK_IN') {
            const { hour, minute } = await getShiftStartTime();
            const nowHour = nowIST.getHours();
            const nowMinute = nowIST.getMinutes();
            isLate = nowHour > hour || (nowHour === hour && nowMinute > minute);
        }

        // Save attendance log
        const result = await query(`
            INSERT INTO "AttendanceLog" 
            (id, "deliveryBoyId", "employeeId", "employeeCode", "employeeName", "attendanceLocationId", 
             latitude, longitude, "punchType", "deviceInfo", date, "isLate", "punchedAt")
            VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, NOW())
            RETURNING id, "punchedAt", "punchType"
        `, [
            user.deliveryBoyId, employeeId, employeeCode, employeeName, locationId,
            latitude, longitude, punchType, deviceInfo, todayStr, isLate
        ]);

        const actionLabel = punchType === 'CHECK_IN' ? 'Checked In' : 'Checked Out';

        return NextResponse.json({
            success: true,
            message: `${actionLabel} at "${loc.name}"${isLate ? ' (Late)' : ''}`,
            log: {
                id: result.rows[0].id,
                punchedAt: result.rows[0].punchedAt,
                punchType: result.rows[0].punchType,
                locationName: loc.name,
                isLate
            }
        });
    } catch (error) {
        console.error("[Delivery AttendancePunch POST] Error:", error);
        return NextResponse.json({ success: false, message: "Failed to mark attendance" }, { status: 500 });
    }
}
