import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../../lib/admin-auth";
import crypto from "crypto";
import { getNowIST } from "../../../../../../lib/timezone";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { id: requestId } = await params;
        console.log(`[DepositRefund] Full Refund & Deactivate for request ID: ${requestId}`);

        // Fetch request details
        const requestRes = await query<{
            id: string;
            customerId: string;
            amount: number;
            status: string;
        }>(
            `SELECT "id", "customerId", "amount", "status" FROM "DepositRefundRequest" WHERE "id" = $1`,
            [requestId]
        );
        const request = requestRes.rows[0];

        if (!request) {
            return NextResponse.json({ message: "Request not found" }, { status: 404 });
        }

        if (request.status !== 'REQUESTED') {
            return NextResponse.json({ message: `Request is already ${request.status}` }, { status: 400 });
        }

        // Full refund amount is the requested amount (assuming it covers all cans)
        // AND we deactivate the user.

        const now = getNowIST();

        await withTransaction(async (client) => {
            // 1. Update Request Status to PAID
            await client.query(
                `UPDATE "DepositRefundRequest" 
                 SET "status" = 'PAID',
                     "adminNote" = 'Full Refund & Deactivated',
                     "approvedAt" = $1, 
                     "updatedAt" = $1 
                 WHERE "id" = $2`,
                [now, requestId]
            );

            // 2. Log Wallet Transaction (Debit) - technically we are clearing their balance
            // If they had more balance than the refund request, should we clear it all?
            // The requirement says "asks refund for full 5 can's amount". 
            // We assume the request amount IS the full amount or at least the amount to be refunded.
            // We'll log the specific refund amount.

            await client.query(
                `INSERT INTO "WalletTransaction"
                 ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
                 VALUES ($1, $2, $3, 'DEBIT', 'REFUND', $4, $5, NOW())`,
                [
                    crypto.randomUUID(),
                    request.customerId,
                    -request.amount,
                    requestId,
                    `Full Refund & Deactivate (Ref: ${requestId.slice(-8)})`
                ]
            );

            // 3. Update Customer: Zero out balance/cans AND set active = false
            await client.query(
                `UPDATE "Customer"
                 SET "depositWalletBalance" = 0,
                     "cansInHand" = 0,
                     "active" = false,
                     "phone" = "phone" || '_deactivated_' || $3,
                     "updatedAt" = $1
                 WHERE "id" = $2`,
                [now, request.customerId, Date.now()]
            );
        });

        return NextResponse.json({
            success: true,
            message: "User refunded and deactivated successfully"
        });

    } catch (error) {
        console.error("Error processing full refund & deactivate:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
