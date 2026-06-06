import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getNowIST } from "../../../../lib/timezone";

// GET /api/admin/delivery-boys-performance - Get delivery boys performance statistics
export async function GET(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const deliveryBoyId = searchParams.get("deliveryBoyId");

    // Optional date range
    let startOfRange: Date | null = null;
    let endOfRange: Date | null = null;

    if (startDate && endDate) {
      startOfRange = getStartOfDayIST(new Date(startDate));
      endOfRange = getEndOfDayIST(new Date(endDate));
    }

    // Build query to get delivery boy performance
    let whereConditions = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // Date filter - filter by route date
    if (startOfRange && endOfRange) {
      whereConditions.push(
        `r."date" >= $${paramIndex} AND r."date" <= $${paramIndex + 1}`
      );
      queryParams.push(startOfRange, endOfRange);
      paramIndex += 2;
    }

    // Delivery boy filter
    if (deliveryBoyId) {
      whereConditions.push(`db."id" = $${paramIndex}`);
      queryParams.push(deliveryBoyId);
      paramIndex += 1;
    }

    // Exclude cancelled orders
    whereConditions.push(`o."status" != 'CANCELLED'`);

    const whereClause =
      whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // Get delivery boy performance statistics
    const performanceRes = await query<{
      deliveryBoyId: string;
      deliveryBoyName: string;
      deliveryBoyPhone: string;
      assignedRouteNames: string | null;
      totalOrdersAssigned: number;
      totalCansAssigned: number;
      totalOrdersDelivered: number;
      totalOrdersNotDelivered: number;
      totalOrdersPending: number;
      totalCansDelivered: number;
      totalExtraCansDelivered: number;
      totalOnlineAmount: number;
      deliverySuccessRate: number;
    }>(
      `SELECT 
        db."id" as "deliveryBoyId",
        db."name" as "deliveryBoyName",
        db."phone" as "deliveryBoyPhone",
        COALESCE(
          (SELECT string_agg(sr."name", ', ') 
           FROM "ServiceRoute" sr 
           WHERE sr."currentDeliveryBoyId" = db."id"),
          ''
        ) as "assignedRouteNames",
        COUNT(DISTINCT ro."orderId")::int as "totalOrdersAssigned",
        COALESCE(SUM(o."quantity"), 0)::int as "totalCansAssigned",
        COUNT(DISTINCT CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN ro."orderId" END)::int as "totalOrdersDelivered",
        COUNT(DISTINCT CASE WHEN ro."deliveryStatus" = 'NOT_DELIVERED' THEN ro."orderId" END)::int as "totalOrdersNotDelivered",
        COUNT(DISTINCT CASE WHEN ro."deliveryStatus" = 'PENDING' THEN ro."orderId" END)::int as "totalOrdersPending",
        COALESCE(SUM(CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN o."quantity" ELSE 0 END), 0)::int as "totalCansDelivered",
        COALESCE(SUM(CASE WHEN ro."deliveryStatus" = 'NOT_DELIVERED' THEN o."quantity" ELSE 0 END), 0)::int as "totalCansNotDelivered",
        COALESCE(SUM(CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN COALESCE(o."additionalQuantity", 0) ELSE 0 END), 0)::int as "totalExtraCansDelivered",
        COALESCE(SUM(CASE WHEN o."paymentStatus" = 'SUCCESS' AND ro."deliveryStatus" = 'DELIVERED' THEN COALESCE(o."amount", 0) ELSE 0 END), 0)::numeric / 100 as "totalOnlineAmount",
        CASE 
          WHEN COUNT(DISTINCT ro."orderId") > 0 
          THEN ROUND((COUNT(DISTINCT CASE WHEN ro."deliveryStatus" = 'DELIVERED' THEN ro."orderId" END)::numeric / COUNT(DISTINCT ro."orderId")::numeric) * 100, 2)
          ELSE 0
        END as "deliverySuccessRate"
      FROM "DeliveryBoy" db
      INNER JOIN "Route" r ON r."deliveryBoyId" = db."id"
      INNER JOIN "RouteOrder" ro ON ro."routeId" = r."id"
      INNER JOIN "Order" o ON o."id" = ro."orderId"
      ${whereClause}
      GROUP BY db."id", db."name", db."phone"
      ORDER BY "totalOrdersDelivered" DESC, db."name" ASC`,
      queryParams
    );

    // Get all delivery boys (for filter dropdown)
    const allDeliveryBoysRes = await query<{
      id: string;
      name: string;
      phone: string;
      active: boolean;
    }>(
      `SELECT "id", "name", "phone", "active"
       FROM "DeliveryBoy"
       WHERE "active" = true
       ORDER BY "name" ASC`
    );

    return NextResponse.json({
      success: true,
      performance: performanceRes.rows,
      deliveryBoys: allDeliveryBoysRes.rows,
      dateRange: startOfRange && endOfRange ? {
        startDate: startOfRange.toISOString(),
        endDate: endOfRange.toISOString(),
      } : null,
    });
  } catch (error) {
    console.error("Error in GET /api/admin/delivery-boys-performance:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

