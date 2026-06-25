import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import crypto from "crypto";
import { assignOrderToRoute } from "../../../../lib/order-assignment";
import { logAction } from "../../../../lib/audit";

const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

/**
 * Save card token from webhook payment data
 * This is a backup mechanism in case verify-payment fails or doesn't run
 */
async function saveCardTokenFromWebhook(
  payment: any,
  customerId: string,
  paymentMethodId?: string
) {
  try {
    // Extract token from payment.card (same logic as verify-payment)
    const cardObj = payment.card as any;
    const tokenId = cardObj.token_id ||
      cardObj.tokenId ||
      cardObj.token ||
      cardObj.card_id ||
      cardObj.cardId ||
      cardObj.id; // Sometimes the card ID itself is the token

    if (!tokenId) {
      // No token available
      return;
    }

    // Get card details from payment
    const cardLast4 = payment.card.last4 || null;
    const cardBrand = payment.card.network?.toLowerCase() || payment.card.name?.toLowerCase() || null;

    let targetPaymentMethodId: string | null = null;

    // If paymentMethodId is provided in notes, use it directly
    if (paymentMethodId && paymentMethodId !== 'COD') {
      // Verify the payment method exists and is a card
      const pmCheck = await query<{
        id: string;
        type: string;
      }>(
        `SELECT "id", "type"
         FROM "CustomerPaymentMethod"
         WHERE "id" = $1 AND "customerId" = $2 AND "type" = 'card'`,
        [paymentMethodId, customerId]
      );

      if (pmCheck.rows.length > 0) {
        targetPaymentMethodId = paymentMethodId;
      }
    }

    // If no paymentMethodId or it wasn't found, try to find by card details
    if (!targetPaymentMethodId && cardLast4) {
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

    // If still no payment method found, create a new one
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
        // Log error but don't fail webhook processing
        console.error("Webhook: Error creating new card payment method:", createError);
        return; // Can't proceed without payment method
      }
    }

    // Save the token and update card details
    try {
      // Try to update with all fields, fallback if columns don't exist
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
        // Try to update with just token
        await query(
          `UPDATE "CustomerPaymentMethod" 
           SET "razorpayTokenId" = $1, "updatedAt" = NOW()
           WHERE "id" = $2 AND "customerId" = $3 AND "type" = 'card'`,
          [tokenId, targetPaymentMethodId, customerId]
        );

        // Try to update cardLast4 and cardBrand separately if columns exist
        if (cardLast4 || cardBrand) {
          try {
            if (cardLast4 && cardBrand) {
              await query(
                `UPDATE "CustomerPaymentMethod" 
                 SET "cardLast4" = $1, "cardBrand" = $2, "updatedAt" = NOW()
                 WHERE "id" = $3 AND "customerId" = $4 AND "type" = 'card'`,
                [cardLast4, cardBrand, targetPaymentMethodId, customerId]
              );
            } else if (cardLast4) {
              await query(
                `UPDATE "CustomerPaymentMethod" 
                 SET "cardLast4" = $1, "updatedAt" = NOW()
                 WHERE "id" = $2 AND "customerId" = $3 AND "type" = 'card'`,
                [cardLast4, targetPaymentMethodId, customerId]
              );
            } else if (cardBrand) {
              await query(
                `UPDATE "CustomerPaymentMethod" 
                 SET "cardBrand" = $1, "updatedAt" = NOW()
                 WHERE "id" = $2 AND "customerId" = $3 AND "type" = 'card'`,
                [cardBrand, targetPaymentMethodId, customerId]
              );
            }
          } catch (cardUpdateError: any) {
            // Columns don't exist - that's okay
            if (cardUpdateError.code !== '42703') {
              console.error("Webhook: Error updating card details:", cardUpdateError);
            }
          }
        }
      } else {
        throw updateError;
      }
    }

    // Card token saved successfully from webhook
  } catch (error: any) {
    // If column doesn't exist, that's okay - don't fail
    if (error.code !== '42703') {
      throw error;
    }
  }
}

/**
 * Save UPI VPA from webhook payment data
 */
