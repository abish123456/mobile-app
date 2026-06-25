const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.ujjowgrjgwjvkszyinui:Abish@1810@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres' });
client.connect()
  .then(() => client.query('SELECT username, email, "passwordHash" FROM "Admin" LIMIT 3'))
  .then(res => {
    console.log(res.rows);
    client.end();
  })
  .catch(console.error);
