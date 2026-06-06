import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getNowIST, formatDateToISO } from "../../../../../lib/timezone";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const routeIdParam = searchParams.get("routeId");

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

    const routesRes = await query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "ServiceRoute" ORDER BY "name" ASC`,
      []
    );
    const serviceRoutes = routesRes.rows;

    let sql = `
      WITH UniqueOrders AS (
        SELECT 
          o."id" as "orderId",
          o."deliveryDate",
          o."amount" as "orderAmount",
          MAX(sr."name") as "routeName",
          MAX(sr."id") as "serviceRouteId",
          COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" != 'COD'), 0) as "onlinePaid",
          COALESCE((SELECT SUM("amount") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS' AND p."method" = 'COD'), 0) as "cashPaid",
          EXISTS(SELECT 1 FROM "RouteOrder" ro2 WHERE ro2."orderId" = o."id" AND ro2."codCollected" = true) as "hasCodCollected"
        FROM "Order" o
        LEFT JOIN "RouteOrder" ro ON o."id" = ro."orderId"
        LEFT JOIN "Route" r ON ro."routeId" = r."id"
        LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
        WHERE (
          (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
          OR EXISTS (
            SELECT 1 FROM "RouteOrder" ro_act
            JOIN "Route" r_act ON ro_act."routeId" = r_act."id"
            WHERE ro_act."orderId" = o."id"
            AND r_act."date" >= $1 AND r_act."date" <= $2
          )
        )
        AND o."status" = 'DELIVERED'
        GROUP BY o."id", o."deliveryDate", o."amount"
      )
      SELECT 
        TO_CHAR(COALESCE(r_act."date", "deliveryDate") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') as "deliveryDateStr",
        "routeName",
        SUM(
          "cashPaid" + 
          CASE WHEN ("hasCodCollected" = true AND "cashPaid" = 0) THEN ("orderAmount" - "onlinePaid") ELSE 0 END
        ) as "totalAmountPaise"
      FROM UniqueOrders
      LEFT JOIN LATERAL (
        SELECT r_inner."date"
        FROM "RouteOrder" ro_inner
        JOIN "Route" r_inner ON ro_inner."routeId" = r_inner."id"
        WHERE ro_inner."orderId" = UniqueOrders."orderId"
        AND r_inner."date" >= $1 AND r_inner."date" <= $2
        ORDER BY r_inner."date" DESC
        LIMIT 1
      ) r_act ON true
      WHERE ("cashPaid" > 0 OR "hasCodCollected" = true)
      GROUP BY TO_CHAR(COALESCE(r_act."date", "deliveryDate") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'), "routeName" 
      ORDER BY "deliveryDateStr" ASC
    `;

    const queryParams: any[] = [startOfDay, endOfDay];

    if (routeIdParam && routeIdParam !== 'all') {
      // We need to inject the filter before the GROUP BY
      const parts = sql.split('WHERE ("cashPaid" > 0 OR "hasCodCollected" = true)');
      sql = parts[0] + 'WHERE ("cashPaid" > 0 OR "hasCodCollected" = true) AND "serviceRouteId" = $3 ' + parts[1];
      queryParams.push(routeIdParam);
    }

    const res = await query<any>(sql, queryParams);
    const rows = res.rows;
    const reportData: any[] = [];

    rows.forEach(row => {
      const dateStr = row.deliveryDateStr;
      const routeName = row.routeName || 'Unassigned';
      const amount = Math.round(Number(row.totalAmountPaise) / 100);

      reportData.push({
        date: dateStr,
        routeName,
        collectedAmount: amount
      });
    });

    // Sort by date, then by route name
    reportData.sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      return a.routeName.localeCompare(b.routeName);
    });

    return NextResponse.json({
      success: true,
      routes: serviceRoutes,
      reportData
    });

  } catch (error) {
    console.error("Error in GET /api/admin/reports/cod-collection:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
