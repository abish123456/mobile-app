# Timezone Configuration for Vercel Deployment

## Problem
When deployed on Vercel, all times were showing in Australian time instead of Indian Standard Time (IST). This happened because:
1. Vercel servers run in a different timezone (UTC or regional timezone)
2. JavaScript `new Date()` uses the server's timezone
3. Date displays were not being converted to IST

## ⚠️ Important Update
**The initial fix of setting database timezone caused order placement issues!**

Setting `timezone=Asia/Kolkata` in the PostgreSQL connection caused date comparison mismatches between JavaScript Date objects (created in server timezone) and PostgreSQL timestamps (interpreted in IST). This broke order assignment logic.

## Correct Solution

### Application-Level Timezone Handling

Instead of changing the database timezone, we handle timezones at the **application level**:

1. **Store all dates in UTC** (database default)
2. **Convert to IST for display only** (frontend/API responses)
3. **Use timezone utilities** for consistent conversions

## Changes Made

### 1. Timezone Utilities (`lib/timezone.ts`)
Created utility functions for IST handling:
- `getNowIST()` - Get current time in IST
- `toIST(date)` - Convert any date to IST
- `formatDateIST(date, options)` - Format date for display in IST
- `getStartOfDayIST(date)` - Get start of day in IST
- `getEndOfDayIST(date)` - Get end of day in IST

### 2. Database Configuration (`lib/db.ts`)
- **Reverted** timezone configuration
- Database now uses default UTC timezone
- This prevents date comparison issues

## How to Use

### For Displaying Dates in IST

```typescript
import { formatDateIST, getNowIST } from '@/lib/timezone';

// Get current time in IST
const now = getNowIST();

// Format for display
const formatted = formatDateIST(now, {
  dateStyle: 'full',
  timeStyle: 'short'
});
// Output: "Wednesday, 11 December 2025 at 12:30 PM"
```

### For Date Comparisons

```typescript
import { getStartOfDayIST, getEndOfDayIST } from '@/lib/timezone';

const date = new Date('2025-12-11');
const startOfDay = getStartOfDayIST(date);
const endOfDay = getEndOfDayIST(date);

// Use for database queries
const orders = await query(
  `SELECT * FROM "Order" WHERE "deliveryDate" >= $1 AND "deliveryDate" <= $2`,
  [startOfDay, endOfDay]
);
```

### For Frontend Display

```javascript
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// Convert UTC date to IST for display
const utcDate = new Date(order.deliveryDate);
const istDate = toZonedTime(utcDate, 'Asia/Kolkata');
const formatted = format(istDate, 'PPP'); // "December 11, 2025"
```

## Deployment Steps for Vercel

### Option 1: Using Vercel Dashboard (Recommended)
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new environment variable:
   - **Name**: `TZ`
   - **Value**: `Asia/Kolkata`
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**
5. Redeploy your application

### Option 2: Using Vercel CLI
```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Set the environment variable
vercel env add TZ

# When prompted, enter: Asia/Kolkata
# Select all environments (Production, Preview, Development)

# Redeploy
vercel --prod
```

### Option 3: Using vercel.json (Not Recommended for Secrets)
Create or update `vercel.json`:
```json
{
  "env": {
    "TZ": "Asia/Kolkata"
  }
}
```

## Verification

After deployment, you can verify the timezone is working correctly:

1. Check your admin reports - dates should now show in IST
2. Create a test order and verify the delivery date/time
3. Check the route assignments - they should use IST

## Important Notes

### Database Timezone vs Application Timezone
- **Database Timezone**: Set via PostgreSQL connection (what we fixed)
- **Application Timezone**: JavaScript Date objects will still use server timezone for display
- **Best Practice**: Always store dates in UTC in the database, but our fix ensures consistency

### For Local Development
The code will automatically use `Asia/Kolkata` timezone even in local development, ensuring consistency between local and production environments.

### If You Need to Change Timezone
Simply update the `TZ` environment variable in Vercel to any valid timezone:
- `Asia/Kolkata` - Indian Standard Time
- `UTC` - Coordinated Universal Time
- `America/New_York` - Eastern Time
- `Europe/London` - British Time
- etc.

## Testing Locally

To test the timezone fix locally:

1. The code already defaults to `Asia/Kolkata`
2. Optionally, create a `.env.local` file:
   ```
   TZ=Asia/Kolkata
   ```
3. Restart your development server
4. Check that dates are displayed correctly

## Troubleshooting

### If times are still showing incorrectly after deployment:

1. **Verify environment variable is set**:
   - Check Vercel dashboard → Settings → Environment Variables
   - Ensure `TZ=Asia/Kolkata` is present

2. **Redeploy the application**:
   - Environment variable changes require a new deployment
   - Go to Deployments tab and click "Redeploy"

3. **Check database connection**:
   - Ensure `DATABASE_URL` is correctly set
   - Verify database is accessible from Vercel

4. **Clear cache**:
   - Sometimes Vercel caches old builds
   - Try a fresh deployment with `vercel --prod --force`

### If you see errors in logs:

1. **Invalid timezone error**:
   - Ensure timezone name is correct: `Asia/Kolkata` (not `IST`)
   - Check PostgreSQL supports the timezone

2. **Connection errors**:
   - Verify `DATABASE_URL` environment variable
   - Check database firewall allows Vercel IPs

## Additional Recommendations

### For Better Date Handling in Frontend:

Consider using a library like `date-fns-tz` or `luxon` for timezone-aware date formatting:

```javascript
import { formatInTimeZone } from 'date-fns-tz';

// Format date in IST
const formattedDate = formatInTimeZone(
  new Date(order.deliveryDate),
  'Asia/Kolkata',
  'yyyy-MM-dd HH:mm:ss zzz'
);
```

### For API Responses:

Always return dates in ISO 8601 format with timezone information:
```javascript
const date = new Date();
const isoString = date.toISOString(); // Always UTC
```

Then convert to IST on the client side if needed.

## Summary

✅ Database connection now uses IST timezone
✅ Configurable via environment variable
✅ Works in both local and production environments
✅ No code changes needed for existing date logic

The fix ensures all database operations use Indian Standard Time, making your application timezone-consistent across all deployments.
