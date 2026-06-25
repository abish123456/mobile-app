import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, verifyAdminAuth, getAdminAuthErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";

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

        if (key === "ORDER_CUTOFF_TIME" || key === "ORDER_CUTOFF_ENABLED") {
            if (!(await verifyAdminAuthWithPermission(req, "adjust_product_cutoff"))) {
                return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
            }
        }

        if (key === "weekly_off_days") {
            if (!(await verifyAdminAuthWithPermission(req, "edit_delivery_settings"))) {
                return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
            }
        }

        const currentSettingRes = await query<{ value: string }>(
            `SELECT "value" FROM "SystemConfig" WHERE "key" = $1`,
            [key]
        );
        const oldValue = currentSettingRes.rows[0]?.value;

        await query(
            `INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
       VALUES ($1, $2, NOW())
       ON CONFLICT ("key") DO UPDATE SET "value" = $2, "updatedAt" = NOW()`,
            [key, String(value)]
        );

        const adminId = await getAdminIdFromRequest(req);

        // For cutoff time settings, skip the individual log and only log combined CUT_OFF_TIME
        const isCutoffKey = key === 'SAME_DAY_CUTOFF_HOUR' || key === 'SAME_DAY_CUTOFF_MINUTE';
        if (!isCutoffKey) {
            logAction({
                actorId: adminId,
                actorType: 'ADMIN',
                entity: 'SYSTEM_SETTING',
                entityId: key,
                action: 'UPDATE',
                oldData: oldValue !== undefined ? { value: oldValue } : null,
                newData: { value: String(value) },
                description: `Admin updated system setting: ${key}`
            });
        }

        // For cutoff time settings, also log a combined CUT_OFF_TIME entry
        if (key === 'SAME_DAY_CUTOFF_HOUR' || key === 'SAME_DAY_CUTOFF_MINUTE') {
            try {
                const allCutoffRes = await query<{ key: string; value: string }>(
                    `SELECT "key", "value" FROM "SystemConfig" WHERE "key" IN ('SAME_DAY_CUTOFF_HOUR', 'SAME_DAY_CUTOFF_MINUTE')`
                );
                const configs: Record<string, string> = {};
                allCutoffRes.rows.forEach(r => { configs[r.key] = r.value; });

                const newHour = key === 'SAME_DAY_CUTOFF_HOUR' ? String(value) : (configs['SAME_DAY_CUTOFF_HOUR'] || '11');
                const newMinute = key === 'SAME_DAY_CUTOFF_MINUTE' ? String(value) : (configs['SAME_DAY_CUTOFF_MINUTE'] || '0');
                const oldHour = key === 'SAME_DAY_CUTOFF_HOUR' ? (oldValue || '11') : (configs['SAME_DAY_CUTOFF_HOUR'] || '11');
                const oldMinute = key === 'SAME_DAY_CUTOFF_MINUTE' ? (oldValue || '0') : (configs['SAME_DAY_CUTOFF_MINUTE'] || '0');

                const newTime = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;

                // Check if a CUT_OFF_TIME log was already created by this admin in the last 10 seconds
                const recentLogRes = await query<{ id: string; oldData: any }>(
                    `SELECT id, "oldData" FROM "AuditLog" 
                     WHERE entity = 'SYSTEM_SETTING' AND "entityId" = 'CUT_OFF_TIME' 
                       AND "actorId" = $1 AND "createdAt" > NOW() - INTERVAL '10 seconds'
                     ORDER BY "createdAt" DESC LIMIT 1`,
                    [adminId]
                );

                let effectiveOldTime = `${String(oldHour).padStart(2, '0')}:${String(oldMinute).padStart(2, '0')}`;

                if (recentLogRes.rows.length > 0) {
                    // Preserve the original starting state from the first log
                    const originalOldTime = recentLogRes.rows[0].oldData?.cutOffTime;
                    if (originalOldTime) effectiveOldTime = originalOldTime;
                    // Delete the previous intermediate log
                    await query(`DELETE FROM "AuditLog" WHERE id = $1`, [recentLogRes.rows[0].id]);
                }

                // Only log if the combined time actually changed from the original state
                if (effectiveOldTime !== newTime) {
                    logAction({
                        actorId: adminId,
                        actorType: 'ADMIN',
                        entity: 'SYSTEM_SETTING',
                        entityId: 'CUT_OFF_TIME',
                        action: 'UPDATE',
                        oldData: { cutOffTime: effectiveOldTime },
                        newData: { cutOffTime: newTime },
                        description: `Admin updated the cut off time`
                    });
                }
            } catch (e) {
                console.error('Failed to log combined cutoff time:', e);
            }
        }

        return NextResponse.json({ success: true, message: "Setting updated successfully" });
    } catch (error) {
        console.error("Error updating setting:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
