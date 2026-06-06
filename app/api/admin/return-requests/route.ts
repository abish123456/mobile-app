import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";

export async function GET(req: NextRequest) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        // Optional filtering by status
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");

        let queryText = `
        SELECT 
            r.*,
            c."name" as "customerName",
            c."phone" as "customerPhone",
            dp."name" as "deliveryPartnerName",
            dp."phone" as "deliveryPartnerPhone"
        FROM "ReturnCanRequest" r
        JOIN "Customer" c ON c."id" = r."customerId"
        LEFT JOIN "DeliveryBoy" dp ON dp."id" = r."deliveryPartnerId"
    `;

        const params = [];
        if (status) {
            queryText += ` WHERE r."status" = $1`;
            params.push(status.toUpperCase());
        }

        queryText += ` ORDER BY r."createdAt" DESC`;

        const res = await query(queryText, params);

        return NextResponse.json({ success: true, requests: res.rows });

    } catch (error) {
        console.error("Error in GET /api/admin/return-requests:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
