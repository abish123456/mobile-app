/**
 * Timezone utilities for handling Indian Standard Time (IST)
 * IST is UTC+5:30
 * 
 * IMPORTANT: The database is configured to use Asia/Kolkata timezone.
 * These utilities ensure JavaScript Date objects work correctly with the database.
 */

/**
 * Get current date/time in IST
 * Returns a standard UTC Date object representing the current moment
 * The database will store this in UTC, and it will be converted to IST for display
 */
export function getNowIST(): Date {
    // Return current time (this represents the current moment)
    // The IST formatting will be handled by createdAtIST field in API responses
    return new Date();
}

/**
 * Convert any date to a date string in IST format (YYYY-MM-DDTHH:mm:ss.sss)
 */
export function getISTString(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date).replace(', ', 'T');
}

/**
 * Convert any date to IST
 * Returns a new Date object capturing the "IST moment".
 * Note: This generates a Date that "looks like" IST but is actually UTC + offset.
 */
export function toIST(date: Date): Date {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;

    // Construct ISO string for parsing: YYYY-MM-DDTHH:mm:ss
    const iso = `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
    return new Date(iso);
}

/**
 * Create a Date object from a date string, interpreting it as IST
 * Useful for parsing user input or API responses
 */
export function parseISTDate(dateString: string): Date {
    const date = new Date(dateString);
    return toIST(date);
}

/**
 * Format date for display in IST
 */
export function formatDateIST(date: Date, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        ...options
    }).format(date);
}

/**
 * Format date to YYYY-MM-DD string in IST
 * Robust against server timezone settings
 */
export function formatDateToISO(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
}

/**
 * Get start of day in IST for a given date
 * Returns a UTC Date object representing 00:00:00 IST (18:30 UTC previous day)
 */
export function getStartOfDayIST(date: Date): Date {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const dateStr = formatter.format(date); // YYYY-MM-DD
    return new Date(`${dateStr}T00:00:00.000+05:30`);
}

/**
 * Get end of day in IST for a given date
 * Returns a UTC Date object representing 23:59:59.999 IST (18:29:59.999 UTC)
 */
export function getEndOfDayIST(date: Date): Date {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const dateStr = formatter.format(date); // YYYY-MM-DD
    return new Date(`${dateStr}T23:59:59.999+05:30`);
}

/**
 * Create a date for a specific day in IST
 * Useful for creating delivery dates
 */
export function createISTDate(year: number, month: number, day: number): Date {
    // Month is 0-indexed in JavaScript Date
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`;
    const date = new Date(dateStr);
    return toIST(date);
}

/**
 * Check if a date is today in IST
 */
export function isTodayIST(date: Date): boolean {
    const now = getNowIST();
    const checkDate = toIST(date);

    return now.getFullYear() === checkDate.getFullYear() &&
        now.getMonth() === checkDate.getMonth() &&
        now.getDate() === checkDate.getDate();
}

/**
 * Check if a date is tomorrow in IST
 */
export function isTomorrowIST(date: Date): boolean {
    const now = getNowIST();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const checkDate = toIST(date);

    return tomorrow.getFullYear() === checkDate.getFullYear() &&
        tomorrow.getMonth() === checkDate.getMonth() &&
        tomorrow.getDate() === checkDate.getDate();
}

/**
 * Get the current date in YYYY-MM-DD format (IST)
 */
export function getTodayIST(): string {
    return formatDateToISO(getNowIST());
}

/**
 * Get tomorrow's date in YYYY-MM-DD format (IST)
 */
export function getTomorrowIST(): string {
    const now = getNowIST();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateToISO(tomorrow);
}

/**
 * Add days to a date in IST
 */
export function addDaysIST(date: Date, days: number): Date {
    const istDate = toIST(date);
    istDate.setDate(istDate.getDate() + days);
    return istDate;
}
