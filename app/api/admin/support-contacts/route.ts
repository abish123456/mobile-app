import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";
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
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
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
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
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

    return NextResponse.json({ success: true, message: "Support contact created successfully", id });
  } catch (error) {
    console.error("Error creating support contact:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { id, type, label, value, active } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, message: "ID is required for updates" }, { status: 400 });
    }

    // Verify contact exists
    const checkRes = await query('SELECT "id" FROM "SupportContact" WHERE "id" = $1', [id]);
    if (checkRes.rowCount === 0) {
      return NextResponse.json({ success: false, message: "Support contact not found" }, { status: 404 });
    }

    // Update with values
    await query(
      'UPDATE "SupportContact" SET "type" = COALESCE($2, "type"), "label" = COALESCE($3, "label"), "value" = COALESCE($4, "value"), "active" = COALESCE($5, "active"), "updatedAt" = NOW() WHERE "id" = $1',
      [id, type, label, value, active]
    );

    return NextResponse.json({ success: true, message: "Support contact updated successfully" });
  } catch (error) {
    console.error("Error updating support contact:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
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

    const result = await query('DELETE FROM "SupportContact" WHERE "id" = $1', [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, message: "Support contact not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Support contact deleted successfully" });
  } catch (error) {
    console.error("Error deleting support contact:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
