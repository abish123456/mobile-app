import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query, withTransaction } from "../../../../lib/db";
import { getCustomerIdFromSession } from "../../../../lib/session-auth";

// GET /api/user/addresses - Fetch all addresses
export async function GET(req: NextRequest) {
    try {
        const customerId = await getCustomerIdFromSession();
        if (!customerId) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const result = await query(
            `SELECT * FROM "Address" 
             WHERE "customerId" = $1 AND "active" = true 
             ORDER BY "isDefault" DESC, "createdAt" DESC`,
            [customerId]
        );

        return NextResponse.json({ addresses: result.rows });
    } catch (error) {
        console.error("Error fetching addresses:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}

// POST /api/user/addresses - Add a new address
export async function POST(req: NextRequest) {
    try {
        const customerId = await getCustomerIdFromSession();
        if (!customerId) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const {
            nickname,
            contactName,
            contactPhone,
            line1,
            line2,
            area,
            city,
            pincode,
            landmark,
            latitude,
            longitude,
            isDefault
        } = await req.json();

        if (!contactPhone || contactPhone.toString().trim().length !== 10) {
            return NextResponse.json({ message: "Valid 10-digit contact phone is required" }, { status: 400 });
        }

        if (contactPhone.toString().trim().startsWith('0')) {
            return NextResponse.json({ message: "Contact phone cannot start with 0" }, { status: 400 });
        }

        // --- Server-Side Security & Data Integrity Checks ---

        // 1. Coordinate Validation
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        if (isNaN(lat) || isNaN(lng)) {
            return NextResponse.json({ message: "Invalid GPS coordinates. Please pin your location on the map." }, { status: 400 });
        }

        // 2. Service Area Validation (Gatekeeper)
        const serviceAreaRes = await query(
            `SELECT 1 FROM "ServiceArea" WHERE "pincode" = $1 AND "active" = true`,
            [pincode]
        );

        if (serviceAreaRes.rowCount === 0) {
            return NextResponse.json({
                message: `Pincode ${pincode} is not in our current service area.`,
                success: false
            }, { status: 400 });
        }

        const id = crypto.randomUUID();
        const now = new Date();

        await withTransaction(async (client) => {
            // If setting as default, unset other defaults
            if (isDefault) {
                await client.query(
                    `UPDATE "Address" SET "isDefault" = false WHERE "customerId" = $1`,
                    [customerId]
                );
            }

            // Check if this is the first address, if so, make it default regardless
            const countRes = await client.query(
                `SELECT COUNT(*) FROM "Address" WHERE "customerId" = $1`,
                [customerId]
            );
            const isFirst = parseInt(countRes.rows[0].count) === 0;

            await client.query(
                `INSERT INTO "Address" 
         ("id", "customerId", "nickname", "contactName", "contactPhone", 
           "line1", "line2", "area", "city", "pincode", "landmark", 
           "latitude", "longitude",
           "isDefault", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
                [
                    id,
                    customerId,
                    nickname || null,
                    contactName || null,
                    contactPhone || null,
                    line1,
                    line2 || null,
                    area,
                    city,
                    pincode,
                    landmark || null,
                    lat,
                    lng,
                    isFirst || isDefault || false,
                    now
                ]
            );
        });

        return NextResponse.json({ message: "Address added successfully", id });
    } catch (error) {
        console.error("Error adding address:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}

// PUT /api/user/addresses/:id is not traditionally possible in app router without config,
// but we can use searchParams or a dynamic route.
// I'll use a dynamic route if needed, but for now I'll use a single POST/PATCH handler or a separate file.
// Let's use a separate dynamic route file for clarity.
