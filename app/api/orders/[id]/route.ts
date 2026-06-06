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
        p."name" as "productName"
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
    const amountInRupees = order.amount ? order.amount / 100 : 0;

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
        paymentMethod: order.paymentMethod,
        amount: amountInRupees,
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

    const updateRes = await query<{ status: string }>(
      `UPDATE "Order"
         SET "status" = 'CANCELLED', "updatedAt" = NOW()
       WHERE "id" = $1
         AND "customerId" = $2
         AND "status" = ANY($3)
       RETURNING "status"`,
      [id, customerId, cancellableStatuses],
    );

    if (updateRes.rowCount === 0) {
      return NextResponse.json(
        { success: false, message: "Order cannot be cancelled" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/orders/[id]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

