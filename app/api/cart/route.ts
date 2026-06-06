import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { cookies } from "next/headers";
import crypto from "crypto";

// Get customer ID from session cookie
async function getCustomerIdFromSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("sessionData")?.value;
    if (!sessionToken) return null;

    const sessionRes = await query<{ customerId: string; expiresAt: Date }>(
      `SELECT "customerId", "expiresAt" FROM "UserSession" WHERE "token" = $1`,
      [sessionToken]
    );
    const session = sessionRes.rows[0];
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) return null;
    return session.customerId;
  } catch {
    return null;
  }
}

// GET /api/cart - get current cart for logged-in customer
export async function GET(req: NextRequest) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const cartRes = await query<{
      id: string;
      productId: string;
      quantity: number;
      returnQuantity: number;
      name: string | null;
      description: string | null;
      price: number | null;
      customerPrice: number | null;
      image: string | null;
      unit: string | null;
      gst: number | null;
      active: boolean | null;
      inStock: boolean | null;
      depositAmount: number | null;
      hasPendingDeposit: boolean;
    }>(
      `SELECT
         ci."id",
         ci."productId",
         ci."quantity",
         ci."returnQuantity",
         p."name",
         p."description",
         p."price",
         cpp."price" as "customerPrice",
         p."image",
         p."unit",
         p."gst",
         p."active",
         p."inStock",
         p."depositAmount",
         EXISTS (
           SELECT 1 FROM "DepositVerificationRequest" dvr 
           WHERE dvr."productId" = ci."productId" 
           AND dvr."customerId" = ci."customerId" 
           AND dvr."status" = 'PENDING'
         ) as "hasPendingDeposit"
       FROM "CartItem" ci
       LEFT JOIN "Product" p ON p."id" = ci."productId"
       LEFT JOIN "CustomerProductPrice" cpp ON cpp."productId" = p."id" AND cpp."customerId" = $1
       WHERE ci."customerId" = $1
       ORDER BY ci."createdAt" ASC`,
      [customerId],
    );

    const items = cartRes.rows.map((row) => {
      // Determine if product is available
      // Product is available if it exists (name is not null), is active, and is in stock
      const isAvailable = row.name !== null && row.active === true && row.inStock === true;

      // Use customer-specific price if available, otherwise use default price
      const finalPrice = row.customerPrice ?? row.price ?? 0;

      return {
        id: row.productId,
        cartItemId: row.id,
        name: row.name || 'Product No Longer Available',
        description: row.description || 'This product has been removed.',
        price: finalPrice,
        image: row.image,
        unit: row.unit || 'can',
        quantity: row.quantity,
        returnQuantity: row.returnQuantity,
        depositAmount: row.depositAmount || 0,
        gst: row.gst ?? 5.0,
        isAvailable: isAvailable,
        hasPendingDeposit: row.hasPendingDeposit,
      };
    });

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("Error in GET /api/cart:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST /api/cart - set quantity for a single product in the cart
// Body: { productId: string, quantity: number }
export async function POST(req: NextRequest) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const productId = (body?.productId ?? "").toString().trim();
    const quantity = Number(body?.quantity ?? 0);
    const returnQuantity = Number(body?.returnQuantity ?? 0);

    if (!productId) {
      return NextResponse.json(
        { success: false, message: "Product ID is required" },
        { status: 400 },
      );
    }

    if (Number.isNaN(quantity) || quantity < 0) {
      return NextResponse.json(
        { success: false, message: "Quantity must be >= 0" },
        { status: 400 },
      );
    }

    if (quantity === 0) {
      // Remove from cart - allow removal even if product is deleted/inactive
      await query(
        `DELETE FROM "CartItem"
         WHERE "customerId" = $1 AND "productId" = $2`,
        [customerId, productId],
      );
      return NextResponse.json({ success: true });
    }

    // For non-zero quantities, ensure product exists and is active
    const productRes = await query<{ id: string; depositAmount: number }>(
      `SELECT "id", "depositAmount" FROM "Product" WHERE "id" = $1 AND "active" = true`,
      [productId],
    );
    const product = productRes.rows[0];

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found or no longer available" },
        { status: 404 },
      );
    }

    // AUTOMATION: Calculate returnQuantity if it's not explicitly provided (or even if it is, enforce business rules)
    // 1. Get customer cans info
    const custInfoRes = await query<{ cansInHand: number }>(
      `SELECT "cansInHand" FROM "Customer" WHERE "id" = $1`,
      [customerId]
    );

    // 2. Get pending returns from active orders
    const pendingReturnedRes = await query<{ pendingReturned: string }>(
      `SELECT COALESCE(SUM(oi."returnQuantity"), 0)::bigint as "pendingReturned"
       FROM "OrderItem" oi
       JOIN "Order" o ON o."id" = oi."orderId"
       JOIN "Product" p ON p."id" = oi."productId"
       WHERE o."customerId" = $1
         AND o."status" NOT IN ('DELIVERED', 'CANCELLED', 'NOT_DELIVERED')
         AND p."depositAmount" > 0
         AND (o."paymentMethod" = 'COD' OR o."paymentStatus" = 'SUCCESS')`,
      [customerId]
    );

    // 3. Get pending explicit return requests
    const pendingExplicitRes = await query<{ pendingExplicit: string }>(
      `SELECT COALESCE(SUM("quantity"), 0)::bigint as "pendingExplicit"
       FROM "ReturnCanRequest"
       WHERE "customerId" = $1 AND "status" = 'REQUESTED'`,
      [customerId]
    );

    // 4. Get other cart items (to see how many cans they already 'claimed' for swap)
    const otherCartItemsRes = await query<{ returnQuantity: number }>(
      `SELECT "returnQuantity" FROM "CartItem" 
       WHERE "customerId" = $1 AND "productId" != $2`,
      [customerId, productId]
    );

    const cansInHand = custInfoRes.rows[0]?.cansInHand || 0;
    const pendingReturned = Number(pendingReturnedRes.rows[0]?.pendingReturned) || 0;
    const pendingExplicit = Number(pendingExplicitRes.rows[0]?.pendingExplicit) || 0;
    const usedByOtherItems = otherCartItemsRes.rows.reduce((sum, row) => sum + row.returnQuantity, 0);

    const availableForSwap = Math.max(0, cansInHand - pendingReturned - pendingExplicit - usedByOtherItems);

    // Auto-calculate return quantity for this update
    // If quantity is increased, we can swap up to the new quantity if cans are available.
    let finalReturnQuantity = returnQuantity;
    if (product.depositAmount > 0) {
      // If the client didn't provide a returnQuantity (like from Items page), or if we want to be safe:
      // Always ensure returnQuantity is within available swap limits and doesn't exceed ordered quantity
      finalReturnQuantity = Math.min(quantity, availableForSwap);
    } else {
      finalReturnQuantity = 0; // No deposit product, no return can swap
    }

    // Upsert cart item - generate CUID for id
    const cartItemId = crypto.randomUUID();
    await query(
      `INSERT INTO "CartItem" ("id", "customerId", "productId", "quantity", "returnQuantity", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT ("customerId", "productId")
       DO UPDATE SET "quantity" = EXCLUDED."quantity", "returnQuantity" = EXCLUDED."returnQuantity", "updatedAt" = NOW()`,
      [cartItemId, customerId, productId, quantity, finalReturnQuantity],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/cart:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE /api/cart - clear entire cart for logged-in customer
export async function DELETE(req: NextRequest) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    await query(
      `DELETE FROM "CartItem" WHERE "customerId" = $1`,
      [customerId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/cart:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}