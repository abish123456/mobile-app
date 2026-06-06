const { Pool } = require('pg');

const pool = new Pool({
    connectionString: "postgresql://postgres:Abish%401810@localhost:5432/watercan_db?schema=public"
});

async function checkRoute(routeId) {
    try {
        const res = await pool.query(`
      SELECT ro."id" as route_order_id, o."id" as order_id, a."id" as address_id, a."latitude", a."longitude", ro."deliveryStatus"
      FROM "RouteOrder" ro
      JOIN "Order" o ON o."id" = ro."orderId"
      JOIN "Address" a ON a."id" = o."addressId"
      WHERE ro."routeId" = $1
    `, [routeId]);

        console.log(`Checking Route: ${routeId}`);
        console.log(`Found ${res.rows.length} total orders in route.`);
        res.rows.forEach(row => {
            console.log(`Order ${row.order_id}: Lat=${row.latitude}, Lng=${row.longitude}, Status=${row.deliveryStatus}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

const routeId = process.argv[2];
if (!routeId) {
    console.log("Please provide a routeId");
    process.exit(1);
}

checkRoute(routeId);
