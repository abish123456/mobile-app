import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../lib/db";
import crypto from "crypto";
import { logAction } from "../../../../lib/audit";

// POST /api/route-orders/update-status - Update delivery status
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { routeOrderId, deliveryStatus, notDeliveredReason, codCollected, actualReturns, token } = body;

    // Optional JWT Auth Check
    const authHeader = req.headers.get("authorization");
    let jwtUser = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const jwtToken = authHeader.split(" ")[1];
        const jwt = require("jsonwebtoken");
        jwtUser = jwt.verify(jwtToken, process.env.JWT_SECRET || "fallback_secret_for_development_only");
      } catch (err) {
        // Fallback to route token validation if JWT fails or isn't a JWT
      }
    }

    // Validation
    if (!routeOrderId || typeof routeOrderId !== "string") {
      return NextResponse.json(
        { success: false, message: "Route order ID is required" },
        { status: 400 }
      );
    }

    if (
      !deliveryStatus ||
      !["PENDING", "DELIVERED", "NOT_DELIVERED"].includes(deliveryStatus)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid delivery status" },
        { status: 400 }
      );
    }

    // Get route order, order details, and route expiration
    const routeOrderRes = await query<{
      orderId: string;
      customerId: string;
      paymentStatus: string;
      orderStatus: string;
      tokenExpiresAt: Date;
      isSubmitted: boolean;
    }>(
      `SELECT 
         o."id" as "orderId", 
         o."customerId",
         o."paymentStatus", 
         o."status" as "orderStatus", 
         r."tokenExpiresAt",
         r."isSubmitted",
         db."id" as "deliveryBoyId",
         db."name" as "deliveryBoyName"
       FROM "RouteOrder" ro
       INNER JOIN "Order" o ON ro."orderId" = o."id"
       INNER JOIN "Route" r ON ro."routeId" = r."id"
       LEFT JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
       WHERE ro."id" = $1`,
      [routeOrderId]
    );

    if (routeOrderRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Route order not found" },
        { status: 404 }
      );
    }

    const { orderId, customerId, paymentStatus, orderStatus, tokenExpiresAt, isSubmitted, deliveryBoyId, deliveryBoyName } = routeOrderRes.rows[0];
    const now = new Date();

    // Check if route is already submitted
    if (isSubmitted) {
      return NextResponse.json(
        { success: false, message: "Route has already been submitted and is locked. You cannot modify delivery status." },
        { status: 403 }
      );
    }

    // Check if route is expired
    if (tokenExpiresAt && new Date(tokenExpiresAt) < now) {
      return NextResponse.json(
        { success: false, message: "Route link has expired. You cannot make updates." },
        { status: 403 }
      );
    }

    if (orderStatus === "CANCELLED") {
      return NextResponse.json(
        { success: false, message: "Order already cancelled" },
        { status: 400 }
      );
    }

    let shouldAutoReassign = false;

    await withTransaction(async (client) => {
      // Update RouteOrder
      if (deliveryStatus === "DELIVERED") {
        // 1. Fetch Order Items for reconciliation
        const result = await client.query(
          `SELECT oi."id", oi."productId", oi."quantity", oi."returnQuantity", p."depositAmount"
           FROM "OrderItem" oi
           JOIN "Product" p ON oi."productId" = p."id"
           WHERE oi."orderId" = $1`,
          [orderId]
        );
        const orderItems = result.rows;

        let totalDelivered = 0;
        let totalClaimedReturned = 0;
        let totalActualReturned = 0;
        let walletDelta = 0;

        for (const item of orderItems) {
          // Use actualReturns from body or fallback to claimed returnQuantity
          // If actualReturns is not provided for an item, assume it matches claimed
          const actualItemReturn = actualReturns && actualReturns[item.id] !== undefined
            ? Number(actualReturns[item.id])
            : item.returnQuantity;

          // Only count items with deposit amount for cansInHand calculation
          // Products without deposit don't contribute to empty cans balance
          if ((item.depositAmount || 0) > 0) {
            totalDelivered += item.quantity;
            totalClaimedReturned += item.returnQuantity;
            totalActualReturned += actualItemReturn;
          }

          // Calculate wallet adjustment if actual differs from claimed
          // If actual > claimed, we owe user more credit (positive delta)
          // If actual < claimed, user owes us (negative delta)
          const diff = actualItemReturn - item.returnQuantity;
          walletDelta += (diff * item.depositAmount);

          // Update OrderItem with actual return quantity
          await client.query(
            `UPDATE "OrderItem" SET "actualReturnQuantity" = $1 WHERE "id" = $2`,
            [actualItemReturn, item.id]
          );
        }

        // 2. Mark as delivered
        await client.query(
          `UPDATE "RouteOrder"
           SET "deliveryStatus" = $1,
               "notDeliveredReason" = NULL,
               "updatedAt" = $2
           WHERE "id" = $3`,
          [deliveryStatus, now, routeOrderId]
        );

        // 3. Update Order status
        await client.query(
          `UPDATE "Order"
           SET "status" = 'DELIVERED', "updatedAt" = $1
           WHERE "id" = $2`,
          [now, orderId]
        );

        // 4. Create Wallet Transaction if there is a delta (adjustment for returns)
        if (walletDelta !== 0) {
          await client.query(
            `INSERT INTO "WalletTransaction"
             ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              crypto.randomUUID(),
              customerId,
              walletDelta,
              walletDelta > 0 ? 'CREDIT' : 'DEBIT',
              'DEPOSIT',
              orderId,
              walletDelta > 0
                ? `Adjustment: Extra returns collected for Order #${orderId.slice(-8).toUpperCase()}`
                : `Adjustment: Fewer returns collected for Order #${orderId.slice(-8).toUpperCase()}`
            ]
          );
        }

        // 5. Update Customer: cansInHand and depositWalletBalance
        // Cans Logic (deposit products only):
        // cansInHand is adjusted ONLY on successful delivery:
        //   cansDelta = totalDelivered - totalActualReturned
        // Meaning:
        //   - Each delivered can adds one empty can in future.
        //   - Each actual returned empty can reduces cansInHand by one.
        const cansDelta = totalDelivered - totalActualReturned;

        await client.query(
          `UPDATE "Customer"
           SET "cansInHand" = "cansInHand" + $1,
               "depositWalletBalance" = "depositWalletBalance" + $2,
               "updatedAt" = NOW()
           WHERE "id" = $3`,
          [cansDelta, walletDelta, customerId]
        );

        // 6. Log audit action
        logAction({
          actorId: deliveryBoyId || 'SYSTEM',
          actorType: 'DELIVERY_BOY',
          actorName: deliveryBoyName || 'Delivery Staff',
          entity: 'ORDER',
          entityId: orderId,
          action: 'UPDATE',
          newData: {
            status: 'DELIVERED',
            codCollected,
            totalDelivered,
            totalActualReturned
          },
          description: `Order successfully delivered by ${deliveryBoyName || 'Delivery Staff'}.`
        });

      } else if (deliveryStatus === "NOT_DELIVERED") {
        // NOT_DELIVERED: Only update RouteOrder and Order status.
        // We do NOT touch cansInHand or wallet here because
        // cansInHand is only adjusted on successful delivery.
        await client.query(
          `UPDATE "RouteOrder"
           SET "deliveryStatus" = $1,
               "notDeliveredReason" = $2,
               "updatedAt" = $3
           WHERE "id" = $4`,
          [
            deliveryStatus,
            notDeliveredReason || "Not specified",
            now,
            routeOrderId,
          ]
        );

        await client.query(
          `UPDATE "Order"
           SET "status" = 'NOT_DELIVERED', "updatedAt" = $1
           WHERE "id" = $2`,
          [now, orderId]
        );

        // Log audit action
        logAction({
          actorId: deliveryBoyId || 'SYSTEM',
          actorType: 'DELIVERY_BOY',
          actorName: deliveryBoyName || 'Delivery Staff',
          entity: 'ORDER',
          entityId: orderId,
          action: 'UPDATE',
          newData: {
            status: 'NOT_DELIVERED',
            reason: notDeliveredReason || "Not specified"
          },
          description: `Order delivery failed: ${notDeliveredReason || "Not specified"}`
        });

        // --- AUTO-REASSIGN LOGIC CHECK ---
        if (notDeliveredReason) {
            const reasonRes = await client.query<{ autoReassign: boolean }>(
                `SELECT "autoReassign" FROM "NotDeliveredReason" WHERE "reason" = $1 AND "isActive" = true`,
                [notDeliveredReason]
            );

            if (reasonRes.rows.length > 0 && reasonRes.rows[0].autoReassign) {
                shouldAutoReassign = true;
            }
        }

      } else {
        // PENDING - just update RouteOrder
        await client.query(
          `UPDATE "RouteOrder"
           SET "deliveryStatus" = $1,
               "updatedAt" = $2
           WHERE "id" = $3`,
          [deliveryStatus, now, routeOrderId]
        );
      }
    });

    // --- AUTO-REASSIGN LOGIC EXECUTION (Outside transaction to avoid deadlocks) ---
    if (shouldAutoReassign) {
        console.log(`[AUTO-REASSIGN] Triggering automatic reassignment for order ${orderId} due to reason: ${notDeliveredReason}`);
        try {
            const { reassignOrderToNextWorkingDay } = await import("../../../../lib/order-assignment");
            await reassignOrderToNextWorkingDay(orderId, notDeliveredReason);
        } catch (reassignError) {
            console.error(`[AUTO-REASSIGN] Failed for order ${orderId}:`, reassignError);
            // We don't fail the whole request since status update succeeded
        }
    }

    return NextResponse.json({
      success: true,
      message: "Delivery status updated successfully",
    });
  } catch (error) {
    console.error("Error in POST /api/route-orders/update-status:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

