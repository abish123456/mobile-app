import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse } from "../../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getNowIST } from "../../../../../lib/timezone";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Verify admin authentication
    if (!(await verifyAdminAuthWithPermission(req, "view_route_wise_reports"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const routeIdParam = searchParams.get("routeId"); // serviceRouteId
    const dateTypeParam = searchParams.get("dateType") || "deliveryDate"; // deliveryDate or createdAt

    let startOfDay: Date;
    let endOfDay: Date;

    if (startDateParam && endDateParam) {
      startOfDay = getStartOfDayIST(new Date(startDateParam));
      endOfDay = getEndOfDayIST(new Date(endDateParam));
    } else {
      const today = getNowIST();
      startOfDay = getStartOfDayIST(today);
      endOfDay = getEndOfDayIST(today);
    }

    // 1. Fetch all routes for filter dropdown options
    const routesRes = await query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "ServiceRoute" ORDER BY "name" ASC`,
      []
    );
    const serviceRoutes = routesRes.rows;

    // 2. Build where conditions for querying orders
    let whereConditions: string[] = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // Global exclusion: exclude orders that are online pending
    whereConditions.push(`NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')`);

    // Date range filter
    if (dateTypeParam === 'deliveryDate') {
      whereConditions.push(`(
        (o."deliveryDate" >= $${paramIndex} AND o."deliveryDate" <= $${paramIndex + 1})
        OR
        EXISTS (
          SELECT 1 FROM "RouteOrder" ro_active
          JOIN "Route" r_active ON ro_active."routeId" = r_active."id"
          WHERE ro_active."orderId" = o."id" 
          AND r_active."date" >= $${paramIndex} 
          AND r_active."date" <= $${paramIndex + 1}
        )
      )`);
    } else {
      whereConditions.push(`o."createdAt" >= $${paramIndex} AND o."createdAt" <= $${paramIndex + 1}`);
    }
    queryParams.push(startOfDay, endOfDay);
    paramIndex += 2;

    // Route filter
    if (routeIdParam && routeIdParam !== 'all') {
      whereConditions.push(`COALESCE(r."serviceRouteId", sa."serviceRouteId") = $${paramIndex}`);
      queryParams.push(routeIdParam);
      paramIndex += 1;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // Grouping orders by Route Name (alphabetically) and Customer Name
    const sql = `
      SELECT
        o."id" as "orderId",
        o."orderNumber",
        o."quantity" as "noOfItems",
        o."amount" as "orderAmount",
        o."deliveryDate" as "requestedDeliveryDate",
        o."status" as "orderStatus",
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
        day_ro."deliveredDate",
        day_ro."routeName" as "assignedRouteName",
        day_ro."serviceRouteId",
        day_ro."deliveryBoyName"
      FROM "Order" o
      INNER JOIN "Customer" c ON o."customerId" = c."id"
      LEFT JOIN "Address" a ON o."addressId" = a."id"
      LEFT JOIN "ServiceArea" sa ON a."pincode" = sa."pincode"
      LEFT JOIN LATERAL (
        SELECT
          ro."deliveryStatus",
          ro."notDeliveredReason",
          ro."codCollected",
          ro."updatedAt" as "deliveredDate",
          ro."routeId",
          sr_inner."name" as "routeName",
          sr_inner."id" as "serviceRouteId",
          db_inner."name" as "deliveryBoyName"
        FROM "RouteOrder" ro
        LEFT JOIN "Route" r_inner ON ro."routeId" = r_inner."id"
        LEFT JOIN "ServiceRoute" sr_inner ON r_inner."serviceRouteId" = sr_inner."id"
        LEFT JOIN "DeliveryBoy" db_inner ON r_inner."deliveryBoyId" = db_inner."id"
        WHERE ro."orderId" = o."id"
        ${dateTypeParam === 'deliveryDate' ? `AND r_inner."date" >= $1 AND r_inner."date" <= $2` : ''}
        ORDER BY
          CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
          ro."updatedAt" DESC
        LIMIT 1
      ) day_ro ON true
      LEFT JOIN "Route" r ON day_ro."routeId" = r."id"
      ${whereClause}
      ORDER BY COALESCE(day_ro."routeName", 'Unassigned') ASC, c."name" ASC
    `;

    const ordersRes = await query<any>(sql, queryParams);
    const orders = ordersRes.rows;

    // Get all payments for these orders to calculate precise COD vs Online payment amounts
    const orderIds = orders.map(o => o.orderId);
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

    const reportData = orders.map(order => {
      const orderAmount = Number(order.orderAmount) / 100;
      const orderPayments = orderPaymentsMap.get(order.orderId) || [];

      // Calculate Online Paid
      const onlinePaid = orderPayments
        .filter(p => p.method === 'ONLINE' || (p.provider !== 'CASH' && p.method !== 'COD'))
        .reduce((sum, p) => sum + p.amount, 0) / 100;

      // Calculate COD Paid
      const cashPaid = orderPayments
        .filter(p => p.method === 'COD' || p.provider === 'CASH')
        .reduce((sum, p) => sum + p.amount, 0) / 100;

      let codAmount = 0;
      let onlineAmount = 0;

      if (!order.isQrPayment) {
        if (order.paymentMethod === 'ONLINE') {
          onlineAmount = onlinePaid > 0 ? onlinePaid : orderAmount;
        } else {
          // COD
          codAmount = cashPaid > 0 ? cashPaid : orderAmount;
        }

        // Handle hybrid / manual overrides (e.g. online paid on COD order)
        if (onlinePaid > 0 && order.paymentMethod !== 'ONLINE') {
          onlineAmount = onlinePaid;
          codAmount = Math.max(0, orderAmount - onlinePaid);
        }
      }

      // Format payment instrument label
      let paymentTypeDisplay = order.paymentMethod === 'COD' ? 'COD' : 'Online';
      if (order.isQrPayment) {
        paymentTypeDisplay = 'COD QR';
      } else if (order.paymentInstrument) {
        paymentTypeDisplay = order.paymentInstrument;
      }

      // Determine delivery statuses
      const rawDeliveryStatus = order.deliveryStatus || order.orderStatus || 'PENDING';
      const isDelivered = rawDeliveryStatus === 'DELIVERED';
      
      // Clear Delivered vs Not Delivered classification (as requested)
      const simpleDeliveryClassification = isDelivered ? 'Delivered' : 'Not Delivered';

      return {
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        routeName: order.assignedRouteName || 'Unassigned',
        deliveryBoyName: order.deliveryBoyName || 'Unassigned',
        noOfItems: order.noOfItems || 0,
        amount: orderAmount,
        cod: codAmount,
        online: onlineAmount,
        isQrPayment: !!order.isQrPayment,
        paymentType: paymentTypeDisplay,
        deliveryStatus: rawDeliveryStatus,
        deliveryClassification: simpleDeliveryClassification,
        notDeliveredReason: order.notDeliveredReason || null,
        deliveredDate: order.deliveredDate,
        createdAt: order.orderCreatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      routes: serviceRoutes,
      reportData
    });
  } catch (error) {
    console.error("Error in GET /api/admin/reports/route-wise:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
