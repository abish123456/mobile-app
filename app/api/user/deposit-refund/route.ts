import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { getCustomerIdFromSession } from "../../../../lib/session-auth";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    try {
        const customerId = await getCustomerIdFromSession();
        if (!customerId) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { quantity, bankDetails, refundMethod } = body;

        // Validation
        if (!quantity || quantity <= 0) {
            return NextResponse.json({ message: "Invalid quantity" }, { status: 400 });
        }

        // Bank details validation only for ONLINE refunds
        // If refundMethod is not provided, default to strict check (backward compatibility)
        // If refundMethod is 'COD', skip bank details check
        if (refundMethod !== 'COD' && (!bankDetails || (!bankDetails.upiId && (!bankDetails.accountNumber)))) {
            return NextResponse.json({ message: "Bank details required" }, { status: 400 });
        }

        // Get customer and verify balance
        const customerRes = await query<{
            id: string;
            depositWalletBalance: number;
            cansInHand: number;
        }>(
            `SELECT "id", "depositWalletBalance", "cansInHand" FROM "Customer" WHERE "id" = $1`,
            [customerId]
        );
        const customer = customerRes.rows[0];

        if (!customer) {
            return NextResponse.json({ message: "Customer not found" }, { status: 404 });
        }

        // Check for active requests
        const pendingRes = await query<{ totalPending: number }>(
            `SELECT COUNT("id") as "count" 
             FROM "DepositRefundRequest" 
             WHERE "customerId" = $1 AND "status" = 'REQUESTED'`,
            [customer.id]
        );
        if (parseInt(pendingRes.rows[0]?.count || "0") > 0) {
            return NextResponse.json({ message: "You already have a pending refund request" }, { status: 400 });
        }

        // Check for active orders
        const activeOrdersRes = await query<{ count: string }>(
            `SELECT COUNT("id") as "count" 
             FROM "Order" 
             WHERE "customerId" = $1 
               AND "status" NOT IN ('DELIVERED', 'CANCELLED', 'NOT_DELIVERED')
               AND NOT ("paymentMethod" = 'ONLINE' AND "paymentStatus" = 'PENDING')`,
            [customer.id]
        );

        if (parseInt(activeOrdersRes.rows[0]?.count || "0") > 0) {
            return NextResponse.json({ message: "Cannot request refund while you have active orders" }, { status: 400 });
        }

        // Get deposit rate
        const productRes = await query<{ depositAmount: number }>(
            `SELECT "depositAmount" FROM "Product" WHERE "active" = true AND "depositAmount" > 0 ORDER BY "createdAt" ASC LIMIT 1`
        );
        const depositRate = productRes.rows[0]?.depositAmount || 0;
        const amount = quantity * depositRate;

        if (quantity > (customer.cansInHand || 0)) {
            return NextResponse.json({ message: "Cannot return more cans than you have in hand" }, { status: 400 });
        }

        /* 
         * Note: Validating against depositWalletBalance is tricky if rates changed. 
         * Ideally cansInHand * currentRate ~= depositWalletBalance.
         * But let's trust cansInHand as primary for Refund Quantity.
         * But we CANNOT refund more than what is in wallet.
         */
        if (amount > customer.depositWalletBalance) {
            // Fallback: If wallet balance is lower (e.g. rate changed?),
            // we can either reject OR cap the amount?
            // Safest is to reject and ask admin/support or cap it?
            // Let's Reject for now as it indicates mismatch.
            return NextResponse.json({
                message: `Calculated refund (₹${amount}) exceeds wallet balance (₹${customer.depositWalletBalance}). Please contact support.`
            }, { status: 400 });
        }

        const requestId = crypto.randomUUID();

        await query(
            `INSERT INTO "DepositRefundRequest"
             ("id", "customerId", "amount", "quantity", "status", "upiId", "accountNumber", "ifscCode", "bankName", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'REQUESTED', $5, $6, $7, $8, NOW(), NOW())`,
            [
                requestId,
                customer.id,
                amount,
                quantity,
                bankDetails?.upiId || null,
                bankDetails?.accountNumber || null,
                bankDetails?.ifscCode || null,
                bankDetails?.bankName || (refundMethod === 'COD' ? 'CASH' : null)
            ]
        );

        return NextResponse.json({
            success: true,
            message: "Deposit refund request submitted successfully",
            requestId
        });

    } catch (error) {
        console.error("Error submitting deposit refund:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const customerId = await getCustomerIdFromSession();
        if (!customerId) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const res = await query(
            `SELECT * FROM "DepositRefundRequest" WHERE "customerId" = $1 ORDER BY "createdAt" DESC`,
            [customerId]
        );

        return NextResponse.json({ requests: res.rows });

    } catch (error) {
        console.error("Error fetching deposit refunds:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
