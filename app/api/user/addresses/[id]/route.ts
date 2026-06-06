import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../lib/db";
import { getCustomerIdFromSession } from "../../../../../lib/session-auth";
import { randomUUID } from "crypto";

// PATCH /api/user/addresses/[id] - Update an address
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const customerId = await getCustomerIdFromSession();
        if (!customerId) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
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
        } = body;

        if (!contactPhone || contactPhone.toString().trim().length !== 10) {
            return NextResponse.json({ message: "Valid 10-digit contact phone is required" }, { status: 400 });
        }

        if (contactPhone.toString().trim().startsWith('0')) {
            return NextResponse.json({ message: "Contact phone cannot start with 0" }, { status: 400 });
        }

        const now = new Date();

        await withTransaction(async (client) => {
            // Check if address belongs to customer and is active
            const checkRes = await client.query(
                `SELECT "id" FROM "Address" WHERE "id" = $1 AND "customerId" = $2 AND "active" = true`,
                [id, customerId]
            );

            if (checkRes.rows.length === 0) {
                throw new Error("Address not found or unauthorized");
            }

            // CHECK IF ADDRESS IS USED IN ANY ORDERS
            const orderCheck = await client.query(
                `SELECT "id" FROM "Order" WHERE "addressId" = $1 LIMIT 1`,
                [id]
            );

            const isLinkedToOrders = orderCheck.rows.length > 0;

            // If setting as default, unset other defaults regardless of copy execution or update
            // Also, if this is the ONLY address, force it to be default
            const totalActiveRes = await client.query(
                `SELECT COUNT(*) FROM "Address" WHERE "customerId" = $1 AND "active" = true`,
                [customerId]
            );
            const isOnlyAddress = parseInt(totalActiveRes.rows[0].count) === 1;
            const finalIsDefault = isOnlyAddress ? true : isDefault;

            if (finalIsDefault) {
                await client.query(
                    `UPDATE "Address" SET "isDefault" = false WHERE "customerId" = $1`,
                    [customerId]
                );
            }

            if (isLinkedToOrders) {
                // COPY-ON-WRITE: Create NEW address, SOFT-DELETE old one

                // 1. Soft delete the old address (mark inactive, remove default status)
                // We keep it as active=false so history is preserved but it doesn't show up in UI
                await client.query(
                    `UPDATE "Address" 
                     SET "active" = false, "isDefault" = false 
                     WHERE "id" = $1`,
                    [id]
                );

                // 2. Create NEW address record
                await client.query(
                    `INSERT INTO "Address" (
                        "id", "customerId", "nickname", "contactName", "contactPhone", 
                        "line1", "line2", "area", "city", "pincode", "landmark", 
                        "latitude", "longitude",
                        "isDefault", "active", "createdAt", "updatedAt"
                    ) VALUES (
                        $1, $2, $3, $4, $5, 
                        $6, $7, $8, $9, $10, $11, 
                        $14, $15,
                        $12, true, $13, $13
                    )`,
                    [
                        randomUUID(), // Generate new UUID for the new address
                        customerId,
                        nickname || null, contactName || null, contactPhone || null,
                        line1, line2 || null, area, city, pincode, landmark || null,
                        finalIsDefault || false, // New address gets the intended default status
                        now,
                        latitude || null,
                        longitude || null
                    ]
                );

            } else {
                // NO LINKED ORDERS: Update in place
                await client.query(
                    `UPDATE "Address"
                     SET "nickname" = $1,
                         "contactName" = $2,
                         "contactPhone" = $3,
                         "line1" = $4,
                         "line2" = $5,
                         "area" = $6,
                         "city" = $7,
                         "pincode" = $8,
                         "landmark" = $9,
                         "latitude" = $14,
                         "longitude" = $15,
                         "isDefault" = $10,
                         "updatedAt" = $11
                     WHERE "id" = $12 AND "customerId" = $13`,
                    [
                        nickname || null, contactName || null, contactPhone || null,
                        line1, line2 || null, area, city, pincode, landmark || null,
                        finalIsDefault || false, now, id, customerId, latitude || null, longitude || null
                    ]
                );
            }
        });

        return NextResponse.json({ message: "Address updated successfully" });
    } catch (error: any) {
        console.error("Error updating address:", error);
        return NextResponse.json({ message: error.message || "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/user/addresses/[id] - Delete an address
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const customerId = await getCustomerIdFromSession();
        if (!customerId) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        await withTransaction(async (client) => {
            // Check if address belongs to customer and is active
            const checkRes = await client.query(
                `SELECT "isDefault" FROM "Address" WHERE "id" = $1 AND "customerId" = $2 AND "active" = true`,
                [id, customerId]
            );

            if (checkRes.rows.length === 0) {
                throw new Error("Address not found or unauthorized");
            }

            const wasDefault = checkRes.rows[0].isDefault;

            // Soft delete address
            await client.query(
                `UPDATE "Address" SET "active" = false, "isDefault" = false WHERE "id" = $1 AND "customerId" = $2`,
                [id, customerId]
            );

            // If we deleted the default address, make the most recent active one default
            if (wasDefault) {
                await client.query(
                    `UPDATE "Address"
           SET "isDefault" = true
           WHERE "id" = (
             SELECT "id" FROM "Address" 
             WHERE "customerId" = $1 AND "active" = true
             ORDER BY "createdAt" DESC 
             LIMIT 1
           )`,
                    [customerId]
                );
            }
        });

        return NextResponse.json({ message: "Address deleted successfully" });
    } catch (error: any) {
        console.error("Error deleting address:", error);
        return NextResponse.json({ message: error.message || "Internal server error" }, { status: 500 });
    }
}
