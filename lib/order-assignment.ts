import crypto from "crypto";
import { query, withTransaction } from "./db";
import { getStartOfDayIST, getEndOfDayIST } from "./timezone";
import { getNextWorkingDay } from "./holidays";
import { logAction } from "./audit";

type AssignmentResult = {
  success: boolean;
  alreadyAssigned?: boolean;
  reason?: string;
};

/**
 * Assigns an order to a delivery route based on the order's pincode and delivery date.
 * Idempotent: if the order is already assigned, it will exit without error.
 */
export async function assignOrderToRoute(orderId: string): Promise<AssignmentResult> {
  const now = new Date();

  try {
    // Fetch order + address info needed for assignment
    const orderRes = await query<{
      deliveryDate: Date;
      pincode: string;
      paymentStatus: string;
      paymentMethod: string;
      status: string;
    }>(
      `SELECT o."deliveryDate", a."pincode", o."paymentStatus", o."paymentMethod", o."status"
       FROM "Order" o
       JOIN "Address" a ON a."id" = o."addressId"
       WHERE o."id" = $1`,
      [orderId],
    );

    const order = orderRes.rows[0];
    if (!order) {
      return { success: false, reason: "order_not_found" };
    }

    // Guard: Never assign a CANCELLED, DELIVERED, or NOT_DELIVERED order to a route
    if (['CANCELLED', 'DELIVERED', 'NOT_DELIVERED'].includes(order.status)) {
      console.log(`[ASSIGN] Skipping order ${orderId} - status is terminal: ${order.status}`);
      return { success: false, reason: "order_in_terminal_status" };
    }

    // Guard: Never assign an ONLINE order that is still PENDING payment
    if (order.paymentMethod === 'ONLINE' && order.paymentStatus === 'PENDING') {
      console.log(`[ASSIGN] Skipping order ${orderId} - unpaid online order.`);
      return { success: false, reason: "unpaid_online_order" };
    }

    // Fast path: check if already assigned TO THIS SPECIFIC DATE
    const startOfOrderDay = getStartOfDayIST(new Date(order.deliveryDate));
    const endOfOrderDay = getEndOfDayIST(new Date(order.deliveryDate));
    
    const existingRouteOrder = await query<{ id: string }>(
      `SELECT ro."id" 
       FROM "RouteOrder" ro
       JOIN "Route" r ON ro."routeId" = r."id"
       WHERE ro."orderId" = $1 
         AND r."date" >= $2 AND r."date" < $3
       LIMIT 1`,
      [orderId, startOfOrderDay, endOfOrderDay],
    );
    if (existingRouteOrder.rows.length > 0) {
      return { success: true, alreadyAssigned: true };
    }

    // Use transaction
    return await withTransaction(async (client) => {
      // Re-verify assignment for this specific date
      const existingAssignmentRes = await client.query<{ id: string }>(
        `SELECT ro."id" 
         FROM "RouteOrder" ro
         JOIN "Route" r ON ro."routeId" = r."id"
         WHERE ro."orderId" = $1 
           AND r."date" >= $2 AND r."date" < $3
         LIMIT 1`,
        [orderId, startOfOrderDay, endOfOrderDay],
      );
      if (existingAssignmentRes.rows.length > 0) {
        return { success: true, alreadyAssigned: true };
      }

      // 1. Find the ServiceRoute for this pincode
      console.log(`[ASSIGN] Finding ServiceRoute for pincode: ${order.pincode}`);
      const serviceRouteRes = await client.query<{ serviceRouteId: string; currentDeliveryBoyId: string | null }>(
        `SELECT "id" as "serviceRouteId", "currentDeliveryBoyId"
         FROM "ServiceRoute"
         WHERE id = (
           SELECT "serviceRouteId" 
           FROM "ServiceArea" 
           WHERE "pincode" = $1 AND "active" = true
           LIMIT 1
         )`,
        [order.pincode]
      );

      if (serviceRouteRes.rows.length === 0 || !serviceRouteRes.rows[0].serviceRouteId) {
        console.log(`[ASSIGN] No ServiceRoute found for pincode: ${order.pincode}`);
        return { success: false, reason: "no_service_route" };
      }

      const { serviceRouteId, currentDeliveryBoyId } = serviceRouteRes.rows[0];
      console.log(`[ASSIGN] Found ServiceRoute: ${serviceRouteId}, DeliveryBoy: ${currentDeliveryBoyId}`);

      const startOfDay = getStartOfDayIST(new Date(order.deliveryDate));
      
      // --- HOLIDAY LOGIC START ---
      const holidayCheck = await getNextWorkingDay(startOfDay);
      if (holidayCheck.adjusted) {
        console.log(`[ASSIGN] Skipping order ${orderId} - ${startOfDay.toISOString()} is a holiday/weekly off.`);
        return { success: false, reason: "delivery_date_is_holiday" };
      }
      // --- HOLIDAY LOGIC END ---

      const endOfDay = getEndOfDayIST(new Date(order.deliveryDate));
      console.log(`[ASSIGN] Looking for Daily Route between ${startOfDay.toISOString()} and ${endOfDay.toISOString()}`);

      // 2. Find the Daily Route for this ServiceRoute and Date
      let routeRes = await client.query<{ id: string }>(
        `SELECT "id" 
          FROM "Route"
          WHERE "serviceRouteId" = $1 
            AND "date" >= $2
            AND "date" < $3
          LIMIT 1`,
        [serviceRouteId, startOfDay, endOfDay]
      );

      let routeId: string;

      if (routeRes.rows.length === 0) {
        console.log(`[ASSIGN] No existing daily route found`);
        // CARRY-FORWARD LOGIC:
        if (currentDeliveryBoyId) {
          routeId = crypto.randomUUID();
          console.log(`[ASSIGN] Creating new route: ${routeId}`);

          await client.query(
            `INSERT INTO "Route" ("id", "date", "serviceRouteId", "deliveryBoyId", "token", "tokenExpiresAt", "createdAt", "updatedAt")
              VALUES ($1, $2, $3, $4, NULL, NULL, NOW(), NOW())`,
            [routeId, startOfDay, serviceRouteId, currentDeliveryBoyId]
          );
        } else {
          console.log(`[ASSIGN] No staff assigned to carry forward`);
          return { success: false, reason: "no_daily_route_assigned" };
        }
      } else {
        routeId = routeRes.rows[0].id;
        console.log(`[ASSIGN] Found existing route: ${routeId}`);
      }

      // 3. Assign to the found Route
      const routeOrderId = crypto.randomUUID();
      try {
        console.log(`[ASSIGN] Inserting RouteOrder: ${routeOrderId} for Order: ${orderId} into Route: ${routeId}`);
        await client.query(
          `INSERT INTO "RouteOrder" ("id", "routeId", "orderId", "deliveryStatus", "codCollected", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'PENDING', false, $4, $4)
           ON CONFLICT ("orderId", "routeId") DO NOTHING`,
          [routeOrderId, routeId, orderId, now],
        );
      } catch (insertError: any) {
        if (insertError.code === '23505') {
          console.log(`[ASSIGN] RouteOrder conflict (already exists)`);
          return { success: true, alreadyAssigned: true };
        }
        console.error(`[ASSIGN] Insert Error: ${insertError.message}`);
        throw insertError;
      }

      // Update order status to CONFIRMED
      const updateResult = await client.query(
        `UPDATE "Order" 
         SET "status" = 'CONFIRMED', "updatedAt" = $2
         WHERE "id" = $1 AND "status" = 'PENDING'
         RETURNING "id"`,
        [orderId, now],
      );

      if (updateResult.rows.length > 0) {
        // Safe fetch of route and staff names for the audit log
        let routeName = "Unknown Route";
        let staffName = "Unassigned";
        try {
          const namesRes = await client.query<{ routeName: string, staffName: string }>(
            `SELECT sr."name" as "routeName", a."name" as "staffName"
             FROM "Route" r
             LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
             LEFT JOIN "DeliveryBoy" a ON r."deliveryBoyId" = a."id"
             WHERE r."id" = $1`,
            [routeId]
          );
          if (namesRes.rows.length > 0) {
            routeName = namesRes.rows[0].routeName || routeName;
            staffName = namesRes.rows[0].staffName || staffName;
          }
        } catch (e) {
          console.error("[ASSIGN] Failed to fetch route names for audit log:", e);
        }

        logAction({
          actorId: 'SYSTEM',
          actorType: 'SYSTEM',
          entity: 'ORDER',
          entityId: orderId,
          action: 'UPDATE',
          newData: { status: 'CONFIRMED' },
          description: `Order assigned and marked as CONFIRMED.\nRoute Name : ${routeName}\nDelivery staff : ${staffName}`
        });
      }

      return { success: true };
    });

  } catch (error) {
    console.error("Error assigning order to route:", error);
    return { success: false, reason: "assignment_error" };
  }
}

