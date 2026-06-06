// scripts/verify_multi_product.js
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function verify() {
    const client = await pool.connect();
    try {
        console.log("--- Multi-Product Order Verification ---");

        // 1. Fetch the latest order with multiple items
        const orderRes = await client.query(`
      SELECT o."id", o."quantity", o."amount", COUNT(oi."id") as "itemCount"
      FROM "Order" o
      JOIN "OrderItem" oi ON o."id" = oi."orderId"
      GROUP BY o."id", o."quantity", o."amount"
      HAVING COUNT(oi."id") > 1
      ORDER BY o."createdAt" DESC
      LIMIT 1
    `);

        if (orderRes.rows.length === 0) {
            console.log("No multi-product orders found yet. Creating a mock one for testing...");

            const orderId = 'test-multi-' + Date.now();
            const customerRes = await client.query('SELECT "id" FROM "Customer" LIMIT 1');
            const addressRes = await client.query('SELECT "id" FROM "Address" LIMIT 1');
            const productsRes = await client.query('SELECT "id", "price" FROM "Product" WHERE "active" = true LIMIT 2');

            if (customerRes.rows.length && addressRes.rows.length && productsRes.rows.length >= 2) {
                const customerId = customerRes.rows[0].id;
                const addressId = addressRes.rows[0].id;

                await client.query('BEGIN');

                // Create Order
                await client.query(`
          INSERT INTO "Order" ("id", "customerId", "addressId", "quantity", "amount", "deliveryDate", "deliverySlot", "paymentMethod", "status", "paymentStatus")
          VALUES ($1, $2, $3, 3, 15000, NOW(), 'MORNING', 'COD', 'PENDING', 'COD')
        `, [orderId, customerId, addressId]);

                // Create OrderItems
                for (let i = 0; i < productsRes.rows.length; i++) {
                    await client.query(`
            INSERT INTO "OrderItem" ("id", "orderId", "productId", "quantity", "price")
            VALUES ($1, $2, $3, $4, $5)
          `, [`item-${i}-${orderId}`, orderId, productsRes.rows[i].id, i + 1, productsRes.rows[i].price]);
                }

                await client.query('COMMIT');
                console.log("Created test order:", orderId);

                // Re-verify
                return verify();
            } else {
                console.log("Could not create test order: Missing data (customer, address, or at least 2 products)");
                return;
            }
        }

        const order = orderRes.rows[0];
        console.log(`Success! Found latest multi-product order:`);
        console.log(`- Order ID: ${order.id}`);
        console.log(`- Total Quantity: ${order.quantity}`);
        console.log(`- Total Amount: ₹${order.amount / 100}`);
        console.log(`- Distinct Items: ${order.itemCount}`);

        // 2. Fetch item details
        const itemsRes = await client.query(`
      SELECT p."name", oi."quantity", oi."price"
      FROM "OrderItem" oi
      JOIN "Product" p ON oi."productId" = p."id"
      WHERE oi."orderId" = $1
    `, [order.id]);

        console.log("\nItems breakdown:");
        itemsRes.rows.forEach(item => {
            console.log(`- ${item.name}: ${item.quantity} x ₹${item.price} = ₹${item.quantity * item.price}`);
        });

    } catch (err) {
        console.error("Verification failed:", err);
        if (client) await client.query('ROLLBACK');
    } finally {
        client.release();
        pool.end();
    }
}

verify();
