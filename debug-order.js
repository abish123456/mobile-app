const { Pool } = require('pg');

const connectionString = "postgresql://postgres.ujjowgrjgwjvkszyinui:Abish@1810@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function debug() {
    try {
        const paymentId = 'pay_SBvLrBfoYivFSP';
        console.log(`Searching for: ${paymentId}`);
        const res = await pool.query('SELECT * FROM "Payment" WHERE "providerPaymentId" = $1', [paymentId]);
        console.log(JSON.stringify(res.rows, null, 2));

        const res2 = await pool.query('SELECT * FROM "Payment" WHERE "providerPaymentId" LIKE $1', [`%SBvLrB%`]);
        console.log('Partial search results:', JSON.stringify(res2.rows, null, 2));

    } catch (err) {
        console.error('Debug Error:', err);
    } finally {
        await pool.end();
        process.exit();
    }
}

debug();
