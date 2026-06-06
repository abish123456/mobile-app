import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { withTransaction } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";
import Razorpay from "razorpay";
import crypto from "crypto";

// Initialize Razorpay
let razorpay: Razorpay | null = null;
if (process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

/**
 * POST /api/payments/reconcile
 * Reconciliation endpoint to recover from payment verification failures
 * 
 * Use case: Payment succeeded in Razorpay but verify-payment failed or didn't run
 * This endpoint checks Razorpay payment status and updates order accordingly
 */
export async function POST(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    if (!razorpay) {
      return NextResponse.json(
        { success: false, message: "Payment gateway not configured" },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { orderId, razorpayPaymentId } = body;

    if (!orderId || typeof orderId !== 'string' || orderId.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Order ID is required" },
        { status: 400 }
      );
    }

    // Get order details
    const orderRes = await query<{
      id: string;
      customerId: string;
      paymentStatus: string;
      quantity: number;
      amount: number | null;
      depositAmount: number | null;
    }>(
      `SELECT "id", "customerId", "paymentStatus", "quantity", "amount", "depositAmount"
       FROM "Order"
       WHERE "id" = $1`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    // If order is already SUCCESS, no reconciliation needed
    if (order.paymentStatus === "SUCCESS") {
      return NextResponse.json({
        success: true,
        message: "Order already marked as paid",
        alreadyPaid: true,
      });
    }

    // If razorpayPaymentId is provided, fetch payment directly
    // Otherwise, we need to find the payment from the order
    let payment: any = null;

    if (razorpayPaymentId) {
      try {
        payment = await razorpay.payments.fetch(razorpayPaymentId);
      } catch (error: any) {
        return NextResponse.json(
          { success: false, message: `Payment not found in Razorpay: ${error.message}` },
          { status: 404 }
        );
      }
    } else {
      // Try to find payment from Payment table
      const paymentRes = await query<{
        providerPaymentId: string;
        providerOrderId: string;
      }>(
        `SELECT "providerPaymentId", "providerOrderId"
         FROM "Payment"
         WHERE "orderId" = $1
         LIMIT 1`,
        [orderId]
      );

      if (paymentRes.rows.length > 0 && paymentRes.rows[0].providerPaymentId) {
        try {
          payment = await razorpay.payments.fetch(paymentRes.rows[0].providerPaymentId);
        } catch (error: any) {
          return NextResponse.json(
            { success: false, message: `Payment not found in Razorpay: ${error.message}` },
            { status: 404 }
          );
        }
      } else {
        // No payment record - check if we can find it from Razorpay orders
        return NextResponse.json(
          { success: false, message: "Payment ID required. Please provide razorpayPaymentId." },
          { status: 400 }
        );
      }
    }

    // Verify payment status
    if (payment.status !== "captured" && payment.status !== "authorized") {
      return NextResponse.json(
        {
          success: false,
          message: `Payment status is ${payment.status}, not captured. Cannot reconcile.`
        },
        { status: 400 }
      );
    }

    // Validate payment amount matches order amount
    if (!order.amount) {
      return NextResponse.json(
        {
          success: false,
          message: "Order amount not found. This order may be from an older version. Please contact support."
        },
        { status: 400 }
      );
    }
    const expectedAmount = order.amount; // Already in paise
    const actualAmount = typeof payment.amount === 'number' ? payment.amount : Number(payment.amount) || 0;

    if (Math.abs(actualAmount - expectedAmount) > 1) {
      return NextResponse.json(
        {
          success: false,
          message: `Payment amount mismatch. Expected ₹${expectedAmount / 100}, received ₹${actualAmount / 100}`
        },
        { status: 400 }
      );
    }

    // Reconcile: Update order and create payment record
    await withTransaction(async (client) => {
      // Update order payment status (only if still PENDING - idempotency)
      const updateResult = await client.query(
        `UPDATE "Order" 
         SET "paymentStatus" = 'SUCCESS', "updatedAt" = NOW()
         WHERE "id" = $1 AND "paymentStatus" = 'PENDING'
         RETURNING "id"`,
        [orderId]
      );

      if (updateResult.rows.length === 0) {
        // Order was already processed. 
        // We throw here but catch outside to return a friendly message if needed, 
        // however, if we are reconciling, we usually expect it to be PENDING.
        // Actually, let's just ignore if it's already SUCCESS to be idempotent.
      }

      // Create/update Payment record
      const paymentId = crypto.randomUUID();
      await client.query(
        `INSERT INTO "Payment" ("id", "orderId", "provider", "providerOrderId", "providerPaymentId", "amount", "status", "method", "createdAt", "updatedAt")
         VALUES ($1, $2, 'RAZORPAY', $3, $4, $5, 'SUCCESS', 'ONLINE', NOW(), NOW())
         ON CONFLICT ("providerPaymentId")
         DO UPDATE SET 
           "status" = 'SUCCESS', 
           "updatedAt" = NOW()`,
        [
          paymentId,
          orderId,
          payment.order_id,
          payment.id,
          payment.amount, // Amount in paise
        ]
      );

      // Update Customer deposit balance if this order included a deposit
      if (order.depositAmount && order.depositAmount > 0) {
        // Check if we have already credited this deposit
        const existingLog = await client.query(
          `SELECT 1 FROM "WalletTransaction" 
           WHERE "referenceId" = $1 AND "referenceType" = 'DEPOSIT'`,
          [orderId]
        );

        if (existingLog.rows.length === 0) {
          const depositInRupees = order.depositAmount / 100;
          await client.query(
            `UPDATE "Customer" 
             SET "depositWalletBalance" = "depositWalletBalance" + $1, "updatedAt" = NOW() 
             WHERE "id" = $2`,
            [depositInRupees, order.customerId]
          );

          // Log the deposit transaction
          await client.query(
            `INSERT INTO "WalletTransaction"
             ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              crypto.randomUUID(),
              order.customerId,
              depositInRupees,
              'CREDIT',
              'DEPOSIT',
              orderId,
              `Deposit paid (Reconciled) for Order #${orderId.slice(-8).toUpperCase()}`
            ]
          );
        }
      }
    });

    // Save card token if payment was made with a card
    // Import the helper function from webhook (or duplicate the logic)
    if (payment.method === 'card' && payment.card) {
      try {
        await saveCardTokenFromReconciliation(payment, order.customerId);
      } catch (tokenError: any) {
        // Log error but don't fail reconciliation
        console.error("Reconciliation: Error saving card token:", tokenError.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Payment reconciled successfully",
      orderId,
      paymentId: payment.id,
      amount: actualAmount / 100, // Return in rupees
    });
  } catch (error: any) {
    console.error("Error in payment reconciliation:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Reconciliation failed" },
      { status: 500 }
    );
  }
}

/**
 * Save card token from reconciliation payment data
 * Similar to webhook token saving but for reconciliation endpoint
 */
async function saveCardTokenFromReconciliation(
  payment: any,
  customerId: string
) {
  try {
    // Extract token from payment.card
    const cardObj = payment.card as any;
    const tokenId = cardObj.token_id ||
      cardObj.tokenId ||
      cardObj.token ||
      cardObj.card_id ||
      cardObj.cardId ||
      cardObj.id;

    if (!tokenId) {
      return;
    }

    // Get card details from payment
    const cardLast4 = payment.card.last4 || null;
    const cardBrand = payment.card.network?.toLowerCase() || payment.card.name?.toLowerCase() || null;

    // Try to find payment method by card details
    let targetPaymentMethodId: string | null = null;

    if (cardLast4) {
      const pmMatch = await query<{
        id: string;
        type: string;
      }>(
        `SELECT "id", "type"
         FROM "CustomerPaymentMethod"
         WHERE "customerId" = $1 
           AND "type" = 'card'
           AND (
             "cardLast4" = $2 
             OR "details" LIKE $3
           )
         ORDER BY "updatedAt" DESC
         LIMIT 1`,
        [customerId, cardLast4, `%${cardLast4}`]
      );

      if (pmMatch.rows.length > 0) {
        targetPaymentMethodId = pmMatch.rows[0].id;
      }
    }

    // If no payment method found, create a new one
    if (!targetPaymentMethodId) {
      // Create new card payment method
      const newPmId = crypto.randomUUID();
      const cardDisplayText = cardLast4 ? `**** **** **** ${cardLast4}` : 'Card';

      // Check if new columns exist
      let useNewColumns = false;
      try {
        const columnCheck = await query(
          `SELECT column_name 
           FROM information_schema.columns 
           WHERE table_name = 'CustomerPaymentMethod' 
           AND column_name IN ('razorpayTokenId', 'cardBrand', 'cardLast4')
           LIMIT 1`
        );
        useNewColumns = columnCheck.rows.length > 0;
      } catch {
        useNewColumns = false;
      }

      try {
        if (useNewColumns) {
          await query(
            `INSERT INTO "CustomerPaymentMethod" 
             ("id", "customerId", "type", "details", "isDefault", "razorpayTokenId", "cardBrand", "cardLast4", "createdAt", "updatedAt")
             VALUES ($1, $2, 'card', $3, false, $4, $5, $6, NOW(), NOW())`,
            [newPmId, customerId, cardDisplayText, tokenId || null, cardBrand, cardLast4]
          );
        } else {
          // Fallback: insert without new columns
          await query(
            `INSERT INTO "CustomerPaymentMethod" 
             ("id", "customerId", "type", "details", "isDefault", "createdAt", "updatedAt")
             VALUES ($1, $2, 'card', $3, false, NOW(), NOW())`,
            [newPmId, customerId, cardDisplayText]
          );
        }
        targetPaymentMethodId = newPmId;
      } catch (createError: any) {
        // Log error but don't fail reconciliation
        console.error("Reconciliation: Error creating new card payment method:", createError);
        return; // Can't proceed without payment method
      }
    }

    // Save the token and update card details
    try {
      await query(
        `UPDATE "CustomerPaymentMethod" 
         SET "razorpayTokenId" = $1, 
             "cardLast4" = COALESCE($4::text, "cardLast4"),
             "cardBrand" = COALESCE($5::text, "cardBrand"),
             "updatedAt" = NOW()
         WHERE "id" = $2 AND "customerId" = $3 AND "type" = 'card'`,
        [tokenId, targetPaymentMethodId, customerId, cardLast4, cardBrand]
      );
    } catch (updateError: any) {
      // Fallback if cardLast4/cardBrand columns don't exist
      if (updateError.code === '42703') {
        await query(
          `UPDATE "CustomerPaymentMethod" 
           SET "razorpayTokenId" = $1, "updatedAt" = NOW()
           WHERE "id" = $2 AND "customerId" = $3 AND "type" = 'card'`,
          [tokenId, targetPaymentMethodId, customerId]
        );
      } else {
        throw updateError;
      }
    }
  } catch (error: any) {
    if (error.code !== '42703') {
      throw error;
    }
  }
}

