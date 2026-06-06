import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getNowIST } from "../../../../lib/timezone";

export const dynamic = 'force-dynamic';

// Price is now stored in order.amount (in paise)

// GET /api/admin/reports - Get delivery reports
export async function GET(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // Legacy single date support
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const deliveryBoyId = searchParams.get("deliveryBoyId");
    const serviceRouteId = searchParams.get("serviceRouteId");
    const pincode = searchParams.get("pincode")?.trim();
    const deliveryStatus = searchParams.get("deliveryStatus");
    const paymentMethod = searchParams.get("paymentMethod");
    const dateType = searchParams.get("dateType") || "createdAt"; // createdAt or deliveryDate

    console.log("Reports API called with:", { startDate, endDate, deliveryBoyId, serviceRouteId, pincode, deliveryStatus, paymentMethod, dateType });

    // Determine date range
    let startOfDay: Date;
    let endOfDay: Date;

    if (startDate && endDate) {
      startOfDay = getStartOfDayIST(new Date(startDate));
      endOfDay = getEndOfDayIST(new Date(endDate));
    } else if (startDate) {
      startOfDay = getStartOfDayIST(new Date(startDate));
      endOfDay = getEndOfDayIST(new Date(startDate));
    } else if (endDate) {
      startOfDay = getStartOfDayIST(new Date(endDate));
      endOfDay = getEndOfDayIST(new Date(endDate));
    } else if (date) {
      startOfDay = getStartOfDayIST(new Date(date));
      endOfDay = getEndOfDayIST(new Date(date));
    } else {
      const today = getNowIST();
      startOfDay = getStartOfDayIST(today);
      endOfDay = getEndOfDayIST(today);
    }

    // Build query conditions for route-based queries (Used by stats and details)
    let commonWhereConditions: string[] = [];
    let commonQueryParams: any[] = [];
    let commonParamIndex = 1;

    const dateField = dateType === "deliveryDate" ? "deliveryDate" : "createdAt";

    // Global exclusions (pending online orders)
    commonWhereConditions.push(`NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')`);

    if (dateType === 'deliveryDate') {
      commonWhereConditions.push(`(
        (o."deliveryDate" >= $${commonParamIndex} AND o."deliveryDate" <= $${commonParamIndex + 1})
        OR
        EXISTS (
          SELECT 1 FROM "RouteOrder" ro_active
          JOIN "Route" r_active ON ro_active."routeId" = r_active."id"
          WHERE ro_active."orderId" = o."id" 
          AND r_active."date" >= $${commonParamIndex} 
          AND r_active."date" <= $${commonParamIndex + 1}
        )
      )`);
    } else {
      commonWhereConditions.push(
        `o."${dateField}" >= $${commonParamIndex} AND o."${dateField}" <= $${commonParamIndex + 1}`
      );
    }
    commonQueryParams.push(startOfDay, endOfDay);
    commonParamIndex += 2;

    if (deliveryBoyId) {
      commonWhereConditions.push(`r."deliveryBoyId" = $${commonParamIndex}`);
      commonQueryParams.push(deliveryBoyId);
      commonParamIndex += 1;
    }

    if (serviceRouteId) {
      // Filter by Route's ServiceRouteId if assigned, otherwise fall back to ServiceArea for unassigned
      commonWhereConditions.push(`COALESCE(r."serviceRouteId", sa."serviceRouteId") = $${commonParamIndex}`);
      commonQueryParams.push(serviceRouteId);
      commonParamIndex += 1;
    }

    if (pincode) {
      // Use explicit table alias for pincode to avoid ambiguity if needed
      // In this context, it's usually from Order's Address (a."pincode")
      commonWhereConditions.push(`a."pincode" = $${commonParamIndex}`);
      commonQueryParams.push(pincode);
      commonParamIndex += 1;
    }

    if (deliveryStatus && deliveryStatus !== 'all') {
      if (deliveryStatus === 'CANCELLED') {
        commonWhereConditions.push(`o."status" = 'CANCELLED'`);
      } else {
        commonWhereConditions.push(`o."status" != 'CANCELLED'`);

        const effectiveStatusSql = `COALESCE(day_ro."deliveryStatus"::text, o."status"::text)`;

        if (deliveryStatus === 'ORDER_RECEIVED') {
          commonWhereConditions.push(`o."status" = 'PENDING'`);
          commonWhereConditions.push(`o."paymentStatus" IN ('SUCCESS', 'COD')`);
          commonWhereConditions.push(`NOT EXISTS (SELECT 1 FROM "RouteOrder" ro_check WHERE ro_check."orderId" = o."id" AND ro_check."deliveryStatus" != 'NOT_DELIVERED')`);
        } else if (deliveryStatus === 'CONFIRMED') {
          commonWhereConditions.push(`${effectiveStatusSql} IS NOT NULL`);
          commonWhereConditions.push(`r."token" IS NULL`);
          commonWhereConditions.push(`${effectiveStatusSql} NOT IN ('DELIVERED', 'NOT_DELIVERED')`);
        } else if (deliveryStatus === 'DELIVERY_IN_PROGRESS') {
          commonWhereConditions.push(`r."token" IS NOT NULL`);
          commonWhereConditions.push(`${effectiveStatusSql} NOT IN ('DELIVERED', 'NOT_DELIVERED')`);
        } else if (deliveryStatus === 'PENDING') {
          commonWhereConditions.push(`(${effectiveStatusSql} = 'PENDING' OR ${effectiveStatusSql} IS NULL)`);
        } else {
          // DELIVERED / NOT_DELIVERED
          commonWhereConditions.push(`${effectiveStatusSql} = $${commonParamIndex}`);
          commonQueryParams.push(deliveryStatus);
          commonParamIndex += 1;
        }
      }
    }

    if (paymentMethod && paymentMethod !== 'all') {
      if (paymentMethod === 'QR') {
        commonWhereConditions.push(`o."isQrPayment" = true`);
      } else {
        commonWhereConditions.push(`o."paymentMethod" = $${commonParamIndex}`);
        commonQueryParams.push(paymentMethod);
        commonParamIndex += 1;
      }
    }

    const commonWhereClause =
      commonWhereConditions.length > 0 ? `WHERE ${commonWhereConditions.join(" AND ")}` : "";

    // Build query conditions for total orders query
    let totalOrdersQuery = "";
    let totalOrdersQueryParams: any[] = [startOfDay, endOfDay];

    const hasExtendedFilters = deliveryBoyId || serviceRouteId || pincode || (deliveryStatus && deliveryStatus !== 'all') || (paymentMethod && paymentMethod !== 'all') || (dateType !== 'createdAt');

    if (hasExtendedFilters) {
      totalOrdersQuery = `
        SELECT COUNT(DISTINCT o."id")::int as "totalOrders"
        FROM "Order" o
        LEFT JOIN LATERAL (
          SELECT ro."deliveryStatus", ro."routeId"
          FROM "RouteOrder" ro
          JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
          WHERE ro."orderId" = o."id"
          ${dateType === 'deliveryDate' ? `AND r_inner."date" >= $1 AND r_inner."date" <= $2` : ''}
          ORDER BY 
            CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
            ro."updatedAt" DESC
          LIMIT 1
        ) day_ro ON true
        LEFT JOIN "Route" r ON day_ro."routeId" = r."id"
        LEFT JOIN "Address" a ON o."addressId" = a."id"
        LEFT JOIN "ServiceArea" sa ON a."pincode" = sa."pincode"
        ${commonWhereClause}
      `;
      totalOrdersQueryParams = commonQueryParams;
    } else {
      totalOrdersQuery = `
        SELECT COUNT(DISTINCT o."id")::int as "totalOrders"
        FROM "Order" o
        WHERE o."createdAt" >= $1 AND o."createdAt" <= $2
        AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
      `;
    }

    // Get consolidated order data for calculation
    let statsQuery = "";
    let statsParams = commonQueryParams;

    if (hasExtendedFilters) {
      statsQuery = `
        SELECT
          o."id" as "orderId",
          o."quantity",
          o."amount",
          o."paymentStatus",
          day_ro."deliveryStatus",
          day_ro."codCollected"
        FROM "Order" o
        LEFT JOIN LATERAL (
          SELECT ro."deliveryStatus", ro."codCollected", ro."routeId"
          FROM "RouteOrder" ro
          JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
          WHERE ro."orderId" = o."id"
          ${dateType === 'deliveryDate' ? `AND r_inner."date" >= $1 AND r_inner."date" <= $2` : ''}
          ORDER BY
            CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
            ro."updatedAt" DESC
          LIMIT 1
        ) day_ro ON true
        LEFT JOIN "Route" r ON day_ro."routeId" = r."id"
        LEFT JOIN "Address" a ON o."addressId" = a."id"
        LEFT JOIN "ServiceArea" sa ON a."pincode" = sa."pincode"
        ${commonWhereClause}
        AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')`;
    } else {
      statsQuery = `
        SELECT
          o."id" as "orderId",
          o."quantity",
          o."amount",
          o."paymentStatus",
          day_ro."deliveryStatus",
          day_ro."codCollected"
        FROM "Order" o
        LEFT JOIN LATERAL (
          SELECT ro."deliveryStatus", ro."codCollected"
          FROM "RouteOrder" ro
          JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
          WHERE ro."orderId" = o."id"
          ORDER BY
            CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
            ro."updatedAt" DESC
          LIMIT 1
        ) day_ro ON true
        WHERE o."createdAt" >= $1 AND o."createdAt" <= $2
        AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')`;
      statsParams = [startOfDay, endOfDay];
    }

    // Prepare details query if needed
    const includeDetails = searchParams.get("includeDetails") === "true";
    let detailsQuery = "";
    let detailsQueryParams: any[] = [];

    if (includeDetails) {
      if (hasExtendedFilters) {
        detailsQuery = `
          SELECT
            o."id",
            o."orderNumber",
            o."quantity",
            o."amount",
            o."deliveryDate",
            o."deliverySlot",
            o."status",
            o."paymentStatus",
            o."paymentMethod",
            o."paymentInstrument",
            o."isQrPayment",
            o."createdAt" as "orderCreatedAt",
            o."customerId",
            c."name" as "customerName",
            c."phone" as "customerPhone",
            a."line1" as "addressLine1",
            a."line2" as "addressLine2",
            a."area" as "addressArea",
            a."city" as "addressCity",
            a."pincode" as "addressPincode",
            day_ro."deliveryStatus",
            day_ro."notDeliveredReason",
            day_ro."codCollected",
            day_ro."routeOrderCreatedAt",
            day_ro."deliveredDate",
            day_ro."routeName",
            day_ro."deliveryBoyName",
            day_ro."isAssigned",
            day_ro."isRouteGenerated",
            COALESCE(
              (SELECT 
                CASE 
                  WHEN COUNT(*) = 1 THEN MAX(p_inner."name")
                  ELSE MAX(p_inner."name") || ' + ' || (COUNT(*) - 1) || ' more'
                END
               FROM "OrderItem" oi_inner
               JOIN "Product" p_inner ON oi_inner."productId" = p_inner."id"
               WHERE oi_inner."orderId" = o."id"
              ),
              (SELECT p_fallback."name" FROM "Product" p_fallback WHERE p_fallback."id" = o."productId"),
              'Water Can'
            ) as "productName"
          FROM "Order" o
          LEFT JOIN LATERAL (
            SELECT
              ro."deliveryStatus",
              ro."notDeliveredReason",
              ro."codCollected",
              ro."createdAt" as "routeOrderCreatedAt",
              ro."updatedAt" as "deliveredDate",
              ro."routeId",
              (ro."id" IS NOT NULL) as "isAssigned",
              (r_inner."token" IS NOT NULL) as "isRouteGenerated",
              COALESCE(sr_inner."name", sr_area_inner."name") as "routeName",
              db_inner."name" as "deliveryBoyName"
            FROM "RouteOrder" ro
            LEFT JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
            LEFT JOIN "ServiceRoute" sr_inner ON r_inner."serviceRouteId" = sr_inner."id"
            LEFT JOIN "DeliveryBoy" db_inner ON r_inner."deliveryBoyId" = db_inner."id"
            LEFT JOIN "Address" a_inner ON a_inner."id" = o."addressId"
            LEFT JOIN "ServiceArea" sa_inner ON a_inner."pincode" = sa_inner."pincode"
            LEFT JOIN "ServiceRoute" sr_area_inner ON sa_inner."serviceRouteId" = sr_area_inner."id"
            WHERE ro."orderId" = o."id"
            ${dateType === 'deliveryDate' ? `AND r_inner."date" >= $1 AND r_inner."date" <= $2` : ''}
            ORDER BY
              CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
              ro."updatedAt" DESC
            LIMIT 1
          ) day_ro ON true
          LEFT JOIN "Route" r ON day_ro."routeId" = r."id"
          INNER JOIN "Customer" c ON o."customerId" = c."id"
          LEFT JOIN "Address" a ON o."addressId" = a."id"
          LEFT JOIN "ServiceArea" sa ON a."pincode" = sa."pincode"
          ${commonWhereClause}
        `;
        detailsQueryParams = commonQueryParams;
      } else {
        // Default details query when no extended filters are applied (usually createdAt report)
        detailsQuery = `
          SELECT
            o."id",
            o."orderNumber",
            o."quantity",
            o."amount",
            o."deliveryDate",
            o."deliverySlot",
            o."status",
            o."paymentStatus",
            o."paymentMethod",
            o."paymentInstrument",
            o."isQrPayment",
            o."createdAt" as "orderCreatedAt",
            o."customerId",
            c."name" as "customerName",
            c."phone" as "customerPhone",
            a."line1" as "addressLine1",
            a."line2" as "addressLine2",
            a."area" as "addressArea",
            a."city" as "addressCity",
            a."pincode" as "addressPincode",
            day_ro."deliveryStatus",
            day_ro."notDeliveredReason",
            day_ro."codCollected",
            day_ro."routeOrderCreatedAt",
            day_ro."deliveredDate",
            day_ro."routeName",
            day_ro."deliveryBoyName",
            day_ro."isAssigned",
            day_ro."isRouteGenerated",
            COALESCE(
              (SELECT 
                CASE 
                  WHEN COUNT(*) = 1 THEN MAX(p_inner."name")
                  ELSE MAX(p_inner."name") || ' + ' || (COUNT(*) - 1) || ' more'
                END
               FROM "OrderItem" oi_inner
               JOIN "Product" p_inner ON oi_inner."productId" = p_inner."id"
               WHERE oi_inner."orderId" = o."id"
              ),
              (SELECT p_fallback."name" FROM "Product" p_fallback WHERE p_fallback."id" = o."productId"),
              'Water Can'
            ) as "productName"
          FROM "Order" o
          LEFT JOIN LATERAL (
            SELECT
              ro."deliveryStatus",
              ro."notDeliveredReason",
              ro."codCollected",
              ro."createdAt" as "routeOrderCreatedAt",
              ro."updatedAt" as "deliveredDate",
              ro."routeId",
              (ro."id" IS NOT NULL) as "isAssigned",
              (r_inner."token" IS NOT NULL) as "isRouteGenerated",
              COALESCE(sr_inner."name", sr_area_inner."name") as "routeName",
              db_inner."name" as "deliveryBoyName"
            FROM "RouteOrder" ro
            LEFT JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
            LEFT JOIN "ServiceRoute" sr_inner ON r_inner."serviceRouteId" = sr_inner."id"
            LEFT JOIN "DeliveryBoy" db_inner ON r_inner."deliveryBoyId" = db_inner."id"
            LEFT JOIN "Address" a_inner ON a_inner."id" = o."addressId"
            LEFT JOIN "ServiceArea" sa_inner ON a_inner."pincode" = sa_inner."pincode"
            LEFT JOIN "ServiceRoute" sr_area_inner ON sa_inner."serviceRouteId" = sr_area_inner."id"
            WHERE ro."orderId" = o."id"
            ORDER BY
              CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
              ro."updatedAt" DESC
            LIMIT 1
          ) day_ro ON true
          LEFT JOIN "Route" r ON day_ro."routeId" = r."id"
          INNER JOIN "Customer" c ON o."customerId" = c."id"
          LEFT JOIN "Address" a ON o."addressId" = a."id"
          WHERE o."createdAt" >= $1 AND o."createdAt" <= $2
          AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
        `;
        detailsQueryParams = [startOfDay, endOfDay];
      }
    }

    const [
      totalOrdersRes,
      ordersRes,
      serviceAreasRes,
      detailsRes
    ] = await Promise.all([
      // 1. Total Orders
      query<{ totalOrders: number }>(totalOrdersQuery, totalOrdersQueryParams),

      // 2. Orders for stats
      query<{
        orderId: string;
        quantity: number;
        amount: number;
        paymentStatus: string;
        deliveryStatus: string | null;
        codCollected: boolean | null;
      }>(statsQuery, statsParams),

      // 3. Service Area mappings
      query<{ pincode: string; areaName: string }>(
        'SELECT "pincode", "areaName" FROM "ServiceArea"'
      ),

      // 4. Detailed orders (if requested)
      includeDetails
        ? query<any>(detailsQuery, detailsQueryParams)
        : Promise.resolve({ rows: [] })
    ]);
    const totalOrders = totalOrdersRes.rows[0]?.totalOrders || 0;

    // Get all payments for these orders
    const orderIds = ordersRes.rows.map(r => r.orderId);
    let orderPaymentsMap = new Map<string, Array<{ amount: number; method: string; provider: string }>>();

    if (orderIds.length > 0) {
      const paymentsRes = await query<{
        orderId: string;
        amount: number;
        method: string;
        provider: string;
      }>(
        `SELECT "orderId", "amount", "method", "provider" FROM "Payment" WHERE "orderId" = ANY($1::text[]) AND "status" = 'SUCCESS'`,
        [orderIds]
      );

      paymentsRes.rows.forEach(p => {
        const existing = orderPaymentsMap.get(p.orderId) || [];
        existing.push({
          amount: Number(p.amount),
          method: p.method,
          provider: p.provider
        });
        orderPaymentsMap.set(p.orderId, existing);
      });
    }

    // Initialize stats
    let ordersAssignedCount = 0;
    let ordersDelivered = 0;
    let ordersPending = 0;
    let ordersNotDelivered = 0;

    let onlinePaymentTotal = 0;
    let codExpected = 0;
    let codCollected = 0;

    // Calculate stats
    ordersRes.rows.forEach(row => {
      // Counts
      ordersAssignedCount++;
      // If deliveryStatus is null, it means it's unassigned but we count it as pending in the overall summary
      const status = row.deliveryStatus || 'PENDING';

      if (status === 'DELIVERED') ordersDelivered++;
      else if (status === 'PENDING') ordersPending++;
      else if (status === 'NOT_DELIVERED') ordersNotDelivered++;

      // Financials
      const orderAmountInPaise = Number(row.amount);
      const orderPayments = orderPaymentsMap.get(row.orderId) || [];

      const onlinePaidInPaise = orderPayments
        .filter(p => p.method === 'ONLINE' || (p.provider !== 'CASH' && p.method !== 'COD'))
        .reduce((sum, p) => sum + p.amount, 0);

      const cashPaidInPaise = orderPayments
        .filter(p => p.method === 'COD' || p.provider === 'CASH')
        .reduce((sum, p) => sum + p.amount, 0);

      const totalPaidInPaise = onlinePaidInPaise + cashPaidInPaise;
      const outstandingAmountInPaise = Math.max(0, orderAmountInPaise - totalPaidInPaise);

      // Online Payment Total (strictly online)
      onlinePaymentTotal += onlinePaidInPaise;

      // COD Collected
      let effectiveCollectedAmount = cashPaidInPaise;
      if (row.codCollected && cashPaidInPaise === 0) {
        // Legacy support or manual marks where payment record creation failed
        effectiveCollectedAmount = outstandingAmountInPaise;
      }
      codCollected += effectiveCollectedAmount;

      // COD Expected
      // COD Expected = cash already collected + outstanding amount that is likely to be cash
      // If paymentStatus is SUCCESS but there is an outstanding amount, it means a COD addition was made
      const isAwaitingCash = row.paymentStatus === 'COD' ||
        row.paymentStatus === 'PENDING' ||
        row.codCollected ||
        (row.paymentStatus === 'SUCCESS' && outstandingAmountInPaise > 0);

      const expectedCashFromThisOrder = cashPaidInPaise + (isAwaitingCash ? outstandingAmountInPaise : 0);

      codExpected += expectedCashFromThisOrder;
    });

    const report = {
      ordersAssigned: ordersAssignedCount,
      ordersDelivered,
      ordersPending,
      ordersNotDelivered,
      onlinePaymentTotal: onlinePaymentTotal / 100,
      codExpected: codExpected / 100,
      codCollected: codCollected / 100
    };

    // Total Payments = Online + COD Collected
    const totalPayments = report.onlinePaymentTotal + report.codCollected;

    // Calculate COD pending
    const codPending = report.codExpected - report.codCollected;

    // Service Area Map (from parallel query)
    const serviceAreaMap = new Map(serviceAreasRes.rows.map(sa => [sa.pincode, sa.areaName]));

    const formatRouteName = (areaStr: string | null) => {
      if (!areaStr) return "-";
      return areaStr
        .split(",")
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => {
          const name = serviceAreaMap.get(p);
          return name ? `${p} - ${name}` : p;
        })
        .join(", ");
    };

    // Fetch detailed orders if requested
    let detailedOrders: any[] = [];
    // includeDetails already defined above

    if (includeDetails) {
      detailedOrders = detailsRes.rows.map(order => ({
        ...order,
        amount: order.amount ? order.amount / 100 : 0,
        routeName: order.routeName || '-',
      }));

      // Sort in JS to ensure desired order (by order date desc)
      detailedOrders.sort((a, b) => {
        return new Date(b.orderCreatedAt).getTime() - new Date(a.orderCreatedAt).getTime();
      });

      // Fetch order items for all orders
      if (detailedOrders.length > 0) {
        const orderIds = detailedOrders.map(o => o.id);
        const orderItemsRes = await query<{
          orderId: string;
          itemId: string;
          productId: string;
          productName: string;
          quantity: number;
          price: number;
        }>(
          `SELECT 
            oi."orderId",
            oi."id" as "itemId",
            oi."productId",
            p."name" as "productName",
            oi."quantity",
            oi."price"
           FROM "OrderItem" oi
           JOIN "Product" p ON oi."productId" = p."id"
           WHERE oi."orderId" = ANY($1::text[])`,
          [orderIds]
        );

        // Create a map of orderId -> list of items
        const orderItemsMap = new Map<string, Array<{ id: string; productId: string; productName: string; quantity: number; price: number }>>();
        orderItemsRes.rows.forEach(row => {
          const existing = orderItemsMap.get(row.orderId) || [];
          existing.push({
            id: row.itemId,
            productId: row.productId,
            productName: row.productName,
            quantity: row.quantity,
            price: row.price
          });
          orderItemsMap.set(row.orderId, existing);
        });

        // Add items to each order
        detailedOrders = detailedOrders.map(order => ({
          ...order,
          items: orderItemsMap.get(order.id) || []
        }));
      }
    }

    // Calculate Stock Summary (Loading Sheet)
    const overallProductMap = new Map<string, number>();
    const staffStockMap = new Map<string, Map<string, number>>();
    const routeStockMap = new Map<string, Map<string, number>>();

    detailedOrders.forEach(order => {
      const staffName = order.deliveryBoyName || 'Unassigned';
      const routeName = order.routeName || 'Unassigned';

      if (!staffStockMap.has(staffName)) staffStockMap.set(staffName, new Map());
      if (!routeStockMap.has(routeName)) routeStockMap.set(routeName, new Map());

      const sMap = staffStockMap.get(staffName)!;
      const rMap = routeStockMap.get(routeName)!;

      if (order.items && order.items.length > 0) {
        order.items.forEach((item: any) => {
          // Overall
          overallProductMap.set(item.productName, (overallProductMap.get(item.productName) || 0) + item.quantity);
          // By Staff
          sMap.set(item.productName, (sMap.get(item.productName) || 0) + item.quantity);
          // By Route
          rMap.set(item.productName, (rMap.get(item.productName) || 0) + item.quantity);
        });
      } else {
        const name = order.productName || 'Water Can';
        // Overall
        overallProductMap.set(name, (overallProductMap.get(name) || 0) + order.quantity);
        // By Staff
        sMap.set(name, (sMap.get(name) || 0) + order.quantity);
        // By Route
        rMap.set(name, (rMap.get(name) || 0) + order.quantity);
      }
    });

    const stockReport = {
      total: {
        totalItems: Array.from(overallProductMap.values()).reduce((a, b) => a + b, 0),
        productBreakdown: Array.from(overallProductMap.entries()).map(([name, qty]) => ({
          productName: name,
          totalQuantity: qty
        }))
      },
      byStaff: Array.from(staffStockMap.entries()).map(([name, items]) => ({
        name,
        items: Array.from(items.entries()).map(([pName, qty]) => ({ productName: pName, totalQuantity: qty })),
        totalQuantity: Array.from(items.values()).reduce((a, b) => a + b, 0)
      })).sort((a, b) => b.totalQuantity - a.totalQuantity),
      byRoute: Array.from(routeStockMap.entries()).map(([name, items]) => ({
        name,
        items: Array.from(items.entries()).map(([pName, qty]) => ({ productName: pName, totalQuantity: qty })),
        totalQuantity: Array.from(items.values()).reduce((a, b) => a + b, 0)
      })).sort((a, b) => b.totalQuantity - a.totalQuantity),
    };

    return NextResponse.json({
      success: true,
      report: {
        totalOrders: totalOrders,
        ordersAssigned: report.ordersAssigned || 0,
        ordersDelivered: report.ordersDelivered || 0,
        ordersPending: report.ordersPending || 0,
        ordersNotDelivered: report.ordersNotDelivered || 0,
        payments: totalPayments || 0,
        onlinePaymentTotal: report.onlinePaymentTotal || 0,
        codExpected: report.codExpected || 0,
        codCollected: report.codCollected || 0,
        codPending: codPending,
      },
      orders: detailedOrders,
      stockReport: stockReport,
    });
  } catch (error) {
    console.error("Error in GET /api/admin/reports:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