async function saveUPIFromWebhook(
  payment: any,
  customerId: string
) {
  try {
    const vpa = payment.vpa as string;
    if (!vpa) return;

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
      [customerId, vpa]
    );

    if (existingPm.rows.length > 0) {
      // Update existing UPI payment method
      await query(
        `UPDATE "CustomerPaymentMethod" 
         SET "updatedAt" = NOW()
         WHERE "id" = $1 AND "customerId" = $2`,
        [existingPm.rows[0].id, customerId]
      );
    } else {
      // Create new UPI payment method
      const newPmId = crypto.randomUUID();
      await query(
        `INSERT INTO "CustomerPaymentMethod" ("id", "customerId", "type", "details", "isDefault", "verified", "createdAt", "updatedAt")
         VALUES ($1, $2, 'upi', $3, false, true, NOW(), NOW())`,
        [newPmId, customerId, vpa]
      );
    }
  } catch (error: any) {
    console.error("Webhook: Error saving UPI VPA:", error.message);
  }
}


export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Razorpay Webhook Endpoint is Active. Note: Webhooks mainly use POST requests."
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    if (!signature) {
      console.error("Webhook: Missing signature");
      return NextResponse.json({ success: false, message: "Missing signature" }, { status: 400 });
    }

    // Skip signature verification if webhook secret is not set (for local testing)
    if (!webhookSecret || webhookSecret === "whsec_placeholder_for_local_testing") {
      console.warn("Webhook: Skipping signature verification (webhook secret not configured)");
      // Parse event without verification (only for local development)
      const event = JSON.parse(body);
      return await processWebhookEvent(event);
    }

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("Webhook signature verification failed");
      return NextResponse.json(
        { success: false, message: "Invalid signature" },
        { status: 401 }
      );
    }

    const event = JSON.parse(body);
    return await processWebhookEvent(event);
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * Determine payment instrument from Razorpay payment entity
 */
function determinePaymentInstrument(payment: any): string {
  let instrument = 'Online';
  if (payment.method === 'upi') instrument = 'UPI';
  else if (payment.method === 'card') instrument = 'Card';
  else if (payment.method === 'netbanking') instrument = 'NetBanking';
  else if (payment.method === 'wallet') instrument = 'Wallet';
  else if (payment.method) instrument = payment.method.charAt(0).toUpperCase() + payment.method.slice(1);
  return instrument;
}

