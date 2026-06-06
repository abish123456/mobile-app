import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { query } from "../../../../lib/db";
import crypto from "crypto";

// Initialize Razorpay
let razorpay: Razorpay | null = null;
if (process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// POST /api/route-orders/generate-qr - Generate a payment QR code for a COD order
export async function POST(req: NextRequest) {
  try {
    if (!razorpay) {
      return NextResponse.json(
        { success: false, message: "Payment gateway not configured" },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { routeOrderId } = body;

    if (!routeOrderId || typeof routeOrderId !== "string") {
      return NextResponse.json(
        { success: false, message: "Route order ID is required" },
        { status: 400 }
      );
    }

    // Get order details
    const routeOrderRes = await query<{
      orderId: string;
      customerId: string;
      amount: number;
      paymentStatus: string;
      customerName: string | null;
      customerPhone: string;
    }>(
      `SELECT ro."orderId", o."customerId", o."amount", o."paymentStatus", c."name" as "customerName", c."phone" as "customerPhone"
       FROM "RouteOrder" ro
       INNER JOIN "Order" o ON ro."orderId" = o."id"
       INNER JOIN "Customer" c ON o."customerId" = c."id"
       WHERE ro."id" = $1`,
      [routeOrderId]
    );

    if (routeOrderRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Route order not found" },
        { status: 404 }
      );
    }

    const order = routeOrderRes.rows[0];

    // Calculate outstanding amount
    const totalExpected = Number(order.amount || 0);
    const paymentsRes = await query<{ amount: number }>(
      `SELECT amount FROM "Payment" WHERE "orderId" = $1 AND "status" = 'SUCCESS'`,
      [order.orderId]
    );
    const totalPaid = paymentsRes.rows.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstanding = Math.max(0, totalExpected - totalPaid);

    if (outstanding <= 0 || order.paymentStatus === 'SUCCESS') {
      return NextResponse.json(
        { success: false, message: "Order is already fully paid" },
        { status: 400 }
      );
    }

    // Determine the app URL dynamically if environment variable is missing or set to localhost
    const host = req.headers.get("host");
    const protocol = req.headers.get("x-forwarded-proto") || "https";
    const envUrl = process.env.NEXT_PUBLIC_APP_URL;

    let baseUrl = envUrl;
    if (!baseUrl || baseUrl.includes("localhost")) {
      baseUrl = host ? `${protocol}://${host}` : "";
    }

    // Check for existing pending payment links
    const pendingLinkRes = await query<{ providerOrderId: string; amount: number }>(
      `SELECT "providerOrderId", "amount" FROM "Payment" 
       WHERE "orderId" = $1 AND "status" = 'PENDING' AND "method" = 'ONLINE' AND "providerOrderId" IS NOT NULL
       ORDER BY "createdAt" DESC LIMIT 5`,
      [order.orderId]
    );

    let reusedLink = null;

    for (const row of pendingLinkRes.rows) {
      try {
        const existingLink = await razorpay.paymentLink.fetch(row.providerOrderId);
        
        // If the link is still active and matches the current outstanding amount, we can reuse it!
        if (existingLink.status === "created" && Number(row.amount) === outstanding) {
          reusedLink = existingLink;
        } else if (existingLink.status === "created") {
          // If it's active but the amount changed (e.g. delivery boy added quantity), we MUST cancel it
          // Otherwise the customer could scan the old QR and underpay.
          await razorpay.paymentLink.cancel(row.providerOrderId);
        }
      } catch (e: any) {
        // Ignore if not found or error
      }
    }

    if (reusedLink) {
      return NextResponse.json({
        success: true,
        message: "Existing payment link retrieved successfully",
        paymentLink: {
          id: reusedLink.id,
          short_url: reusedLink.short_url,
          amount: outstanding / 100, // For display
        },
      });
    }

    // Create Razorpay payment link
    const paymentLink = await razorpay.paymentLink.create({
      amount: outstanding,
      currency: "INR",
      description: `Payment for Order #${order.orderId.slice(-8).toUpperCase()}`,
      customer: {
        name: order.customerName || "Customer",
        contact: order.customerPhone,
        email: "",
      },
      notify: {
        sms: false,
        email: false,
      },
      reminder_enable: false,
      notes: {
        orderId: order.orderId,
        type: "cod_qr_payment",
      },
      callback_url: `${baseUrl}/shop/api/payments/payment-link-callback?orderId=${order.orderId}`,
      callback_method: "get",
    });

    // Save the new payment link to DB so we can cancel it later if needed
    await query(
      `INSERT INTO "Payment" (
        "id", "orderId", "amount", "status", "provider", "providerOrderId", "method", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, 'PENDING', 'RAZORPAY', $4, 'ONLINE', NOW(), NOW())`,
      [crypto.randomUUID(), order.orderId, outstanding, paymentLink.id]
    );

    return NextResponse.json({
      success: true,
      message: "Payment link generated successfully",
      paymentLink: {
        id: paymentLink.id,
        short_url: paymentLink.short_url,
        amount: outstanding / 100, // For display
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/route-orders/generate-qr:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
