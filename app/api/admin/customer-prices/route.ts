import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";
import crypto from "crypto";

// GET /api/admin/customer-prices - List all customer-specific prices
export async function GET(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const productId = searchParams.get("productId");

    let whereConditions = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    if (customerId) {
      whereConditions.push(`cpp."customerId" = $${paramIndex}`);
      queryParams.push(customerId);
      paramIndex += 1;
    }

    if (productId) {
      whereConditions.push(`cpp."productId" = $${paramIndex}`);
      queryParams.push(productId);
      paramIndex += 1;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const pricesRes = await query<{
      id: string;
      customerId: string;
      customerName: string | null;
      customerPhone: string;
      productId: string;
      productName: string;
      price: number;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT 
        cpp."id",
        cpp."customerId",
        c."name" as "customerName",
        c."phone" as "customerPhone",
        cpp."productId",
        p."name" as "productName",
        cpp."price",
        cpp."createdAt",
        cpp."updatedAt"
      FROM "CustomerProductPrice" cpp
      INNER JOIN "Customer" c ON c."id" = cpp."customerId"
      INNER JOIN "Product" p ON p."id" = cpp."productId"
      ${whereClause}
      ORDER BY c."name" ASC, p."name" ASC`,
      queryParams
    );

    return NextResponse.json({
      success: true,
      prices: pricesRes.rows,
    });
  } catch (error) {
    console.error("Error in GET /api/admin/customer-prices:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/customer-prices - Create or update customer-specific price
export async function POST(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const body = await req.json();
    const { customerId, productId, price } = body;

    // Validation
    if (!customerId || typeof customerId !== "string") {
      return NextResponse.json(
        { success: false, message: "Customer ID is required" },
        { status: 400 }
      );
    }

    if (!productId || typeof productId !== "string") {
      return NextResponse.json(
        { success: false, message: "Product ID is required" },
        { status: 400 }
      );
    }

    if (!price || typeof price !== "number" || price <= 0) {
      return NextResponse.json(
        { success: false, message: "Valid price is required" },
        { status: 400 }
      );
    }

    // Check if customer exists
    const customerRes = await query<{ id: string }>(
      `SELECT "id" FROM "Customer" WHERE "id" = $1`,
      [customerId]
    );

    if (customerRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 }
      );
    }

    // Check if product exists
    const productRes = await query<{ id: string }>(
      `SELECT "id" FROM "Product" WHERE "id" = $1 AND "active" = true`,
      [productId]
    );

    if (productRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 }
      );
    }

    // Check if price already exists
    const existingRes = await query<{ id: string }>(
      `SELECT "id" FROM "CustomerProductPrice" WHERE "customerId" = $1 AND "productId" = $2`,
      [customerId, productId]
    );

    const now = new Date();

    if (existingRes.rows.length > 0) {
      // Update existing price
      await query(
        `UPDATE "CustomerProductPrice" 
         SET "price" = $1, "updatedAt" = $2 
         WHERE "customerId" = $3 AND "productId" = $4`,
        [price, now, customerId, productId]
      );

      return NextResponse.json({
        success: true,
        message: "Customer price updated successfully",
        price: {
          id: existingRes.rows[0].id,
          customerId,
          productId,
          price,
        },
      });
    } else {
      // Create new price
      const priceId = crypto.randomUUID();

      await query(
        `INSERT INTO "CustomerProductPrice" ("id", "customerId", "productId", "price", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [priceId, customerId, productId, price, now]
      );

      return NextResponse.json({
        success: true,
        message: "Customer price created successfully",
        price: {
          id: priceId,
          customerId,
          productId,
          price,
        },
      });
    }
  } catch (error) {
    console.error("Error in POST /api/admin/customer-prices:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/customer-prices - Delete customer-specific price
export async function DELETE(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const customerId = searchParams.get("customerId");
    const productId = searchParams.get("productId");

    if (!id && (!customerId || !productId)) {
      return NextResponse.json(
        { success: false, message: "Either id or both customerId and productId are required" },
        { status: 400 }
      );
    }

    if (id) {
      await query(`DELETE FROM "CustomerProductPrice" WHERE "id" = $1`, [id]);
    } else {
      await query(
        `DELETE FROM "CustomerProductPrice" WHERE "customerId" = $1 AND "productId" = $2`,
        [customerId, productId]
      );
    }

    return NextResponse.json({
      success: true,
      message: "Customer price deleted successfully",
    });
  } catch (error) {
    console.error("Error in DELETE /api/admin/customer-prices:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

