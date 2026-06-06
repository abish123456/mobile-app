const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
});

async function seedProduct() {
  try {
    const result = await pool.query(`
      INSERT INTO "Product" ("id", "name", "description", "price", "image", "unit", "inStock", "active", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, 'Water Can (20L)', 'Premium purified water can - 20 liters', 50, '/WaterCan1.png', 'can', true, true, NOW(), NOW())
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Product seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding product:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedProduct();

