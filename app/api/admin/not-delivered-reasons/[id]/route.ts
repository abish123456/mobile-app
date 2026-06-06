import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";

// PATCH /api/admin/not-delivered-reasons/[id] - Update a reason
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { id } = await params;
    const { reason, isActive, autoReassign, hideFromExceptions } = await req.json();

    // Check if reason exists
    const existing = await query(
      `SELECT id FROM "NotDeliveredReason" WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Reason not found" },
        { status: 404 }
      );
    }

    // If reason text is being updated, check for duplicates
    if (reason) {
      const duplicate = await query(
        `SELECT id FROM "NotDeliveredReason" WHERE LOWER("reason") = LOWER($1) AND id != $2`,
        [reason.trim(), id]
      );

      if (duplicate.rows.length > 0) {
        return NextResponse.json(
          { success: false, message: "Another reason with this name already exists" },
          { status: 400 }
        );
      }
    }

    // Build update query
    let updateFields = [];
    let queryParams = [];
    let paramIndex = 1;

    if (reason !== undefined) {
      updateFields.push(`"reason" = $${paramIndex++}`);
      queryParams.push(reason.trim());
    }
    if (isActive !== undefined) {
      updateFields.push(`"isActive" = $${paramIndex++}`);
      queryParams.push(isActive);
    }
    if (autoReassign !== undefined) {
      updateFields.push(`"autoReassign" = $${paramIndex++}`);
      queryParams.push(autoReassign);
    }
    if (hideFromExceptions !== undefined) {
      updateFields.push(`"hideFromExceptions" = $${paramIndex++}`);
      queryParams.push(hideFromExceptions);
    }

    updateFields.push(`"updatedAt" = NOW()`);
    queryParams.push(id);

    const result = await query(
      `UPDATE "NotDeliveredReason" 
       SET ${updateFields.join(", ")} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      queryParams
    );

    return NextResponse.json({
      success: true,
      reason: result.rows[0]
    });
  } catch (error) {
    console.error("Error in PATCH /api/admin/not-delivered-reasons/[id]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/not-delivered-reasons/[id] - Delete a reason
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { id } = await params;

    const result = await query(
      `DELETE FROM "NotDeliveredReason" WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Reason not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Reason deleted successfully"
    });
  } catch (error) {
    console.error("Error in DELETE /api/admin/not-delivered-reasons/[id]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
