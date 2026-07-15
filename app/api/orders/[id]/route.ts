import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { getCustomerIdFromSession } from "../../../../lib/session-auth";

// Price is now stored in order.amount (in paise)

// GET /api/orders/[id] - Fetch a single order by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await params;

    // Fetch order with address details
    const orderRes = await query<{
      id: string;
      quantity: number;
      originalQuantity: number | null;
      additionalQuantity: number | null;
      amount: number | null; // Amount in paise, may be null for old orders
      deliveryDate: Date;
      deliverySlot: string;
      status: string;
      paymentStatus: string;
      paymentMethod: string;
      createdAt: Date;
      addressLine1: string;
      addressLine2: string | null;
      area: string;
      city: string;
      pincode: string;
      productName: string | null;
    }>(
      `SELECT 
        o."id",
        o."quantity",
        o."originalQuantity",
        o."additionalQuantity",
        o."amount",
        o."deliveryDate",
        o."deliverySlot",
        o."status",
        o."paymentStatus",
        o."paymentMethod",
        o."createdAt",
        a."line1" as "addressLine1",
        a."line2" as "addressLine2",
        a."area",
        a."city",
        a."pincode",
        p."name" as "productName",
        COALESCE(
          (SELECT wt."amount"
           FROM "WalletTransaction" wt
           WHERE wt."referenceId" = o."id"
             AND wt."walletType" = 'ORDER'
             AND wt."type" = 'DEBIT'
           LIMIT 1), 0
        ) as "walletAmountApplied"
       FROM "Order" o
       INNER JOIN "Address" a ON o."addressId" = a."id"
       LEFT JOIN "Product" p ON o."productId" = p."id"
       WHERE o."id" = $1 AND o."customerId" = $2
       LIMIT 1`,
      [id, customerId],
    );

    if (orderRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 },
      );
    }

    const order = orderRes.rows[0];

    // Use stored amount (all new orders have amount stored)
    // For old orders without amount, return 0
    const amountInRupees = order.amount ? Math.round(order.amount / 100) : 0;

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        quantity: order.quantity,
        originalQuantity: order.originalQuantity,
        additionalQuantity: order.additionalQuantity,
        deliveryDate: order.deliveryDate.toISOString(),
        deliverySlot: order.deliverySlot,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: Number(order.walletAmountApplied || 0) > 0
          ? (amountInRupees === 0 ? 'WALLET' : `WALLET + ${order.paymentMethod}`)
          : order.paymentMethod,
        amount: amountInRupees,
        walletAmountApplied: Number(order.walletAmountApplied || 0),
        createdAt: order.createdAt.toISOString(),
        address: {
          line1: order.addressLine1,
          line2: order.addressLine2,
          area: order.area,
          city: order.city,
          pincode: order.pincode,
        },
        productName: order.productName || "Water Can",
        items: (await query<{
          id: string;
          productId: string;
          productName: string;
          quantity: number;
          price: number;
          gst: number;
        }>(
          `SELECT 
            oi."id",
            oi."productId",
            p."name" as "productName",
            oi."quantity",
            oi."price",
            oi."gst"
           FROM "OrderItem" oi
           JOIN "Product" p ON oi."productId" = p."id"
           WHERE oi."orderId" = $1`,
          [order.id]
        )).rows,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/orders/[id]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

// PATCH /api/orders/[id] - Cancel an order (customer-initiated)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await params;

    // Cancel only if not already delivered/cancelled/not delivered
    const cancellableStatuses = ["PENDING", "CONFIRMED", "OUT_FOR_DELIVERY"];

    const orderRes = await query<{
      id: string;
      orderNumber: string;
      status: string;
      paymentStatus: string;
      paymentMethod: string;
      amount: number;
      depositAmount: number;
    }>(
      `SELECT "id", "orderNumber", "status", "paymentStatus", "paymentMethod", "amount", "depositAmount"
       FROM "Order"
       WHERE "id" = $1 AND "customerId" = $2 AND "status" = ANY($3)`,
      [id, customerId, cancellableStatuses]
    );

    if (orderRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Order cannot be cancelled" },
        { status: 400 },
      );
    }

    const order = orderRes.rows[0];

    // Import withTransaction from lib/db
    const { withTransaction } = await import("../../../../lib/db");
    
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE "Order" SET "status" = 'CANCELLED', "updatedAt" = NOW() WHERE "id" = $1`,
        [order.id]
      );

      // Refund Deposit Wallet (if any deposit was paid via wallet)
      const depositTxRes = await client.query<{ amount: number }>(
        `SELECT "amount" FROM "WalletTransaction"
         WHERE "referenceId" = $1 AND "type" = 'DEBIT' AND "referenceType" = 'DEPOSIT'`,
        [order.id]
      );
      if (depositTxRes.rows.length > 0) {
        const depositRefund = Math.abs(depositTxRes.rows[0].amount);
        await client.query(
          `UPDATE "Customer" SET "depositWalletBalance" = "depositWalletBalance" + $1, "updatedAt" = NOW() WHERE "id" = $2`,
          [depositRefund, customerId]
        );
        await client.query(
          `INSERT INTO "WalletTransaction" ("id", "customerId", "amount", "type", "walletType", "referenceType", "referenceId", "description", "createdAt")
           VALUES ($1, $2, $3, 'CREDIT', 'DEPOSIT', 'ORDER_CANCELLED', $4, $5, NOW())`,
          [crypto.randomUUID(), customerId, depositRefund, order.id, `Deposit reversal for Cancelled Order #${order.id.slice(-8).toUpperCase()}`]
        );
      }

      // Refund Order Wallet (if any amount was paid via order wallet or online)
      const orderTxRes = await client.query<{ amount: number }>(
        `SELECT SUM("amount") as total_amount FROM "WalletTransaction"
         WHERE "referenceId" = $1 AND "type" = 'DEBIT' AND "walletType" = 'ORDER'`,
        [order.id]
      );
      let orderWalletRefund = orderTxRes.rows[0]?.total_amount ? Math.abs(orderTxRes.rows[0].total_amount) : 0;
      
      // If paid ONLINE, also refund the product amount to the Order Wallet
      if (order.paymentStatus === 'SUCCESS' && order.paymentMethod === 'ONLINE') {
        const productAmountPaise = Math.max(0, (order.amount || 0) - (order.depositAmount || 0));
        orderWalletRefund += (productAmountPaise / 100);
      }

      if (orderWalletRefund > 0) {
        await client.query(
          `UPDATE "Customer" SET "orderWalletBalance" = "orderWalletBalance" + $1, "updatedAt" = NOW() WHERE "id" = $2`,
          [orderWalletRefund, customerId]
        );
        await client.query(
          `INSERT INTO "WalletTransaction" ("id", "customerId", "amount", "type", "walletType", "referenceType", "referenceId", "description", "createdAt")
           VALUES ($1, $2, $3, 'CREDIT', 'ORDER', 'ORDER_CANCELLED', $4, $5, NOW())`,
          [crypto.randomUUID(), customerId, orderWalletRefund, order.id, `Order Wallet credit for Cancelled Order #${(order.orderNumber || order.id.slice(-8)).toUpperCase()}`]
        );
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/orders/[id]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

