import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "@/lib/admin-auth";
import crypto from "crypto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { id } = await params;

        const requestRes = await query<{
            id: string;
            status: string;
            quantity: number;
            refundAmount: number;
            customerId: string;
            refundMethod: string;
        }>(`SELECT "id", "status", "quantity", "refundAmount", "customerId", "refundMethod" FROM "ReturnCanRequest" WHERE "id" = $1`, [id]);

        const request = requestRes.rows[0];

        if (!request) {
            return NextResponse.json({ message: "Request not found" }, { status: 404 });
        }

        if (request.status !== 'COLLECTED') {
            return NextResponse.json({ message: "Request must be in COLLECTED state to process refund payment" }, { status: 400 });
        }

        // if (request.refundMethod === 'COD') {
        //     return NextResponse.json({ message: "This request is marked as COD. Payment should have been handled by Delivery Partner." }, { status: 400 });
        // }

        // Process refund with transaction
        await withTransaction(async (client) => {
            // 1. Update Return Request Status
            await client.query(
                `UPDATE "ReturnCanRequest" 
             SET "status" = 'REFUNDED', 
                 "updatedAt" = NOW()
             WHERE "id" = $1`,
                [id]
            );

            // 2. Update Customer (depositWalletBalance)
            // cansInHand was already reduced upon collection
            await client.query(
                `UPDATE "Customer"
             SET "depositWalletBalance" = "depositWalletBalance" - $1,
                 "updatedAt" = NOW()
             WHERE "id" = $2`,
                [request.refundAmount, request.customerId]
            );

            // 3. Log Wallet Transaction (Debit)
            const description = request.refundMethod === 'COD'
                ? 'Return Cans Refund (Cash Confirm by Admin)'
                : 'Return Cans Refund (Processed by Admin)';

            await client.query(
                `INSERT INTO "WalletTransaction"
              ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
              VALUES ($1, $2, $3, 'DEBIT', 'REFUND', $4, $5, NOW())`,
                [crypto.randomUUID(), request.customerId, -request.refundAmount, id, description]
            );
        });

        return NextResponse.json({ success: true, message: "Refund processed successfully." });

    } catch (error) {
        console.error("Error in POST /api/admin/return-requests/[id]/refund:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