async function processWebhookEvent(event: any) {
  try {
    // Webhook received

    // Handle payment link paid event (for payment links)
    if (event.event === "payment_link.paid") {
      const paymentLink = event.payload.payment_link.entity;
      const orderId = paymentLink.notes?.orderId;
      const isAdditionalQuantity = paymentLink.notes?.type === "additional_quantity";
      const isQrNote = paymentLink.notes?.type === "cod_qr_payment" || isAdditionalQuantity;

      // Payment link paid event

      if (!orderId) {
        console.error("Webhook: Missing orderId in payment link notes");
        return NextResponse.json({ success: false, message: "Missing orderId" }, { status: 400 });
      }

      // For additional quantity payments
      if (isAdditionalQuantity) {
        // Get order details
        const orderRes = await query<{
          customerId: string;
          paymentStatus: string;
        }>(
          `SELECT "customerId", "paymentStatus" FROM "Order" WHERE "id" = $1`,
          [orderId]
        );

        if (orderRes.rows.length === 0) {
          console.error(`Webhook: Order ${orderId} not found`);
          return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
        }

        const customerId = orderRes.rows[0].customerId;

        // Get payment details from payment link
        const payments = paymentLink.payments || [];
        if (payments.length > 0) {
          const payment = payments[0]; // Get first payment
          const instrument = determinePaymentInstrument(payment);

          // Use ON CONFLICT ("orderId") to avoid duplicates and handle multiple installments if needed
          // However, since we want to support multiple payments, and ON CONFLICT ("orderId") exists,
          // we must sum the amount. 
          // NOTE: We should check if this specific razorpay payment was already processed to be idempotent
          const existingSubPaymentRes = await query(
            `SELECT "id" FROM "Payment" WHERE "providerPaymentId" = $1`,
            [payment.id || paymentLink.id]
          );

          if (existingSubPaymentRes.rows.length === 0) {
            const additionalPaymentId = crypto.randomUUID();
            await query(
              `INSERT INTO "Payment" ("id", "orderId", "provider", "providerOrderId", "providerPaymentId", "amount", "status", "method", "createdAt", "updatedAt")
               VALUES ($1, $2, 'RAZORPAY', $3, $4, $5, 'SUCCESS', 'ONLINE', NOW(), NOW())
               ON CONFLICT ("providerPaymentId") DO UPDATE SET 
                  "status" = 'SUCCESS',
                  "updatedAt" = NOW()`,
              [
                additionalPaymentId,
                orderId,
                paymentLink.id,
                payment.id || paymentLink.id,
                paymentLink.amount, // Amount in paise
              ]
            );

            // Re-fetch the updated order and sum of payments to decide if it's fully paid
            const updatedOrderRes = await query<{ amount: number }>(
              `SELECT "amount" FROM "Order" WHERE "id" = $1`,
              [orderId]
            );

            const totalPaidRes = await query<{ total: number }>(
              `SELECT SUM("amount")::bigint as total FROM "Payment" WHERE "orderId" = $1 AND "status" = 'SUCCESS'`,
              [orderId]
            );

            const totalExpected = Number(updatedOrderRes.rows[0]?.amount || 0);
            const totalPaid = Number(totalPaidRes.rows[0]?.total || 0);

            // If total paid is >= expected (within 1 paise tolerance), mark as SUCCESS
            if (totalPaid >= totalExpected - 1) {
              await query(
                `UPDATE "Order" 
                  SET "paymentStatus" = 'SUCCESS', 
                      "paymentInstrument" = $2, 
                      "isQrPayment" = $3,
                      "updatedAt" = NOW(),
                      "orderNumber" = COALESCE("orderNumber", (SELECT nextval('order_id_seq')::text))
                  WHERE "id" = $1`,
                [orderId, instrument, isQrNote]
              );
            }
          }

          // Save UPI details if payment was made with UPI
          if (payment.method === 'upi' && payment.vpa) {
            await saveUPIFromWebhook(payment, customerId);
          }

          // Logged payment success for additional quantity
        }
      } else {
        // Regular payment link payment
        const payments = paymentLink.payments || [];
        if (payments.length > 0) {
          // Find customer for this order
          const orderRes = await query<{
            customerId: string;
          }>(
            `SELECT "customerId" FROM "Order" WHERE "id" = $1`,
            [orderId]
          );

          if (orderRes.rows.length > 0) {
            const customerId = orderRes.rows[0].customerId;
            const payment = payments[0];
            const instrument = determinePaymentInstrument(payment);

            // Save payment details
            if (payment.method === 'card' && payment.card) {
              await saveCardTokenFromWebhook(payment, customerId, payment.notes?.paymentMethodId);
            } else if (payment.method === 'upi' && payment.vpa) {
              await saveUPIFromWebhook(payment, customerId);
            }

            // Step 1: Mark as SUCCESS / assign orderNumber (handles both PENDING and COD orders paying online)
            await query(
              `UPDATE "Order" 
                SET "paymentStatus" = 'SUCCESS',
                    "paymentMethod" = 'ONLINE',
                    "isQrPayment" = $2,
                    "status" = CASE WHEN "status" = 'CANCELLED' AND "paymentStatus" = 'FAILED' THEN 'PENDING' ELSE "status" END,
                    "updatedAt" = NOW(),
                    "orderNumber" = COALESCE("orderNumber", (SELECT nextval('order_id_seq')::text))
                WHERE "id" = $1 AND "paymentStatus" != 'SUCCESS'`,
               [orderId, isQrNote]
            );

            // Step 2: Always update paymentInstrument (even if order.paid already set SUCCESS without instrument)
            // Also ensure paymentMethod is set to ONLINE in case it was a COD order
            await query(
              `UPDATE "Order" 
                SET "paymentInstrument" = COALESCE(NULLIF("paymentInstrument", 'Online'), $2),
                    "paymentMethod" = 'ONLINE',
                    "isQrPayment" = $3,
                    "updatedAt" = NOW()
                WHERE "id" = $1 AND ("paymentInstrument" IS NULL OR "paymentInstrument" = 'Online' OR "paymentMethod" = 'COD')`,
               [orderId, instrument, isQrNote]
            );

            // Log action in Audit Log for the payment
            logAction({
              actorId: 'SYSTEM',
              actorType: 'SYSTEM',
              actorName: 'Payment Webhook',
              entity: 'ORDER',
              entityId: orderId,
              action: 'UPDATE',
              newData: {
                paymentStatus: 'SUCCESS',
                paymentMethod: 'ONLINE',
                paymentInstrument: instrument,
                isQrPayment: isQrNote
              },
              description: `Payment successful via Razorpay ${isQrNote ? 'QR/Link' : ''}`
            });
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    // Handle payment captured (successful payment) - for regular payments and payment links
    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;
      // Check notes in payment entity or payment_link if available
      const orderId = payment.notes?.orderId ||
        (event.payload.payment_link?.entity?.notes?.orderId);
      const isAdditionalQuantity = payment.notes?.type === "additional_quantity" ||
        (event.payload.payment_link?.entity?.notes?.type === "additional_quantity");
      const isQrNote = payment.notes?.type === "cod_qr_payment" || isAdditionalQuantity;

      const instrument = determinePaymentInstrument(payment);

      // Payment captured event

      if (!orderId) {
        console.error("Webhook: Missing orderId in notes", JSON.stringify(payment, null, 2));
        return NextResponse.json({ success: false, message: "Missing orderId" }, { status: 400 });
      }

      // For additional quantity payments, we don't change the main payment status
      // Instead, we just create a payment record for tracking
      if (isAdditionalQuantity) {
        // Get order details
        const orderRes = await query<{
          customerId: string;
          paymentStatus: string;
        }>(
          `SELECT "customerId", "paymentStatus" FROM "Order" WHERE "id" = $1`,
          [orderId]
        );

        if (orderRes.rows.length === 0) {
          console.error(`Webhook: Order ${orderId} not found`);
          return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
        }

        const customerId = orderRes.rows[0].customerId;

        // Create payment record for additional quantity (use orderId with suffix to allow multiple payments)
        const additionalPaymentId = crypto.randomUUID();
        await query(
          `INSERT INTO "Payment" ("id", "orderId", "provider", "providerOrderId", "providerPaymentId", "amount", "status", "method", "createdAt", "updatedAt")
           VALUES ($1, $2, 'RAZORPAY', $3, $4, $5, 'SUCCESS', 'ONLINE', NOW(), NOW())
           ON CONFLICT ("providerPaymentId") DO UPDATE SET
             "status" = 'SUCCESS',
             "updatedAt" = NOW()`,
          [
            additionalPaymentId,
            orderId, // Same orderId - we'll track multiple payments per order
            payment.order_id || payment.payment_link_id,
            payment.id,
            payment.amount, // Amount in paise
          ]
        );

        // Update order payment status if it was PENDING (first payment)
        if (orderRes.rows[0].paymentStatus === 'PENDING') {
          await query(
            `UPDATE "Order" 
              SET "paymentStatus" = 'SUCCESS', 
                  "paymentInstrument" = $2, 
                  "isQrPayment" = $3,
                  "updatedAt" = NOW(),
                  "orderNumber" = COALESCE("orderNumber", (SELECT nextval('order_id_seq')::text))
              WHERE "id" = $1`,
             [orderId, instrument, isQrNote]
          );
        }

        // Save payment methods
        if (payment.method === 'card' && payment.card) {
          try {
            await saveCardTokenFromWebhook(payment, customerId, payment.notes?.paymentMethodId);
          } catch (tokenError: any) {
            console.error("Webhook: Error saving card token:", tokenError.message);
          }
        } else if (payment.method === 'upi' && payment.vpa) {
          try {
            await saveUPIFromWebhook(payment, customerId);
          } catch (upiError: any) {
            console.error("Webhook: Error saving UPI VPA:", upiError.message);
          }
        }

        // Logged additional quantity payment success
        return NextResponse.json({ success: true });
      }

      // Verify order exists before inserting payment
      const orderExists = await query(
        `SELECT "id" FROM "Order" WHERE "id" = $1`,
        [orderId]
      );

      if (orderExists.rows.length === 0) {
        console.warn(`Webhook: Order ${orderId} not found for payment ${payment.id}`);
        // Return 200 to stop Razorpay from retrying, as this error isn't recoverable
        return NextResponse.json({ success: true, message: "Order not found, skipping" });
      }

      // Update order payment status only if total payments match total order amount
      // First, record the payment (idempotently)
      const paymentId = crypto.randomUUID();
      await query(
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

      // Check if order should be marked SUCCESS
      const checkFullPayment = await query<{ amount: number, depositAmount: number, customerId: string }>(
        `SELECT "amount", "depositAmount", "customerId" FROM "Order" WHERE "id" = $1`,
        [orderId]
      );
      const sumPayments = await query<{ total: number }>(
        `SELECT SUM("amount")::bigint as total FROM "Payment" WHERE "orderId" = $1 AND "status" = 'SUCCESS'`,
        [orderId]
      );

      const orderData = checkFullPayment.rows[0];
      const expected = Number(orderData?.amount || 0);
      const actual = Number(sumPayments.rows[0]?.total || 0);

      if (actual >= expected - 1) {
        // Step 1: Mark as SUCCESS and assign orderNumber (only if not already SUCCESS).
        // Also flip paymentMethod to ONLINE in case this was a COD order that paid online.
        await query(
          `UPDATE "Order" 
            SET "paymentStatus" = 'SUCCESS',
                "paymentMethod" = 'ONLINE',
                "isQrPayment" = $2,
                "status" = CASE WHEN "status" = 'CANCELLED' AND "paymentStatus" = 'FAILED' THEN 'PENDING' ELSE "status" END,
                "updatedAt" = NOW(),
                "orderNumber" = COALESCE("orderNumber", (SELECT nextval('order_id_seq')::text))
            WHERE "id" = $1 AND "paymentStatus" != 'SUCCESS'`,
           [orderId, isQrNote]
        );

        // Step 2: Always update paymentInstrument (even if order.paid already set SUCCESS without instrument)
        // Also ensure paymentMethod is set to ONLINE in case it was a COD order
        await query(
          `UPDATE "Order" 
            SET "paymentInstrument" = COALESCE(NULLIF("paymentInstrument", 'Online'), $2),
                "paymentMethod" = 'ONLINE',
                "isQrPayment" = $3,
                "updatedAt" = NOW()
            WHERE "id" = $1 AND ("paymentInstrument" IS NULL OR "paymentInstrument" = 'Online' OR "paymentMethod" = 'COD')`,
           [orderId, instrument, isQrNote]
        );

        // Log action in Audit Log for the payment
        logAction({
          actorId: 'SYSTEM',
          actorType: 'SYSTEM',
          actorName: 'Payment Webhook',
          entity: 'ORDER',
          entityId: orderId,
          action: 'UPDATE',
          newData: {
            paymentStatus: 'SUCCESS',
            paymentMethod: 'ONLINE',
            isQrPayment: isQrNote
          },
          description: `Payment successful via Razorpay ${isQrNote ? 'QR/Link' : ''}`
        });

        // Update Customer deposit balance if this order included a deposit
        if (orderData && orderData.depositAmount && orderData.depositAmount > 0) {
          // Check if we already have a PAYMENT log for this order to be idempotent (shared with verify-payment)
          const existingPaymentLog = await query(
            `SELECT 1 FROM "WalletTransaction" 
             WHERE "referenceId" = $1 AND "referenceType" = 'PAYMENT'`,
            [orderId]
          );

          if (existingPaymentLog.rows.length === 0) {
            const depositInRupees = orderData.depositAmount / 100;
            const customerId = orderData.customerId;

            // Null-safe relative update
            await query(
              `UPDATE "Customer" 
               SET "depositWalletBalance" = COALESCE("depositWalletBalance", 0) + $1, 
                   "updatedAt" = NOW() 
               WHERE "id" = $2`,
              [depositInRupees, customerId]
            );

            // Log the deposit transaction
            await query(
              `INSERT INTO "WalletTransaction"
               ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
              [
                crypto.randomUUID(),
                customerId,
                depositInRupees,
                'CREDIT',
                'PAYMENT',
                orderId,
                `Online Deposit Payment for Order #${orderId.slice(-8).toUpperCase()}`
              ]
            );
          }
        }
      }

      // Save payment methods
      const customerId = orderData?.customerId;

      if (customerId) {
        if (payment.method === 'card' && payment.card) {
          try {
            await saveCardTokenFromWebhook(payment, customerId, payment.notes?.paymentMethodId);
          } catch (tokenError: any) {
            console.error("Webhook: Error saving card token:", tokenError.message);
          }
        } else if (payment.method === 'upi' && payment.vpa) {
          try {
            await saveUPIFromWebhook(payment, customerId);
          } catch (upiError: any) {
            console.error("Webhook: Error saving UPI VPA:", upiError.message);
          }
        }
      }

      try {
        const assignmentResult = await assignOrderToRoute(orderId);
        console.info("Webhook: route assignment result", {
          orderId,
          success: assignmentResult?.success,
          alreadyAssigned: assignmentResult?.alreadyAssigned,
          reason: assignmentResult?.reason,
        });
      } catch (assignmentError) {
        console.error("Webhook: route assignment failed", {
          orderId,
          error: (assignmentError as Error)?.message || assignmentError,
        });
      }
    } else if (event.event === "payment.failed") {
      const payment = event.payload.payment.entity;
      const orderId = payment.notes?.orderId;

      if (orderId) {
        // Find if this was an additional quantity payment
        const isAdditional = payment.notes?.type === "additional_quantity" ||
          (event.payload.payment_link?.entity?.notes?.type === "additional_quantity");

        // ONLY cancel the order if it's NOT an additional quantity payment 
        // AND the order hasn't been successfully paid yet for the original amount
        if (!isAdditional) {
          // Fetch order details to check if it's a COD order
          const orderRes = await query<{ paymentMethod: string }>(
            `SELECT "paymentMethod" FROM "Order" WHERE "id" = $1`,
            [orderId]
          );

          if (orderRes.rows.length > 0) {
            const isCodOrder = orderRes.rows[0].paymentMethod === 'COD';

            // Only proceed with cancellation if it's NOT a COD order
            if (!isCodOrder) {
              const successCheck = await query(`SELECT id FROM "Payment" WHERE "orderId" = $1 AND "status" = 'SUCCESS' LIMIT 1`, [orderId]);

              if (successCheck.rows.length === 0) {
                await query(
                  `UPDATE "Order" 
                   SET "paymentStatus" = 'FAILED', "status" = 'CANCELLED', "updatedAt" = NOW()
                   WHERE "id" = $1`,
                  [orderId]
                );
              }
            } else {
              // Log that we skipped cancellation for COD order
              console.info(`Webhook: Skipping cancellation for failed payment on COD order ${orderId}`);
            }
          }
        }
      }
    } else if (event.event === "payment_link.expired" || event.event === "payment_link.cancelled") {
      const paymentLink = event.payload.payment_link.entity;
      const orderId = paymentLink.notes?.orderId;

      if (orderId) {
        // Find if this was an additional quantity payment
        const isAdditional = paymentLink.notes?.type === "additional_quantity";

        if (!isAdditional) {
          // Check if order exists and is NOT a COD order
          const orderRes = await query<{ paymentMethod: string, paymentStatus: string }>(
            `SELECT "paymentMethod", "paymentStatus" FROM "Order" WHERE "id" = $1`,
            [orderId]
          );

          if (orderRes.rows.length > 0) {
            const order = orderRes.rows[0];

            // Only cancel if it's an ONLINE order that is still PENDING
            if (order.paymentMethod === 'ONLINE' && order.paymentStatus === 'PENDING') {
              await query(
                `UPDATE "Order" 
                 SET "paymentStatus" = 'FAILED', "status" = 'CANCELLED', "updatedAt" = NOW()
                 WHERE "id" = $1`,
                [orderId]
              );
              console.info(`Webhook: Cancelled order ${orderId} due to payment link ${event.event}`);
            }
          }
        }
      }
    } else if (event.event === "order.paid") {
      // Alternative event for successful payment
      const orderEntity = event.payload.order.entity;
      const orderId = orderEntity.notes?.orderId;

      // order.paid doesn't usually contain the payment method details directly in the minimal order payload
      // We might need to fetch the payment, but typically payment.captured is better for that.
      // However, if we MUST update here, we default to Online, or we could fetch the payment.
      // For now, let's leave it as is or default to Online if we can't get it, 
      // but typically payment.captured runs first/too.
      // Actually, let's generic 'Online' here to be safe, or just SUCCESS.
      // But if we want to be consistent, we might want to skip instrument update here if captured handles it.

      if (orderId) {
        // order.paid does not contain payment method details — only mark SUCCESS/orderNumber here.
        // The paymentInstrument will be set by the payment.captured event which fires alongside this.
        await query(
          `UPDATE "Order" 
           SET "paymentStatus" = 'SUCCESS', 
               "paymentMethod" = 'ONLINE',
               "status" = CASE WHEN "status" = 'CANCELLED' AND "paymentStatus" = 'FAILED' THEN 'PENDING' ELSE "status" END,
               "updatedAt" = NOW(),
               "orderNumber" = COALESCE("orderNumber", (SELECT nextval('order_id_seq')::text))
           WHERE "id" = $1 AND "paymentStatus" != 'SUCCESS'`,
          [orderId]
        );

        try {
          const assignmentResult = await assignOrderToRoute(orderId);
          console.info("Webhook order.paid: route assignment result", {
            orderId,
            success: assignmentResult?.success,
            alreadyAssigned: assignmentResult?.alreadyAssigned,
            reason: assignmentResult?.reason,
          });
        } catch (assignmentError) {
          console.error("Webhook order.paid: route assignment failed", {
            orderId,
            error: (assignmentError as Error)?.message || assignmentError,
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}
