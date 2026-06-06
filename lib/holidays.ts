/**
 * Holiday utilities
 * Used to check whether a given delivery date falls on a holiday or a weekly
 * off-day and, if so, roll it forward to the next available working day.
 */

import { query } from "./db";
import { addDaysIST, getStartOfDayIST, formatDateToISO } from "./timezone";

/**
 * Returns the IST weekday index (0=Sun … 6=Sat) for any Date object,
 * correctly accounting for the UTC→IST offset.
 */
function getISTWeekday(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

const WEEKDAY_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/**
 * Returns an ISO date string (YYYY-MM-DD) for each one-off holiday between
 * `from` (inclusive) and `to` (inclusive), using IST dates.
 */
export async function getHolidaysInRange(
  from: Date,
  to: Date
): Promise<{ date: string; name: string | null }[]> {
  const result = await query<{ date: Date; name: string | null }>(
    `SELECT "date", "name" FROM "Holiday"
     WHERE "date" >= $1 AND "date" <= $2
     ORDER BY "date" ASC`,
    [from, to]
  );
  return result.rows.map((h) => ({
    date: formatDateToISO(h.date),
    name: h.name,
  }));
}

/**
 * Fetches the set of recurring weekly off-day indices (0=Sun … 6=Sat)
 * from SystemConfig key "HOLIDAY_WEEKDAYS".
 * Returns an empty Set if the key doesn't exist.
 */
export async function getWeeklyOffDays(): Promise<Set<number>> {
  const result = await query<{ value: string }>(
    `SELECT "value" FROM "SystemConfig" WHERE "key" = 'HOLIDAY_WEEKDAYS'`
  );
  if (!result.rows[0]?.value) return new Set();
  return new Set(
    result.rows[0].value
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0 && n <= 6)
  );
}

/**
 * Given a target delivery date, returns the same date if it is NOT a holiday
 * or weekly off-day.  If it IS blocked, rolls forward day-by-day (up to 60
 * days) until a valid working day is found.
 */
export async function getNextWorkingDay(date: Date): Promise<{
  date: Date;
  adjusted: boolean;
  originalDate: string;
  adjustedReason: string | null;
}> {
  const originalISO = formatDateToISO(date);

  // 1. Load one-off holidays in a 60-day window
  const windowEnd = addDaysIST(date, 60);
  const holidayRows = await query<{ date: Date; name: string | null }>(
    `SELECT "date", "name" FROM "Holiday"
     WHERE "date" >= $1 AND "date" <= $2`,
    [date, windowEnd]
  );

  // Build map:  "YYYY-MM-DD" → holiday name (or null)
  const holidayMap = new Map<string, string | null>(
    holidayRows.rows.map((h) => [formatDateToISO(h.date), h.name])
  );

  // 2. Load recurring weekly off-days
  const weeklyOffDays = await getWeeklyOffDays();

  // 3. Roll forward until we land on a working day
  let candidate = date;
  let adjustedReason: string | null = null;

  for (let i = 0; i < 60; i++) {
    const iso = formatDateToISO(candidate);
    const dayIdx = getISTWeekday(candidate);

    const isHoliday = holidayMap.has(iso);
    const isWeeklyOff = weeklyOffDays.has(dayIdx);

    if (!isHoliday && !isWeeklyOff) {
      // Found a valid working day — stop
      break;
    }

    // Record the reason for the first skip only
    if (adjustedReason === null) {
      if (isHoliday) {
        const name = holidayMap.get(iso);
        adjustedReason = name
          ? `${iso} is a holiday (${name})`
          : `${iso} is a holiday`;
      } else {
        adjustedReason = `${iso} is a weekly off-day (${WEEKDAY_LONG[dayIdx]})`;
      }
    }

    // Advance to next day (IST-safe)
    candidate = getStartOfDayIST(addDaysIST(candidate, 1));
  }

  const adjusted = formatDateToISO(candidate) !== originalISO;
  return {
    date: candidate,
    adjusted,
    originalDate: originalISO,
    adjustedReason: adjusted ? adjustedReason : null,
  };
}
