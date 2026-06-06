import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";

// GET /api/payments/payment-link-callback - Callback for Razorpay Payment Links
// This is called when customer completes payment via payment link
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentLinkId = searchParams.get("payment_link_id") || searchParams.get("razorpay_payment_link_id");
    const paymentId = searchParams.get("payment_id") || searchParams.get("razorpay_payment_id");
    const status = searchParams.get("status") || searchParams.get("razorpay_payment_link_status");

    if (!paymentLinkId || !status) {
      // Redirect to a generic success/failure page
      return NextResponse.redirect(
        new URL("/shop/payment-status?status=error", req.url)
      );
    }

    // If payment was successful, webhook will handle the update
    // This callback is mainly for redirecting the customer
    if (status === "paid" && paymentId) {
      // Redirect to success page
      return NextResponse.redirect(
        new URL(`/shop/payment-status?status=success&payment_id=${paymentId}`, req.url)
      );
    } else {
      // Payment failed or cancelled
      return NextResponse.redirect(
        new URL(`/shop/payment-status?status=failed`, req.url)
      );
    }
  } catch (error) {
    console.error("Error in payment link callback:", error);
    return NextResponse.redirect(
      new URL("/shop/payment-status?status=error", req.url)
    );
  }
}

