import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import { logAction } from "../../../../../lib/audit";

// PATCH /api/admin/not-delivered-reasons/[id] - Update a reason
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await verifyAdminAuthWithPermission(req, "edit_not_delivered_reasons"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }
    
    const adminId = await getAdminIdFromRequest(req);

    const { id } = await params;
    const { reason, isActive, autoReassign, hideFromExceptions } = await req.json();

    // Check if reason exists
    const existing = await query<{id: string, reason: string, isActive: boolean, autoReassign: boolean, hideFromExceptions: boolean}>(
      `SELECT * FROM "NotDeliveredReason" WHERE id = $1`,
      [id]
    );
    
    const oldData = existing.rows[0];

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

    const newReason = result.rows[0];

    await logAction({
      actorId: adminId,
      actorType: 'ADMIN',
      entity: 'FAILURE_REASON',
      entityId: id,
      action: 'UPDATE',
      oldData: { reason: oldData?.reason, isActive: oldData?.isActive, autoReassign: oldData?.autoReassign, hideFromExceptions: oldData?.hideFromExceptions },
      newData: { reason: newReason.reason, isActive: newReason.isActive, autoReassign: newReason.autoReassign, hideFromExceptions: newReason.hideFromExceptions },
      description: `Updated failure reason: ${newReason.reason}`
    });

    return NextResponse.json({
      success: true,
      reason: newReason
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
    if (!(await verifyAdminAuthWithPermission(req, "delete_not_delivered_reasons"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }
    
    const adminId = await getAdminIdFromRequest(req);

    const { id } = await params;

    const existingRes = await query<{reason: string}>(
      `SELECT "reason" FROM "NotDeliveredReason" WHERE id = $1`,
      [id]
    );
    const oldData = existingRes.rows[0];

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

    await logAction({
      actorId: adminId,
      actorType: 'ADMIN',
      entity: 'FAILURE_REASON',
      entityId: id,
      action: 'DELETE',
      oldData: { reason: oldData?.reason },
      newData: null,
      description: `Deleted failure reason: ${oldData?.reason || id}`
    });

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
