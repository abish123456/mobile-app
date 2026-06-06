const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
});

async function verifyDecimalPrice() {
    try {
        console.log('Testing decimal price insertion...');
        const testPrice = 85.5;
        const productId = 'test-decimal-product';

        // Clean up
        await pool.query('DELETE FROM "Product" WHERE id = $1', [productId]);

        // Test Insert
        await pool.query(`
      INSERT INTO "Product" ("id", "name", "description", "price", "image", "unit", "inStock", "active", "createdAt", "updatedAt")
      VALUES ($1, 'Test Decimal Product', 'Testing decimals', $2, null, 'can', true, true, NOW(), NOW())
    `, [productId, testPrice]);

        console.log('✅ Successfully inserted product with price 85.5');

        // Test Read
        const res = await pool.query('SELECT price FROM "Product" WHERE id = $1', [productId]);
        const savedPrice = res.rows[0].price;
        console.log(`Saved price: ${savedPrice} (Type: ${typeof savedPrice})`);

        if (savedPrice === 85.5) {
            console.log('✅ Verification PASSED: Saved price matches 85.5');
        } else {
            console.error(`❌ Verification FAILED: Saved price is ${savedPrice}`);
        }

        // Clean up
        await pool.query('DELETE FROM "Product" WHERE id = $1', [productId]);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error during verification:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

verifyDecimalPrice();
