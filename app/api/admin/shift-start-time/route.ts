import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";

/**
 * GET /api/admin/shift-start-time
 * Returns the current shift start time config (global default + today override if any)
 */
export async function GET(req: NextRequest) {
    try {
    const adminId = await getAdminIdFromRequest(req);
    if (!adminId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

        const configRes = await query<{ key: string; value: string }>(
            `SELECT "key", "value" FROM "SystemConfig"
             WHERE "key" IN ('SHIFT_START_HOUR','SHIFT_START_MINUTE','SHIFT_START_OVERRIDE_DATE','SHIFT_START_OVERRIDE_HOUR','SHIFT_START_OVERRIDE_MINUTE')`
        );
        const cfg: Record<string, string> = {};
        configRes.rows.forEach(r => { cfg[r.key] = r.value; });

        return NextResponse.json({
            success: true,
            config: {
                defaultHour: parseInt(cfg['SHIFT_START_HOUR'] || '8'),
                defaultMinute: parseInt(cfg['SHIFT_START_MINUTE'] || '0'),
                overrideDate: cfg['SHIFT_START_OVERRIDE_DATE'] || '',
                overrideHour: cfg['SHIFT_START_OVERRIDE_HOUR'] !== '' ? parseInt(cfg['SHIFT_START_OVERRIDE_HOUR']) : null,
                overrideMinute: cfg['SHIFT_START_OVERRIDE_MINUTE'] !== '' ? parseInt(cfg['SHIFT_START_OVERRIDE_MINUTE']) : null,
            }
        });
    } catch (error) {
        console.error("Error in GET /api/admin/shift-start-time:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}

/**
 * Helper function to check if any shifts have already started on a given date string (YYYY-MM-DD)
 */
async function hasShiftsStartedOnDate(dateStr: string): Promise<boolean> {
    const checkRes = await query(
        `SELECT 1 FROM "Route" r
         JOIN "RouteShift" rs ON rs."routeId" = r."id"
         WHERE DATE(r."date" AT TIME ZONE 'Asia/Kolkata') = $1
         AND rs."status" != 'NOT_STARTED'
         LIMIT 1`,
        [dateStr]
    );
    return checkRes.rows.length > 0;
}

/**
 * POST /api/admin/shift-start-time
 * Update the global default shift start time, or set a one-day override.
 */
export async function POST(req: NextRequest) {
    try {
        const adminId = await getAdminIdFromRequest(req);
        if (!adminId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { type, hour, minute, date } = body;

        if (type === "default") {
            if (hour === undefined || hour < 0 || hour > 23) {
                return NextResponse.json({ success: false, message: "Invalid hour (0–23)." }, { status: 400 });
            }
            const min = minute ?? 0;
            await query(
                `UPDATE "SystemConfig" SET "value" = $1, "updatedAt" = NOW() WHERE "key" = 'SHIFT_START_HOUR'`,
                [String(hour)]
            );
            await query(
                `UPDATE "SystemConfig" SET "value" = $1, "updatedAt" = NOW() WHERE "key" = 'SHIFT_START_MINUTE'`,
                [String(min)]
            );
            logAction({
                actorId: adminId,
                actorType: 'ADMIN',
                entity: 'SYSTEM_CONFIG',
                entityId: 'SHIFT_START_TIME',
                action: 'UPDATE',
                newData: { hour, minute: min },
                description: `Updated global default shift start time to ${hour}:${String(min).padStart(2,'0')}`
            });
            return NextResponse.json({ success: true, message: `Default shift start time set to ${hour}:${String(min).padStart(2,'0')}.` });
        }

        if (type === "override") {
            if (!date || hour === undefined || hour < 0 || hour > 23) {
                return NextResponse.json({ success: false, message: "date and valid hour required for override." }, { status: 400 });
            }
            
            // Validation: Cannot override if shifts have already started
            if (await hasShiftsStartedOnDate(date)) {
                return NextResponse.json({ 
                    success: false, 
                    message: `Cannot change shift time for ${date} because one or more staff members have already started their shift.` 
                }, { status: 400 });
            }

            const min = minute ?? 0;
            await query(`UPDATE "SystemConfig" SET "value" = $1, "updatedAt" = NOW() WHERE "key" = 'SHIFT_START_OVERRIDE_DATE'`, [date]);
            await query(`UPDATE "SystemConfig" SET "value" = $1, "updatedAt" = NOW() WHERE "key" = 'SHIFT_START_OVERRIDE_HOUR'`, [String(hour)]);
            await query(`UPDATE "SystemConfig" SET "value" = $1, "updatedAt" = NOW() WHERE "key" = 'SHIFT_START_OVERRIDE_MINUTE'`, [String(min)]);
            logAction({
                actorId: adminId,
                actorType: 'ADMIN',
                entity: 'SYSTEM_CONFIG',
                entityId: 'SHIFT_START_TIME',
                action: 'UPDATE',
                newData: { overrideDate: date, hour, minute: min },
                description: `Set shift start time override for ${date} to ${hour}:${String(min).padStart(2,'0')}`
            });
            return NextResponse.json({ success: true, message: `Override set for ${date}: ${hour}:${String(min).padStart(2,'0')}.` });
        }

        if (type === "clear_override") {
            // Check current override date to see if shifts have already started
            const currentOverrideRes = await query<{ value: string }>(`SELECT value FROM "SystemConfig" WHERE key = 'SHIFT_START_OVERRIDE_DATE'`);
            if (currentOverrideRes.rows.length > 0 && currentOverrideRes.rows[0].value) {
                const currentDate = currentOverrideRes.rows[0].value;
                if (await hasShiftsStartedOnDate(currentDate)) {
                    return NextResponse.json({ 
                        success: false, 
                        message: `Cannot clear shift time override for ${currentDate} because one or more staff members have already started their shift.` 
                    }, { status: 400 });
                }
            }

            await query(`UPDATE "SystemConfig" SET "value" = '', "updatedAt" = NOW() WHERE "key" IN ('SHIFT_START_OVERRIDE_DATE','SHIFT_START_OVERRIDE_HOUR','SHIFT_START_OVERRIDE_MINUTE')`);
            logAction({
                actorId: adminId,
                actorType: 'ADMIN',
                entity: 'SYSTEM_CONFIG',
                entityId: 'SHIFT_START_TIME',
                action: 'UPDATE',
                newData: { overrideCleared: true },
                description: `Cleared shift start time override. Reverted to global default.`
            });
            return NextResponse.json({ success: true, message: "Override cleared. Default shift time will be used." });
        }

        return NextResponse.json({ success: false, message: "Invalid type. Use 'default', 'override', or 'clear_override'." }, { status: 400 });

    } catch (error) {
        console.error("Error in POST /api/admin/shift-start-time:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
