import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { query, withTransaction } from "../../../../lib/db";
import { assignOrderToRoute } from "../../../../lib/order-assignment";
import { getCustomerIdFromSession } from "../../../../lib/session-auth";
import crypto from "crypto";

// Price is now stored in order.amount (in paise)

// Initialize Razorpay
let razorpay: Razorpay | null = null;
if (process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!razorpay) {
      return NextResponse.json(
        { success: false, message: "Payment gateway not configured" },
        { status: 503 }
      );
    }

    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId, paymentMethodId } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return NextResponse.json(
        { success: false, message: "Missing payment details" },
        { status: 400 }
      );
    }

    // Verify order belongs to customer and get order details
    const orderRes = await query<{
      id: string;
      orderNumber: string | null;
      customerId: string;
      paymentStatus: string;
      quantity: number;
      amount: number | null; // Amount in paise, may be null for old orders
      depositAmount: number | null; // Amount in paise
    }>(
      `SELECT o."id", o."orderNumber", o."customerId", o."paymentStatus", o."quantity", o."amount", o."depositAmount"
       FROM "Order" o
       WHERE o."id" = $1 AND o."customerId" = $2`,
      [orderId, customerId]
    );

    if (orderRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    // Verify payment signature
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(text)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      console.error("Payment signature mismatch");
      return NextResponse.json(
        { success: false, message: "Invalid payment signature" },
        { status: 400 }
      );
    }

    // Get payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== "captured" && payment.status !== "authorized") {
      return NextResponse.json(
        { success: false, message: "Payment not successful" },
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
    const expectedAmount = order.amount;
    const actualAmount = typeof payment.amount === 'number' ? payment.amount : Number(payment.amount) || 0;

    if (Math.abs(actualAmount - expectedAmount) > 1) {
      console.error(`Payment amount mismatch for order ${orderId}: expected ${expectedAmount}, got ${actualAmount}`);
      return NextResponse.json(
        {
          success: false,
          message: `Payment amount mismatch. Expected ₹${expectedAmount / 100}, received ₹${actualAmount / 100}`
        },
        { status: 400 }
      );
    }

    // Use transaction to ensure atomicity only if PENDING or COD
    let alreadySuccess = order.paymentStatus !== "PENDING" && order.paymentStatus !== "COD";

    // Determine payment instrument
    let instrument = 'Online';
    if (payment.method === 'upi') instrument = 'UPI';
    else if (payment.method === 'card') instrument = 'Card';
    else if (payment.method === 'netbanking') instrument = 'NetBanking';
    else if (payment.method === 'wallet') instrument = 'Wallet';
    else if (payment.method) instrument = payment.method.charAt(0).toUpperCase() + payment.method.slice(1);

    // 1. Record the payment (idempotently) - ALWAYS do this for visibility
    const recordPaymentId = crypto.randomUUID();
    await query(
      `INSERT INTO "Payment" ("id", "orderId", "provider", "providerOrderId", "providerPaymentId", "amount", "status", "method", "createdAt", "updatedAt")
       VALUES ($1, $2, 'RAZORPAY', $3, $4, $5, 'SUCCESS', 'ONLINE', $6, $6)
       ON CONFLICT ("providerPaymentId")
       DO UPDATE SET 
            "status" = 'SUCCESS', 
            "updatedAt" = $6`,
      [
        recordPaymentId,
        orderId,
        razorpay_order_id,
        razorpay_payment_id,
        payment.amount, // Amount in paise
        new Date(),
      ]
    );

    if (!alreadySuccess) {
      await withTransaction(async (client) => {
        // 2. Update order payment status and assign orderNumber if missing
        const updateResult = await client.query(
          `UPDATE "Order" 
             SET "paymentStatus" = 'SUCCESS', 
                 "status" = CASE WHEN "status" = 'CANCELLED' AND "paymentStatus" = 'FAILED' THEN 'PENDING' ELSE "status" END,
                 "paymentInstrument" = $2, 
                 "paymentMethod" = 'ONLINE',
                 "updatedAt" = NOW(),
                 "orderNumber" = COALESCE("orderNumber", (SELECT nextval('order_id_seq')::text))
             WHERE "id" = $1 AND "paymentStatus" != 'SUCCESS'
             RETURNING "id", "orderNumber"`,
          [orderId, instrument]
        );

        if (updateResult.rows.length === 0) {
          alreadySuccess = true;
          // Order was already marked as SUCCESS by webhook or previous call
        }

        // 3. Update Customer deposit balance if this order included a deposit
        if (order.depositAmount && order.depositAmount > 0) {
          // Check if we already have a PAYMENT log for this order to be idempotent
          const existingPaymentLog = await client.query(
            `SELECT 1 FROM "WalletTransaction" 
               WHERE "referenceId" = $1 AND "referenceType" = 'PAYMENT'`,
            [orderId]
          );

          if (existingPaymentLog.rows.length === 0) {
            const depositInRupees = order.depositAmount / 100;

            // Null-safe relative update
            await client.query(
              `UPDATE "Customer" 
                 SET "depositWalletBalance" = COALESCE("depositWalletBalance", 0) + $1, 
                     "updatedAt" = NOW() 
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
                'PAYMENT',
                orderId,
                `Online Deposit Payment for Order #${orderId.slice(-8).toUpperCase()}`
              ]
            );
          }
        }
      });
    }

    // Safety Net: If order was already successful (e.g. via webhook), 
    // allow updating the instrument if it wasn't set correctly before.
    if (alreadySuccess) {
      await query(
        `UPDATE "Order" 
           SET "paymentInstrument" = COALESCE(NULLIF("paymentInstrument", 'Online'), $2),
               "paymentMethod" = 'ONLINE'
           WHERE "id" = $1 AND ("paymentInstrument" IS NULL OR "paymentInstrument" = 'Online' OR "paymentMethod" = 'COD')`,
        [orderId, instrument]
      );
    }

    // Assign order to a delivery route only after payment succeeds (if not already assigned)
    if (!alreadySuccess) {
      try {
        const assignmentResult = await assignOrderToRoute(orderId);
        console.info("Payment verify: route assignment result", {
          orderId,
          success: assignmentResult?.success,
          alreadyAssigned: assignmentResult?.alreadyAssigned,
          reason: assignmentResult?.reason,
        });
      } catch (assignmentError) {
        console.error("Payment verify: route assignment failed", {
          orderId,
          error: (assignmentError as Error)?.message || assignmentError,
        });
      }
    }

    // Save card token if payment was made with a card and token is available
    // Razorpay returns token in various possible fields depending on configuration
    if (paymentMethodId && paymentMethodId !== 'COD' && payment.card && payment.method === 'card') {
      try {
        // Check all possible token field names
        const cardObj = payment.card as any;
        const tokenId = cardObj.token_id ||
          cardObj.tokenId ||
          cardObj.token ||
          cardObj.card_id ||
          cardObj.cardId ||
          cardObj.id; // Sometimes the card ID itself is the token

        // Attempting to save card token

        if (tokenId) {
          // Verify the payment method exists and is a card
          const pmCheck = await query<{
            id: string;
            type: string;
            customerId: string;
          }>(
            `SELECT "id", "type", "customerId"
             FROM "CustomerPaymentMethod"
             WHERE "id" = $1 AND "customerId" = $2`,
            [paymentMethodId, order.customerId]
          );

          if (pmCheck.rows.length === 0 || pmCheck.rows[0].type !== 'card') {
            // Payment method not found or not a card, skipping token save
          } else {
            // Save the token and update card details from payment
            try {
              // Update token and card details (last4, brand) from actual payment
              const cardLast4 = payment.card.last4 || null;
              const cardBrand = payment.card.network?.toLowerCase() || payment.card.name?.toLowerCase() || null;

              // Try to update with all fields, fallback if columns don't exist
              let updateResult;
              try {
                // Use COALESCE to only update if value is not null, otherwise keep existing
                // Cast parameters to TEXT to help PostgreSQL determine the type
                updateResult = await query(
                  `UPDATE "CustomerPaymentMethod" 
                   SET "razorpayTokenId" = $1, 
                       "cardLast4" = COALESCE($4::text, "cardLast4"),
                       "cardBrand" = COALESCE($5::text, "cardBrand"),
                       "updatedAt" = NOW()
                   WHERE "id" = $2 AND "customerId" = $3 AND "type" = 'card'`,
                  [tokenId, paymentMethodId, order.customerId, cardLast4, cardBrand]
                );

                // Verify the update actually worked by querying back
                const verifyRes = await query<{
                  razorpayTokenId: string | null;
                  cardLast4: string | null;
                  cardBrand: string | null;
                }>(
                  `SELECT "razorpayTokenId", "cardLast4", "cardBrand"
                   FROM "CustomerPaymentMethod"
                   WHERE "id" = $1`,
                  [paymentMethodId]
                );

                if (verifyRes.rows.length > 0) {
                  const updated = verifyRes.rows[0];
                  // Token update verified
                }
              } catch (updateError: any) {
                // Fallback if cardLast4/cardBrand columns don't exist
                if (updateError.code === '42703') {
                  // Try to update with just token first
                  updateResult = await query(
                    `UPDATE "CustomerPaymentMethod" 
                     SET "razorpayTokenId" = $1, "updatedAt" = NOW()
                     WHERE "id" = $2 AND "customerId" = $3 AND "type" = 'card'`,
                    [tokenId, paymentMethodId, order.customerId]
                  );

                  // Try to update cardLast4 and cardBrand separately if columns exist
                  if (cardLast4 || cardBrand) {
                    try {
                      if (cardLast4 && cardBrand) {
                        await query(
                          `UPDATE "CustomerPaymentMethod" 
                           SET "cardLast4" = $1, "cardBrand" = $2, "updatedAt" = NOW()
                           WHERE "id" = $3 AND "customerId" = $4 AND "type" = 'card'`,
                          [cardLast4, cardBrand, paymentMethodId, order.customerId]
                        );
                      } else if (cardLast4) {
                        await query(
                          `UPDATE "CustomerPaymentMethod" 
                           SET "cardLast4" = $1, "updatedAt" = NOW()
                           WHERE "id" = $2 AND "customerId" = $3 AND "type" = 'card'`,
                          [cardLast4, paymentMethodId, order.customerId]
                        );
                      } else if (cardBrand) {
                        await query(
                          `UPDATE "CustomerPaymentMethod" 
                           SET "cardBrand" = $1, "updatedAt" = NOW()
                           WHERE "id" = $2 AND "customerId" = $3 AND "type" = 'card'`,
                          [cardBrand, paymentMethodId, order.customerId]
                        );
                      }
                      // Card details updated
                    } catch (cardUpdateError: any) {
                      // Columns don't exist - that's okay
                      if (cardUpdateError.code !== '42703') {
                        console.error("Error updating card details:", cardUpdateError);
                      }
                    }
                  }

                  // Verify the update
                  const verifyRes = await query<{
                    razorpayTokenId: string | null;
                    cardLast4: string | null;
                    cardBrand: string | null;
                  }>(
                    `SELECT "razorpayTokenId", 
                            COALESCE("cardLast4", NULL) as "cardLast4",
                            COALESCE("cardBrand", NULL) as "cardBrand"
                     FROM "CustomerPaymentMethod"
                     WHERE "id" = $1`,
                    [paymentMethodId]
                  );

                  if (verifyRes.rows.length > 0) {
                    // Token update verified (fallback)
                  }
                } else {
                  throw updateError;
                }
              }

              // Card token saved successfully
            } catch (updateError: any) {
              // If column doesn't exist, log warning but don't fail
              if (updateError.code !== '42703') { // Column doesn't exist - skip error
                console.error("Error saving card token:", {
                  code: updateError.code,
                  message: updateError.message,
                  detail: updateError.detail,
                });
              }
            }
          }
        } else {
          // No token available in payment response
        }
      } catch (tokenError: any) {
        // Log error but don't fail payment verification
        console.error("Error processing card token:", {
          message: tokenError.message,
          stack: tokenError.stack,
        });
      }
    } else if (payment.card && payment.method === 'card') {
      // Card payment but no paymentMethodId - this means it's a new card
      // Create a new payment method record for this card
      try {
        const cardLast4 = payment.card.last4 || null;
        const cardBrand = payment.card.network?.toLowerCase() || payment.card.name?.toLowerCase() || null;
        const cardObj = payment.card as any;
        const tokenId = cardObj.token_id ||
          cardObj.tokenId ||
          cardObj.token ||
          cardObj.card_id ||
          cardObj.cardId ||
          cardObj.id;

        // Check if a payment method with this card already exists
        let existingPm = null;
        if (cardLast4) {
          const pmCheck = await query<{
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
             LIMIT 1`,
            [order.customerId, cardLast4, `%${cardLast4}`]
          );

          if (pmCheck.rows.length > 0) {
            existingPm = pmCheck.rows[0];
          }
        }

        if (existingPm) {
          // Update existing card payment method with token and details
          try {
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

            if (useNewColumns) {
              await query(
                `UPDATE "CustomerPaymentMethod" 
                 SET "razorpayTokenId" = COALESCE($1, "razorpayTokenId"),
                     "cardLast4" = COALESCE($2::text, "cardLast4"),
                     "cardBrand" = COALESCE($3::text, "cardBrand"),
                     "updatedAt" = NOW()
                 WHERE "id" = $4 AND "customerId" = $5 AND "type" = 'card'`,
                [tokenId || null, cardLast4, cardBrand, existingPm.id, order.customerId]
              );
            } else {
              // Fallback: update without new columns
              await query(
                `UPDATE "CustomerPaymentMethod" 
                 SET "updatedAt" = NOW()
                 WHERE "id" = $1 AND "customerId" = $2`,
                [existingPm.id, order.customerId]
              );
            }
          } catch (updateError: any) {
            console.error("Error updating existing card payment method:", updateError);
          }
        } else {
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

          if (useNewColumns) {
            await query(
              `INSERT INTO "CustomerPaymentMethod" 
               ("id", "customerId", "type", "details", "isDefault", "razorpayTokenId", "cardBrand", "cardLast4", "createdAt", "updatedAt")
               VALUES ($1, $2, 'card', $3, false, $4, $5, $6, NOW(), NOW())`,
              [newPmId, order.customerId, cardDisplayText, tokenId || null, cardBrand, cardLast4]
            );
          } else {
            // Fallback: insert without new columns
            await query(
              `INSERT INTO "CustomerPaymentMethod" 
               ("id", "customerId", "type", "details", "isDefault", "createdAt", "updatedAt")
               VALUES ($1, $2, 'card', $3, false, NOW(), NOW())`,
              [newPmId, order.customerId, cardDisplayText]
            );
          }
        }
      } catch (cardError: any) {
        // Log error but don't fail payment verification
        console.error("Error saving new card payment method:", {
          message: cardError.message,
          stack: cardError.stack,
        });
      }
    }

    // Save UPI details if payment was made with UPI
    if (payment.method === 'upi' && payment.vpa) {
      try {
        const vpa = payment.vpa as string;

        // Check if a payment method with this VPA already exists
        const existingPm = await query<{
          id: string;
          type: string;
        }>(
          `SELECT "id", "type"
           FROM "CustomerPaymentMethod"
           WHERE "customerId" = $1 
             AND "type" = 'upi'
             AND "details" = $2
           LIMIT 1`,
          [order.customerId, vpa]
        );

        if (existingPm.rows.length > 0) {
          // Update existing UPI payment method
          await query(
            `UPDATE "CustomerPaymentMethod" 
             SET "updatedAt" = NOW()
             WHERE "id" = $1 AND "customerId" = $2`,
            [existingPm.rows[0].id, order.customerId]
          );
        } else {
          // Create new UPI payment method
          const newPmId = crypto.randomUUID();
          await query(
            `INSERT INTO "CustomerPaymentMethod" ("id", "customerId", "type", "details", "isDefault", "verified", "createdAt", "updatedAt")
             VALUES ($1, $2, 'upi', $3, false, true, NOW(), NOW())`,
            [newPmId, order.customerId, vpa]
          );
        }
      } catch (upiError: any) {
        // Log error but don't fail payment verification
        console.error("Error saving UPI details:", {
          message: upiError.message,
          stack: upiError.stack,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (error: any) {
    console.error("Error verifying payment:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to verify payment" },
      { status: 500 }
    );
  }
}