/**
 * Finds and assigns all unassigned orders for a given pincode.
 * Useful when a new delivery boy is assigned to an area.
 * @param pincode Single pincode or comma-separated pincodes
 */
export async function retroactivelyAssignOrders(pincode: string): Promise<number> {
  if (!pincode) return 0;

  const codes = pincode.split(",").map(c => c.trim()).filter(Boolean);
  let totalAssigned = 0;

  for (const code of codes) {
    const today = getStartOfDayIST(new Date());
    const pendingOrdersRes = await query<{ id: string }>(
      `SELECT o."id"
       FROM "Order" o
       JOIN "Address" a ON a."id" = o."addressId"
       WHERE o."status" IN ('PENDING', 'CONFIRMED')
         AND o."status" NOT IN ('CANCELLED', 'DELIVERED', 'NOT_DELIVERED')
         AND (o."paymentStatus" = 'SUCCESS' OR o."paymentStatus" = 'COD')
         AND a."pincode" = $1
         AND o."deliveryDate" >= ($2 AT TIME ZONE 'UTC')
         AND NOT EXISTS (
           SELECT 1 FROM "RouteOrder" ro WHERE ro."orderId" = o."id"
         )`,
      [code, today]
    );

    if (pendingOrdersRes.rows.length > 0) {


      for (const order of pendingOrdersRes.rows) {
        try {
          const result = await assignOrderToRoute(order.id);
          if (result.success) totalAssigned++;
        } catch (err) {
          console.error(`[ERROR] Failed to retroactively assign order ${order.id}:`, err);
        }
      }
    }
  }

  return totalAssigned;
}
/**
 * Reassigns all pending/confirmed orders for given pincodes to their new service routes.
 * This should be called when an admin changes the serviceRouteId mapping for a pincode.
 * Orders will only be moved if the current daily route (if any) DOES NOT have a magic link token.
 */
