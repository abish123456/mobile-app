# Migration Guide - Delivery Boy Area Management

## Issue
The database schema has drifted from the migration history. We need to properly generate and apply migrations.

## Steps to Fix

### 1. Ensure Database Connection
Make sure your `.env.local` file has the correct `DATABASE_URL` and that you can connect to your database.

### 2. Resolve Drift and Create Migration

Run the following command to create a proper migration:

```bash
npx prisma migrate dev --name add_delivery_boy_area_management
```

This will:
- Detect the schema changes (assignedArea, onLeave columns)
- Detect the drift (razorpayTokenId index)
- Generate a migration file automatically
- Apply it to your database

### 3. If Migration Fails Due to Drift

If Prisma asks to reset the database, you have two options:

**Option A: Resolve the drift manually (Recommended)**
```bash
# Mark the migration as applied (if the columns already exist)
npx prisma migrate resolve --applied <migration_name>

# Or create a migration to fix the drift
npx prisma migrate dev --create-only --name fix_razorpay_index_drift
# Then edit the migration file to add back the index if needed
# Then apply: npx prisma migrate dev
```

**Option B: Use db push (Development only - loses migration history)**
```bash
npx prisma db push
```

### 4. Verify Migration

After migration, verify the columns exist:
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'DeliveryBoy' 
AND column_name IN ('assignedArea', 'onLeave');
```

## What the Migration Should Include

1. Add `assignedArea` column (TEXT, nullable)
2. Add `onLeave` column (BOOLEAN, default false)
3. Create index on `(assignedArea, active, onLeave)`
4. Handle the `razorpayTokenId` index drift (add it back if needed)
