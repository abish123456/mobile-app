// Script to create admin account
// Usage: node scripts/create-admin.js [email] [username] [password] [name]

const { query } = require('../lib/db');
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function createAdmin() {
  const email = process.argv[2] || 'admin@watercan.com';
  const username = process.argv[3] || 'admin';
  const password = process.argv[4] || 'admin123';
  const name = process.argv[5] || 'Admin User';

  const passwordHash = hashPassword(password);
  const adminId = crypto.randomUUID();

  try {
    // Check if admin already exists
    const existingRes = await query(
      `SELECT "id" FROM "Admin" WHERE "email" = $1 OR "username" = $2`,
      [email, username]
    );

    if (existingRes.rows.length > 0) {
      console.error('Admin with this email or username already exists!');
      process.exit(1);
    }

    await query(
      `INSERT INTO "Admin" ("id", "email", "username", "passwordHash", "name", "active", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [adminId, email, username, passwordHash, name, true]
    );
    
    console.log('✅ Admin created successfully!');
    console.log(`   Email: ${email}`);
    console.log(`   Username: ${username}`);
    console.log(`   Name: ${name}`);
    console.log(`   ID: ${adminId}`);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

createAdmin();

