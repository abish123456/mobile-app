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
        const { quantity, bankDetails, refundMethod = 'ONLINE' } = body;

        if (!quantity || quantity <= 0) {
            return NextResponse.json({ message: "Invalid quantity" }, { status: 400 });
        }

        if (refundMethod === 'ONLINE' && (!bankDetails || (!bankDetails.upiId && !bankDetails.accountNumber))) {
            return NextResponse.json({ message: "Bank details (UPI or Account) required for Online Refund" }, { status: 400 });
        }

        // Get customer
        const customerRes = await query<{ id: string; cansInHand: number }>(
            `SELECT "id", "cansInHand" FROM "Customer" WHERE "id" = $1`,
            [customerId]
        );
        const customer = customerRes.rows[0];

        if (!customer) {
            return NextResponse.json({ message: "Customer not found" }, { status: 404 });
        }

        // Check for existing active return/refund requests
        const activeRequestRes = await query<{ count: string }>(
            `SELECT COUNT("id") as "count" 
             FROM "ReturnCanRequest" 
             WHERE "customerId" = $1 AND "status" = 'REQUESTED'`,
            [customer.id]
        );

        if (parseInt(activeRequestRes.rows[0]?.count || "0") > 0) {
            return NextResponse.json({ message: "You already have a pending refund/return request. Please wait for it to be processed." }, { status: 400 });
        }

        // Check for active orders (ordered or returned cans pending)
        // We shouldn't allow refunds if there are open orders as it complicates the deposit logic
        const activeOrdersRes = await query<{ count: string }>(
            `SELECT COUNT("id") as "count" 
             FROM "Order" 
             WHERE "customerId" = $1 
               AND "status" NOT IN ('DELIVERED', 'CANCELLED', 'NOT_DELIVERED')
               AND NOT ("paymentMethod" = 'ONLINE' AND "paymentStatus" = 'PENDING')`,
            [customer.id]
        );

        if (parseInt(activeOrdersRes.rows[0]?.count || "0") > 0) {
            return NextResponse.json({ message: "Cannot request refund while you have active orders. Please wait for them to be delivered." }, { status: 400 });
        }

        if (quantity > (customer.cansInHand || 0)) {
            return NextResponse.json({ message: "Cannot return more cans than you have in hand" }, { status: 400 });
        }

        // Get active product deposit amount
        const productRes = await query<{ depositAmount: number }>(
            `SELECT "depositAmount" FROM "Product" WHERE "active" = true ORDER BY "createdAt" ASC LIMIT 1`
        );
        const depositAmount = productRes.rows[0]?.depositAmount || 0;
        const refundAmount = quantity * depositAmount;

        const requestId = crypto.randomUUID();

        await query(
            `INSERT INTO "ReturnCanRequest" 
       ("id", "customerId", "quantity", "status", "refundAmount", "refundMethod", "upiId", "accountNumber", "ifscCode", "bankName", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'REQUESTED', $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
            [
                requestId,
                customer.id,
                quantity,
                refundAmount,
                refundMethod,
                bankDetails?.upiId || null,
                bankDetails?.accountNumber || null,
                bankDetails?.ifscCode || null,
                bankDetails?.bankName || null
            ]
        );

        return NextResponse.json({
            success: true,
            message: "Return request submitted successfully",
            requestId
        });

    } catch (error) {
        console.error("Error submitting return request:", error);
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
            `SELECT * FROM "ReturnCanRequest" WHERE "customerId" = $1 ORDER BY "createdAt" DESC`,
            [customerId]
        );

        return NextResponse.json({ requests: res.rows });

    } catch (error) {
        console.error("Error fetching return requests:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