export async function reassignOrdersByPincodeBulk(pincodes: string[]): Promise<{ totalMoved: number, totalSkipped: number }> {
  if (!pincodes || pincodes.length === 0) return { totalMoved: 0, totalSkipped: 0 };

  const today = getStartOfDayIST(new Date());
  let totalMoved = 0;
  let totalSkipped = 0;

  // 1. Find all active orders for these pincodes from today onwards
  const pendingOrdersRes = await query<{ id: string; routeId: string | null; token: string | null }>(
    `SELECT o."id", ro."routeId", r."token"
     FROM "Order" o
     JOIN "Address" a ON a."id" = o."addressId"
     LEFT JOIN "RouteOrder" ro ON ro."orderId" = o."id"
     LEFT JOIN "Route" r ON r."id" = ro."routeId"
     WHERE a."pincode" = ANY($1)
       AND o."deliveryDate" >= ($2 AT TIME ZONE 'UTC')
       AND o."status" IN ('PENDING', 'CONFIRMED')
       AND o."status" NOT IN ('CANCELLED', 'DELIVERED', 'NOT_DELIVERED')
       AND (o."paymentStatus" = 'SUCCESS' OR o."paymentStatus" = 'COD')`,
    [pincodes, today]
  );

  for (const order of pendingOrdersRes.rows) {
    try {
      // 2. Safety Check: If already linked to a route that HAS a token, skip it.
      if (order.token) {
        console.log(`[REASSIGN] Skipping order ${order.id} - route already has token.`);
        totalSkipped++;
        continue;
      }

      // 3. Use transaction to unassign and reassign
      await withTransaction(async (client) => {
        // Remove from current route if exists
        if (order.routeId) {
          await client.query(`DELETE FROM "RouteOrder" WHERE "orderId" = $1`, [order.id]);
        }

        // Mark as PENDING so assignOrderToRoute picks it up properly
        // Guard: Never reset a CANCELLED or DELIVERED order
        await client.query(
          `UPDATE "Order" SET "status" = 'PENDING' WHERE "id" = $1
           AND "status" NOT IN ('CANCELLED', 'DELIVERED', 'NOT_DELIVERED')`,
          [order.id]
        );
      });

      // 4. Call assigning logic (this will look up the NEW service route and assign)
      const result = await assignOrderToRoute(order.id);
      if (result.success) {
        totalMoved++;
      } else {
        console.error(`[REASSIGN] Failed to reassign order ${order.id}: ${result.reason}`);
      }
    } catch (err) {
      console.error(`[ERROR] Failed during bulk reassignment for order ${order.id}:`, err);
    }
  }

  return { totalMoved, totalSkipped };
}

