import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";

// PUT /api/admin/products/[id] - Update product
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, description, price, depositAmount, image, unit, inStock, active, gst, isCustomPrice } = body;

    // Check if product exists
    const productRes = await query<{ id: string }>(
      `SELECT "id" FROM "Product" WHERE "id" = $1`,
      [id]
    );

    if (productRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 }
      );
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { success: false, message: "Product name cannot be empty" },
          { status: 400 }
        );
      }
      updates.push(`"name" = $${paramIndex}`);
      values.push(name.trim());
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`"description" = $${paramIndex}`);
      values.push(description?.trim() || null);
      paramIndex++;
    }

    if (price !== undefined) {
      if (typeof price !== "number" || price <= 0) {
        return NextResponse.json(
          { success: false, message: "Price must be a positive number" },
          { status: 400 }
        );
      }
      updates.push(`"price" = $${paramIndex}`);
      values.push(price);
      paramIndex++;
    }

    if (depositAmount !== undefined) {
      if (typeof depositAmount !== "number" || depositAmount < 0) {
        return NextResponse.json(
          { success: false, message: "Deposit amount must be a non-negative number" },
          { status: 400 }
        );
      }
      updates.push(`"depositAmount" = $${paramIndex}`);
      values.push(depositAmount);
      paramIndex++;
    }

    if (image !== undefined) {
      updates.push(`"image" = $${paramIndex}`);
      values.push(image?.trim() || null);
      paramIndex++;
    }

    if (unit !== undefined) {
      updates.push(`"unit" = $${paramIndex}`);
      values.push(unit || "");
      paramIndex++;
    }

    if (inStock !== undefined) {
      updates.push(`"inStock" = $${paramIndex}`);
      values.push(inStock === true);
      paramIndex++;
    }

    if (active !== undefined) {
      updates.push(`"active" = $${paramIndex}`);
      values.push(active === true);
      paramIndex++;
    }

    if (gst !== undefined) {
      if (typeof gst !== "number" || gst < 0 || gst > 100) {
        return NextResponse.json(
          { success: false, message: "GST must be between 0 and 100" },
          { status: 400 }
        );
      }
      updates.push(`"gst" = $${paramIndex}`);
      values.push(gst);
      paramIndex++;
    }

    if (isCustomPrice !== undefined) {
      updates.push(`"isCustomPrice" = $${paramIndex}`);
      values.push(isCustomPrice === true);
      paramIndex++;
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, message: "No fields to update" },
        { status: 400 }
      );
    }

    updates.push(`"updatedAt" = $${paramIndex}`);
    values.push(new Date());
    paramIndex++;

    values.push(id);

    await query(
      `UPDATE "Product" SET ${updates.join(", ")} WHERE "id" = $${paramIndex}`,
      values
    );

    return NextResponse.json({
      success: true,
      message: "Product updated successfully",
    });
  } catch (error) {
    console.error("Error in PUT /api/admin/products/[id]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/products/[id] - Soft delete product
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    // Extract id from params with better error handling
    let id: string;
    try {
      const resolvedParams = await params;
      id = resolvedParams.id;
    } catch (paramsError: any) {
      console.error("Error resolving params in DELETE /api/admin/products/[id]:", paramsError);
      // Try to extract id from URL as fallback
      const url = new URL(req.url);
      const pathParts = url.pathname.split('/');
      id = pathParts[pathParts.length - 1];

      if (!id || id === '[id]') {
        return NextResponse.json(
          { success: false, message: "Invalid product ID" },
          { status: 400 }
        );
      }
    }

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Product ID is required" },
        { status: 400 }
      );
    }

    const now = new Date();

    // Soft delete by setting active = false
    await query(
      `UPDATE "Product" SET "active" = false, "updatedAt" = $1 WHERE "id" = $2`,
      [now, id]
    );

    return NextResponse.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error: any) {
    console.error("Error in DELETE /api/admin/products/[id]:", error);
    console.error("Error details:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Internal server error",
        error: process.env.NODE_ENV === 'development' ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}

