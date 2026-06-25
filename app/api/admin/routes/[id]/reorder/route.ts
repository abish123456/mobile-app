import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse, getAdminIdFromRequest } from "../../../../../../lib/admin-auth";
import { logAction } from "../../../../../../lib/audit";

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
        
        const adminId = await getAdminIdFromRequest(req);

        // 2. Parse request body
        const body = await req.json();
        const { orderIds } = body;

        if (!orderIds || !Array.isArray(orderIds)) {
            return NextResponse.json(
                { success: false, message: "Invalid request body: orderIds is required and must be an array" },
                { status: 400 }
            );
        }

        // Fetch current sequence & route name for logging
        const routeInfoRes = await query<{ routeName: string }>(
            `SELECT sr."name" as "routeName"
             FROM "Route" r
             JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
             WHERE r."id" = $1`,
            [routeId]
        );
        const routeName = routeInfoRes.rows.length > 0 ? routeInfoRes.rows[0].routeName : "Unknown Route";

        const ordersRes = await query<{
            orderId: string;
            orderNumber: string;
            sequence: number;
        }>(
            `SELECT ro."orderId", o."orderNumber", ro."sequence"
             FROM "RouteOrder" ro
             JOIN "Order" o ON o."id" = ro."orderId"
             WHERE ro."routeId" = $1 AND ro."orderId" = ANY($2::text[])`,
            [routeId, orderIds]
        );

        const oldSequenceArray = [...ordersRes.rows]
            .sort((a, b) => a.sequence - b.sequence)
            .map(row => `${row.sequence + 1}. #${row.orderNumber}`);

        const orderNumberMap = new Map(ordersRes.rows.map(r => [r.orderId, r.orderNumber]));
        const newSequenceArray = orderIds.map((id, index) => {
            const num = orderNumberMap.get(id);
            return num ? `${index + 1}. #${num}` : `${index + 1}. Unknown`;
        });

        // 3. Update sequences in a transaction
        await withTransaction(async () => {
            for (let i = 0; i < orderIds.length; i++) {
                const orderId = orderIds[i];
                await query(
                    `UPDATE "RouteOrder" 
           SET "sequence" = $1, "updatedAt" = NOW() 
           WHERE "routeId" = $2 AND "orderId" = $3`,
                    [i + 1, routeId, orderId]
                );
            }
        });

        // 4. Log the action
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'ROUTE',
            entityId: routeId,
            action: 'UPDATE',
            oldData: { previousSequence: oldSequenceArray },
            newData: { manualSequence: newSequenceArray },
            description: `Manually reordered delivery sequences for ${orderIds.length} orders in ${routeName}.`
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
