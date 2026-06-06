const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  const client = await pool.connect();
  try {
    const check = await client.query('SELECT count(*) FROM "SupportContact"');
    if (parseInt(check.rows[0].count) === 0) {
      console.log('Seeding default support contacts...');
      const contacts = [
        { id: 'sc_1', type: 'PHONE', label: 'Support Line 1', value: '9843820202', active: true },
        { id: 'sc_2', type: 'PHONE', label: 'Support Line 2', value: '9843490909', active: true },
        { id: 'sc_3', type: 'PHONE', label: 'Support Line 3', value: '9843469000', active: true },
        { id: 'sc_4', type: 'EMAIL', label: 'Email Support', value: 'sabolpurewater@yahoo.com', active: true }
      ];
      for (const c of contacts) {
        await client.query(
          'INSERT INTO "SupportContact" (id, type, label, value, active, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
          [c.id, c.type, c.label, c.value, c.active]
        );
      }
      console.log('Seeded 4 default support contacts successfully.');
    } else {
      console.log('Support contacts already exist, skipping seed.');
    }
  } finally {
    client.release();
  }
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Error seeding support contacts:', err);
    pool.end();
    process.exit(1);
  });
