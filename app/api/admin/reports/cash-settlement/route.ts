import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getNowIST } from "../../../../../lib/timezone";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Verify admin authentication
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

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

    // 2. Fetch all service routes for structuring the baseline list
    const routesRes = await query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "ServiceRoute" ORDER BY "name" ASC`,
      []
    );
    const serviceRoutes = routesRes.rows;

    // 3. Build where conditions for querying orders
    let whereConditions: string[] = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // Global exclusions: exclude cancelled orders, and online pending orders
    whereConditions.push(`o."status" != 'CANCELLED'`);
    whereConditions.push(`NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')`);

    // Date range filter (strictly delivered date)
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
    queryParams.push(startOfDay, endOfDay);
    paramIndex += 2;

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // 4. Query all orders that were DELIVERED
    const sql = `
      SELECT
        o."id" as "orderId",
        o."amount" as "orderAmount",
        o."depositAmount" as "orderDepositAmount",
        o."paymentMethod",
        o."paymentInstrument",
        o."isQrPayment",
        day_ro."routeName" as "assignedRouteName",
        day_ro."serviceRouteId"
      FROM "Order" o
      INNER JOIN "RouteOrder" ro ON o."id" = ro."orderId"
      LEFT JOIN LATERAL (
        SELECT
          sr_inner."name" as "routeName",
          sr_inner."id" as "serviceRouteId"
        FROM "RouteOrder" ro_inner
        LEFT JOIN "Route" r_inner ON ro_inner."routeId" = r_inner."id"
        LEFT JOIN "ServiceRoute" sr_inner ON r_inner."serviceRouteId" = sr_inner."id"
        WHERE ro_inner."orderId" = o."id"
        ORDER BY
          CASE WHEN ro_inner."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
          ro_inner."updatedAt" DESC
        LIMIT 1
      ) day_ro ON true
      ${whereClause} AND ro."deliveryStatus" = 'DELIVERED'
    `;

    const ordersRes = await query<any>(sql, queryParams);
    const orders = ordersRes.rows;

    // 5. Get all successful payments to handle hybrid / partial cash splits
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

    // 6. Aggregate data route-by-route in memory
    const routeMap = new Map<string, {
      routeName: string;
      totalSales: number;
      cashSales: number;
      cashDeposit: number;
      officeGpay: number;
      officeGpayDeposit: number;
      qrPayment: number;
      qrDeposit: number;
      cashInHand: number;
    }>();

    // Initialize all service routes in map to guarantee they appear even with zero sales
    serviceRoutes.forEach(sr => {
      routeMap.set(sr.id, {
        routeName: sr.name,
        totalSales: 0,
        cashSales: 0,
        cashDeposit: 0,
        officeGpay: 0,
        officeGpayDeposit: 0,
        qrPayment: 0,
        qrDeposit: 0,
        cashInHand: 0,
      });
    });

    // Initialize an "Unassigned" row
    const UNASSIGNED_KEY = "unassigned";
    routeMap.set(UNASSIGNED_KEY, {
      routeName: "Unassigned",
      totalSales: 0,
      cashSales: 0,
      cashDeposit: 0,
      officeGpay: 0,
      officeGpayDeposit: 0,
      qrPayment: 0,
      qrDeposit: 0,
      cashInHand: 0,
    });

    // Populate order aggregates
    orders.forEach(order => {
      const routeKey = order.serviceRouteId || UNASSIGNED_KEY;
      const routeData = routeMap.get(routeKey) || {
        routeName: order.assignedRouteName || "Unassigned",
        totalSales: 0,
        cashSales: 0,
        cashDeposit: 0,
        officeGpay: 0,
        officeGpayDeposit: 0,
        qrPayment: 0,
        qrDeposit: 0,
        cashInHand: 0,
      };

      const orderAmount = Number(order.orderAmount) / 100;
      const depositAmount = Number(order.orderDepositAmount) / 100;
      const orderPayments = orderPaymentsMap.get(order.orderId) || [];

      // Calculate Online Paid (from payments table)
      const onlinePaid = orderPayments
        .filter(p => p.method === 'ONLINE' || (p.provider !== 'CASH' && p.method !== 'COD'))
        .reduce((sum, p) => sum + p.amount, 0) / 100;

      // Calculate Cash/COD Paid (from payments table)
      const cashPaid = orderPayments
        .filter(p => p.method === 'COD' || p.provider === 'CASH')
        .reduce((sum, p) => sum + p.amount, 0) / 100;

      let itemCashSales = 0;
      let itemCashDeposit = 0;
      let itemOfficeGpay = 0;
      let itemOfficeGpayDeposit = 0;
      let itemQrPayment = 0;
      let itemQrDeposit = 0;

      if (order.isQrPayment) {
        const qrDeposit = depositAmount;
        itemQrPayment = Math.max(0, orderAmount - qrDeposit);
        itemQrDeposit = qrDeposit;
      } else {
        if (order.paymentMethod === 'ONLINE') {
          const onlineDeposit = depositAmount;
          itemOfficeGpay = Math.max(0, (onlinePaid > 0 ? onlinePaid : orderAmount) - onlineDeposit);
          itemOfficeGpayDeposit = onlineDeposit;
        } else {
          // COD
          let codAmount = cashPaid > 0 ? cashPaid : orderAmount;
          let onlineAmount = 0;
          if (onlinePaid > 0) {
            onlineAmount = onlinePaid;
            codAmount = Math.max(0, orderAmount - onlinePaid);
          }

          itemCashDeposit = Math.min(codAmount, depositAmount);
          itemCashSales = Math.max(0, codAmount - itemCashDeposit);

          if (onlineAmount > 0) {
            const onlineDeposit = Math.max(0, depositAmount - itemCashDeposit);
            itemOfficeGpay = Math.max(0, onlineAmount - onlineDeposit);
            itemOfficeGpayDeposit = onlineDeposit;
          }
        }
      }

      // Add to route data
      routeData.totalSales += orderAmount;
      routeData.cashSales += itemCashSales;
      routeData.cashDeposit += itemCashDeposit;
      routeData.officeGpay += itemOfficeGpay;
      routeData.officeGpayDeposit += itemOfficeGpayDeposit;
      routeData.qrPayment += itemQrPayment;
      routeData.qrDeposit += itemQrDeposit;
      routeData.cashInHand += (itemCashSales + itemCashDeposit);

      routeMap.set(routeKey, routeData);
    });

    // Remove Unassigned route if it has absolutely no sales to keep report clean,
    // otherwise keep it so any stray orders are caught.
    const unassignedData = routeMap.get(UNASSIGNED_KEY);
    if (unassignedData && unassignedData.totalSales === 0) {
      routeMap.delete(UNASSIGNED_KEY);
    }

    // Convert map to sorted array
    const settlementData = Array.from(routeMap.entries()).map(([id, data]) => ({
      routeId: id,
      ...data
    })).sort((a, b) => {
      if (a.routeName === "Unassigned") return 1;
      if (b.routeName === "Unassigned") return -1;
      return a.routeName.localeCompare(b.routeName, undefined, { numeric: true, sensitivity: 'base' });
    });

    return NextResponse.json({
      success: true,
      settlementData
    });
  } catch (error) {
    console.error("Error in GET /api/admin/reports/cash-settlement:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
