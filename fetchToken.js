const { Client } = require('pg');
const connectionString = 'postgresql://postgres.nmbzicxigpwncdgpxjka:2LdFj%23rY6Y_4m2b@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
const client = new Client({ connectionString });
client.connect().then(() => {
  return client.query('SELECT "pushToken" FROM "UserSession" WHERE "pushToken" IS NOT NULL ORDER BY "updatedAt" DESC LIMIT 1');
}).then(res => {
  console.log("LATEST TOKEN IS:", res.rows[0].pushToken);
  client.end();
});
