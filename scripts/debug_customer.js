const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function debug() {
    try {
        const updateRes = await pool.query(`
          UPDATE "Order" 
          SET amount = 110201, 
              "depositAmount" = 40000, 
              "codAdjustmentAmount" = 16500 
          WHERE id = 'cbd31b6e-8b43-479b-8ada-5622f87e557f'
        `);
        console.log('Update rows affected:', updateRes.rowCount);
    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}
debug();
