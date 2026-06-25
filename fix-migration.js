const { Client } = require('pg');

async function fix() {
  const client = new Client({
    connectionString: 'postgresql://postgres:Ashika4@@localhost:5432/waterApp?schema=public'
  });
  
  await client.connect();
  const res = await client.query("DELETE FROM _prisma_migrations WHERE migration_name = '20260615100224_add_route_is_auto_optimized'");
  console.log(`Deleted ${res.rowCount} row(s)`);
  await client.end();
}

fix().catch(console.error);
