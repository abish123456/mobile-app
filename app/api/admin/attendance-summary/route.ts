import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse } from "../../../../lib/admin-auth";

// GET - Dashboard summary for attendance
export async function GET(req: NextRequest) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_attendance_reports');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        // Get today's date (IST)
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const todayStr = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, '0')}-${String(nowIST.getDate()).padStart(2, '0')}`;

        // Total active employees
        const totalRes = await query(`SELECT COUNT(*)::int as count FROM "Employee" WHERE active = true`);
        const totalEmployees = totalRes.rows[0]?.count || 0;

        // Present today (employees who have CHECK_IN for today)
        const presentRes = await query(`
            SELECT COUNT(DISTINCT "employeeId")::int as count
            FROM "AttendanceLog"
            WHERE date = $1::date AND "punchType" = 'CHECK_IN' AND "employeeId" IS NOT NULL
        `, [todayStr]);
        const presentCount = presentRes.rows[0]?.count || 0;

        // Also count delivery boys without employee records who checked in
        const dbPresentRes = await query(`
            SELECT COUNT(DISTINCT "deliveryBoyId")::int as count
            FROM "AttendanceLog"
            WHERE date = $1::date AND "punchType" = 'CHECK_IN' AND "employeeId" IS NULL AND "deliveryBoyId" IS NOT NULL
        `, [todayStr]);
        const dbPresentCount = dbPresentRes.rows[0]?.count || 0;

        const totalPresent = presentCount + dbPresentCount;

        // On Leave (delivery boys marked onLeave)
        const onLeaveRes = await query(`SELECT COUNT(*)::int as count FROM "DeliveryBoy" WHERE active = true AND "onLeave" = true`);
        const onLeaveCount = onLeaveRes.rows[0]?.count || 0;

        // Late today
        const lateRes = await query(`
            SELECT COUNT(DISTINCT COALESCE("employeeId", "deliveryBoyId"))::int as count
            FROM "AttendanceLog"
            WHERE date = $1::date AND "punchType" = 'CHECK_IN' AND "isLate" = true
        `, [todayStr]);
        const lateCount = lateRes.rows[0]?.count || 0;

        // Absent = Total - Present - On Leave
        const absentCount = Math.max(0, totalEmployees - totalPresent - onLeaveCount);

        return NextResponse.json({
            success: true,
            summary: {
                totalEmployees,
                presentToday: totalPresent,
                absentToday: absentCount,
                onLeave: onLeaveCount,
                lateToday: lateCount,
                date: todayStr
            }
        });
    } catch (error) {
        console.error("[AttendanceSummary GET] Error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch attendance summary" }, { status: 500 });
    }
}
