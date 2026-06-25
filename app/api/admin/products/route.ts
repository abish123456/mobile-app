import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";
import crypto from "crypto";

// GET /api/admin/products - List all products
export async function GET(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuthWithPermission(req, "view_products"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const productsRes = await query<{
      id: string;
      name: string;
      description: string | null;
      price: number;
      depositAmount: number;
      image: string | null;
      unit: string;
      inStock: boolean;
      gst: number;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT 
        "id",
        "name",
        "description",
        "price",
        "depositAmount",
        "image",
        "unit",
        "inStock",
        "gst",
        "isCustomPrice",
        "active",
        "createdAt",
        "updatedAt"
      FROM "Product"
      WHERE "active" = true
      ORDER BY "createdAt" ASC, "id" ASC`,
      []
    );

    return NextResponse.json({
      success: true,
      products: productsRes.rows,
    });
  } catch (error) {
    console.error("Error in GET /api/admin/products:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/products - Create new product
export async function POST(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuthWithPermission(req, "create_products"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const body = await req.json();
    const { name, description, price, depositAmount, image, unit, inStock, gst, isCustomPrice } = body;

    // Validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Product name is required" },
        { status: 400 }
      );
    }

    if (!price || typeof price !== "number" || price <= 0) {
      return NextResponse.json(
        { success: false, message: "Valid price is required" },
        { status: 400 }
      );
    }

    if (gst !== undefined && (typeof gst !== "number" || gst < 0 || gst > 100)) {
      return NextResponse.json(
        { success: false, message: "GST must be between 0 and 100" },
        { status: 400 }
      );
    }

    const productId = crypto.randomUUID();
    const now = new Date();

    await query(
      `INSERT INTO "Product" ("id", "name", "description", "price", "depositAmount", "image", "unit", "inStock", "gst", "isCustomPrice", "active", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
      [
        productId,
        name.trim(),
        description?.trim() || null,
        price,
        depositAmount !== undefined ? Number(depositAmount) : 0,
        image?.trim() || null,
        unit || "",
        inStock !== false,
        gst !== undefined ? Number(gst) : 5.0,
        isCustomPrice === true,
        true,
        now,
      ]
    );

    const adminId = await getAdminIdFromRequest(req);
    const newProduct = {
      id: productId,
      name: name.trim(),
      description: description?.trim() || null,
      price,
      depositAmount: depositAmount !== undefined ? Number(depositAmount) : 0,
      image: image?.trim() || null,
      unit: unit || "",
      inStock: inStock !== false,
      gst: gst !== undefined ? Number(gst) : 5.0,
      isCustomPrice: isCustomPrice === true,
      active: true,
    };

    logAction({
      actorId: adminId,
      actorType: 'ADMIN',
      entity: 'PRODUCT',
      entityId: productId,
      action: 'CREATE',
      newData: newProduct,
      description: `Created new product: ${newProduct.name}`,
    });

    return NextResponse.json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
    });
  } catch (error) {
    console.error("Error in POST /api/admin/products:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

