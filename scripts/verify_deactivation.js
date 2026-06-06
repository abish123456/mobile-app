const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function verifyDeactivation() {
    const customerId = 'e0fba386-c761-4377-b486-7c0cc6afc10d'; // User "Abish" from earlier debug
    console.log(`Verifying deactivation for customer: ${customerId}`);

    try {
        // 1. Check current status
        const statusRes = await pool.query('SELECT active, phone FROM "Customer" WHERE id = $1', [customerId]);
        console.log('Current Customer Status:', statusRes.rows[0]);

        // 2. Simulate session check (same query as in lib/session-auth.ts)
        // We'll just check what the query returns if the customer is active vs inactive
        const sessionToken = 'dummy-token-' + Date.now();
        await pool.query(
            'INSERT INTO "UserSession" ("id", "customerId", "token", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
            [require('crypto').randomUUID(), customerId, sessionToken, new Date(Date.now() + 3600000)]
        );

        const checkSession = async () => {
            const res = await pool.query(
                `SELECT s."customerId", s."expiresAt", c."active" 
             FROM "UserSession" s
             JOIN "Customer" c ON s."customerId" = c."id"
             WHERE s."token" = $1`,
                [sessionToken]
            );
            return res.rows[0];
        };

        console.log('\n--- Test 1: Active Customer ---');
        await pool.query('UPDATE "Customer" SET active = true WHERE id = $1', [customerId]);
        const activeResult = await checkSession();
        console.log('Session Check Result (Active):', activeResult ? 'VALID' : 'INVALID');
        console.log('Result Data:', activeResult);

        console.log('\n--- Test 2: Inactive Customer ---');
        await pool.query('UPDATE "Customer" SET active = false WHERE id = $1', [customerId]);
        const inactiveResult = await checkSession();
        console.log('Session Check Result (Inactive):', (inactiveResult && inactiveResult.active) ? 'VALID' : 'INVALID');
        console.log('Result Data:', inactiveResult);

        // Cleanup
        await pool.query('DELETE FROM "UserSession" WHERE token = $1', [sessionToken]);
        // Restore original phone suffix logic if needed, but for now just restore active status for user to continue testing
        await pool.query('UPDATE "Customer" SET active = true WHERE id = $1', [customerId]);
        console.log('\nRestored customer to active status for further user testing.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

verifyDeactivation();
