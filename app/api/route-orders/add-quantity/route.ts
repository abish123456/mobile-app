import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { query } from "../../../../lib/db";

// Initialize Razorpay (only if keys are available)
let razorpay: Razorpay | null = null;
if (process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// POST /api/route-orders/add-quantity - Add additional quantity to an order
// Body: { orderId: string, additionalQuantity: number }
export async function POST(req: NextRequest) {
  try {
    if (!razorpay) {
      return NextResponse.json(
        { success: false, message: "Payment gateway not configured" },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { orderId, additionalQuantity, paymentType } = body;

    // Validation
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        { success: false, message: "Order ID is required" },
        { status: 400 }
      );
    }

    if (!additionalQuantity || typeof additionalQuantity !== "number" || additionalQuantity <= 0) {
      return NextResponse.json(
        { success: false, message: "Additional quantity must be a positive number" },
        { status: 400 }
      );
    }

    // Check if the order belongs to an expired route
    const routeRes = await query<{ tokenExpiresAt: Date }>(
      `SELECT r."tokenExpiresAt"
       FROM "RouteOrder" ro
       INNER JOIN "Route" r ON ro."routeId" = r."id"
       WHERE ro."orderId" = $1
       ORDER BY r."createdAt" DESC
       LIMIT 1`,
      [orderId]
    );

    if (routeRes.rows.length > 0) {
      const { tokenExpiresAt } = routeRes.rows[0];
      const now = new Date();
      if (tokenExpiresAt && new Date(tokenExpiresAt) < now) {
        return NextResponse.json(
          { success: false, message: "Route link has expired. You cannot add quantity." },
          { status: 403 }
        );
      }
    }

    // Get order details with customer and product info
    const orderRes = await query<{
      id: string;
      customerId: string;
      quantity: number;
      originalQuantity: number | null;
      additionalQuantity: number | null;
      amount: number;
      paymentStatus: string;
      status: string;
      customerPhone: string;
      customerName: string | null;
    }>(
      `SELECT 
        o."id",
        o."customerId",
        o."quantity",
        o."originalQuantity",
        o."additionalQuantity",
        o."amount",
        o."paymentStatus",
        o."status",
        c."phone" as "customerPhone",
        c."name" as "customerName"
      FROM "Order" o
      INNER JOIN "Customer" c ON o."customerId" = c."id"
      WHERE o."id" = $1`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    // Check if order is cancelled
    if (order.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, message: "Cannot add quantity to cancelled order" },
        { status: 400 }
      );
    }

    // Get product price (use customer-specific price if available, otherwise default price)
    // Assuming single product per order for now (water cans)
    const productRes = await query<{
      price: number;
      customerPrice: number | null;
    }>(
      `SELECT 
        p."price",
        cpp."price" as "customerPrice"
      FROM "Product" p
      LEFT JOIN "CustomerProductPrice" cpp ON cpp."productId" = p."id" AND cpp."customerId" = $1
      WHERE p."active" = true AND p."inStock" = true
      ORDER BY p."createdAt" DESC
      LIMIT 1`,
      [order.customerId]
    );

    if (productRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "No active product found" },
        { status: 404 }
      );
    }

    const product = productRes.rows[0];
    const unitPrice = product.customerPrice ?? product.price; // Use customer-specific price if available

    // Calculate additional amount (with 5% GST)
    const additionalSubtotal = unitPrice * additionalQuantity;
    const gstAmount = additionalSubtotal * 0.05;
    const additionalTotal = Math.round(additionalSubtotal + gstAmount);
    const additionalAmountInPaise = Math.round(additionalTotal * 100); // Convert to paise

    // Determine original quantity (if this is first addition, use current quantity as original)
    const originalQty = order.originalQuantity ?? order.quantity;
    const currentAdditionalQty = order.additionalQuantity ?? 0;
    const newAdditionalQty = currentAdditionalQty + additionalQuantity;
    const newTotalQty = originalQty + newAdditionalQty;
    const newTotalAmount = order.amount + additionalAmountInPaise;

    // Check if there's an existing payment for this order
    const existingPaymentRes = await query<{
      amount: number;
    }>(
      `SELECT "amount" FROM "Payment" WHERE "orderId" = $1 AND "status" = 'SUCCESS'`,
      [orderId]
    );

    const existingPaymentAmount = existingPaymentRes.rows.length > 0
      ? existingPaymentRes.rows[0].amount
      : 0;

    // If existing payment is less than new total amount, payment is pending
    // Otherwise, if original order was already paid and we're adding more, it becomes pending
    // If order was already online (PENDING or SUCCESS), keep it that way.
    // Adding COD additional quantity should not allow bypassing existing online payment requirement.
    let newPaymentStatus = order.paymentStatus;

    if (paymentType === 'COD') {
      // If it's already PENDING (Online) or SUCCESS, don't change it to COD.
      // This prevents Loopholes where delivery boy switches an online order to COD to bypass gateway.
      if (order.paymentStatus !== 'PENDING' && order.paymentStatus !== 'SUCCESS') {
        newPaymentStatus = 'COD';
      }
    } else if (existingPaymentAmount < newTotalAmount) {
      newPaymentStatus = 'PENDING';
    }

    // Update order with additional quantity
    await query(
      `UPDATE "Order"
       SET "quantity" = $1,
           "originalQuantity" = $2,
           "additionalQuantity" = $3,
           "amount" = $4,
           "paymentStatus" = $5,
           "updatedAt" = NOW()
       WHERE "id" = $6`,
      [newTotalQty, originalQty, newAdditionalQty, newTotalAmount, newPaymentStatus, orderId]
    );

    let paymentLink = null;
    if (paymentType !== 'COD') {
      // Determine the app URL dynamically if environment variable is missing or set to localhost
      const host = req.headers.get("host");
      const protocol = req.headers.get("x-forwarded-proto") || "https";
      const envUrl = process.env.NEXT_PUBLIC_APP_URL;

      let baseUrl = envUrl;
      if (!baseUrl || baseUrl.includes("localhost")) {
        baseUrl = host ? `${protocol}://${host}` : "";
      }

      paymentLink = await razorpay.paymentLink.create({
        amount: additionalAmountInPaise,
        currency: "INR",
        description: `Additional ${additionalQuantity} can(s) for Order #${orderId.slice(-8).toUpperCase()}`,
        customer: {
          name: order.customerName || "Customer",
          contact: order.customerPhone,
          email: "", // Add email if available
        },
        notify: {
          sms: true,
          email: false,
        },
        reminder_enable: true,
        notes: {
          orderId: orderId,
          type: "additional_quantity",
          additionalQuantity: additionalQuantity.toString(),
        },
        callback_url: `${baseUrl}/shop/api/payments/payment-link-callback?orderId=${orderId}`,
        callback_method: "get",
      });
    }

    // Store payment link info (we'll need to track this for webhook updates)
    // For now, we'll rely on webhook to update payment status when paid

    return NextResponse.json({
      success: true,
      message: "Additional quantity added successfully",
      data: {
        orderId: orderId,
        originalQuantity: originalQty,
        additionalQuantity: newAdditionalQty,
        totalQuantity: newTotalQty,
        additionalAmount: additionalAmountInPaise / 100, // Convert back to rupees
        additionalSubtotal: additionalSubtotal, // Subtotal before GST
        additionalGst: gstAmount, // GST amount
        paymentLink: paymentLink ? {
          id: paymentLink.id,
          short_url: paymentLink.short_url,
          qr_code: (paymentLink as any).qr_code || null, // QR code image URL (if available)
        } : null,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/route-orders/add-quantity:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

