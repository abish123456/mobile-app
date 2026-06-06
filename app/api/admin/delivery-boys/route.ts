import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import crypto from "crypto";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";

// GET /api/admin/delivery-boys - List all delivery boys
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    // Fetch delivery boys with their assigned service routes
    const deliveryBoysRes = await query<{
      id: string;
      name: string;
      phone: string;
      active: boolean;
      onLeave: boolean;
      createdAt: Date;
      updatedAt: Date;
      assignedRouteNames: string | null;
    }>(
      `SELECT 
        db."id",
        db."name",
        db."phone",
        db."active",
        db."onLeave",
        db."createdAt",
        db."updatedAt",
        (SELECT STRING_AGG(sr."name", ', ') FROM "ServiceRoute" sr WHERE sr."currentDeliveryBoyId" = db."id") as "assignedRouteNames"
      FROM "DeliveryBoy" db
      WHERE db."active" = true
      ORDER BY db."name" ASC`
    );

    return NextResponse.json({
      success: true,
      deliveryBoys: deliveryBoysRes.rows,
    });
  } catch (error) {
    console.error("Error in GET /api/admin/delivery-boys:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/delivery-boys - Create new delivery boy
export async function POST(req: NextRequest) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const body = await req.json();
    const { name, phone } = body;

    // Validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Name is required" },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== "string" || phone.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Phone is required" },
        { status: 400 }
      );
    }

    // Check if phone already exists
    const existingRes = await query<{ id: string, active: boolean }>(
      `SELECT "id", "active" FROM "DeliveryBoy" WHERE "phone" = $1`,
      [phone.trim()]
    );

    let id: string;
    const now = new Date();

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      if (existing.active) {
        return NextResponse.json(
          { success: false, message: "Delivery staff with this phone number already exists" },
          { status: 400 }
        );
      } else {
        // Reactivate existing inactive staff
        id = existing.id;
        await query(
          `UPDATE "DeliveryBoy" 
           SET "name" = $1, "active" = true, "updatedAt" = $2 
           WHERE "id" = $3`,
          [name.trim(), now, id]
        );
      }
    } else {
      // Create new delivery staff
      id = crypto.randomUUID();
      await query(
        `INSERT INTO "DeliveryBoy" ("id", "name", "phone", "active", "onLeave", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [id, name.trim(), phone.trim(), true, false, now]
      );
    }

    return NextResponse.json({
      success: true,
      message: "Delivery staff created successfully.",
      deliveryBoy: {
        id,
        name: name.trim(),
        phone: phone.trim(),
        active: true,
        onLeave: false,
      },
    });

  } catch (error: any) {
    console.error("Error in POST /api/admin/delivery-boys:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
