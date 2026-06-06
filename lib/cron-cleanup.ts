import { query } from "./db";
import { getTodayIST, getNowIST } from "./timezone";

/**
 * Runs a daily cleanup task to mark overdue PENDING/CONFIRMED orders as NOT_DELIVERED.
 * This function is designed to be called "lazily" when an admin logs in.
 */
export async function runDailyCleanup() {
    try {
        const today = getTodayIST(); // "YYYY-MM-DD" in IST
        const now = getNowIST();

        console.log(`[Cleanup] Checking for overdue orders before ${today}...`);

        // 1. Find candidate orders
        const overdueOrdersRes = await query<{ id: string }>(
            `SELECT "id"
       FROM "Order"
       WHERE "status" IN ('PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY')
       AND ("deliveryDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date < $1::date`,
            [today]
        );

        if (overdueOrdersRes.rows.length === 0) {
            console.log(`[Cleanup] No overdue orders found.`);
            return;
        }

        const orderIds = overdueOrdersRes.rows.map(o => o.id);
        console.log(`[Cleanup] Found ${orderIds.length} overdue orders. Processing...`);

        // 2. Update the Order table status
        await query(
            `UPDATE "Order"
         SET "status" = 'NOT_DELIVERED', 
             "updatedAt" = $1
         WHERE "id" = ANY($2::text[])`,
            [now, orderIds]
        );

        // 3. Update existing RouteOrder table for any orders that were ALREADY assigned
        await query(
            `UPDATE "RouteOrder"
             SET "deliveryStatus" = 'NOT_DELIVERED',
                 "notDeliveredReason" = 'Overdue - No Status Update',
                 "updatedAt" = $1
             WHERE "orderId" = ANY($2::text[]) 
             AND "deliveryStatus" != 'DELIVERED'`,
            [now, orderIds]
        );

        console.log(`[Cleanup] Successfully processed ${orderIds.length} orders.`);

    } catch (error) {
        console.error("[Cleanup] Failed to run daily cleanup:", error);
    }
}
