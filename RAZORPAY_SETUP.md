# Razorpay Payment Gateway Integration Guide

This guide explains how to set up and configure Razorpay for online payments (UPI and Cards) in the SABOLS Delivery App.

## Prerequisites

1. Razorpay account (Sign up at https://razorpay.com)
2. API keys from Razorpay Dashboard
3. Vercel account (for production deployment)

## Setup Steps

### 1. Get Razorpay API Keys

1. Log in to your Razorpay Dashboard: https://dashboard.razorpay.com
2. Go to **Settings** → **API Keys**
3. Generate **Test Keys** for development (or **Live Keys** for production)
4. Copy the following:
   - **Key ID** (starts with `rzp_test_` or `rzp_live_`)
   - **Key Secret** (starts with `rzp_test_` or `rzp_live_`)

### 2. Configure Environment Variables (Vercel Deployment)

When deploying to Vercel, you must set the environment variables in the Vercel Dashboard.

1. Go to your **Vercel Project** → **Settings** → **Environment Variables**.
2. Add the following keys:
   - `NEXT_PUBLIC_RAZORPAY_KEY_ID`: `rzp_live_xxxxxxxxxxxxx` (Use Live Key ID)
   - `RAZORPAY_KEY_SECRET`: `your_live_key_secret_here` (Use Live Key Secret)
   - `RAZORPAY_WEBHOOK_SECRET`: `your_chosen_webhook_secret` (Create a strong password/secret yourself, e.g., `my_secure_webhook_pass_2025`)

**Important:**
- `NEXT_PUBLIC_RAZORPAY_KEY_ID` is exposed to the browser.
- `RAZORPAY_KEY_SECRET` is kept secret on the server.
- `RAZORPAY_WEBHOOK_SECRET` allows your app to verify that the webhook actually came from Razorpay.

### 3. Configure Webhook (Razorpay Dashboard)

Once your app is deployed to Vercel (e.g., `https://my-delivery-app.vercel.app`), configure the webhook:

1. Go to Razorpay Dashboard → **Settings** → **Webhooks**.
2. Click **+ Add New Webhook**.
3. **Webhook URL**: Enter your Vercel domain + `/api/payments/webhook`
   - Example: `https://my-delivery-app.vercel.app/api/payments/webhook`
4. **Secret**: Enter the SAME secret you added to Vercel (`RAZORPAY_WEBHOOK_SECRET`).
5. **Active Events**: Check ONLY the following boxes (CRITICAL):
   - ✅ `payment.captured` (Handles standard checkout payments)
   - ✅ `payment.failed` (Handles failed payments)
   - ✅ `payment_link.paid` (Handles "Add Quantity" payments sent via link)
   - ✅ `order.paid` (Backup for standard orders)
6. Click **Create Webhook**.

### 4. Test Mode vs Live Mode

#### Test Mode (Development)
- Use test API keys (`rzp_test_...`)
- Use test cards: https://razorpay.com/docs/payments/test-cards
- Test UPI: Use `success@razorpay`

#### Live Mode (Production)
- Use live API keys (`rzp_live_...`)
- Real money is moved.
- ensuring your **Vercel Environment Variables** are using the Live Keys.
- Ensure **RAZORPAY_WEBHOOK_SECRET** matches in Vercel and Razorpay Dashboard.

## How It Works

### Payment Flow

1. **User places order** → Order is created with `paymentStatus: PENDING`
2. **Payment initialization** → `/api/payments/create` creates Razorpay order
3. **Razorpay checkout opens** → User selects payment method (UPI/Card/etc.)
4. **Payment processing** → Razorpay processes the payment
5. **Webhook notification** → Razorpay sends webhook to `/api/payments/webhook`
6. **Order status updated** → Payment record created, order status updated to `SUCCESS`

### Supported Payment Methods

Razorpay automatically supports:
- ✅ **UPI** (all UPI apps: GPay, PhonePe, Paytm, etc.)
- ✅ **Credit/Debit Cards** (Visa, Mastercard, RuPay, etc.)
- ✅ **Netbanking**
- ✅ **Wallets** (Paytm, Freecharge, etc.)
- ✅ **EMI** (if enabled)

## Troubleshooting

### Webhook not receiving events?
1. **Check URL**: Is it `https`? Does it end in `/api/payments/webhook`?
2. **Check Secret**: Does the secret in Razorpay Dashboard match `RAZORPAY_WEBHOOK_SECRET` in Vercel?
3. **Check Events**: Did you select `payment.captured` and `payment_link.paid`?

### "Signature Verification Failed" Error
This means the secret keys do not match.
1. Update `RAZORPAY_WEBHOOK_SECRET` in Vercel.
2. Redeploy the app (or restart the function).
3. Update the secret in Razorpay Dashboard -> Webhooks.

## Security Notes

1. **Never expose** `RAZORPAY_KEY_SECRET` to the frontend.
2. **Always verify** webhook signatures (the code handles this automatically).
3. **Use HTTPS** (Vercel provides this by default).
