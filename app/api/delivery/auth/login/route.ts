import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_development_only";

export async function POST(req: Request) {
  const bcrypt = require("bcryptjs");
  const jwt = require("jsonwebtoken");
  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, message: "Username/Email and password are required" },
        { status: 400 }
      );
    }

    // Find the Admin user by email or username using raw SQL
    const adminRes = await query(
      `SELECT a.*,
        (SELECT json_agg(ar."name")
         FROM "AdminRole" ar
         JOIN "_AdminToAdminRole" atr ON ar.id = atr."B"
         WHERE atr."A" = a."id"
        ) as "roleNames"
       FROM "Admin" a
       WHERE (a."email" = $1 OR a."username" = $1) AND a."active" = true
       LIMIT 1`,
      [identifier]
    );

    if (adminRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    const admin = adminRes.rows[0];

    // The database uses SHA-256 hashing for passwords, not bcrypt!
    const crypto = require("crypto");
    const hashedInputPassword = crypto.createHash("sha256").update(password).digest("hex");
    const isPasswordValid = (hashedInputPassword === admin.passwordHash);

    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    const roleNames = admin.roleNames || [];

    // Check role to ensure they are delivery staff
    if (!roleNames.includes("Delivery Staff")) {
      return NextResponse.json(
        { success: false, message: "Access denied. Only Delivery Staff can log in here." },
        { status: 403 }
      );
    }

    // Fetch linked delivery boy profiles
    const profilesRes = await query(
      `SELECT * FROM "DeliveryBoy" WHERE "adminId" = $1`,
      [admin.id]
    );
    const deliveryBoyProfiles = profilesRes.rows;

    // Ensure they have a linked DeliveryBoy profile
    if (deliveryBoyProfiles.length === 0) {
      return NextResponse.json(
        { success: false, message: "No Delivery Boy profile linked to this account. Please contact the administrator." },
        { status: 403 }
      );
    }

    // Assume one-to-many relationship but we just grab the first active one
    const activeProfile = deliveryBoyProfiles.find(p => p.active);
    if (!activeProfile) {
      return NextResponse.json(
        { success: false, message: "Your delivery profile is currently inactive." },
        { status: 403 }
      );
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        adminId: admin.id,
        deliveryBoyId: activeProfile.id,
        roles: roleNames,
      },
      JWT_SECRET,
      { expiresIn: "7d" } // Token expires in 7 days
    );

    return NextResponse.json({
      success: true,
      token,
      profile: {
        id: activeProfile.id,
        name: activeProfile.name,
        phone: activeProfile.phone,
        email: admin.email,
        username: admin.username
      }
    });
  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
