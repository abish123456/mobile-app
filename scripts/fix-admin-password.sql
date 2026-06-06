-- Fix admin password hash
-- Update the existing admin's password to match 'admin123'

UPDATE "Admin"
SET 
  "passwordHash" = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  "updatedAt" = NOW()
WHERE "email" = 'admin@watercan.com' OR "username" = 'admin';
