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
    const body = await req.json();
    const { appliedWalletAmount } = body;

    if (!appliedWalletAmount || appliedWalletAmount <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid wallet amount" },
        { status: 400 }
      );
    }

    let result = { success: false, paymentComplete: false, remainingAmount: 0 };

    await withTransaction(async (client) => {
      // 1. Fetch Order and Customer details with lock to prevent race conditions
      const orderRes = await client.query<{
        id: string;
        amount: number; // in paise
        paidAmount: number; // in paise
        status: string;
        paymentStatus: string;
        paymentMethod: string;
        orderNumber: string;
      }>(
        `SELECT o."id", o."amount", o."status", o."paymentStatus", o."paymentMethod", o."orderNumber",
          COALESCE((
            SELECT SUM(p."amount")::bigint
            FROM "Payment" p
            WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS'
          ), 0) as "paidAmount"
         FROM "Order" o
         WHERE o."id" = $1 AND o."customerId" = $2
         FOR UPDATE`,
        [orderId, customerId]
      );

      if (orderRes.rows.length === 0) {
        throw new Error("Order not found");
      }
      const order = orderRes.rows[0];

      if (order.status === 'CANCELLED' || order.status === 'DELIVERED') {
        throw new Error(`Cannot pay for a ${order.status.toLowerCase()} order`);
      }

      const customerRes = await client.query<{ orderWalletBalance: number }>(
        `SELECT "orderWalletBalance" FROM "Customer" WHERE "id" = $1 FOR UPDATE`,
        [customerId]
      );
      const customer = customerRes.rows[0];

      // Amounts are in paise in DB, but appliedWalletAmount from frontend is usually in Rupees.
      // Let's assume appliedWalletAmount from frontend is in Rupees.
      const appliedAmountPaise = Math.round(appliedWalletAmount * 100);
      const outstandingBalance = Math.max(0, Number(order.amount || 0) - Number(order.paidAmount || 0));

      if (outstandingBalance <= 0) {
        throw new Error("Order is already fully paid");
      }

      if (appliedAmountPaise > Math.round(customer.orderWalletBalance * 100)) {
        throw new Error("Insufficient wallet balance");
      }

      // We only apply up to the outstanding balance
      const actualDeductionPaise = Math.min(appliedAmountPaise, outstandingBalance);
      const actualDeductionRupees = actualDeductionPaise / 100;

      if (actualDeductionPaise <= 0) {
         throw new Error("Invalid deduction amount");
      }

      // 2. Deduct from wallet
      await client.query(
        `UPDATE "Customer" SET "orderWalletBalance" = "orderWalletBalance" - $1, "updatedAt" = NOW() WHERE "id" = $2`,
        [actualDeductionRupees, customerId]
      );

      // 3. Create Wallet Transaction
      await client.query(
        `INSERT INTO "WalletTransaction" ("id", "customerId", "amount", "type", "walletType", "referenceType", "referenceId", "description", "createdAt")
         VALUES ($1, $2, $3, 'DEBIT', 'ORDER', 'ORDER_PAYMENT', $4, $5, NOW())`,
        [crypto.randomUUID(), customerId, actualDeductionRupees, orderId, `Paid for Order #${(order.orderNumber || orderId.slice(-8)).toUpperCase()}`]
      );

      // 4. Update Order amount (reduce it since wallet covers this part of the bill)
      const newAmountPaise = Math.max(0, Number(order.amount || 0) - actualDeductionPaise);
      const isFullyPaid = newAmountPaise <= Number(order.paidAmount || 0);

      const paymentMethod = order.paymentMethod;
      const paymentStatus = isFullyPaid ? 'SUCCESS' : order.paymentStatus;

      await client.query(
        `UPDATE "Order" SET "amount" = $1, "paymentStatus" = $2, "paymentMethod" = $3, "updatedAt" = NOW() WHERE "id" = $4`,
        [newAmountPaise, paymentStatus, paymentMethod, orderId]
      );

      result = {
        success: true,
        paymentComplete: isFullyPaid,
        remainingAmount: isFullyPaid ? 0 : Math.max(0, newAmountPaise - Number(order.paidAmount || 0)) / 100
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in POST /api/orders/[id]/pay-with-wallet:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Internal server error" },
      { status: 400 } // use 400 for business logic errors thrown above
    );
  }
}
