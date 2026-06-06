import { NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { formatDateToISO } from "../../../lib/timezone";

export async function GET() {
    try {
        // Fetch cutoff settings
        const configsRes = await query<{ key: string; value: string }>(
            'SELECT "key", "value" FROM "SystemConfig" WHERE "key" IN (\'SAME_DAY_CUTOFF_HOUR\', \'SAME_DAY_CUTOFF_MINUTE\', \'HOLIDAY_WEEKDAYS\')'
        );

        const configs = configsRes.rows.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {} as Record<string, string>);

        // Fetch upcoming holidays for the next 60 days (for the customer date picker)
        const holidaysRes = await query<{ date: Date; name: string | null }>(
            `SELECT "date", "name" FROM "Holiday"
             WHERE "date" >= NOW() AND "date" <= NOW() + INTERVAL '60 days'
             ORDER BY "date" ASC`
        );

        // Fetch active support contacts
        const supportRes = await query<{ id: string; type: string; label: string; value: string }>(
            'SELECT "id", "type", "label", "value" FROM "SupportContact" WHERE "active" = true ORDER BY "createdAt" ASC'
        );

        return NextResponse.json({
            success: true,
            config: {
                SAME_DAY_CUTOFF_HOUR: configs.SAME_DAY_CUTOFF_HOUR || '11',
                SAME_DAY_CUTOFF_MINUTE: configs.SAME_DAY_CUTOFF_MINUTE || '0',
                // Weekly off-days: array of day indices (0=Sun, 1=Mon, … 6=Sat)
                HOLIDAY_WEEKDAYS: configs.HOLIDAY_WEEKDAYS
                    ? configs.HOLIDAY_WEEKDAYS.split(',').map((n: string) => parseInt(n.trim(), 10)).filter((n: number) => !isNaN(n))
                    : [],
                holidays: holidaysRes.rows.map((h) => ({
                    date: formatDateToISO(h.date), // YYYY-MM-DD in IST
                    name: h.name,
                })),
                supportContacts: supportRes.rows,
            }
        });
    } catch (error) {
        console.error("Error fetching public config:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}

