import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../../lib/admin-auth";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: routeId } = await params;

        // 1. Verify admin authentication
        const admin = await verifyAdminAuth(req);
        if (!admin) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        // 2. Parse request body
        const body = await req.json();
        const { orderIds } = body;

        if (!orderIds || !Array.isArray(orderIds)) {
            return NextResponse.json(
                { success: false, message: "Invalid request body: orderIds is required and must be an array" },
                { status: 400 }
            );
        }

        // 3. Update sequences in a transaction
        await withTransaction(async () => {
            for (let i = 0; i < orderIds.length; i++) {
                const orderId = orderIds[i];
                await query(
                    `UPDATE "RouteOrder" 
           SET "sequence" = $1, "updatedAt" = NOW() 
           WHERE "routeId" = $2 AND "orderId" = $3`,
                    [i, routeId, orderId]
                );
            }
        });

        return NextResponse.json({
            success: true,
            message: "Order sequence updated successfully"
        });
    } catch (error) {
        console.error("Error in POST /api/admin/routes/[id]/reorder:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
