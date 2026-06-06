import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";

// Helper to extract phone from Authorization header
function getPhoneFromAuth(req: NextRequest): string | null {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }
    return authHeader.substring(7).trim();
}

// GET - Check if customer has pending deposit verification requests
export async function GET(req: NextRequest) {
    try {
        const phone = getPhoneFromAuth(req);

        if (!phone) {
            return NextResponse.json(
                { success: false, message: "Authentication required" },
                { status: 401 }
            );
        }

        // Get customer ID from phone
        const customerRes = await query<{ id: string }>(
            `SELECT "id" FROM "Customer" WHERE "phone" = $1`,
            [phone]
        );

        if (customerRes.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Customer not found" },
                { status: 404 }
            );
        }

        const customerId = customerRes.rows[0].id;

        // Check for pending deposit verification requests
        const pendingRes = await query<{ count: number }>(
            `SELECT COUNT(*)::int as count
       FROM "DepositVerificationRequest"
       WHERE "customerId" = $1 AND "status" = 'PENDING'`,
            [customerId]
        );

        const hasPendingRequests = (pendingRes.rows[0]?.count || 0) > 0;

        return NextResponse.json({
            success: true,
            hasPendingDeposit: hasPendingRequests,
            canCheckout: !hasPendingRequests,
        });
    } catch (error) {
        console.error("Error in GET /api/deposit-verifications/status:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
