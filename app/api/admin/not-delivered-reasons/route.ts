import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";

// GET /api/admin/not-delivered-reasons - Fetch all reasons
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAdminAuthWithPermission(req, "view_not_delivered_reasons"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const result = await query(
      `SELECT * FROM "NotDeliveredReason" ORDER BY "reason" ASC`
    );

    return NextResponse.json({
      success: true,
      reasons: result.rows
    });
  } catch (error) {
    console.error("Error in GET /api/admin/not-delivered-reasons:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/not-delivered-reasons - Create a new reason
export async function POST(req: NextRequest) {
  try {
    if (!(await verifyAdminAuthWithPermission(req, "create_not_delivered_reasons"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }
    
    const adminId = await getAdminIdFromRequest(req);

    const { reason, isActive, autoReassign, hideFromExceptions } = await req.json();

    if (!reason) {
      return NextResponse.json(
        { success: false, message: "Reason is required" },
        { status: 400 }
      );
    }

    // Check if reason already exists
    const existing = await query(
      `SELECT id FROM "NotDeliveredReason" WHERE LOWER("reason") = LOWER($1)`,
      [reason.trim()]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: "This reason already exists" },
        { status: 400 }
      );
    }

    const id = `ndr_${Math.random().toString(36).substr(2, 9)}`;
    const result = await query(
      `INSERT INTO "NotDeliveredReason" (id, "reason", "isActive", "autoReassign", "hideFromExceptions", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [
        id,
        reason.trim(),
        isActive !== undefined ? isActive : true,
        autoReassign !== undefined ? autoReassign : false,
        hideFromExceptions !== undefined ? hideFromExceptions : false
      ]
    );

    const newReason = result.rows[0];

    await logAction({
      actorId: adminId,
      actorType: 'ADMIN',
      entity: 'FAILURE_REASON',
      entityId: id,
      action: 'CREATE',
      oldData: null,
      newData: { reason: newReason.reason, isActive: newReason.isActive, autoReassign: newReason.autoReassign, hideFromExceptions: newReason.hideFromExceptions },
      description: `Created failure reason: ${newReason.reason}`
    });

    return NextResponse.json({
      success: true,
      reason: newReason
    });
  } catch (error) {
    console.error("Error in POST /api/admin/not-delivered-reasons:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
