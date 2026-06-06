import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    // 1. Verify Admin Authentication
    const isAuthorized = await verifyAdminAuth(req);
    if (!isAuthorized) {
        return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    try {
        const body = await req.json();
        const rawPhone = (body?.phone ?? "").toString().trim();
        const name = (body?.name ?? "").toString().trim();
        const cansInHand = parseInt(body?.cansInHand) || 0;
        const depositWalletBalance = parseFloat(body?.depositWalletBalance) || 0;

        // Ensure phone has +91 prefix
        let phone = rawPhone;
        if (/^\d{10}$/.test(rawPhone)) {
            phone = `+91${rawPhone}`;
        }

        // 2. Validate Input
        // Check if phone matches +91 followed by 10 digits
        if (!phone || !/^\+91\d{10}$/.test(phone)) {
            return NextResponse.json(
                { success: false, message: "Invalid phone number. Must be 10 digits." },
                { status: 400 }
            );
        }

        // 3. Check for Existing User
        // We check both active and inactive users. 
        // If inactive, we could reactivate, but for now let's just properly report existence.
        const existingRes = await query(
            `SELECT "id", "active" FROM "Customer" WHERE "phone" = $1`,
            [phone]
        );

        if (existingRes.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "User with this phone number already exists." },
                { status: 409 }
            );
        }

        // 4. Create New User
        const newCustomerId = crypto.randomUUID();
        const now = new Date();

        const insertRes = await query(
            `INSERT INTO "Customer" ("id", "phone", "name", "active", "createdAt", "updatedAt", "cansInHand", "depositWalletBalance")
       VALUES ($1, $2, $3, true, $4, $4, $5, $6)
       RETURNING "id", "phone", "name", "cansInHand", "depositWalletBalance"`,
            [newCustomerId, phone, name || null, now, cansInHand, depositWalletBalance]
        );

        const newUser = insertRes.rows[0];

        return NextResponse.json({
            success: true,
            message: "User created successfully",
            user: newUser
        });

    } catch (error) {
        console.error("[Create User] Error:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
