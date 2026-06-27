import { query } from "./db";
import { getTodayIST, getNowIST } from "./timezone";

/**
 * Runs a daily cleanup task to mark overdue PENDING/CONFIRMED orders as NOT_DELIVERED
 * and force-end any stale RouteShift records from previous days.
 * This function is designed to be called "lazily" when an admin logs in.
 */
export async function runDailyCleanup() {
    try {
        const today = getTodayIST(); // "YYYY-MM-DD" in IST
        const now = getNowIST();

        console.log(`[Cleanup] Checking for overdue orders before ${today}...`);

        // 1. Find candidate overdue orders
        const overdueOrdersRes = await query<{ id: string }>(
            `SELECT "id"
             FROM "Order"
             WHERE "status" IN ('PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY')
             AND ("deliveryDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date < $1::date`,
            [today]
        );

        if (overdueOrdersRes.rows.length > 0) {
            const orderIds = overdueOrdersRes.rows.map(o => o.id);
            console.log(`[Cleanup] Found ${orderIds.length} overdue orders. Processing...`);

            // 2. Update Order table status to NOT_DELIVERED
            await query(
                `UPDATE "Order"
                 SET "status" = 'NOT_DELIVERED',
                     "updatedAt" = $1
                 WHERE "id" = ANY($2::text[])`,
                [now, orderIds]
            );

            // 3. Update RouteOrder records for any assigned orders
            await query(
                `UPDATE "RouteOrder"
                 SET "deliveryStatus" = 'NOT_DELIVERED',
                     "notDeliveredReason" = 'Overdue - No Status Update',
                     "updatedAt" = $1
                 WHERE "orderId" = ANY($2::text[])
                 AND "deliveryStatus" != 'DELIVERED'`,
                [now, orderIds]
            );

            console.log(`[Cleanup] Successfully processed ${orderIds.length} overdue orders.`);
        } else {
            console.log(`[Cleanup] No overdue orders found.`);
        }

        // 4. Force-end any RouteShift records still ACTIVE or PAUSED from a PREVIOUS day
        const staleShiftsRes = await query<{ id: string }>(
            `SELECT rs."id"
             FROM "RouteShift" rs
             JOIN "Route" r ON r."id" = rs."routeId"
             WHERE rs."status" IN ('ACTIVE', 'PAUSED')
               AND (r."date" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date < $1::date`,
            [today]
        );

        if (staleShiftsRes.rows.length > 0) {
            const staleIds = staleShiftsRes.rows.map(s => s.id);

            // Force-end the RouteShift records
            await query(
                `UPDATE "RouteShift"
                 SET "status" = 'ENDED', "endedAt" = $1, "updatedAt" = $1
                 WHERE "id" = ANY($2::text[])`,
                [now, staleIds]
            );

            // Also mark their Route as submitted so it's consistent
            await query(
                `UPDATE "Route" SET "isSubmitted" = true, "submittedAt" = $1, "updatedAt" = $1
                 WHERE "id" IN (
                   SELECT "routeId" FROM "RouteShift" WHERE "id" = ANY($2::text[])
                 ) AND "isSubmitted" = false`,
                [now, staleIds]
            );

            // Insert FORCE_ENDED ShiftLog entry for each stale shift (for auditing)
            for (const shiftId of staleIds) {
                await query(
                    `INSERT INTO "ShiftLog" ("id", "routeShiftId", "action", "actorType", "metadata", "createdAt")
                     VALUES (gen_random_uuid(), $1, 'FORCE_ENDED', 'SYSTEM', '{"reason":"midnight_cleanup"}', $2)`,
                    [shiftId, now]
                );
            }

            console.log(`[Cleanup] Force-ended ${staleIds.length} stale RouteShift record(s).`);
        }

    } catch (error) {
        console.error("[Cleanup] Failed to run daily cleanup:", error);
    }
}
