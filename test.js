require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    const res = await pool.query(`
      SELECT 
        o.id as "orderId", 
        c.name as "customerName",
        oi.quantity as "sales", 
        COALESCE(oi."actualReturnQuantity", oi."returnQuantity", 0) as "emptyReturn",
        (oi.quantity - COALESCE(oi."actualReturnQuantity", oi."returnQuantity", 0)) as "depositCans"
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      JOIN "Customer" c ON o."customerId" = c.id
      JOIN "Product" p ON oi."productId" = p.id
      LEFT JOIN LATERAL (
        SELECT ro_inner."deliveryStatus"
        FROM "RouteOrder" ro_inner
        JOIN "Route" r_inner ON ro_inner."routeId" = r_inner."id"
        WHERE ro_inner."orderId" = o."id"
        AND r_inner."date" >= '2026-06-30T18:30:00.000Z' AND r_inner."date" <= '2026-07-01T18:29:59.999Z'
        ORDER BY ro_inner."updatedAt" DESC
        LIMIT 1
      ) ro_sr ON true
      WHERE o."status" != 'CANCELLED'
      AND p.name LIKE '%20L%'
      AND COALESCE(ro_sr."deliveryStatus"::text, o.status::text) = 'DELIVERED'
      AND (
        (o."deliveryDate" >= '2026-06-30T18:30:00.000Z' AND o."deliveryDate" <= '2026-07-01T18:29:59.999Z')
        OR EXISTS (
          SELECT 1 FROM "RouteOrder" ro_hist
          JOIN "Route" r_hist ON ro_hist."routeId" = r_hist."id"
          WHERE ro_hist."orderId" = o."id"
          AND r_hist."date" >= '2026-06-30T18:30:00.000Z' AND r_hist."date" <= '2026-07-01T18:29:59.999Z'
        )
      )
      AND EXISTS (
        SELECT 1 FROM "RouteOrder" ro
        JOIN "Route" r ON r.id = ro."routeId"
        JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr.id
        WHERE ro."orderId" = o.id AND sr.name = 'Route 1'
        AND r."date" >= '2026-06-30T18:30:00.000Z' AND r."date" <= '2026-07-01T18:29:59.999Z'
      )
      AND (oi.quantity - COALESCE(oi."actualReturnQuantity", oi."returnQuantity", 0)) > 0
    `);
    console.log("Orders with Deposit Cans on July 1st for Route 1:", JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
main();
