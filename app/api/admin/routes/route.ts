import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import crypto from "crypto";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse } from "../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST } from "../../../../lib/timezone";

// GET /api/admin/routes - List all daily routes (Updated for ServiceRoute schema)
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAdminAuthWithPermission(req, "view_assign_routes"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    const queryParams: any[] = [];
    let dateFilter = "";

    if (date) {
      const startOfDay = getStartOfDayIST(new Date(date));
      const endOfDay = getEndOfDayIST(new Date(date));
      dateFilter = `WHERE r."date" >= $1 AND r."date" <= $2`;
      queryParams.push(startOfDay, endOfDay);
    }

    // Filter for refunds:
    // 1. REQUESTED (Active)
    // 2. PAID but not collected (Active)
    // 3. PAID & Collected BUT happened TODAY (History for today)
    let refundFilter = `drr.status = 'REQUESTED'`;
    if (date) {
      // If date is specific, we use $1 and $2 which are start/end of that day
      refundFilter = `(
            drr.status = 'REQUESTED' 
            OR (drr.status = 'PAID' AND drr."collected" = false)
            OR (drr.status = 'PAID' AND drr."collected" = true AND drr."updatedAt" >= $1 AND drr."updatedAt" <= $2)
        )`;
    }

    const routesRes = await query<{
      id: string;
      date: Date;
      serviceRouteId: string;
      serviceRouteName: string;
      token: string;
      tokenExpiresAt: Date;
      deliveryBoyId: string;
      deliveryBoyName: string;
      orderCount: number;
      refundCount: number;
      createdAt: Date;
      isSubmitted: boolean;
      submittedAt: Date | null;
    }>(
      `WITH RouteRefunds AS (
          SELECT 
            sr.id as "serviceRouteId",
            COUNT(drr.id) as "refundCount"
          FROM "ServiceRoute" sr
          JOIN "ServiceArea" sa ON sr.id = sa."serviceRouteId"
          JOIN "Address" a ON sa."pincode" = a."pincode" AND a."isDefault" = true
          JOIN "Customer" c ON a."customerId" = c.id
          JOIN "DepositRefundRequest" drr ON c.id = drr."customerId"
          WHERE ${refundFilter}
          GROUP BY sr.id
      )
      SELECT 
            r."id",
            r."date",
            r."serviceRouteId",
            sr."name" as "serviceRouteName",
            r."token",
            r."tokenExpiresAt",
            r."deliveryBoyId",
            db."name" as "deliveryBoyName",
            COUNT(
                CASE 
                    WHEN o."id" IS NOT NULL
                    AND o."status" != 'CANCELLED'
                    AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
                    THEN 1 
                END
            )::int as "orderCount",
            COUNT(
                CASE 
                    WHEN o."id" IS NOT NULL
                    AND o."status" != 'CANCELLED'
                    AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
                    AND ro."sequence" = 0
                    THEN 1 
                END
            )::int as "unoptimizedCount",
            COALESCE(rr."refundCount", 0)::int as "refundCount",
            r."createdAt",
            r."isSubmitted",
            r."submittedAt",
            r."isAutoOptimized"
        FROM "Route" r
        INNER JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
        INNER JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
        LEFT JOIN "RouteOrder" ro ON r."id" = ro."routeId"
        LEFT JOIN "Order" o ON ro."orderId" = o."id"
        LEFT JOIN RouteRefunds rr ON sr.id = rr."serviceRouteId" 
        ${dateFilter}
        GROUP BY r."id", r."date", r."serviceRouteId", sr."name", r."token", r."tokenExpiresAt", r."deliveryBoyId", db."name", r."createdAt", rr."refundCount", r."isSubmitted", r."submittedAt", r."isAutoOptimized"
        HAVING COUNT(CASE WHEN o."id" IS NOT NULL AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING') THEN 1 END) > 0 OR COALESCE(rr."refundCount", 0) > 0 OR r."token" IS NOT NULL
        ORDER BY r."date" DESC, r."createdAt" DESC`,
      queryParams
    );

    // Map to expected format (using serviceRouteName as area for compatibility if needed, or new field)
    const routes = await Promise.all(routesRes.rows.map(async (r) => {
      // Fetch token logs for this route
      const logsRes = await query<{ token: string, action: string, generatedAt: Date }>(
        `SELECT "token", "action", "generatedAt" AT TIME ZONE 'Asia/Kolkata' as "generatedAt" FROM "RouteTokenLog" WHERE "routeId" = $1 ORDER BY "generatedAt" DESC`,
        [r.id]
      );

      return {
        ...r,
        area: r.serviceRouteName, // Mapping service route name to 'area' for frontend compatibility
        tokenLogs: logsRes.rows
      };
    }));

    return NextResponse.json({
      success: true,
      routes: routes,
    });

  } catch (error) {
    console.error("Error in GET /api/admin/routes:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/routes - Delete logic if used by old page
// ... (Keeping it minimal or deprecated. If the user uses the new page, this shouldn't be heavily used)
export async function DELETE(req: NextRequest) {
  return NextResponse.json(
    { success: false, message: "Use the new Route Config page to manage daily assignments." },
    { status: 410 }
  );
}
// POST / PUT - Deprecated in favor of daily-routes?
// Or update to use serviceRouteId.
// For now, let's fix GET so the old page doesn't crash if visited.
