import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../../lib/admin-auth";
import crypto from "crypto";
import { getNowIST } from "../../../../../../lib/timezone";
import { logAction } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "approve_refunds"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const { id: requestId } = await params;
        console.log(`[DepositRefund] Approving request ID: ${requestId}`);

        const body = await req.json();
        const { transactionId } = body;

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
            console.error(`[DepositRefund] Request not found for ID: ${requestId}`);
            return NextResponse.json({ message: "Request not found", requestId }, { status: 404 });
        }

        if (request.status !== 'REQUESTED') {
            return NextResponse.json({ message: `Request is already ${request.status}` }, { status: 400 });
        }

        const customerRes = await query<{ cansInHand: number }>('SELECT "cansInHand" FROM "Customer" WHERE "id" = $1', [request.customerId]);
        const cansInHand = customerRes.rows[0]?.cansInHand || 0;

        // Calculate cans to deduct
        // We need the deposit rate to know equivalent cans.
        // Option 1: Use active product deposit.
        // Option 2: Default to 0 if rate unavailable?
        // User said "can count also deducts". 
        // Let's protect against negative CansInHand? Or allow it?
        // Ideally, we deduct: round(Amount / Rate).
        const productRes = await query<{ depositAmount: number }>(
            `SELECT "depositAmount" FROM "Product" WHERE "active" = true AND "depositAmount" > 0 ORDER BY "createdAt" ASC LIMIT 1`
        );
        const depositRate = productRes.rows[0]?.depositAmount || 100; // Default fallback to avoid div/0
        const cansToDeduct = Math.round(request.amount / depositRate);
        const now = getNowIST();

        await withTransaction(async (client) => {
            // 1. Update Request Status
            await client.query(
                `UPDATE "DepositRefundRequest" 
                 SET "status" = 'PAID', 
                     "transactionId" = $1, 
                     "approvedAt" = $2, 
                     "updatedAt" = $2 
                 WHERE "id" = $3`,
                [transactionId || null, now, requestId]
            );

            // 2. Log Wallet Transaction
            await client.query(
                `INSERT INTO "WalletTransaction"
                 ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
                 VALUES ($1, $2, $3, 'DEBIT', 'REFUND', $4, $5, NOW())`,
                [
                    crypto.randomUUID(),
                    request.customerId,
                    -request.amount, // Negative for debit
                    requestId,
                    `Deposit Refund Paid (Ref: ${requestId.slice(-8)})`
                ]
            );

            // 3. Update Customer Balance and Cans
            await client.query(
                `UPDATE "Customer"
                 SET "depositWalletBalance" = "depositWalletBalance" - $1,
                     "cansInHand" = GREATEST(0, "cansInHand" - $2),
                     "updatedAt" = $3
                 WHERE "id" = $4`,
                [request.amount, cansToDeduct, now, request.customerId]
            );
        });

        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'CUSTOMER',
            entityId: request.customerId,
            action: 'APPROVE_DEPOSIT_REFUND',
            oldData: { status: 'REQUESTED' },
            newData: { status: 'PAID' },
            description: `Admin approved deposit refund of ₹${request.amount}`
        });

        return NextResponse.json({
            success: true,
            message: "Refund approved and marked as paid",
            deductedCans: cansToDeduct
        });

    } catch (error) {
        console.error("Error approving deposit refund:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
