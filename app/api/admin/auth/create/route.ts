import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { hashPasswordForStorage } from "../../../../../lib/admin-auth";
import crypto from "crypto";

// POST /api/admin/auth/create - Create new admin (protected endpoint)
// TODO: Protect this endpoint - only super admin should create admins
// For now, you can manually create admins via SQL or script
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, username, password, name } = body;

    if (!email || !username || !password) {
      return NextResponse.json(
        { success: false, message: "Email, username, and password are required" },
        { status: 400 }
      );
    }

    // Check if admin already exists
    const existingRes = await query<{ id: string }>(
      `SELECT "id" FROM "Admin" WHERE "email" = $1 OR "username" = $2`,
      [email, username]
    );

    if (existingRes.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: "Admin with this email or username already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = hashPasswordForStorage(password);
    const adminId = crypto.randomUUID();

    // Create admin
    await query(
      `INSERT INTO "Admin" ("id", "email", "username", "passwordHash", "name", "active", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [adminId, email, username, passwordHash, name || null, true]
    );

    return NextResponse.json({
      success: true,
      message: "Admin created successfully",
      admin: {
        id: adminId,
        email,
        username,
        name: name || null,
      },
    });
  } catch (error: any) {
    console.error("Error creating admin:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

