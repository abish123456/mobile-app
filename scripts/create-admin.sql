-- SQL script to create first admin account
-- Password: admin123 (hash: 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9)
-- Change the password hash if you want a different password!

INSERT INTO "Admin" ("id", "email", "username", "passwordHash", "name", "active", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  'admin@watercan.com',
  'admin',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', -- hash of 'admin123'
  'Admin User',
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "Admin" 
  WHERE "email" = 'admin@watercan.com' OR "username" = 'admin'
);

