import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "@/lib/admin-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { deliveryPartnerId } = body;

        if (!deliveryPartnerId) {
            return NextResponse.json({ message: "Delivery Partner ID is required" }, { status: 400 });
        }

        // Check request exists
        const requestRes = await query(`SELECT "id", "status" FROM "ReturnCanRequest" WHERE "id" = $1`, [id]);
        if (requestRes.rows.length === 0) {
            return NextResponse.json({ message: "Request not found" }, { status: 404 });
        }

        // Check partner exists
        const partnerRes = await query(`SELECT "id" FROM "DeliveryBoy" WHERE "id" = $1`, [deliveryPartnerId]);
        if (partnerRes.rows.length === 0) {
            return NextResponse.json({ message: "Delivery Partner not found" }, { status: 404 });
        }

        await query(
            `UPDATE "ReturnCanRequest" 
         SET "status" = 'ASSIGNED', "deliveryPartnerId" = $1, "approvedAt" = NOW(), "updatedAt" = NOW()
         WHERE "id" = $2`,
            [deliveryPartnerId, id]
        );

        return NextResponse.json({ success: true, message: "Request approved and assigned" });

    } catch (error) {
        console.error("Error in POST /api/admin/return-requests/approve:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
