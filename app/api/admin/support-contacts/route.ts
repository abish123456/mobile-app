import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";
import crypto from "crypto";

interface SupportContact {
  id: string;
  type: string;
  label: string;
  value: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAdminAuthWithPermission(req, 'view_support_contacts'))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const result = await query<SupportContact>(
      'SELECT "id", "type", "label", "value", "active", "createdAt", "updatedAt" FROM "SupportContact" ORDER BY "createdAt" ASC'
    );

    return NextResponse.json({ success: true, contacts: result.rows });
  } catch (error) {
    console.error("Error fetching support contacts:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await verifyAdminAuthWithPermission(req, 'create_support_contacts'))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const { type, label, value, active = true } = await req.json();

    if (!type || !label || !value) {
      return NextResponse.json({ success: false, message: "Type, label, and value are required" }, { status: 400 });
    }

    if (type !== "PHONE" && type !== "EMAIL") {
      return NextResponse.json({ success: false, message: "Type must be either PHONE or EMAIL" }, { status: 400 });
    }

    const id = `sc_${crypto.randomUUID().replace(/-/g, "")}`;

    await query(
      'INSERT INTO "SupportContact" ("id", "type", "label", "value", "active", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
      [id, type, label, value, active]
    );

    const adminId = await getAdminIdFromRequest(req);
    logAction({
        actorId: adminId,
        actorType: 'ADMIN',
        entity: 'SUPPORT_CONTACT',
        entityId: id,
        action: 'CREATE',
        oldData: null,
        newData: { type, label, value, active },
        description: `Admin created support contact (${label})`
    });

    return NextResponse.json({ success: true, message: "Support contact created successfully", id });
  } catch (error) {
    console.error("Error creating support contact:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!(await verifyAdminAuthWithPermission(req, 'edit_support_contacts'))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const { id, type, label, value, active } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, message: "ID is required for updates" }, { status: 400 });
    }

    // Verify contact exists
    const checkRes = await query<{ type: string, label: string, value: string, active: boolean }>('SELECT "type", "label", "value", "active" FROM "SupportContact" WHERE "id" = $1', [id]);
    if (checkRes.rowCount === 0) {
      return NextResponse.json({ success: false, message: "Support contact not found" }, { status: 404 });
    }
    const oldContact = checkRes.rows[0];

    // Update with values
    await query(
      'UPDATE "SupportContact" SET "type" = COALESCE($2, "type"), "label" = COALESCE($3, "label"), "value" = COALESCE($4, "value"), "active" = COALESCE($5, "active"), "updatedAt" = NOW() WHERE "id" = $1',
      [id, type, label, value, active]
    );

    const adminId = await getAdminIdFromRequest(req);
    logAction({
        actorId: adminId,
        actorType: 'ADMIN',
        entity: 'SUPPORT_CONTACT',
        entityId: id,
        action: 'UPDATE',
        oldData: oldContact,
        newData: { 
            type: type !== undefined ? type : oldContact.type, 
            label: label !== undefined ? label : oldContact.label, 
            value: value !== undefined ? value : oldContact.value, 
            active: active !== undefined ? active : oldContact.active 
        },
        description: `Admin updated support contact (${label || oldContact.label})`
    });

    return NextResponse.json({ success: true, message: "Support contact updated successfully" });
  } catch (error) {
    console.error("Error updating support contact:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await verifyAdminAuthWithPermission(req, 'delete_support_contacts'))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");

    if (!id) {
      // fallback to body
      try {
        const body = await req.json();
        id = body.id;
      } catch (e) {}
    }

    if (!id) {
      return NextResponse.json({ success: false, message: "ID is required" }, { status: 400 });
    }

    const checkRes = await query<{ label: string }>('SELECT "label" FROM "SupportContact" WHERE "id" = $1', [id]);
    const oldContact = checkRes.rows[0];

    const result = await query('DELETE FROM "SupportContact" WHERE "id" = $1', [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, message: "Support contact not found" }, { status: 404 });
    }

    const adminId = await getAdminIdFromRequest(req);
    logAction({
        actorId: adminId,
        actorType: 'ADMIN',
        entity: 'SUPPORT_CONTACT',
        entityId: id,
        action: 'DELETE',
        oldData: oldContact || null,
        description: `Admin deleted support contact (${oldContact?.label || id})`
    });

    return NextResponse.json({ success: true, message: "Support contact deleted successfully" });
  } catch (error) {
    console.error("Error deleting support contact:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
