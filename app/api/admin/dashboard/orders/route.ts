import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST } from "../../../../../lib/timezone";

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // e.g., 'scheduled', 'delivered', 'non_delivered'
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    if (!type || !startDateParam || !endDateParam) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const startDateTime = getStartOfDayIST(new Date(startDateParam));
    const endDateTime = getEndOfDayIST(new Date(endDateParam));

    let sql = "";
    let params = [startDateTime, endDateTime];

    switch (type) {
      case "scheduled":
        sql = `
          SELECT o.*, c.name as "customerName", c.phone as "customerPhone", 
                 COALESCE(a."line1" || ', ' || a."area" || ' (' || a."pincode" || ')', a."line1") as "displayAddress",
                 COALESCE(day_ro."deliveryStatus"::text, o."status"::text) as "historicalStatus"
          FROM "Order" o
          JOIN "Customer" c ON o."customerId" = c.id
          JOIN "Address" a ON o."addressId" = a.id
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
          ORDER BY o."createdAt" DESC`;
        break;

      case "delivered":
        sql = `
          SELECT o.*, c.name as "customerName", c.phone as "customerPhone", 
                 COALESCE(a."line1" || ', ' || a."area" || ' (' || a."pincode" || ')', a."line1") as "displayAddress",
                 COALESCE(day_ro."deliveryStatus"::text, o."status"::text) as "historicalStatus"
          FROM "Order" o
          JOIN "Customer" c ON o."customerId" = c.id
          JOIN "Address" a ON o."addressId" = a.id
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
          AND COALESCE(day_ro."deliveryStatus"::text, o."status"::text) = 'DELIVERED'
          ORDER BY o."createdAt" DESC`;
        break;

      case "non_delivered":
        sql = `
          SELECT o.*, c.name as "customerName", c.phone as "customerPhone", 
                 COALESCE(a."line1" || ', ' || a."area" || ' (' || a."pincode" || ')', a."line1") as "displayAddress",
                 COALESCE(day_ro."deliveryStatus"::text, o."status"::text) as "historicalStatus"
          FROM "Order" o
          JOIN "Customer" c ON o."customerId" = c.id
          JOIN "Address" a ON o."addressId" = a.id
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
          ORDER BY o."createdAt" DESC`;
        break;

      case "prev_non_delivered":
        // Logic for "Previous Day" cards
        const prevStart = getStartOfDayIST(new Date(new Date(startDateParam).getTime() - 24 * 60 * 60 * 1000));
        const prevEnd = getEndOfDayIST(new Date(new Date(startDateParam).getTime() - 24 * 60 * 60 * 1000));
        params = [prevStart, prevEnd];
        sql = `
          SELECT o.*, c.name as "customerName", c.phone as "customerPhone", 
                 COALESCE(a."line1" || ', ' || a."area" || ' (' || a."pincode" || ')', a."line1") as "displayAddress",
                 COALESCE(day_ro."deliveryStatus"::text, o."status"::text) as "historicalStatus"
          FROM "Order" o
          JOIN "Customer" c ON o."customerId" = c.id
          JOIN "Address" a ON o."addressId" = a.id
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
          ORDER BY o."createdAt" DESC`;
        break;

      case "reassigned":
        sql = `
          SELECT o.*, c.name as "customerName", c.phone as "customerPhone", 
                 COALESCE(a."line1" || ', ' || a."area" || ' (' || a."pincode" || ')', a."line1") as "displayAddress",
                 COALESCE(day_ro."deliveryStatus"::text, o."status"::text) as "historicalStatus"
          FROM "Order" o
          JOIN "Customer" c ON o."customerId" = c.id
          JOIN "Address" a ON o."addressId" = a.id
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
          AND EXISTS (
             SELECT 1 FROM "RouteOrder" ro_check 
             JOIN "Route" r_check ON ro_check."routeId" = r_check."id"
             WHERE ro_check."orderId" = o."id" 
             AND ro_check."deliveryStatus" = 'NOT_DELIVERED'
             AND r_check."date" < $1
          )
          ORDER BY o."createdAt" DESC`;
        break;

      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const result = await query(sql, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Dashboard Orders API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
