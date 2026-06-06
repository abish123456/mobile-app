import { Pool } from "pg";

// Create a single shared connection pool for the app
// Configure to use Indian Standard Time (IST)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Set timezone to IST for all connections
pool.on('connect', (client) => {
  client.query('SET timezone = "Asia/Kolkata"');
});

export async function query<T = any>(text: string, params?: any[]) {
  const res = await pool.query<T>(text, params);
  return res;
}

export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


