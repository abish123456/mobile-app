import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { query } from "../../../../lib/db";
import { getCustomerIdFromSession } from "../../../../lib/session-auth";
import crypto from "crypto";
import { checkRateLimit, RATE_LIMITS, getRateLimitHeaders } from "../../../../lib/rate-limit";
import { createSecureResponse } from "../../../../lib/security-headers";
import { createRequestLogger } from "../../../../lib/request-logger";

// Initialize Razorpay (only if keys are available)
let razorpay: Razorpay | null = null;
if (process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

export async function POST(req: NextRequest) {
  const logger = createRequestLogger()(req);

  try {
    // Rate limiting - moderate for payment endpoints
    const rateLimitResponse = checkRateLimit(req, RATE_LIMITS.PAYMENT);
    if (rateLimitResponse) {
      logger.log({ statusCode: 429 });
      return rateLimitResponse;
    }

    if (!razorpay) {
      logger.log({ statusCode: 503 });
      return createSecureResponse(
        { success: false, message: "Payment gateway not configured" },
        { status: 503 }
      );
    }

    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      logger.log({ statusCode: 401 });
      return createSecureResponse(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { orderId, amount, paymentMethodId } = body; // amount in paise (INR), paymentMethodId from saved payment methods

    if (!orderId || !amount) {
      logger.log({ statusCode: 400 });
      return createSecureResponse(
        { success: false, message: "Order ID and amount are required" },
        { status: 400 }
      );
    }

    // Verify order exists and belongs to customer
    const orderRes = await query<{
      id: string;
      customerId: string;
      paymentStatus: string;
      quantity: number;
      amount: number;
    }>(
      `SELECT o."id", o."customerId", o."paymentStatus", o."quantity", o."amount"
       FROM "Order" o
       WHERE o."id" = $1 AND o."customerId" = $2`,
      [orderId, customerId]
    );

    if (orderRes.rows.length === 0) {
      logger.log({ statusCode: 404 });
      return createSecureResponse(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];
    if (order.paymentStatus !== "PENDING" && order.paymentStatus !== "COD") {
      logger.log({ statusCode: 400 });
      return createSecureResponse(
        { success: false, message: "Payment already processed" },
        { status: 400 }
      );
    }

    // Get customer details for prefill and Razorpay customer
    let customerRes;
    let customer: { name: string | null; phone: string; razorpayCustomerId: string | null };

    try {
      customerRes = await query<{
        name: string | null;
        phone: string;
        razorpayCustomerId: string | null;
      }>(
        `SELECT "name", "phone", 
                COALESCE("razorpayCustomerId", NULL) as "razorpayCustomerId"
         FROM "Customer"
         WHERE "id" = $1`,
        [order.customerId]
      );
      customer = customerRes.rows[0] || { name: null, phone: "", razorpayCustomerId: null };
    } catch (error: any) {
      // Fallback if razorpayCustomerId column doesn't exist yet
      if (error.code === '42703') {
        customerRes = await query<{
          name: string | null;
          phone: string;
        }>(
          `SELECT "name", "phone"
           FROM "Customer"
           WHERE "id" = $1`,
          [order.customerId]
        );
        const row = customerRes.rows[0];
        customer = row ? { ...row, razorpayCustomerId: null } : { name: null, phone: "", razorpayCustomerId: null };
      } else {
        throw error;
      }
    }

    // Create or get Razorpay customer for saved cards
    let razorpayCustomerId = customer.razorpayCustomerId;
    if (!razorpayCustomerId && razorpay) {
      try {
        // Create Razorpay customer if doesn't exist
        const razorpayCustomer = await razorpay.customers.create({
          name: customer.name || "Customer",
          contact: customer.phone,
          email: "", // Add email if available
        });
        razorpayCustomerId = razorpayCustomer.id;

        // Save Razorpay customer ID to database
        await query(
          `UPDATE "Customer" 
           SET "razorpayCustomerId" = $1 
           WHERE "id" = $2`,
          [razorpayCustomerId, order.customerId]
        );
        // Razorpay customer created
      } catch (error: any) {
        // If customer already exists or other error, try to fetch by contact
        console.warn("Error creating Razorpay customer:", error.message);
        // Continue without customer_id - saved cards won't work but payment will
      }
    }

    // Get payment method details if provided (for UPI prefill, card info, and token usage)
    let upiId: string | null = null;
    let paymentMethodType: string | null = null;
    let paymentMethodDetails: { type: string; details: string; cardBrand?: string | null; cardLast4?: string | null; razorpayTokenId?: string | null } | null = null;
    let razorpayTokenId: string | null = null;

    if (paymentMethodId && paymentMethodId !== 'COD') {
      try {
        // Try to fetch with all columns including token
        let pmRes;
        try {
          pmRes = await query<{
            type: string;
            details: string;
            cardBrand: string | null;
            cardLast4: string | null;
            razorpayTokenId: string | null;
          }>(
            `SELECT "type", "details", "cardBrand", "cardLast4", "razorpayTokenId"
             FROM "CustomerPaymentMethod"
             WHERE "id" = $1 AND "customerId" = $2`,
            [paymentMethodId, order.customerId]
          );
        } catch (error: any) {
          // Fallback if new columns don't exist
          try {
            pmRes = await query<{
              type: string;
              details: string;
              cardBrand: string | null;
              cardLast4: string | null;
              razorpayTokenId: null;
            }>(
              `SELECT "type", "details", "cardBrand", "cardLast4"
               FROM "CustomerPaymentMethod"
               WHERE "id" = $1 AND "customerId" = $2`,
              [paymentMethodId, order.customerId]
            );
          } catch (fallbackError: any) {
            // Final fallback - just basic columns
            pmRes = await query<{
              type: string;
              details: string;
              cardBrand: null;
              cardLast4: null;
              razorpayTokenId: null;
            }>(
              `SELECT "type", "details"
               FROM "CustomerPaymentMethod"
               WHERE "id" = $1 AND "customerId" = $2`,
              [paymentMethodId, order.customerId]
            );
          }
        }

        if (pmRes.rows.length > 0) {
          const pm = pmRes.rows[0];
          paymentMethodType = pm.type;
          razorpayTokenId = pm.razorpayTokenId || null;
          paymentMethodDetails = {
            type: pm.type,
            details: pm.details,
            cardBrand: pm.cardBrand || null,
            cardLast4: pm.cardLast4 || null,
            razorpayTokenId: pm.razorpayTokenId || null,
          };

          if (pm.type === 'upi') {
            // Extract UPI ID from details (format: "**** **** **** 4242" or "upi@paytm")
            const upiMatch = pm.details.match(/@[\w.]+/);
            if (upiMatch) {
              // If it's masked, we can't use it - user will enter manually
              // But if it's a full UPI ID, use it
              if (!pm.details.includes('****')) {
                upiId = pm.details;
              }
            } else {
              // If no @ found, might be a full UPI ID without @ (unlikely but handle it)
              if (!pm.details.includes('****') && pm.details.includes('@')) {
                upiId = pm.details;
              }
            }
          }
        }
      } catch (error: any) {
        // Ignore errors - payment method lookup is optional
        console.warn("Error fetching payment method:", error);
      }
    }

    // Create Razorpay Order
    // Receipt must be max 40 characters, so we'll use a shorter format
    const receipt = orderId.length > 30
      ? `ord_${orderId.substring(0, 30)}`
      : `ord_${orderId}`;

    const razorpayOrder = await razorpay.orders.create({
      amount: order.amount, // Amount in paise (INR) from DB
      currency: "INR",
      receipt: receipt.substring(0, 40), // Ensure max 40 chars
      notes: {
        orderId: orderId,
        customerId: order.customerId,
        phone: customer.phone,
        ...(paymentMethodId && paymentMethodId !== 'COD' ? { paymentMethodId: paymentMethodId } : {}),
      },
    });

    // Build description with payment method info if available
    let description = `Order #${orderId}`;
    if (paymentMethodDetails) {
      if (paymentMethodDetails.type === 'card' && paymentMethodDetails.cardBrand && paymentMethodDetails.cardLast4) {
        description = `Order #${orderId} - ${paymentMethodDetails.cardBrand} ending in ${paymentMethodDetails.cardLast4}`;
      } else if (paymentMethodDetails.type === 'upi' && paymentMethodDetails.details) {
        // Show masked UPI ID if available
        const displayUpi = paymentMethodDetails.details.includes('****')
          ? paymentMethodDetails.details
          : paymentMethodDetails.details.replace(/@[\w.]+/, '@****');
        description = `Order #${orderId} - UPI: ${displayUpi}`;
      }
    }

    // Return Razorpay order details for frontend
    return NextResponse.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      name: "SABOLS Delivery",
      description: description,
      prefill: {
        name: customer.name || "Customer",
        contact: customer.phone,
        email: "", // Add email if available
      },
      upiId: upiId, // Prefill UPI if available
      paymentMethodType: paymentMethodType, // 'upi' or 'card' - to prioritize in Razorpay
      paymentMethodDetails: paymentMethodDetails, // Full payment method details
      razorpayTokenId: razorpayTokenId, // Token for saved cards (enables quick payment)
    });
  } catch (error: any) {
    console.error("Error creating Razorpay order:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create payment order" },
      { status: 500 }
    );
  }
}
