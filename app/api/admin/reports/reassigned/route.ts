import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getNowIST } from "../../../../../lib/timezone";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    let startDate: Date;
    let endDate: Date;

    if (startDateParam && endDateParam) {
      startDate = getStartOfDayIST(new Date(startDateParam));
      endDate = getEndOfDayIST(new Date(endDateParam));
    } else {
      const today = getNowIST();
      startDate = getStartOfDayIST(today);
      endDate = getEndOfDayIST(today);
    }

    const reassignedOrdersQuery = `
      SELECT 
        o."id", 
        o."orderNumber", 
        o."createdAt" as "orderCreatedAt",
        o."status",
        o."deliveryDate",
        o."paymentStatus",
        (EXISTS (SELECT 1 FROM "RouteOrder" ro_check WHERE ro_check."orderId" = o."id" AND ro_check."deliveryStatus" != 'NOT_DELIVERED')) as "isAssigned",
        (EXISTS (SELECT 1 FROM "RouteOrder" ro_prog JOIN "Route" r_prog ON ro_prog."routeId" = r_prog."id" WHERE ro_prog."orderId" = o."id" AND r_prog."token" IS NOT NULL AND ro_prog."deliveryStatus" != 'NOT_DELIVERED')) as "isRouteGenerated",
        (SELECT "deliveryStatus" FROM "RouteOrder" ro WHERE ro."orderId" = o."id" AND ro."deliveryStatus" != 'NOT_DELIVERED' LIMIT 1) as "deliveryStatus",
        (SELECT "updatedAt" FROM "RouteOrder" ro WHERE ro."orderId" = o."id" AND ro."deliveryStatus" = 'DELIVERED' LIMIT 1) as "deliveredDate",
        c."name" as "customerName",
        c."phone" as "customerPhone",
        a."area" as "addressArea",
        a."pincode" as "addressPincode",
        (SELECT COUNT(*) FROM "OrderActivityLog" al2 WHERE al2."orderId" = o."id" AND al2."action" = 'REASSIGNED') as "reassignmentCount",
        (SELECT MAX(al3."createdAt") FROM "OrderActivityLog" al3 WHERE al3."orderId" = o."id" AND al3."action" = 'REASSIGNED') as "lastReassignedAt",
        (CURRENT_DATE - o."createdAt"::date) as "agingDays"
      FROM "Order" o
      JOIN "Customer" c ON o."customerId" = c."id"
      JOIN "Address" a ON o."addressId" = a."id"
      WHERE EXISTS (
        SELECT 1 FROM "OrderActivityLog" al 
        WHERE al."orderId" = o."id" 
        AND al."action" = 'REASSIGNED'
        AND al."createdAt" >= $1 AND al."createdAt" <= $2
      )
      ORDER BY "lastReassignedAt" DESC
    `;

    const result = await query(reassignedOrdersQuery, [startDate, endDate]);

    return NextResponse.json({
      success: true,
      orders: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error("Error in GET /api/admin/reports/reassigned:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
