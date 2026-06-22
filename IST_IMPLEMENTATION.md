# Indian Standard Time (IST) Implementation Guide

## Overview
This application is configured to work entirely in **Indian Standard Time (IST, UTC+5:30)** throughout the system - from database to frontend.

## How It Works

### 1. Database Configuration
**File**: `lib/db.ts`

The PostgreSQL database is configured to use `Asia/Kolkata` timezone:

```typescript
pool.on('connect', (client) => {
  client.query('SET timezone = "Asia/Kolkata"');
});
```

This ensures:
- All `TIMESTAMP` columns are stored and retrieved in IST
- `NOW()` function returns IST time
- Date comparisons work in IST

### 2. JavaScript/TypeScript Timezone Utilities
**File**: `lib/timezone.ts`

Utility functions ensure JavaScript Date objects work correctly with IST:

#### Key Functions:

**`getNowIST()`** - Get current time in IST
```typescript
const now = getNowIST();
// Returns: Date object representing current IST time
```

**`toIST(date)`** - Convert any date to IST
```typescript
const utcDate = new Date('2025-12-11T10:00:00Z');
const istDate = toIST(utcDate);
// Converts UTC to IST representation
```

**`formatDateIST(date, options)`** - Format date for display
```typescript
const formatted = formatDateIST(new Date(), {
  dateStyle: 'full',
  timeStyle: 'short'
});
// Output: "Wednesday, 11 December 2025 at 12:30 PM"
```

**`getStartOfDayIST(date)`** - Get 00:00:00 IST
```typescript
const startOfDay = getStartOfDayIST(new Date());
// Returns: Date object for today at 00:00:00 IST
```

**`getEndOfDayIST(date)`** - Get 23:59:59 IST
```typescript
const endOfDay = getEndOfDayIST(new Date());
// Returns: Date object for today at 23:59:59.999 IST
```

**`getTodayIST()`** - Get today's date string
```typescript
const today = getTodayIST();
// Returns: "2025-12-11"
```

**`getTomorrowIST()`** - Get tomorrow's date string
```typescript
const tomorrow = getTomorrowIST();
// Returns: "2025-12-12"
```

## Usage in Different Parts of the App

### Backend API Routes

When working with dates in API routes:

```typescript
import { getNowIST, getStartOfDayIST, getEndOfDayIST } from '@/lib/timezone';

// Get current time
const now = getNowIST();

// Create date ranges for queries
const startOfDay = getStartOfDayIST(new Date());
const endOfDay = getEndOfDayIST(new Date());

// Query orders for today
const orders = await query(
  `SELECT * FROM "Order" 
   WHERE "deliveryDate" >= $1 AND "deliveryDate" <= $2`,
  [startOfDay, endOfDay]
);
```

### Frontend Components

For displaying dates to users:

```typescript
import { formatDateIST, getNowIST } from '@/lib/timezone';

// Display current time
const currentTime = formatDateIST(getNowIST(), {
  hour: '2-digit',
  minute: '2-digit'
});

// Display order date
const orderDate = formatDateIST(new Date(order.deliveryDate), {
  dateStyle: 'medium'
});
```

### Order Creation

When creating orders with delivery dates:

```typescript
import { getNowIST, createISTDate } from '@/lib/timezone';

const now = getNowIST();

// For "TODAY" delivery
const deliveryDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

// For "TOMORROW" delivery
const deliveryDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

// For specific date (YYYY-MM-DD)
const [year, month, day] = dateString.split('-').map(Number);
const deliveryDate = createISTDate(year, month - 1, day);
```

## Important Notes

### ✅ DO:
- Use `getNowIST()` instead of `new Date()` when you need current time
- Use timezone utilities for date comparisons
- Store dates in the database as-is (they're already in IST)
- Use `formatDateIST()` for displaying dates to users

### ❌ DON'T:
- Don't use `new Date()` directly for current time (use `getNowIST()`)
- Don't manually calculate timezone offsets
- Don't mix UTC and IST dates in comparisons
- Don't change the database timezone configuration

## Deployment on Vercel

### Environment Variables
No special timezone environment variables needed! The configuration is in the code.

### Verification
After deployment, verify IST is working:

1. **Check current time**:
   ```typescript
   console.log('Current IST time:', getNowIST());
   ```

2. **Check database time**:
   ```sql
   SELECT NOW(); -- Should return IST time
   ```

3. **Check order creation**:
   - Create a test order
   - Verify `deliveryDate` is in IST
   - Check admin panel shows correct time

## Troubleshooting

### Issue: Times still showing wrong timezone
**Solution**: 
- Ensure you're using `formatDateIST()` for display
- Check that database connection is using IST (check logs)
- Verify `getNowIST()` is being used instead of `new Date()`

### Issue: Date comparisons not working
**Solution**:
- Use `getStartOfDayIST()` and `getEndOfDayIST()` for date ranges
- Ensure both dates being compared are in IST
- Check database timezone is set correctly

### Issue: Orders not being assigned to routes
**Solution**:
- Check delivery date is created using IST utilities
- Verify route date comparisons use same timezone
- Check logs for date mismatch errors

## Testing

### Local Development
Works automatically! The IST configuration applies in all environments.

### Production (Vercel)
The IST configuration works regardless of Vercel's server location:
- Database uses `Asia/Kolkata` timezone
- JavaScript utilities convert to IST
- Consistent behavior everywhere

## Examples

### Example 1: Create Order for Tomorrow
```typescript
import { getNowIST } from '@/lib/timezone';

const now = getNowIST();
const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(0, 0, 0, 0);

await query(
  `INSERT INTO "Order" (..., "deliveryDate", ...) VALUES (..., $1, ...)`,
  [tomorrow]
);
```

### Example 2: Get Today's Orders
```typescript
import { getStartOfDayIST, getEndOfDayIST } from '@/lib/timezone';

const startOfDay = getStartOfDayIST(new Date());
const endOfDay = getEndOfDayIST(new Date());

const orders = await query(
  `SELECT * FROM "Order" 
   WHERE "deliveryDate" >= $1 AND "deliveryDate" <= $2`,
  [startOfDay, endOfDay]
);
```

### Example 3: Display Order Time
```typescript
import { formatDateIST } from '@/lib/timezone';

const orderTime = formatDateIST(new Date(order.createdAt), {
  dateStyle: 'medium',
  timeStyle: 'short'
});
// Output: "11 Dec 2025, 12:30 PM"
```

## Summary

✅ **Database**: Uses `Asia/Kolkata` timezone
✅ **Backend**: Uses IST utility functions
✅ **Frontend**: Displays times in IST
✅ **Consistent**: Works everywhere (local, Vercel, etc.)

The entire application now operates in Indian Standard Time!
