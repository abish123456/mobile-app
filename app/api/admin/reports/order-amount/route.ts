import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse } from "../../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getNowIST, formatDateToISO } from "../../../../../lib/timezone";
import { format } from "date-fns";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAdminAuthWithPermission(req, "view_order_amount_reports"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const productId = searchParams.get("productId"); // 'all' or specific ID
    const groupByRoute = searchParams.get("groupByRoute") === 'true';
    const dateType = searchParams.get("dateType") || "createdAt";
    const dateField = dateType === "deliveryDate" ? "deliveryDate" : "createdAt";

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

    // 1. Fetch all active products for the dropdown
    const productsRes = await query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "Product" WHERE "active" = true ORDER BY "createdAt" ASC`,
      []
    );
    const products = productsRes.rows;

    let sql = "";
    let params: any[] = [startOfDay, endOfDay];

    if (!productId || productId === 'all') {
      // Aggregate Total Order Amount
      if (groupByRoute) {
        sql = `
        WITH UniqueOrders AS (
          SELECT 
            o."id" as "orderId",
            o."createdAt",
            o."paymentMethod",
            o."amount",
            latest_ro."routeName"
          FROM "Order" o
          LEFT JOIN LATERAL (
            SELECT sr."name" as "routeName"
            FROM "RouteOrder" ro
            LEFT JOIN "Route" r ON ro."routeId" = r."id"
            LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
            WHERE ro."orderId" = o."id"
            ORDER BY
              CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
              ro."updatedAt" DESC
            LIMIT 1
          ) latest_ro ON true
          LEFT JOIN LATERAL (
            SELECT r_inner."date" as "routeDate"
            FROM "RouteOrder" ro_inner
            JOIN "Route" r_inner ON ro_inner."routeId" = r_inner."id"
            WHERE ro_inner."orderId" = o."id"
            AND r_inner."date" >= $1 AND r_inner."date" <= $2
            ORDER BY r_inner."date" DESC
            LIMIT 1
          ) day_ro ON true
          WHERE (
            (o."${dateField}" >= $1 AND o."${dateField}" <= $2)
            ${dateType === 'deliveryDate' ? `OR day_ro."routeDate" IS NOT NULL` : ''}
          )
          AND o."status" != 'CANCELLED'
          AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
        )
        SELECT 
          TO_CHAR(COALESCE(day_ro_outer."routeDate", "order_raw_date") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') as "orderDateStr",
          "paymentMethod",
          "routeName",
          SUM("amount") as "totalAmountPaise"
        FROM (
            SELECT 
                "createdAt" as "order_raw_date",
                "paymentMethod",
                "routeName",
                "amount",
                "orderId"
            FROM UniqueOrders
        ) base
        LEFT JOIN LATERAL (
            SELECT r_inner."date" as "routeDate"
            FROM "RouteOrder" ro_inner
            JOIN "Route" r_inner ON ro_inner."routeId" = r_inner."id"
            WHERE ro_inner."orderId" = base."orderId"
            AND r_inner."date" >= $1 AND r_inner."date" <= $2
            ORDER BY r_inner."date" DESC
            LIMIT 1
        ) day_ro_outer ON true
        GROUP BY COALESCE(day_ro_outer."routeDate", "order_raw_date"), "paymentMethod", "routeName"
        ORDER BY "orderDateStr" ASC`;
      } else {
        sql = `SELECT 
          TO_CHAR(o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') as "orderDateStr",
          o."paymentMethod",
          SUM(o."amount") as "totalAmountPaise"
        FROM "Order" o
        WHERE o."createdAt" >= $1 AND o."createdAt" <= $2
        AND o."status" != 'CANCELLED'
        AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
        GROUP BY o."createdAt", o."paymentMethod"
        ORDER BY o."createdAt" ASC`;
      }
    } else {
      // Aggregate Product-specific Amount and Quantity
      params.push(productId);
      if (groupByRoute) {
        sql = `
        WITH UniqueOrders AS (
          SELECT 
            o."id" as "orderId",
            o."createdAt",
            o."paymentMethod",
            SUM(oi."quantity") as "totalQuantity",
            SUM(oi."quantity" * oi."price" * (1 + oi."gst" / 100.0) * 100) as "totalAmountPaise",
            latest_ro."routeName"
          FROM "Order" o
          JOIN "OrderItem" oi ON o."id" = oi."orderId"
          LEFT JOIN LATERAL (
            SELECT sr."name" as "routeName"
            FROM "RouteOrder" ro
            LEFT JOIN "Route" r ON ro."routeId" = r."id"
            LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
            WHERE ro."orderId" = o."id"
            ORDER BY
              CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
              ro."updatedAt" DESC
            LIMIT 1
          ) latest_ro ON true
          WHERE oi."productId" = $3
          AND o."createdAt" >= $1 AND o."createdAt" <= $2
          AND o."status" != 'CANCELLED'
          AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
          GROUP BY o."id", o."createdAt", o."paymentMethod", latest_ro."routeName"
        )
        SELECT 
          TO_CHAR("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') as "orderDateStr",
          "paymentMethod",
          "routeName",
          SUM("totalQuantity") as "totalQuantity",
          SUM("totalAmountPaise") as "totalAmountPaise"
        FROM UniqueOrders
        GROUP BY "createdAt", "paymentMethod", "routeName"
        ORDER BY "createdAt" ASC`;
      } else {
        sql = `SELECT 
          TO_CHAR(o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') as "orderDateStr",
          o."paymentMethod",
          SUM(oi."quantity") as "totalQuantity",
          SUM(oi."quantity" * oi."price" * (1 + oi."gst" / 100.0) * 100) as "totalAmountPaise"
        FROM "Order" o
        JOIN "OrderItem" oi ON o."id" = oi."orderId"
        WHERE oi."productId" = $3
        AND o."createdAt" >= $1 AND o."createdAt" <= $2
        AND o."status" != 'CANCELLED'
        AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
        GROUP BY o."createdAt", o."paymentMethod"
        ORDER BY o."createdAt" ASC`;
      }
    }

    const res = await query<any>(sql, params);
    const rows = res.rows;
    const reportMap = new Map<string, any>();

    rows.forEach(row => {
      const dateStr = row.orderDateStr;
      const routeName = groupByRoute ? (row.routeName || 'Unassigned') : '';
      const key = groupByRoute ? `${routeName}|${dateStr}` : dateStr;

      if (!reportMap.has(key)) {
        reportMap.set(key, {
          date: dateStr,
          routeName: groupByRoute ? routeName : undefined,
          quantity: productId && productId !== 'all' ? 0 : undefined,
          cod: 0,
          online: 0,
          total: 0
        });
      }

      const dayData = reportMap.get(key);
      const amount = Math.round(Number(row.totalAmountPaise) / 100);
      
      if (dayData.quantity !== undefined) {
        dayData.quantity += Number(row.totalQuantity || 0);
      }

      if (row.paymentMethod === 'COD') {
        dayData.cod += amount;
      } else if (row.paymentMethod === 'ONLINE') {
        dayData.online += amount;
      }
      dayData.total += amount;
    });

    const reportData = Array.from(reportMap.values()).sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      if (groupByRoute) return a.routeName.localeCompare(b.routeName);
      return 0;
    });

    return NextResponse.json({
      success: true,
      products,
      reportData
    });

  } catch (error) {
    console.error("Error in GET /api/admin/reports/order-amount:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
