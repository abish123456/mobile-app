import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { query } from "../../../../lib/db";
import { createSecureResponse } from "../../../../lib/security-headers";

export async function GET(req: NextRequest) {
    try {
        const headersList = await headers();
        const authHeader = headersList.get('authorization') || '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        const cookieStore = await cookies();
        const cookieToken = cookieStore.get("sessionData")?.value;

        const sessionToken = bearerToken || cookieToken;

        if (!sessionToken) {
            return createSecureResponse(
                { success: false, message: "No session found" },
                { status: 401 }
            );
        }

        // Query session and customer details with address
        // We select the default address or active address
        const sessionRes = await query(
            `SELECT s.*, 
                    c.id as customer_id, c.name, c.phone, c."depositWalletBalance" as "depositAmount", c."cansInHand", c."active",
                    a."line1" as "addressLine", a.area, a.city, a.pincode
             FROM "UserSession" s
             JOIN "Customer" c ON s."customerId" = c.id
             LEFT JOIN "Address" a ON c.id = a."customerId" AND a."isDefault" = true
             WHERE s.token = $1 AND c.active = true`,
            [sessionToken]
        );

        const sessionData = sessionRes.rows[0];

        if (!sessionData) {
            return createSecureResponse(
                { success: false, message: "Invalid session" },
                { status: 401 }
            );
        }

        // Check expiration
        if (new Date(sessionData.expiresAt) < new Date()) {
            await query('DELETE FROM "UserSession" WHERE id = $1', [sessionData.id]);
            return createSecureResponse(
                { success: false, message: "Session expired" },
                { status: 401 }
            );
        }

        // Map flat result to nested object structure expected by frontend
        const customer = {
            id: sessionData.customer_id,
            name: sessionData.name,
            phone: sessionData.phone,
            addressLine: sessionData.addressLine,
            area: sessionData.area,
            city: sessionData.city,
            pincode: sessionData.pincode,
            depositAmount: sessionData.depositAmount,
            cansInHand: sessionData.cansInHand,
        };

        const isNewUser = !customer.name;

        return createSecureResponse({
            success: true,
            customer,
            isNewUser,
        });
    } catch (error) {
        console.error("Session check error:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}

