import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getTodayIST, getNowIST } from "../../../../lib/timezone";
import { runDailyCleanup } from "../../../../lib/cron-cleanup";

// GET /api/admin/dashboard - Get dashboard statistics

export async function GET(req: NextRequest) {
  // Wait for cleanup check to ensure it completes before the request finishes
  try {
    await runDailyCleanup();
  } catch (err) {
    console.error("Lazy cleanup error:", err);
  }

  try {
    // Admin authentication check
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    let startDateTime: Date;
    let endDateTime: Date;

    const today = new Date();
    const startOfToday = getStartOfDayIST(today);
    const endOfToday = getEndOfDayIST(today);

    if (startDateParam && endDateParam) {
      startDateTime = getStartOfDayIST(new Date(startDateParam));
      endDateTime = getEndOfDayIST(new Date(endDateParam));
    } else {
      startDateTime = startOfToday;
      endDateTime = endOfToday;
    }

    // Calculate Previous Day (The day before startDateTime)
    const previousDayStart = getStartOfDayIST(new Date(startDateTime.getTime() - 24 * 60 * 60 * 1000));
    const previousDayEnd = getEndOfDayIST(new Date(startDateTime.getTime() - 24 * 60 * 60 * 1000));

    // Execute all independent queries in parallel
    const [
      totalOrdersRes,
      rangeOrdersReceivedRes, // Previously "todayOrdersReceived"
      rangeScheduledDeliveriesRes, // Previously "todayScheduledDeliveries"
      deliveryBoysRes,
      revenueRes, // Keep as All Time? Or Filtered? Let's make it Filtered Revenue for the period.
      customerUsageRes,
      totalCansWithCustomersRes, // This is a current state, not historical. Keep as is.
      cansToBeDeliveredRes,
      cansDeliveredRes,
      rangeRevenueRes, // Previously "todayRevenue"
      codExpectedRes,
      codCollectedRes,
      ordersByTimeRes, // Previously "todayOrdersByTime"
      topPincodesRes,
      // New queries for detailed counts and amounts
      paidOrdersRes,
      codOrdersRes,
      deliveredOrdersRes,
      nonDeliveredOrdersRes,
      totalOrdersAmountRes,
      reassignedOrdersRes,
      // Previous Day Specific Stats
      prevTotalOrdersRes,
      prevPaidOrdersRes,
      prevCodOrdersRes,
      prevDeliveredRes,
      prevNonDeliveredRes,
      // Order Date Specific Stats (New)
      orderDateCodCollectedRes,
      deliveryDateCodCollectedRes,
      paidOrdersDeliveryRes,
      codOrdersDeliveryRes,
      qrOrdersDeliveryRes,
      routeWiseProductsRes
    ] = await Promise.all([
      // 1. Total Orders (Filtered by Date Range if provided, else All Time? 
      query<{ count: number }>(
        `SELECT COUNT(*)::int as count
         FROM "Order" o
         WHERE o."status" != 'CANCELLED'
         AND (o."paymentStatus" = 'SUCCESS' OR o."paymentMethod" = 'COD')`
      ),
      // 2. Orders Received (In Selected Range)
      query<{ count: number }>(
        `SELECT COUNT(*)::int as count
           FROM "Order" o
           WHERE o."createdAt" >= $1 AND o."createdAt" <= $2
           AND o."status" != 'CANCELLED'`,
        [startDateTime, endDateTime]
      ),
      // 3. Orders Scheduled for Delivery (In Selected Range)
      query<{ count: number }>(
        `SELECT COUNT(*)::int as count
         FROM "Order" o
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR EXISTS (
             SELECT 1 FROM "RouteOrder" ro
             JOIN "Route" r ON ro."routeId" = r."id"
             WHERE ro."orderId" = o."id"
             AND r."date" >= $1 AND r."date" <= $2
           )
         )
         AND o."status" != 'CANCELLED'`,
        [startDateTime, endDateTime]
      ),
      // 4. Active Delivery Boys (Current State - Independent of date)
      query<{ count: number }>(
        `SELECT COUNT(*)::int as count
         FROM "DeliveryBoy"
         WHERE "active" = true`
      ),
      // 5. Total Revenue (All Time)
      query<{ revenue: number }>(
        `WITH OrderStats AS (
           SELECT 
             o."id", 
             o."amount" as orderAmount,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" != 'COD'), 0) as onlinePaid,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" = 'COD'), 0) as cashPaid,
             EXISTS(SELECT 1 FROM "RouteOrder" ro WHERE ro."orderId" = o."id" AND ro."codCollected" = true) as "hasCodCollected"
           FROM "Order" o
           WHERE (o."status" != 'CANCELLED') AND (o."status" = 'DELIVERED' OR o."paymentStatus" = 'SUCCESS')
         )
         SELECT (
           (SELECT COALESCE(SUM(amount), 0) FROM "Payment" WHERE "status" = 'SUCCESS') +
           COALESCE(SUM(
             CASE WHEN ("hasCodCollected" = true AND cashPaid = 0) THEN (orderAmount - onlinePaid) ELSE 0 END
           ), 0)
         )::numeric / 100 as revenue
         FROM OrderStats`
      ),
      // 6. Customer Usage (Distinct customers in range)
      query<{ count: number }>(
        `SELECT COUNT(DISTINCT o."customerId")::int as count
         FROM "Order" o
         WHERE o."status" != 'CANCELLED'
         AND (o."paymentStatus" = 'SUCCESS' OR o."paymentMethod" = 'COD')
         AND o."createdAt" >= $1 AND o."createdAt" <= $2`,
        [startDateTime, endDateTime]
      ),
      // 7. Total Empty Cans with Customers (Current State)
      query<{ total: number }>(
        `SELECT COALESCE(SUM("cansInHand"), 0)::int as total
         FROM "Customer"`
      ),
      // 8. Cans To Be Delivered (In Range)
      query<{ total: number }>(
        `SELECT COALESCE(SUM(o."quantity"), 0)::int as total
         FROM "Order" o
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR EXISTS (
             SELECT 1 FROM "RouteOrder" ro
             JOIN "Route" r ON ro."routeId" = r."id"
             WHERE ro."orderId" = o."id"
             AND r."date" >= $1 AND r."date" <= $2
           )
         )
         AND o."status" != 'CANCELLED'`,
        [startDateTime, endDateTime]
      ),
      // 9. Cans Delivered (In Range)
      query<{ total: number }>(
        `SELECT COALESCE(SUM(o."quantity"), 0)::int as total
         FROM "Order" o
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR EXISTS (
             SELECT 1 FROM "RouteOrder" ro
             JOIN "Route" r ON ro."routeId" = r."id"
             WHERE ro."orderId" = o."id"
             AND r."date" >= $1 AND r."date" <= $2
           )
         )
         AND o."status" = 'DELIVERED'`,
        [startDateTime, endDateTime]
      ),
      // 10. Range Revenue (Collected in Range)
      query<{ revenue: number }>(
        `WITH OrderStats AS (
           SELECT 
             o."id", 
             o."amount" as orderAmount,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" != 'COD'), 0) as onlinePaid,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" = 'COD'), 0) as cashPaid,
             EXISTS(SELECT 1 FROM "RouteOrder" ro WHERE ro."orderId" = o."id" AND ro."codCollected" = true) as "hasCodCollected"
           FROM "Order" o
           WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR EXISTS (
             SELECT 1 FROM "RouteOrder" ro
             JOIN "Route" r ON ro."routeId" = r."id"
             WHERE ro."orderId" = o."id"
             AND r."date" >= $1 AND r."date" <= $2
           )
         )
           AND o."status" != 'CANCELLED'
           AND (o."status" = 'DELIVERED' OR o."paymentStatus" = 'SUCCESS')
         )
         SELECT (
           (SELECT COALESCE(SUM("amount"), 0) FROM "Payment" WHERE "status" = 'SUCCESS' AND "createdAt" >= $1 AND "createdAt" <= $2) +
           COALESCE(SUM(
             CASE WHEN ("hasCodCollected" = true AND cashPaid = 0) THEN (orderAmount - onlinePaid) ELSE 0 END
           ), 0)
         )::numeric / 100 as revenue
         FROM OrderStats`,
        [startDateTime, endDateTime]
      ),
       // 11. COD Expected (In Range)
      query<{ amount: number, count: number }>(
        `WITH OrderStats AS (
           SELECT 
             o."id", 
             o."amount" as orderAmount,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" != 'COD'), 0) as onlinePaid
           FROM "Order" o
           WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR EXISTS (
             SELECT 1 FROM "RouteOrder" ro
             JOIN "Route" r ON ro."routeId" = r."id"
             WHERE ro."orderId" = o."id"
             AND r."date" >= $1 AND r."date" <= $2
           )
         )
             AND o."status" != 'CANCELLED'
             AND o."paymentMethod" = 'COD'
         )
         SELECT 
           COALESCE(SUM(CASE WHEN (orderAmount - onlinePaid) > 0 THEN (orderAmount - onlinePaid) ELSE 0 END), 0)::numeric / 100 as amount,
           COUNT(CASE WHEN (orderAmount - onlinePaid) > 0 THEN 1 END)::int as count
         FROM OrderStats`,
        [startDateTime, endDateTime]
      ),
      // 12. COD Collected (In Range)
      query<{ amount: number, count: number }>(
        `WITH OrderStats AS (
           SELECT 
             o."id", 
             o."amount" as orderAmount,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" != 'COD'), 0) as onlinePaid,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" = 'COD'), 0) as cashPaid,
             EXISTS(SELECT 1 FROM "RouteOrder" ro WHERE ro."orderId" = o."id" AND ro."codCollected" = true) as "hasCodCollected"
           FROM "Order" o
           WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR EXISTS (
             SELECT 1 FROM "RouteOrder" ro
             JOIN "Route" r ON ro."routeId" = r."id"
             WHERE ro."orderId" = o."id"
             AND r."date" >= $1 AND r."date" <= $2
           )
         )
             AND o."status" = 'DELIVERED'
         )
         SELECT 
           COALESCE(SUM(
             cashPaid + 
             CASE WHEN ("hasCodCollected" = true AND cashPaid = 0 AND (orderAmount - onlinePaid) > 0) THEN (orderAmount - onlinePaid) ELSE 0 END
           ), 0)::numeric / 100 as amount,
           COUNT(CASE WHEN (cashPaid > 0 OR ("hasCodCollected" = true AND (orderAmount - onlinePaid) > 0)) THEN 1 END)::int as count
         FROM OrderStats`,
        [startDateTime, endDateTime]
      ),
      // 13. Orders By Time (In Range)
      query<{
        hour: number;
        codOrders: number;
        onlineOrders: number;
      }>(
        `SELECT 
          EXTRACT(HOUR FROM o."createdAt")::int as hour,
          COUNT(CASE WHEN o."paymentMethod" = 'COD' THEN 1 END)::int as "codOrders",
          COUNT(CASE WHEN o."paymentMethod" = 'ONLINE' THEN 1 END)::int as "onlineOrders"
         FROM "Order" o
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR EXISTS (
             SELECT 1 FROM "RouteOrder" ro
             JOIN "Route" r ON ro."routeId" = r."id"
             WHERE ro."orderId" = o."id"
             AND r."date" >= $1 AND r."date" <= $2
           )
          )
         GROUP BY EXTRACT(HOUR FROM o."createdAt")
         ORDER BY EXTRACT(HOUR FROM o."createdAt") ASC`,
        [startDateTime, endDateTime]
      ),
      // 14. Route-Wise Delivery Status
      query<{
        route_name: string;
        delivered: number;
        not_delivered: number;
        empty_cans: number;
        total_orders: number;
      }>(
        `SELECT 
          COALESCE(ro_sr."name", CASE WHEN $2 >= NOW() THEN sr."name" ELSE NULL END, 'Unassigned') as route_name,
          COUNT(DISTINCT CASE WHEN COALESCE(ro_sr."deliveryStatus"::text, o."status"::text) = 'DELIVERED' THEN o."id" END)::int as delivered,
          COUNT(DISTINCT CASE WHEN COALESCE(ro_sr."deliveryStatus"::text, o."status"::text) != 'DELIVERED' AND o."status" != 'CANCELLED' THEN o."id" END)::int as not_delivered,
          COALESCE(SUM(oi."actualReturnQuantity"), 0)::int as empty_cans,
          COUNT(DISTINCT o."id")::int as total_orders
         FROM "Order" o
         INNER JOIN "Address" a ON o."addressId" = a."id"
         LEFT JOIN LATERAL (
             SELECT sr_inner."name", ro_inner."deliveryStatus"
             FROM "RouteOrder" ro_inner
             JOIN "Route" r_inner ON ro_inner."routeId" = r_inner."id"
             JOIN "ServiceRoute" sr_inner ON r_inner."serviceRouteId" = sr_inner."id"
             WHERE ro_inner."orderId" = o."id"
             AND r_inner."date" >= $1 AND r_inner."date" <= $2
             ORDER BY 
               CASE WHEN ro_inner."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
               ro_inner."updatedAt" DESC
             LIMIT 1
         ) ro_sr ON true
         LEFT JOIN "ServiceArea" sa ON a."pincode" = sa."pincode"
         LEFT JOIN "ServiceRoute" sr ON sa."serviceRouteId" = sr."id"
         LEFT JOIN "OrderItem" oi ON o."id" = oi."orderId"
          WHERE (
            (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
            OR EXISTS (
              SELECT 1 FROM "RouteOrder" ro_hist
              JOIN "Route" r_hist ON ro_hist."routeId" = r_hist."id"
              WHERE ro_hist."orderId" = o."id"
              AND r_hist."date" >= $1 AND r_hist."date" <= $2
            )
          )
          AND o."status" != 'CANCELLED'
         GROUP BY COALESCE(ro_sr."name", CASE WHEN $2 >= NOW() THEN sr."name" ELSE NULL END, 'Unassigned')
         ORDER BY total_orders DESC`,
        [startDateTime, endDateTime]
      ),
      // 15. Paid Orders Count and Amount (By Order Date)
      query<{ count: number, amount: number }>(
        `SELECT COUNT(*)::int as count, COALESCE(SUM("amount"), 0)::numeric / 100 as amount
         FROM "Order"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
         AND "status" != 'CANCELLED'
         AND "paymentMethod" = 'ONLINE' AND "paymentStatus" = 'SUCCESS'`,
        [startDateTime, endDateTime]
      ),
      // 16. COD Orders Count and Amount (By Order Date)
      query<{ count: number, amount: number }>(
        `SELECT COUNT(*)::int as count, COALESCE(SUM("amount"), 0)::numeric / 100 as amount
         FROM "Order"
         WHERE "createdAt" >= $1 AND $2 >= "createdAt"
         AND "status" != 'CANCELLED'
         AND "paymentMethod" = 'COD'`,
        [startDateTime, endDateTime]
      ),
       // 17. Delivered Orders Count and Amount (Selected Range)
      query<{ count: number, amount: number }>(
        `SELECT COUNT(*)::int as count, COALESCE(SUM("amount"), 0)::numeric / 100 as amount
           FROM "Order" o
           LEFT JOIN LATERAL (
             SELECT ro."deliveryStatus"
             FROM "RouteOrder" ro
             JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
             WHERE ro."orderId" = o."id"
             AND r_inner."date" >= $1 AND r_inner."date" <= $2
             ORDER BY ro."updatedAt" DESC
             LIMIT 1
           ) day_ro ON true
           WHERE (
             (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
             OR day_ro."deliveryStatus" IS NOT NULL
           )
           AND o."status" != 'CANCELLED'
           AND COALESCE(day_ro."deliveryStatus"::text, o."status"::text) = 'DELIVERED'`,
         [startDateTime, endDateTime]
      ),
      // 18. Non-Delivered Orders Count (Selected Range)
      query<{ count: number, amount: number }>(
        `SELECT COUNT(*)::int as count, COALESCE(SUM("amount"), 0)::numeric / 100 as amount
           FROM "Order" o
           LEFT JOIN LATERAL (
             SELECT ro."deliveryStatus"
             FROM "RouteOrder" ro
             JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
             WHERE ro."orderId" = o."id"
             AND r_inner."date" >= $1 AND r_inner."date" <= $2
             ORDER BY ro."updatedAt" DESC
             LIMIT 1
           ) day_ro ON true
           WHERE (
             (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
             OR day_ro."deliveryStatus" IS NOT NULL
           )
           AND o."status" != 'CANCELLED'
           AND COALESCE(day_ro."deliveryStatus"::text, o."status"::text) NOT IN ('DELIVERED', 'CANCELLED')`,
         [startDateTime, endDateTime]
      ),
      // 19. Total Orders Amount (Booked Today)
      query<{ amount: number }>(
        `SELECT COALESCE(SUM("amount"), 0)::numeric / 100 as amount
         FROM "Order" o
         WHERE o."createdAt" >= $1 AND o."createdAt" <= $2
         AND o."status" != 'CANCELLED'
         AND (o."paymentStatus" = 'SUCCESS' OR o."paymentMethod" = 'COD')`,
        [startDateTime, endDateTime]
      ),
      // 20. Reassigned Orders (Orders scheduled for today that failed on a previous day)
      query<{ count: number, amount: number }>(
        `SELECT COUNT(*)::int as count, COALESCE(SUM("amount"), 0)::numeric / 100 as amount
         FROM "Order" o
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR EXISTS (
             SELECT 1 FROM "RouteOrder" ro
             JOIN "Route" r ON ro."routeId" = r."id"
             WHERE ro."orderId" = o."id"
             AND r."date" >= $1 AND r."date" <= $2
           )
         )
         AND o."status" != 'CANCELLED'
         AND EXISTS (
             SELECT 1 FROM "RouteOrder" ro_check 
             JOIN "Route" r_check ON ro_check."routeId" = r_check."id"
             WHERE ro_check."orderId" = o."id" 
             AND ro_check."deliveryStatus" = 'NOT_DELIVERED'
             AND r_check."date" < $1 -- Failed on a day BEFORE the current selection
         )`,
        [startDateTime, endDateTime]
      ),
      // 21. Previous Day Non-Delivered Total
      query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM "Order" o 
         LEFT JOIN LATERAL (
             SELECT ro."deliveryStatus"
             FROM "RouteOrder" ro
             JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
             WHERE ro."orderId" = o."id"
             AND r_inner."date" >= $1 AND r_inner."date" <= $2
             ORDER BY ro."updatedAt" DESC
             LIMIT 1
         ) day_ro ON true
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR day_ro."deliveryStatus" IS NOT NULL
         )
         AND o."status" != 'CANCELLED'
         AND COALESCE(day_ro."deliveryStatus"::text, o."status"::text) NOT IN ('DELIVERED', 'CANCELLED')`,
        [previousDayStart, previousDayEnd]
      ),
      // 22. Previous Day Non-Delivered Paid Orders
      query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM "Order" o 
         LEFT JOIN LATERAL (
             SELECT ro."deliveryStatus"
             FROM "RouteOrder" ro
             JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
             WHERE ro."orderId" = o."id"
             AND r_inner."date" >= $1 AND r_inner."date" <= $2
             ORDER BY ro."updatedAt" DESC
             LIMIT 1
         ) day_ro ON true
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR day_ro."deliveryStatus" IS NOT NULL
         )
         AND o."status" != 'CANCELLED'
         AND COALESCE(day_ro."deliveryStatus"::text, o."status"::text) NOT IN ('DELIVERED', 'CANCELLED')
         AND o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'SUCCESS'`,
        [previousDayStart, previousDayEnd]
      ),
      // 23. Previous Day Non-Delivered COD Orders
      query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM "Order" o 
         LEFT JOIN LATERAL (
             SELECT ro."deliveryStatus"
             FROM "RouteOrder" ro
             JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
             WHERE ro."orderId" = o."id"
             AND r_inner."date" >= $1 AND r_inner."date" <= $2
             ORDER BY ro."updatedAt" DESC
             LIMIT 1
         ) day_ro ON true
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR day_ro."deliveryStatus" IS NOT NULL
         )
         AND o."status" != 'CANCELLED'
         AND COALESCE(day_ro."deliveryStatus"::text, o."status"::text) NOT IN ('DELIVERED', 'CANCELLED')
         AND o."paymentMethod" = 'COD'`,
        [previousDayStart, previousDayEnd]
      ),
      // 24. Previous Day Delivered
      query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM "Order" o
         LEFT JOIN LATERAL (
             SELECT ro."deliveryStatus"
             FROM "RouteOrder" ro
             JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
             WHERE ro."orderId" = o."id"
             AND r_inner."date" >= $1 AND r_inner."date" <= $2
             ORDER BY ro."updatedAt" DESC
             LIMIT 1
         ) day_ro ON true
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR day_ro."deliveryStatus" IS NOT NULL
         )
         AND o."status" != 'CANCELLED'
         AND COALESCE(day_ro."deliveryStatus"::text, o."status"::text) = 'DELIVERED'`,
        [previousDayStart, previousDayEnd]
      ),
      // 25. Previous Day Non-Delivered
      query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM "Order" o
         LEFT JOIN LATERAL (
             SELECT ro."deliveryStatus"
             FROM "RouteOrder" ro
             JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
             WHERE ro."orderId" = o."id"
             AND r_inner."date" >= $1 AND r_inner."date" <= $2
             ORDER BY ro."updatedAt" DESC
             LIMIT 1
         ) day_ro ON true
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR day_ro."deliveryStatus" IS NOT NULL
         )
         AND o."status" != 'CANCELLED'
         AND COALESCE(day_ro."deliveryStatus"::text, o."status"::text) NOT IN ('DELIVERED', 'CANCELLED')`,
        [previousDayStart, previousDayEnd]
      ),
       // 26. COD Collected (By Order Date)
      query<{ amount: number, count: number }>(
        `WITH OrderStats AS (
           SELECT 
             o."id", 
             o."amount" as orderAmount,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" != 'COD'), 0) as onlinePaid,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" = 'COD'), 0) as cashPaid,
             EXISTS(SELECT 1 FROM "RouteOrder" ro WHERE ro."orderId" = o."id" AND ro."codCollected" = true) as "hasCodCollected"
           FROM "Order" o
           WHERE o."createdAt" >= $1 AND o."createdAt" <= $2
           AND o."status" = 'DELIVERED'
         )
         SELECT 
           COALESCE(SUM(
             cashPaid + 
             CASE WHEN ("hasCodCollected" = true AND cashPaid = 0 AND (orderAmount - onlinePaid) > 0) THEN (orderAmount - onlinePaid) ELSE 0 END
           ), 0)::numeric / 100 as amount,
           COUNT(CASE WHEN (cashPaid > 0 OR ("hasCodCollected" = true AND (orderAmount - onlinePaid) > 0)) THEN 1 END)::int as count
         FROM OrderStats`,
        [startDateTime, endDateTime]
      ),
       // 27. COD Collected (By Delivery Date)
      query<{ amount: number, count: number }>(
        `WITH OrderStats AS (
           SELECT 
             o."id", 
             o."amount" as orderAmount,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" != 'COD'), 0) as onlinePaid,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" = 'COD'), 0) as cashPaid,
             EXISTS(SELECT 1 FROM "RouteOrder" ro WHERE ro."orderId" = o."id" AND ro."codCollected" = true) as "hasCodCollected"
           FROM "Order" o
           WHERE (
             (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
             OR EXISTS (
               SELECT 1 FROM "RouteOrder" ro
               JOIN "Route" r ON ro."routeId" = r."id"
               WHERE ro."orderId" = o."id"
               AND r."date" >= $1 AND r."date" <= $2
             )
           )
           AND o."status" = 'DELIVERED'
         )
         SELECT 
           COALESCE(SUM(
             cashPaid + 
             CASE WHEN ("hasCodCollected" = true AND cashPaid = 0 AND (orderAmount - onlinePaid) > 0) THEN (orderAmount - onlinePaid) ELSE 0 END
           ), 0)::numeric / 100 as amount,
           COUNT(CASE WHEN (cashPaid > 0 OR ("hasCodCollected" = true AND (orderAmount - onlinePaid) > 0)) THEN 1 END)::int as count
         FROM OrderStats`,
        [startDateTime, endDateTime]
      ),
       // 28. Paid Orders Count and Amount (By Delivery Date)
      query<{ count: number, amount: number }>(
        `WITH OrderStats AS (
           SELECT 
             o."id", 
             o."amount" as orderAmount,
             o."paymentMethod",
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" != 'COD'), 0) as onlinePaid
           FROM "Order" o
           WHERE (
             (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
             OR EXISTS (
               SELECT 1 FROM "RouteOrder" ro
               JOIN "Route" r ON ro."routeId" = r."id"
               WHERE ro."orderId" = o."id"
               AND r."date" >= $1 AND r."date" <= $2
             )
           )
           AND o."status" != 'CANCELLED'
         )
         SELECT 
           COUNT(CASE WHEN (onlinePaid > 0 OR "paymentMethod" = 'ONLINE') THEN 1 END)::int as count,
           COALESCE(SUM(CASE WHEN (onlinePaid > 0 OR "paymentMethod" = 'ONLINE') THEN onlinePaid ELSE 0 END), 0)::numeric / 100 as amount
         FROM OrderStats`,
        [startDateTime, endDateTime]
      ),
      // 29. COD Orders Count and Amount (By Delivery Date)
      query<{ count: number, amount: number }>(
        `WITH OrderStats AS (
           SELECT 
             o."id", 
             o."amount" as orderAmount,
             COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" != 'COD'), 0) as onlinePaid
           FROM "Order" o
           WHERE (
             (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
             OR EXISTS (
               SELECT 1 FROM "RouteOrder" ro
               JOIN "Route" r ON ro."routeId" = r."id"
               WHERE ro."orderId" = o."id"
               AND r."date" >= $1 AND r."date" <= $2
             )
           )
           AND o."status" != 'CANCELLED'
           AND o."paymentMethod" = 'COD'
         )
         SELECT 
           COUNT(CASE WHEN (orderAmount - onlinePaid) > 0 THEN 1 END)::int as count,
           COALESCE(SUM(CASE WHEN (orderAmount - onlinePaid) > 0 THEN (orderAmount - onlinePaid) ELSE 0 END), 0)::numeric / 100 as amount
         FROM OrderStats`,
        [startDateTime, endDateTime]
      ),
      // 30. QR Orders Count and Amount (By Delivery Date)
      query<{ count: number, amount: number }>(
        `SELECT COUNT(*)::int as count, COALESCE(SUM("amount"), 0)::numeric / 100 as amount
         FROM "Order" o
         WHERE (
           (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
           OR EXISTS (
             SELECT 1 FROM "RouteOrder" ro
             JOIN "Route" r ON ro."routeId" = r."id"
             WHERE ro."orderId" = o."id"
             AND r."date" >= $1 AND r."date" <= $2
           )
         )
         AND o."status" != 'CANCELLED'
         AND o."isQrPayment" = true`,
        [startDateTime, endDateTime]
      ),
      // 31. Route-Wise Scheduled Products
      query<{
        route_name: string;
        product_name: string;
        total_quantity: number;
      }>(
        `SELECT 
          COALESCE(ro_sr."name", CASE WHEN $2 >= NOW() THEN sr."name" ELSE NULL END, 'Unassigned') as route_name,
          COALESCE(p."name", 'Unknown Product') as product_name,
          COALESCE(SUM(oi."quantity"), 0)::int as total_quantity
         FROM "Order" o
         INNER JOIN "Address" a ON o."addressId" = a."id"
         LEFT JOIN LATERAL (
             SELECT sr_inner."name"
             FROM "RouteOrder" ro_inner
             JOIN "Route" r_inner ON ro_inner."routeId" = r_inner."id"
             JOIN "ServiceRoute" sr_inner ON r_inner."serviceRouteId" = sr_inner."id"
             WHERE ro_inner."orderId" = o."id"
             AND r_inner."date" >= $1 AND r_inner."date" <= $2
             ORDER BY ro_inner."updatedAt" DESC
             LIMIT 1
         ) ro_sr ON true
         LEFT JOIN "ServiceArea" sa ON a."pincode" = sa."pincode"
         LEFT JOIN "ServiceRoute" sr ON sa."serviceRouteId" = sr."id"
         LEFT JOIN "OrderItem" oi ON o."id" = oi."orderId"
         LEFT JOIN "Product" p ON oi."productId" = p."id"
         WHERE (
            (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
            OR EXISTS (
              SELECT 1 FROM "RouteOrder" ro_hist
              JOIN "Route" r_hist ON ro_hist."routeId" = r_hist."id"
              WHERE ro_hist."orderId" = o."id"
              AND r_hist."date" >= $1 AND r_hist."date" <= $2
            )
          )
         AND o."status" != 'CANCELLED'
         GROUP BY COALESCE(ro_sr."name", CASE WHEN $2 >= NOW() THEN sr."name" ELSE NULL END, 'Unassigned'), p."name"
         ORDER BY COALESCE(ro_sr."name", CASE WHEN $2 >= NOW() THEN sr."name" ELSE NULL END, 'Unassigned') ASC, p."name" ASC`,
        [startDateTime, endDateTime]
      )
    ]);

    // Daily Revenue Trend
    const trendStart = new Date(endDateTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dailyRevenueRes = await query<{
      date: string;
      revenue: number;
    }>(
      `WITH date_series AS (
        SELECT generate_series(
          ($1 AT TIME ZONE 'Asia/Kolkata')::date,
          ($2 AT TIME ZONE 'Asia/Kolkata')::date,
          INTERVAL '1 day'
        )::date AS date
      ),
      OrderPayments AS (
        SELECT "orderId", SUM("amount") as totalPaid FROM "Payment" WHERE "status" = 'SUCCESS' GROUP BY "orderId"
      ),
      DailyData AS (
        SELECT DATE("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as date, "amount" FROM "Payment" WHERE "status" = 'SUCCESS' AND "createdAt" >= $1 AND "createdAt" <= $2
        UNION ALL
        SELECT DATE(o."deliveryDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as date, (o."amount" - COALESCE(op.totalPaid, 0)) as amount FROM "Order" o LEFT JOIN OrderPayments op ON o."id" = op."orderId" WHERE o."status" = 'DELIVERED' AND EXISTS(SELECT 1 FROM "RouteOrder" ro WHERE ro."orderId" = o."id" AND ro."codCollected" = true) AND (o."amount" - COALESCE(op.totalPaid, 0)) > 0 AND o."deliveryDate" >= $1 AND o."deliveryDate" <= $2
      )
      SELECT ds.date::text as date, COALESCE(SUM(dd.amount), 0)::numeric / 100 as revenue FROM date_series ds LEFT JOIN DailyData dd ON dd.date = ds.date GROUP BY ds.date ORDER BY ds.date ASC`,
      [trendStart, endDateTime]
    );

    const formatTimeSlot = (hour: number): string => {
      if (hour === 0) return '12A';
      if (hour < 12) return `${hour}A`;
      if (hour === 12) return '12P';
      return `${hour - 12}P`;
    };

    return NextResponse.json({
      success: true,
      stats: {
        totalOrders: totalOrdersRes.rows[0]?.count || 0,
        todayOrdersReceived: rangeOrdersReceivedRes.rows[0]?.count || 0,
        todayScheduledDeliveries: rangeScheduledDeliveriesRes.rows[0]?.count || 0,
        activeDeliveryBoys: deliveryBoysRes.rows[0]?.count || 0,
        revenue: Number(revenueRes.rows[0]?.revenue || 0),
        customerUsage: customerUsageRes.rows[0]?.count || 0,
        todayRevenue: Number(rangeRevenueRes.rows[0]?.revenue || 0),
        todayOrdersByTime: ordersByTimeRes.rows.map(row => ({ time: formatTimeSlot(row.hour), cod: row.codOrders || 0, online: row.onlineOrders || 0 })),
        topPincodes: topPincodesRes.rows.map(row => ({ routeName: row.route_name || 'Unassigned', delivered: row.delivered || 0, not_delivered: row.not_delivered || 0, empty_cans: row.empty_cans || 0 })),
        dailyRevenue: dailyRevenueRes.rows.map(row => ({ date: row.date, revenue: Number(row.revenue || 0) })),
        codExpected: Number(codExpectedRes.rows[0]?.amount || 0),
        codCollected: Number(codCollectedRes.rows[0]?.amount || 0),
        codCollectedCount: codCollectedRes.rows[0]?.count || 0,
        orderDateRevenue: Number(paidOrdersRes.rows[0]?.amount || 0) + Number(orderDateCodCollectedRes.rows[0]?.amount || 0),
        orderDateRevenueCount: (paidOrdersRes.rows[0]?.count || 0) + (orderDateCodCollectedRes.rows[0]?.count || 0),
        orderDateCodCollected: Number(orderDateCodCollectedRes.rows[0]?.amount || 0),
        orderDateCodCollectedCount: orderDateCodCollectedRes.rows[0]?.count || 0,
        cansToBeDelivered: cansToBeDeliveredRes.rows[0]?.total || 0,
        cansDelivered: cansDeliveredRes.rows[0]?.total || 0,
        totalCansWithCustomers: totalCansWithCustomersRes.rows[0]?.total || 0,
        todayOrdersAmount: Number(totalOrdersAmountRes.rows[0]?.amount || 0),
        paidOrdersCount: paidOrdersRes.rows[0]?.count || 0,
        paidOrdersAmount: Number(paidOrdersRes.rows[0]?.amount || 0),
        codOrdersCount: codOrdersRes.rows[0]?.count || 0,
        codOrdersAmount: Number(codOrdersRes.rows[0]?.amount || 0),
        deliveredOrdersCount: deliveredOrdersRes.rows[0]?.count || 0,
        deliveredOrdersAmount: Number(deliveredOrdersRes.rows[0]?.amount || 0),
        nonDeliveredOrdersCount: nonDeliveredOrdersRes.rows[0]?.count || 0,
        nonDeliveredOrdersAmount: Number(nonDeliveredOrdersRes.rows[0]?.amount || 0),
        reassignedOrdersCount: reassignedOrdersRes.rows[0]?.count || 0,
        reassignedOrdersAmount: Number(reassignedOrdersRes.rows[0]?.amount || 0),
        totalScheduledCount: deliveredOrdersRes.rows[0]?.count + nonDeliveredOrdersRes.rows[0]?.count,
        newOrdersScheduledCount: (deliveredOrdersRes.rows[0]?.count + nonDeliveredOrdersRes.rows[0]?.count) - reassignedOrdersRes.rows[0]?.count,
        prevTotalOrdersCount: prevTotalOrdersRes.rows[0]?.count || 0,
        prevPaidOrdersCount: prevPaidOrdersRes.rows[0]?.count || 0,
        prevCodOrdersCount: prevCodOrdersRes.rows[0]?.count || 0,
        prevDeliveredCount: prevDeliveredRes.rows[0]?.count || 0,
        prevNonDeliveredCount: prevNonDeliveredRes.rows[0]?.count || 0,
        deliveryDateCodCollected: Number(deliveryDateCodCollectedRes.rows[0]?.amount || 0),
        deliveryDateCodCollectedCount: deliveryDateCodCollectedRes.rows[0]?.count || 0,
        deliveryDatePaidCount: paidOrdersDeliveryRes.rows[0]?.count || 0,
        deliveryDatePaidAmount: Number(paidOrdersDeliveryRes.rows[0]?.amount || 0),
        deliveryDateCodCount: codOrdersDeliveryRes.rows[0]?.count || 0,
        deliveryDateCodAmount: Number(codOrdersDeliveryRes.rows[0]?.amount || 0),
        deliveryDateQrCount: qrOrdersDeliveryRes.rows[0]?.count || 0,
        deliveryDateQrAmount: Number(qrOrdersDeliveryRes.rows[0]?.amount || 0),
        routeWiseProducts: routeWiseProductsRes.rows.map(row => ({
          routeName: row.route_name,
          productName: row.product_name,
          totalQuantity: row.total_quantity
        })),
        isFiltered: !!(startDateParam && endDateParam)
      },
    });
  } catch (error) {
    console.error("Error in GET /api/admin/dashboard:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
