import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import { getStartOfDayIST } from "../../../../../lib/timezone";
// import { retroactivelyAssignOrders } from "../../../../../lib/order-assignment";

// PUT /api/admin/delivery-boys/[id] - Update delivery boy
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
    const { name, phone, active, assignedRoutes, onLeave } = body;

    // Validation
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return NextResponse.json(
        { success: false, message: "Name must be a non-empty string" },
        { status: 400 }
      );
    }

    if (phone !== undefined && (typeof phone !== "string" || phone.trim().length === 0)) {
      return NextResponse.json(
        { success: false, message: "Phone must be a non-empty string" },
        { status: 400 }
      );
    }

    if (onLeave !== undefined && typeof onLeave !== "boolean") {
      return NextResponse.json(
        { success: false, message: "onLeave must be a boolean" },
        { status: 400 }
      );
    }

    // Check if delivery boy exists
    const existingRes = await query<{ id: string }>(
      `SELECT "id" FROM "DeliveryBoy" WHERE "id" = $1`,
      [id]
    );

    if (existingRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Delivery staff not found" },
        { status: 404 }
      );
    }

    // Check if phone is being changed and if new phone already exists
    if (phone !== undefined) {
      const phoneCheckRes = await query<{ id: string }>(
        `SELECT "id" FROM "DeliveryBoy" WHERE "phone" = $1 AND "id" != $2 AND "active" = true`,
        [phone.trim(), id]
      );

      if (phoneCheckRes.rows.length > 0) {
        return NextResponse.json(
          { success: false, message: "Delivery staff with this phone number already exists" },
          { status: 400 }
        );
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`"name" = $${paramIndex}`);
      values.push(name.trim());
      paramIndex++;
    }

    if (phone !== undefined) {
      updates.push(`"phone" = $${paramIndex}`);
      values.push(phone.trim());
      paramIndex++;
    }

    if (active !== undefined) {
      updates.push(`"active" = $${paramIndex}`);
      values.push(active);
      paramIndex++;
    }

    if (onLeave !== undefined) {
      updates.push(`"onLeave" = $${paramIndex}`);
      values.push(onLeave);
      paramIndex++;
    }

    // Validate Route conflicts if updating routes
    if (assignedRoutes !== undefined && Array.isArray(assignedRoutes) && assignedRoutes.length > 0) {
      // Find if these routes are assigned to anyone else (excluding self)
      const conflictRes = await query<{ name: string, deliveryBoyName: string }>(
        `SELECT sr."name", db."name" as "deliveryBoyName"
             FROM "ServiceRoute" sr
             JOIN "DeliveryBoy" db ON sr."currentDeliveryBoyId" = db."id"
             WHERE sr."id" = ANY($1) 
             AND db."active" = true AND db."id" != $2`,
        [assignedRoutes, id]
      );

      if (conflictRes.rows.length > 0) {
        const conflict = conflictRes.rows[0];
        return NextResponse.json({
          success: false,
          message: `Route '${conflict.name}' is already assigned to ${conflict.deliveryBoyName}`
        }, { status: 400 });
      }
    }

    let message = "Delivery staff updated successfully";

    if (updates.length > 0) {
      updates.push(`"updatedAt" = $${paramIndex}`);
      values.push(new Date());
      values.push(id); // For WHERE clause

      await query(
        `UPDATE "DeliveryBoy" 
        SET ${updates.join(", ")}
        WHERE "id" = $${paramIndex + 1}`,
        values
      );
    }

    // Update Service Routes if provided
    if (assignedRoutes !== undefined) {
      // 1. Unassign all routes for this delivery boy
      await query(
        `UPDATE "ServiceRoute" SET "currentDeliveryBoyId" = NULL, "updatedAt" = NOW() WHERE "currentDeliveryBoyId" = $1`,
        [id]
      );

      // 2. Assign new routes
      if (Array.isArray(assignedRoutes) && assignedRoutes.length > 0) {
        await query(
          `UPDATE "ServiceRoute"
                SET "currentDeliveryBoyId" = $1, "updatedAt" = NOW()
                WHERE "id" = ANY($2)`,
          [id, assignedRoutes]
        );
      }
    }

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("Error in PUT /api/admin/delivery-boys/[id]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/delivery-boys/[id] - Delete delivery boy (soft delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { id } = await params;

    // Check if delivery boy exists
    const existingRes = await query<{ id: string }>(
      `SELECT "id" FROM "DeliveryBoy" WHERE "id" = $1`,
      [id]
    );

    if (existingRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Delivery staff not found" },
        { status: 404 }
      );
    }

    // Delete active/future daily routes
    const today = getStartOfDayIST(new Date());

    await query(
      `UPDATE "Order" o
       SET "status" = 'PENDING', "updatedAt" = NOW()
       WHERE o."status" NOT IN ('CANCELLED', 'DELIVERED')
         AND EXISTS (
           SELECT 1 FROM "RouteOrder" ro
           JOIN "Route" r ON r."id" = ro."routeId"
           WHERE ro."orderId" = o."id"
             AND r."deliveryBoyId" = $1
             AND r."date" >= $2
         )`,
      [id, today]
    );

    await query(
      `DELETE FROM "Route" 
       WHERE "deliveryBoyId" = $1 AND "date" >= $2`,
      [id, today]
    );

    // Release assigned Service Routes
    await query(
      `UPDATE "ServiceRoute" 
       SET "currentDeliveryBoyId" = NULL, "updatedAt" = NOW() 
       WHERE "currentDeliveryBoyId" = $1`,
      [id]
    );

    // Soft delete
    await query(
      `UPDATE "DeliveryBoy" 
       SET "active" = false, "updatedAt" = $1
       WHERE "id" = $2`,
      [new Date(), id]
    );

    return NextResponse.json({
      success: true,
      message: "Delivery staff deleted successfully",
    });
  } catch (error) {
    console.error("Error in DELETE /api/admin/delivery-boys/[id]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
