# Order Placement Issue on Vercel - Diagnosis and Fix

## Problem
Orders show "Order placed successfully!" message but are not actually being created in the database when deployed on Vercel.

## Root Cause Analysis

### Likely Causes:

1. **Timezone Configuration Issue** (MOST LIKELY)
   - The recent timezone change to `Asia/Kolkata` in `lib/db.ts` may have caused date comparison mismatches
   - JavaScript `new Date()` creates dates in server timezone (Australian time on Vercel)
   - PostgreSQL with `timezone=Asia/Kolkata` interprets dates differently
   - Date range queries in `order-assignment.ts` may fail to find matching routes

2. **Silent Database Errors**
   - Errors might be occurring but not being logged properly
   - The frontend shows success based on API response, but database operations fail

3. **Environment Variable Issues**
   - Missing or incorrect environment variables on Vercel
   - Database connection string might be different

## Immediate Fixes Applied

### 1. Reverted Timezone Configuration
**File**: `lib/db.ts`
- Removed `options: '-c timezone=Asia/Kolkata'` from database pool
- This prevents date comparison mismatches between JS and PostgreSQL

### 2. Added Error Logging
**File**: `app/api/orders/route.ts`
- Added detailed console.error logging in catch block
- This will help diagnose the actual error in Vercel logs

### 3. Created Timezone Utilities
**File**: `lib/timezone.ts`
- Created utility functions for IST handling at application level
- Better approach than database-level timezone configuration

## How to Fix on Vercel

### Step 1: Deploy the Code Changes
```bash
git add .
git commit -m "Fix order placement issue - revert timezone config and add logging"
git push
```

Vercel will auto-deploy the changes.

### Step 2: Check Vercel Logs
After deployment, try placing an order and immediately check logs:

1. Go to Vercel Dashboard → Your Project
2. Click on "Deployments" → Latest deployment
3. Click on "Functions" tab
4. Look for `/api/orders` function
5. Check the logs for any errors

### Step 3: Verify Environment Variables
Ensure these are set in Vercel:

1. `DATABASE_URL` - PostgreSQL connection string
2. `RAZORPAY_KEY_ID` - Razorpay API key
3. `RAZORPAY_KEY_SECRET` - Razorpay secret
4. `RAZORPAY_WEBHOOK_SECRET` - Webhook secret
5. `ADMIN_USERNAME` - Admin username
6. `ADMIN_PASSWORD` - Admin password hash

### Step 4: Test Order Placement

1. Place a test order
2. Check Vercel function logs immediately
3. Check database directly:
   ```sql
   SELECT * FROM "Order" ORDER BY "createdAt" DESC LIMIT 5;
   ```

## Common Issues and Solutions

### Issue 1: "No delivery boy" error
**Symptom**: Orders fail with no_delivery_boy reason
**Solution**: 
- Check if delivery boys are assigned to the correct pincodes
- Verify delivery boy `assignedArea` field contains the pincode
- Ensure delivery boys are marked as `active=true` and `onLeave=false`

### Issue 2: Date comparison failures
**Symptom**: Routes not being found or created
**Solution**:
- Ensure all date objects are created consistently
- Use UTC for storage, convert to IST for display only

### Issue 3: Payment webhook not firing
**Symptom**: Order created but payment status stays PENDING
**Solution**:
- Verify `RAZORPAY_WEBHOOK_SECRET` is set correctly
- Check Razorpay dashboard for webhook delivery status
- Ensure webhook URL is `https://yourdomain.com/api/payments/webhook`

## Debugging Commands

### Check Database Connection
```sql
-- Check if orders are being created
SELECT COUNT(*) FROM "Order" WHERE "createdAt" > NOW() - INTERVAL '1 hour';

-- Check pending orders
SELECT * FROM "Order" WHERE "paymentStatus" = 'PENDING' ORDER BY "createdAt" DESC LIMIT 10;

-- Check delivery boys and their assigned areas
SELECT "id", "name", "assignedArea", "active", "onLeave" FROM "DeliveryBoy";
```

### Check Vercel Logs via CLI
```bash
vercel logs [deployment-url] --follow
```

## Timezone Display Fix (Separate Issue)

For displaying dates in IST on the frontend, use the timezone utilities:

```typescript
import { formatDateIST, getNowIST } from '@/lib/timezone';

// Display current time in IST
const now = getNowIST();
console.log(formatDateIST(now, { 
  dateStyle: 'full', 
  timeStyle: 'long' 
}));
```

## Next Steps

1. Deploy the fixes
2. Monitor Vercel logs during order placement
3. If errors persist, share the exact error message from logs
4. Check database directly to see if orders are being created

## Prevention

To prevent this in the future:

1. **Always test on Vercel staging** before production
2. **Use UTC for all database timestamps**
3. **Convert to local timezone only for display**
4. **Add comprehensive error logging**
5. **Monitor Vercel function logs regularly**

## Rollback Plan

If issues persist, you can rollback to the previous working version:

```bash
# Find the last working deployment
vercel ls

# Promote a previous deployment
vercel promote [deployment-url]
```
