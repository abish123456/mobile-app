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

// POST /api/payments/check-status - Check status of a payment link and update DB
export async function POST(req: NextRequest) {
    try {
        if (!razorpay) {
            return NextResponse.json(
                { success: false, message: "Payment gateway not configured" },
                { status: 503 }
            );
        }

        const body = await req.json();
        const { paymentLinkId, orderId } = body;

        if (!paymentLinkId) {
            return NextResponse.json(
                { success: false, message: "Payment Link ID is required" },
                { status: 400 }
            );
        }

        // Fetch the payment link details from Razorpay
        const link = await razorpay.paymentLink.fetch(paymentLinkId);

        // If paid, update the database
        if (link.status === "paid") {
            // Get the payment ID from the payments array in the link object
            // format: link.payments: [{ payment_id: "pay_...", status: "captured", ... }]
            // We'll take the latest successful payment
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const payments = (link as any).payments || [];
            const successfulPayment = payments.find((p: any) => p.status === "captured" || p.status === "authorized");
            const providerPaymentId = successfulPayment ? successfulPayment.payment_id : null;

            const targetId = orderId || link.notes?.orderId;
            const isQrNote = link.notes?.type === "cod_qr_payment" || link.notes?.type === "additional_quantity";

            // Fetch Order to get the Total Expected Amount
            const orderRes = await query<{
                amount: number;
                customerId: string;
            }>(`
                SELECT "amount", "customerId" FROM "Order" WHERE "id" = $1
            `, [targetId]);

            if (orderRes.rows.length === 0) {
                // Should not happen if orderId is correct
                return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
            }

            const order = orderRes.rows[0];

            // Amount in the link is the amount requested (the additional amount)
            // We should update the Payment record incrementally or at least accurately.
            // Using ON CONFLICT to ensure we either insert or update cautiously.

            // Check if this payment_id from Razorpay was already handled (idempotency)
            if (providerPaymentId) {
                const existingPaymentWithId = await query(`SELECT id FROM "Payment" WHERE "providerPaymentId" = $1`, [providerPaymentId]);
                if (existingPaymentWithId.rows.length > 0) {
                    return NextResponse.json({ success: true, status: "paid", message: "Payment already processed" });
                }
            }

            const linkAmount = Number(link.amount); // in paise

            // Fetch payment details to get the instrument (UPI, Card, etc.)
            let instrument = 'Online';
            if (providerPaymentId) {
                try {
                    const paymentDetails = await razorpay.payments.fetch(providerPaymentId);
                    if (paymentDetails.method === 'upi') instrument = 'UPI';
                    else if (paymentDetails.method === 'card') instrument = 'Card';
                    else if (paymentDetails.method === 'netbanking') instrument = 'NetBanking';
                    else if (paymentDetails.method === 'wallet') instrument = 'Wallet';
                    else if (paymentDetails.method) instrument = paymentDetails.method.charAt(0).toUpperCase() + paymentDetails.method.slice(1);
                } catch (e) {
                    console.error("Error fetching payment details in check-status:", e);
                }
            }

            // Upsert Payment record using ON CONFLICT logic similar to webhook
            await query(
                `INSERT INTO "Payment" (
                    "id", "orderId", "amount", "status", "provider", "providerOrderId", "providerPaymentId", "method", "createdAt", "updatedAt"
                ) VALUES ($1, $2, $3, 'SUCCESS', 'RAZORPAY', $4, $5, 'ONLINE', NOW(), NOW())
                ON CONFLICT ("providerPaymentId") DO UPDATE SET
                    "status" = 'SUCCESS',
                    "updatedAt" = NOW()`,
                [
                    `pay_rec_${Date.now()}`,
                    targetId,
                    linkAmount,
                    paymentLinkId,
                    providerPaymentId || "multi-payment"
                ]
            );

            // Fetch total paid so far
            const totalPaidRes = await query<{ total: number }>(
                `SELECT SUM("amount")::bigint as total FROM "Payment" WHERE "orderId" = $1 AND "status" = 'SUCCESS'`,
                [targetId]
            );

            const totalPaid = Number(totalPaidRes.rows[0]?.total || 0);
            const totalExpected = Number(order.amount || 0);

            // Update Order Payment Status ONLY if fully paid
            if (totalPaid >= totalExpected - 1) {
                await query(
                    `UPDATE "Order" 
                     SET "paymentStatus" = 'SUCCESS', 
                         "paymentMethod" = 'ONLINE',
                         "isQrPayment" = $3,
                         "paymentInstrument" = COALESCE(NULLIF("paymentInstrument", 'Online'), $2),
                         "updatedAt" = NOW() 
                     WHERE "id" = $1`,
                    [targetId, instrument, isQrNote]
                );
            } else {
                // Safety Net: Even if not fully paid yet, if we got a partial online payment,
                // ensure the instrument is at least recorded if it's the first online payment.
                await query(
                    `UPDATE "Order" 
                     SET "paymentInstrument" = COALESCE(NULLIF("paymentInstrument", 'Online'), $2),
                         "paymentMethod" = CASE WHEN "paymentMethod" = 'COD' THEN 'ONLINE' ELSE "paymentMethod" END,
                         "isQrPayment" = $3,
                         "updatedAt" = NOW()
                     WHERE "id" = $1 AND ("paymentInstrument" IS NULL OR "paymentInstrument" = 'Online' OR "paymentMethod" = 'COD')`,
                    [targetId, instrument, isQrNote]
                );
            }

            return NextResponse.json({
                success: true,
                status: "paid",
                totalPaid: totalPaid / 100,
                isFullyPaid: totalPaid >= totalExpected - 1,
                message: totalPaid >= totalExpected - 1 ? "Order fully paid" : "Partial payment received"
            });
        }

        return NextResponse.json({
            success: true,
            status: link.status, // created, expired, cancelled, partially_paid
            message: `Payment status: ${link.status}`
        });

    } catch (error: any) {
        console.error("Error checking payment link status:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
