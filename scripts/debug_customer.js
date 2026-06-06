const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const fs = require('fs');
const outPath = 'd:/stedaxis project/watercan_delivery_app/scripts/debug_output.txt';

function log(msg) {
    console.log(msg);
    fs.appendFileSync(outPath, msg + '\n');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function debug() {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

    const partialId = 'C6AFC10D'.toLowerCase();
    log(`Searching for customer with partial ID: ${partialId}`);

    try {
        // Search across id, phone, name, razorpayCustomerId
        const customerRes = await pool.query(
            `SELECT id, name, phone, "cansInHand", "depositWalletBalance" 
       FROM "Customer" 
       WHERE id ILIKE $1 OR phone ILIKE $1 OR name ILIKE $1 OR "razorpayCustomerId" ILIKE $1`,
            [`%${partialId}%`]
        );

        if (customerRes.rows.length === 0) {
            log('Customer not found in Customer table. Checking Order table...');
            // Maybe it's an order ID part?
            const orderCheck = await pool.query(
                'SELECT "customerId", id, status FROM "Order" WHERE id ILIKE $1',
                [`%${partialId}%`]
            );
            if (orderCheck.rows.length > 0) {
                log(`Found order with this ID part: ${JSON.stringify(orderCheck.rows[0])}`);
                // Re-read customer from this order
                const custFromOrder = await pool.query(
                    'SELECT id, name, phone, "cansInHand", "depositWalletBalance" FROM "Customer" WHERE id = $1',
                    [orderCheck.rows[0].customerId]
                );
                if (custFromOrder.rows.length > 0) {
                    log(`Customer from order: ${JSON.stringify(custFromOrder.rows[0])}`);
                    customerRes.rows = custFromOrder.rows;
                }
            } else {
                log('No matching customer or order found.');
                return;
            }
        }

        const customer = customerRes.rows[0];
        log(`Customer Details: ${JSON.stringify(customer, null, 2)}`);

        const ordersRes = await pool.query(
            'SELECT id, status, "paymentStatus", "paymentMethod", "deliveryDate", "createdAt" FROM "Order" WHERE "customerId" = $1 ORDER BY "createdAt" DESC',
            [customer.id]
        );

        log(`Found ${ordersRes.rows.length} orders:`);
        ordersRes.rows.forEach(order => {
            log(`ID: ${order.id}, Status: ${order.status}, PaymentStatus: ${order.paymentStatus}, Method: ${order.paymentMethod}, Created: ${order.createdAt}`);
        });

        // Simulate the API query
        log('\nSimulating API Active Orders Query:');
        const apiQuery = `
      SELECT id, status, "paymentMethod", "paymentStatus"
      FROM "Order" 
      WHERE "customerId" = $1 
        AND "status" NOT IN ('DELIVERED', 'CANCELLED', 'NOT_DELIVERED')
        AND NOT ("paymentMethod" = 'ONLINE' AND "paymentStatus" = 'PENDING')
    `;
        const apiQueryRes = await pool.query(apiQuery, [customer.id]);
        log(`API Query result count: ${apiQueryRes.rows.length}`);
        apiQueryRes.rows.forEach(row => {
            log(`Matched Row: ${JSON.stringify(row)}`);
        });

        if (apiQueryRes.rows.length === 0) {
            log('\nSUCCESS: API query returns 0. The blockage should NOT happen if this customer is the one testing.');
        } else {
            log('\nFAILURE: API query matches these rows, causing the blockage.');
        }

    } catch (error) {
        log(`Error during debug: ${error.message}`);
        log(error.stack);
    } finally {
        await pool.end();
    }
}

debug();