/**
 * Automatically reassigns an order to the next available working day.
 * Used for automatic recovery from certain delivery failure reasons.
 */
export async function reassignOrderToNextWorkingDay(orderId: string, reason?: string): Promise<AssignmentResult> {
  try {
    // 0. Get current order details for logging
    const orderRes = await query<{ deliveryDate: Date }>(
      `SELECT "deliveryDate" FROM "Order" WHERE "id" = $1`,
      [orderId]
    );
    const oldDate = orderRes.rows[0]?.deliveryDate;

    // 1. Get next working day starting from tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const nextWorkingDay = await getNextWorkingDay(tomorrow);
    const newDate = nextWorkingDay.date;

    // 2. Log the automatic reassignment
    try {
      const oldDateStr = oldDate ? new Date(oldDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : "N/A";
      const newDateStr = new Date(newDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      
      await query(
        `INSERT INTO "OrderActivityLog" ("id", "orderId", "action", "description", "metadata", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          crypto.randomUUID(),
          orderId,
          'REASSIGNED',
          `Auto-reassigned from ${oldDateStr} to ${newDateStr}${reason ? ` due to: ${reason}` : ''}.`,
          JSON.stringify({
            oldDate,
            newDate,
            reason,
            type: 'AUTOMATIC'
          }),
          new Date()
        ]
      );

      // Log to central AuditLog
      logAction({
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        entity: 'ORDER',
        entityId: orderId,
        action: 'UPDATE',
        description: `Auto-rescheduled order from ${oldDateStr} to ${newDateStr} ${reason ? `due to: ${reason}` : ''}`,
        oldData: { deliveryDate: oldDate },
        newData: { deliveryDate: newDate }
      });
    } catch (logError) {
      console.error("[AUTO-REASSIGN] Failed to log activity:", logError);
    }

    // 3. Update order delivery date and reset status to PENDING
    await query(
      `UPDATE "Order" 
       SET "deliveryDate" = $1, "status" = 'PENDING', "updatedAt" = NOW() 
       WHERE "id" = $2`,
      [newDate, orderId]
    );

    // 4. Trigger assignment logic
    return await assignOrderToRoute(orderId);
  } catch (error) {
    console.error(`[AUTO-REASSIGN] Failed for order ${orderId}:`, error);
    return { success: false, reason: "auto_reassign_failed" };
  }
}

