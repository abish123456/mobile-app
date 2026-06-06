import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import crypto from "crypto";

// POST /api/route-orders/mark-paid - Mark an order as paid (COD collected)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { routeOrderId } = body;

        if (!routeOrderId || typeof routeOrderId !== "string") {
            return NextResponse.json(
                { success: false, message: "Route order ID is required" },
                { status: 400 }
            );
        }

        // Get details
        const routeOrderRes = await query<{
            orderId: string;
            customerId: string;
            depositAmount: number;
            tokenExpiresAt: Date;
            isSubmitted: boolean;
        }>(
            `SELECT ro."orderId", o."customerId", o."depositAmount", r."tokenExpiresAt", r."isSubmitted"
       FROM "RouteOrder" ro
       INNER JOIN "Order" o ON ro."orderId" = o."id"
       INNER JOIN "Route" r ON ro."routeId" = r."id"
       WHERE ro."id" = $1`,
            [routeOrderId]
        );

        if (routeOrderRes.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Route order not found" },
                { status: 404 }
            );
        }

        const { orderId, customerId, depositAmount, tokenExpiresAt, isSubmitted } = routeOrderRes.rows[0];
        const now = new Date();

        if (isSubmitted) {
            return NextResponse.json(
                { success: false, message: "Route has already been submitted and is locked. You cannot modify payment details." },
                { status: 403 }
            );
        }

        if (tokenExpiresAt && new Date(tokenExpiresAt) < now) {
            return NextResponse.json(
                { success: false, message: "Route link has expired." },
                { status: 403 }
            );
        }

        // Update Payment Status to SUCCESS (Paid)
        // Update COD Collected to true
        // CRITICAL: Update originalQuantity to current quantity so that future additions are calculated correctly
        // and reset additionalQuantity to 0
        // ALSO CRITICAL: Upsert into Payment table so that outstandingAmount calculation correctly reflects 0

        // 1. Calculate current outstanding amount
        const orderData = await query<{ amount: number }>(`SELECT amount FROM "Order" WHERE "id" = $1`, [orderId]);
        const totalExpected = Number(orderData.rows[0]?.amount || 0);

        const paymentsRes = await query<{ amount: number }>(
            `SELECT amount FROM "Payment" WHERE "orderId" = $1 AND "status" = 'SUCCESS'`,
            [orderId]
        );
        const totalPaid = paymentsRes.rows.reduce((sum, p) => sum + Number(p.amount), 0);
        const outstanding = Math.max(0, totalExpected - totalPaid);

        if (outstanding > 0) {
            // 2. Insert new Payment record for the cash collection
            await query(
                `INSERT INTO "Payment" (
                    "id", "orderId", "routeOrderId", "amount", "status", "provider", "providerPaymentId", "method", "createdAt", "updatedAt"
                ) VALUES ($1, $2, $3, $4, 'SUCCESS', 'CASH', $5, 'COD', NOW(), NOW())`,
                [
                    crypto.randomUUID(),
                    orderId,
                    routeOrderId,
                    outstanding,
                    `COD-${Date.now()}`
                ]
            );
        }

        // 3. Update Order status
        await query(
            `UPDATE "Order" 
             SET "paymentStatus" = 'SUCCESS', "updatedAt" = $1
             WHERE "id" = $2`,
            [now, orderId]
        );

        await query(
            `UPDATE "RouteOrder" SET "codCollected" = true, "updatedAt" = $1 WHERE "id" = $2`,
            [now, routeOrderId]
        );

        // Update Customer deposit balance if this order included a deposit
        if (depositAmount && depositAmount > 0) {
            // Check for existing PAYMENT log
            const existingPaymentLog = await query(
                `SELECT 1 FROM "WalletTransaction" 
                 WHERE "referenceId" = $1 AND "referenceType" = 'PAYMENT'`,
                [orderId]
            );

            if (existingPaymentLog.rows.length === 0) {
                const depositInRupees = depositAmount / 100;

                // Add deposit to wallet (refundable amount)
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
                        `Deposit paid (COD) for Order #${orderId.slice(-8).toUpperCase()}`
                    ]
                );
            }
        }

        return NextResponse.json({
            success: true,
            message: "Payment marked as collected",
        });

    } catch (error) {
        console.error("Error in POST /api/route-orders/mark-paid:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
