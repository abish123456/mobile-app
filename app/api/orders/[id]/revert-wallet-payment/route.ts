import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../lib/db";
import { getCustomerIdFromSession } from "../../../../../lib/session-auth";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: orderId } = await params;

    let result = { success: false };

    await withTransaction(async (client) => {
      // 1. Fetch Order with lock
      const orderRes = await client.query<{
        id: string;
        amount: number;
        paymentStatus: string;
      }>(
        `SELECT o."id", o."amount", o."paymentStatus"
         FROM "Order" o
         WHERE o."id" = $1 AND o."customerId" = $2
         FOR UPDATE`,
        [orderId, customerId]
      );

      if (orderRes.rows.length === 0) {
        throw new Error("Order not found");
      }
      const order = orderRes.rows[0];

      // If the order is already SUCCESS, we should not revert wallet payment!
      if (order.paymentStatus === 'SUCCESS') {
        throw new Error("Cannot revert wallet on a successfully paid order");
      }

      // 2. Find the most recent DEBIT transaction for this order
      const txRes = await client.query<{
        id: string;
        amount: number;
        createdAt: Date;
      }>(
        `SELECT "id", "amount", "createdAt" 
         FROM "WalletTransaction"
         WHERE "referenceId" = $1 
           AND "referenceType" = 'ORDER_PAYMENT' 
           AND "type" = 'DEBIT' 
           AND "customerId" = $2
         ORDER BY "createdAt" DESC 
         LIMIT 1`,
        [orderId, customerId]
      );

      if (txRes.rows.length === 0) {
        // No transaction found, nothing to revert
        result = { success: true };
        return;
      }

      const tx = txRes.rows[0];
      const now = new Date();
      const diffMinutes = (now.getTime() - new Date(tx.createdAt).getTime()) / 1000 / 60;

      // Only revert if the transaction was created within the last 30 minutes
      // This prevents reverting old wallet applications from checkout
      if (diffMinutes > 30) {
        result = { success: true };
        return;
      }

      // 3. Delete the WalletTransaction
      await client.query(
        `DELETE FROM "WalletTransaction" WHERE "id" = $1`,
        [tx.id]
      );

      // 4. Refund the customer's wallet
      await client.query(
        `UPDATE "Customer" 
         SET "orderWalletBalance" = "orderWalletBalance" + $1, 
             "updatedAt" = NOW() 
         WHERE "id" = $2`,
        [tx.amount, customerId]
      );

      // 5. Restore the Order amount
      const refundAmountPaise = Math.round(tx.amount * 100);
      const newAmountPaise = Number(order.amount || 0) + refundAmountPaise;

      await client.query(
        `UPDATE "Order" 
         SET "amount" = $1, 
             "updatedAt" = NOW() 
         WHERE "id" = $2`,
        [newAmountPaise, orderId]
      );

      result = { success: true };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in POST /api/orders/[id]/revert-wallet-payment:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Internal server error" },
      { status: 400 }
    );
  }
}
