import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse } from "../../../../lib/admin-auth";

export async function GET(req: NextRequest) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_attendance_reports');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const reportType = searchParams.get('reportType') || 'daily';
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const staffId = searchParams.get('staffId');
        const locationId = searchParams.get('locationId');

        // Get all staff and locations for filter dropdowns
        const staffResult = await query(`
            SELECT id, name FROM "DeliveryBoy" WHERE active = true ORDER BY name ASC
        `);
        const locationsResult = await query(`
            SELECT id, name FROM "AttendanceLocation" ORDER BY name ASC
        `);

        if (reportType === 'monthly') {
            return await getMonthlyReport(dateFrom, dateTo, staffId, staffResult.rows, locationsResult.rows);
        }

        // ---- DAILY REPORT ----
        const targetDate = dateFrom || new Date().toISOString().split('T')[0];

        // Get all employees
        const employeesRes = await query(`
            SELECT e.id, e."employeeCode", e.name, e.mobile, e.active
            FROM "Employee" e
            WHERE e.active = true
            ORDER BY e.name ASC
        `);

        // Get all attendance logs for this date
        let logQuery = `
            SELECT 
                al.id, al."deliveryBoyId", al."employeeId", al."employeeCode", al."employeeName",
                al."attendanceLocationId", al.latitude, al.longitude, al."punchType",
                al."deviceInfo", al."punchedAt", al."isLate",
                db.name as "staffName", db.phone as "staffPhone",
                loc.name as "locationName"
            FROM "AttendanceLog" al
            LEFT JOIN "DeliveryBoy" db ON al."deliveryBoyId" = db.id
            LEFT JOIN "AttendanceLocation" loc ON al."attendanceLocationId" = loc.id
            WHERE al.date = $1::date
        `;
        const params: any[] = [targetDate];
        let paramIdx = 2;

        if (staffId && staffId !== 'all') {
            logQuery += ` AND al."deliveryBoyId" = $${paramIdx}`;
            params.push(staffId);
            paramIdx++;
        }
        if (locationId && locationId !== 'all') {
            logQuery += ` AND al."attendanceLocationId" = $${paramIdx}`;
            params.push(locationId);
            paramIdx++;
        }
        logQuery += ` ORDER BY al."punchedAt" ASC`;

        const logsRes = await query(logQuery, params);

        // Build a map per employee/staff for daily view
        const dailyMap: Record<string, any> = {};

        // First, add all employees as "ABSENT" by default
        for (const emp of employeesRes.rows) {
            dailyMap[emp.id] = {
                employeeId: emp.id,
                employeeCode: emp.employeeCode,
                employeeName: emp.name,
                mobile: emp.mobile,
                checkIn: null,
                checkOut: null,
                locationName: null,
                latitude: null,
                longitude: null,
                isLate: false,
                status: 'ABSENT',
                deviceInfo: null
            };
        }

        // Then overlay attendance logs
        for (const log of logsRes.rows) {
            const key = log.employeeId || log.deliveryBoyId || log.id;
            if (!dailyMap[key]) {
                dailyMap[key] = {
                    employeeId: log.employeeId,
                    employeeCode: log.employeeCode,
                    employeeName: log.employeeName || log.staffName || 'Unknown',
                    mobile: log.staffPhone || '',
                    checkIn: null,
                    checkOut: null,
                    locationName: null,
                    latitude: null,
                    longitude: null,
                    isLate: false,
                    status: 'ABSENT',
                    deviceInfo: null
                };
            }

            const entry = dailyMap[key];
            if (log.punchType === 'CHECK_IN') {
                entry.checkIn = log.punchedAt;
                entry.locationName = log.locationName;
                entry.latitude = log.latitude;
                entry.longitude = log.longitude;
                entry.isLate = log.isLate;
                entry.status = log.isLate ? 'LATE' : 'PRESENT';
                entry.deviceInfo = log.deviceInfo;
            } else if (log.punchType === 'CHECK_OUT') {
                entry.checkOut = log.punchedAt;
            }
        }

        const dailyRows = Object.values(dailyMap).sort((a: any, b: any) => {
            // Present first, then late, then absent
            const order: Record<string, number> = { PRESENT: 0, LATE: 1, ABSENT: 2 };
            return (order[a.status] ?? 3) - (order[b.status] ?? 3);
        });

        // Summary counts
        const presentCount = dailyRows.filter((r: any) => r.status === 'PRESENT').length;
        const lateCount = dailyRows.filter((r: any) => r.status === 'LATE').length;
        const absentCount = dailyRows.filter((r: any) => r.status === 'ABSENT').length;

        return NextResponse.json({
            success: true,
            reportType: 'daily',
            date: targetDate,
            rows: dailyRows,
            summary: {
                total: dailyRows.length,
                present: presentCount,
                late: lateCount,
                absent: absentCount
            },
            staff: staffResult.rows,
            locations: locationsResult.rows
        });
    } catch (error) {
        console.error("[AttendanceReports GET] Error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch attendance reports" }, { status: 500 });
    }
}

async function getMonthlyReport(dateFrom: string | null, dateTo: string | null, staffId: string | null, staff: any[], locations: any[]) {
    try {
        const now = new Date();
        const from = dateFrom || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const to = dateTo || now.toISOString().split('T')[0];

        // Get all employees
        const employeesRes = await query(`
            SELECT id, "employeeCode", name, mobile FROM "Employee" WHERE active = true ORDER BY name ASC
        `);

        // Get attendance counts per employee in the date range
        let countQuery = `
            SELECT 
                COALESCE(al."employeeId", al."deliveryBoyId") as "staffKey",
                al."employeeCode",
                al."employeeName",
                COUNT(DISTINCT CASE WHEN al."punchType" = 'CHECK_IN' THEN al.date END)::int as "presentDays",
                COUNT(DISTINCT CASE WHEN al."punchType" = 'CHECK_IN' AND al."isLate" = true THEN al.date END)::int as "lateDays"
            FROM "AttendanceLog" al
            WHERE al.date >= $1::date AND al.date <= $2::date
        `;
        const params: any[] = [from, to];
        let paramIdx = 3;

        if (staffId && staffId !== 'all') {
            countQuery += ` AND al."deliveryBoyId" = $${paramIdx}`;
            params.push(staffId);
            paramIdx++;
        }

        countQuery += ` GROUP BY "staffKey", al."employeeCode", al."employeeName"`;

        const countsRes = await query(countQuery, params);

        // Calculate total working days in range (excluding weekends is complex, so use calendar days for now)
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const totalDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // Build per-employee row
        const countsMap: Record<string, any> = {};
        for (const c of countsRes.rows) {
            countsMap[c.staffKey] = c;
        }

        const monthlyRows = employeesRes.rows.map((emp: any) => {
            const data = countsMap[emp.id];
            const presentDays = data?.presentDays || 0;
            const lateDays = data?.lateDays || 0;
            const absentDays = Math.max(0, totalDays - presentDays);

            return {
                employeeId: emp.id,
                employeeCode: emp.employeeCode,
                employeeName: emp.name,
                mobile: emp.mobile,
                totalDays,
                presentDays,
                absentDays,
                lateDays
            };
        });

        return NextResponse.json({
            success: true,
            reportType: 'monthly',
            dateFrom: from,
            dateTo: to,
            totalDays,
            rows: monthlyRows,
            staff,
            locations
        });
    } catch (error) {
        console.error("[AttendanceReports Monthly] Error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch monthly report" }, { status: 500 });
    }
}
