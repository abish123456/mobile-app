/**
 * Script to apply payment method verification migration
 * Run with: node scripts/apply-payment-verification-migration.js
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function applyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Applying payment method verification migration...');
    
    await client.query(`
      ALTER TABLE "CustomerPaymentMethod"
      ADD COLUMN IF NOT EXISTS "verified" BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS "stripePaymentMethodId" TEXT,
      ADD COLUMN IF NOT EXISTS "cardBrand" TEXT,
      ADD COLUMN IF NOT EXISTS "cardLast4" TEXT;
    `);
    
    console.log('✅ Migration applied successfully!');
    console.log('Added columns: verified, stripePaymentMethodId, cardBrand, cardLast4');
  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();

