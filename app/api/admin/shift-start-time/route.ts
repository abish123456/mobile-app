import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";
import { getStartOfDayIST, getEndOfDayIST } from "../../../../lib/timezone";

export const dynamic = 'force-dynamic';

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
    const startOfDay = getStartOfDayIST(new Date(dateStr));
    const endOfDay = getEndOfDayIST(new Date(dateStr));
    const checkRes = await query<{ count: string }>(
        `SELECT COUNT(*)::bigint as "count" 
         FROM "Route" r
         JOIN "RouteShift" rs ON rs."routeId" = r."id"
         WHERE r."date" >= $1 AND r."date" <= $2 AND rs."status" != 'NOT_STARTED'`,
        [startOfDay, endOfDay]
    );
    return parseInt(checkRes.rows[0].count, 10) > 0;
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
            const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const shiftsStarted = await hasShiftsStartedOnDate(todayStr);

            let scopeMessage = "";

            if (shiftsStarted) {
                // Determine current effective time for today
                const configRes = await query<{ key: string; value: string }>(
                    `SELECT "key", "value" FROM "SystemConfig"
                     WHERE "key" IN ('SHIFT_START_HOUR','SHIFT_START_MINUTE','SHIFT_START_OVERRIDE_DATE','SHIFT_START_OVERRIDE_HOUR','SHIFT_START_OVERRIDE_MINUTE')`
                );
                const cfg: Record<string, string> = {};
                configRes.rows.forEach(r => { cfg[r.key] = r.value; });

                const hasTodayOverride = cfg['SHIFT_START_OVERRIDE_DATE'] === todayStr;
                const effectiveHour = hasTodayOverride && cfg['SHIFT_START_OVERRIDE_HOUR'] ? parseInt(cfg['SHIFT_START_OVERRIDE_HOUR']) : parseInt(cfg['SHIFT_START_HOUR'] || '8');
                const effectiveMinute = hasTodayOverride && cfg['SHIFT_START_OVERRIDE_MINUTE'] ? parseInt(cfg['SHIFT_START_OVERRIDE_MINUTE']) : parseInt(cfg['SHIFT_START_MINUTE'] || '0');

                // Set override for today with effective time
                await query(`UPDATE "SystemConfig" SET "value" = $1, "updatedAt" = NOW() WHERE "key" = 'SHIFT_START_OVERRIDE_DATE'`, [todayStr]);
                await query(`UPDATE "SystemConfig" SET "value" = $1, "updatedAt" = NOW() WHERE "key" = 'SHIFT_START_OVERRIDE_HOUR'`, [String(effectiveHour)]);
                await query(`UPDATE "SystemConfig" SET "value" = $1, "updatedAt" = NOW() WHERE "key" = 'SHIFT_START_OVERRIDE_MINUTE'`, [String(effectiveMinute)]);
                
                scopeMessage = "Only Future Dates (shifts already started today)";
            } else {
                // Clear today's override if no shifts started
                await query(`UPDATE "SystemConfig" SET "value" = '', "updatedAt" = NOW() WHERE "key" IN ('SHIFT_START_OVERRIDE_DATE','SHIFT_START_OVERRIDE_HOUR','SHIFT_START_OVERRIDE_MINUTE')`);
                
                scopeMessage = "Today and Future Dates";
            }

            // Update global config
            await query(
                `UPDATE "SystemConfig" SET "value" = $1, "updatedAt" = NOW() WHERE "key" = 'SHIFT_START_HOUR'`,
                [String(hour)]
            );
            await query(
                `UPDATE "SystemConfig" SET "value" = $1, "updatedAt" = NOW() WHERE "key" = 'SHIFT_START_MINUTE'`,
                [String(min)]
            );
            
            // Get admin details for logging
            const adminRes = await query<{ name: string }>(`SELECT name FROM "Admin" WHERE id = $1`, [adminId]);
            const adminName = adminRes.rows.length > 0 ? adminRes.rows[0].name : 'Admin';

            logAction({
                actorId: adminId,
                actorType: 'ADMIN',
                actorName: adminName,
                entity: 'SYSTEM_CONFIG',
                entityId: 'SHIFT_START_TIME',
                action: 'UPDATE',
                newData: { hour, minute: min, scope: scopeMessage },
                description: `Changed shift time to ${hour}:${String(min).padStart(2,'0')}. Applies to: ${scopeMessage}`
            });
            return NextResponse.json({ 
                success: true, 
                message: `Shift time set to ${hour}:${String(min).padStart(2,'0')}.`,
                scope: shiftsStarted ? 'future' : 'all'
            });
        }

        return NextResponse.json({ success: false, message: "Invalid type. Use 'default'." }, { status: 400 });

    } catch (error) {
        console.error("Error in POST /api/admin/shift-start-time:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
