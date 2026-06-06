import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { getCustomerIdFromSession } from "../../../lib/session-auth";

// GET /api/products - Get all active products (for customer app)
// If customer is authenticated, returns customer-specific prices when available
// Optional query param: ?forDeposit=true -> only return products with depositAmount > 0
export async function GET(req: NextRequest) {
  try {
    const customerId = await getCustomerIdFromSession();
    const { searchParams } = new URL(req.url);
    const forDeposit = (searchParams.get("forDeposit") || "").toLowerCase() === "true";

    const depositFilter = forDeposit ? 'AND p."depositAmount" > 0' : "";

    // Fetch products with customer-specific prices and pending deposit status in a single query
    const productsRes = await query<{
      id: string;
      name: string;
      description: string | null;
      price: number;
      customerPrice: number | null;
      image: string | null;
      unit: string;
      inStock: boolean;
      depositAmount: number;
      hasPendingDeposit: boolean;
    }>(
      `SELECT 
        p."id",
        p."name",
        p."description",
        p."price",
        cpp."price" as "customerPrice",
        p."image",
        p."unit",
        p."inStock",
        p."depositAmount",
        EXISTS (
          SELECT 1 FROM "DepositVerificationRequest" dvr 
          WHERE dvr."productId" = p."id" 
          AND dvr."customerId" = $1
          AND dvr."status" = 'PENDING'
        ) as "hasPendingDeposit"
      FROM "Product" p
      LEFT JOIN "CustomerProductPrice" cpp ON cpp."productId" = p."id" AND cpp."customerId" = $1
      WHERE p."active" = true AND p."inStock" = true ${depositFilter}
      ORDER BY p."createdAt" ASC, p."id" ASC`,
      [customerId || ""],
    );

    // Map results to use customer price if available, otherwise default price
    const products = productsRes.rows.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.customerPrice ?? product.price, // Use customer price if available
      image: product.image,
      unit: product.unit,
      inStock: product.inStock,
      depositAmount: product.depositAmount ?? 0,
      hasPendingDeposit: product.hasPendingDeposit,
    }));

    return NextResponse.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Error in GET /api/products:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

