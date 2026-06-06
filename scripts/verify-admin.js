// Script to verify admin account exists and check credentials
const { query } = require('../lib/db');
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function verifyAdmin() {
  try {
    // Check if admin exists
    const adminRes = await query(
      `SELECT "id", "email", "username", "passwordHash", "active" FROM "Admin" WHERE "email" = $1 OR "username" = $2`,
      ['admin@watercan.com', 'admin']
    );

    if (adminRes.rows.length === 0) {
      console.log('❌ No admin found with email admin@watercan.com or username admin');
      console.log('   Run the create-admin script or SQL to create the admin first.');
      process.exit(1);
    }

    const admin = adminRes.rows[0];
    console.log('✅ Admin found:');
    console.log(`   ID: ${admin.id}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Username: ${admin.username}`);
    console.log(`   Active: ${admin.active}`);
    console.log(`   Password Hash: ${admin.passwordHash}`);

    // Verify password hash
    const testPassword = 'admin123';
    const expectedHash = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
    const computedHash = hashPassword(testPassword);
    
    console.log('\n🔐 Password Verification:');
    console.log(`   Expected hash: ${expectedHash}`);
    console.log(`   Computed hash: ${computedHash}`);
    console.log(`   Hash matches: ${computedHash === expectedHash}`);
    console.log(`   Stored hash matches: ${admin.passwordHash === expectedHash}`);
    console.log(`   Stored hash matches computed: ${admin.passwordHash === computedHash}`);

    if (!admin.active) {
      console.log('\n⚠️  WARNING: Admin account is not active!');
    }

    if (admin.passwordHash !== expectedHash && admin.passwordHash !== computedHash) {
      console.log('\n⚠️  WARNING: Password hash mismatch!');
      console.log('   The stored hash does not match the expected hash for "admin123"');
    }

  } catch (error) {
    console.error('❌ Error verifying admin:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

verifyAdmin();
