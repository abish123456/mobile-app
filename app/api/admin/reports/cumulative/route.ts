import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getNowIST, formatDateToISO } from "../../../../../lib/timezone";
import { format } from "date-fns";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
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

    // 1. Fetch all active products to determine columns
    const productsRes = await query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "Product" WHERE "active" = true ORDER BY "createdAt" ASC`,
      []
    );
    const products = productsRes.rows;

    const dateType = searchParams.get("dateType") || "createdAt";
    const dateField = dateType === "deliveryDate" ? "deliveryDate" : "createdAt";

    // 2. Fetch all orders with their items in the date range
    // Price is in paise, so we divide by 100 for display
    const ordersRes = await query<any>(
      `SELECT 
        o."id" as "orderId",
        TO_CHAR(COALESCE(day_ro."routeDate", o."${dateField}") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') as "orderDateStr",
        oi."productId",
        p."name" as "productName",
        oi."quantity",
        oi."price" as "itemPrice",
        oi."gst" as "itemGst",
        latest_ro."serviceRouteId",
        latest_ro."serviceRouteName"
      FROM "Order" o
      JOIN "OrderItem" oi ON o."id" = oi."orderId"
      JOIN "Product" p ON oi."productId" = p."id"
      LEFT JOIN LATERAL (
        SELECT r."serviceRouteId", sr."name" as "serviceRouteName"
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
      ORDER BY "orderDateStr" ASC`,
      [startOfDay, endOfDay]
    );

    const orders = ordersRes.rows;

    // 3. Aggregate Date-wise
    const dateWiseMap = new Map<string, any>();
    
    orders.forEach(order => {
      const dateStr = order.orderDateStr;
      if (!dateWiseMap.has(dateStr)) {
        const initialProducts: any = {};
        products.forEach(p => {
          initialProducts[p.name] = { quantity: 0, amount: 0 };
        });
        dateWiseMap.set(dateStr, {
          date: dateStr,
          products: initialProducts,
          totalAmount: 0
        });
      }

      const dateData = dateWiseMap.get(dateStr);
      if (dateData.products[order.productName]) {
        dateData.products[order.productName].quantity += order.quantity;
        const baseAmount = (order.quantity * order.itemPrice);
        const itemGstAmount = baseAmount * (order.itemGst / 100);
        const itemAmount = Math.round(baseAmount + itemGstAmount);
        dateData.products[order.productName].amount += itemAmount;
        dateData.totalAmount += itemAmount;
      }
    });

    const dateWiseReports = Array.from(dateWiseMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // 4. Aggregate Route-wise
    const routeWiseMap = new Map<string, any>();

    orders.forEach(order => {
      const dateStr = order.orderDateStr;
      const routeName = order.serviceRouteName || "Unassigned";
      const key = `${routeName}|${dateStr}`;

      if (!routeWiseMap.has(key)) {
        const initialProducts: any = {};
        products.forEach(p => {
          initialProducts[p.name] = { quantity: 0, amount: 0 };
        });
        routeWiseMap.set(key, {
          routeName,
          date: dateStr,
          products: initialProducts,
          totalAmount: 0
        });
      }

      const routeData = routeWiseMap.get(key);
      if (routeData.products[order.productName]) {
        routeData.products[order.productName].quantity += order.quantity;
        const baseAmount = (order.quantity * order.itemPrice);
        const itemGstAmount = baseAmount * (order.itemGst / 100);
        const itemAmount = Math.round(baseAmount + itemGstAmount);
        routeData.products[order.productName].amount += itemAmount;
        routeData.totalAmount += itemAmount;
      }
    });

    const routeWiseReports = Array.from(routeWiseMap.values()).sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      return a.routeName.localeCompare(b.routeName);
    });

    return NextResponse.json({
      success: true,
      products,
      dateWiseReports,
      routeWiseReports
    });

  } catch (error) {
    console.error("Error in GET /api/admin/reports/cumulative:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
