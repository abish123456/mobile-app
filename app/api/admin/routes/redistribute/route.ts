
import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    try {
        // 1. Verify Admin Session
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const body = await req.json();
        const { sourceRouteId, targetRouteId, orderIds } = body;

        if (!sourceRouteId || !targetRouteId || !orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return NextResponse.json(
                { success: false, message: "Source Route, Target Route, and at least one Order ID are required." },
                { status: 400 }
            );
        }

        // 2. Fetch details about routes for logging and safety checks
        const routeInfoRes = await query<{ id: string, deliveryBoyName: string, date: Date, token: string | null }>(
            `SELECT r."id", db."name" as "deliveryBoyName", r."date", r."token"
             FROM "Route" r
             JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
             WHERE r."id" IN ($1, $2)`,
            [sourceRouteId, targetRouteId]
        );

        if (routeInfoRes.rows.length < 2) {
            // Check if source and target are the same (which is invalid anyway)
            if (sourceRouteId === targetRouteId) {
                return NextResponse.json({ success: false, message: "Source and target route cannot be the same." }, { status: 400 });
            }
            return NextResponse.json({ success: false, message: "One or both routes not found." }, { status: 404 });
        }

        const sourceInfo = routeInfoRes.rows.find(r => r.id === sourceRouteId);
        const targetInfo = routeInfoRes.rows.find(r => r.id === targetRouteId);

        // Safety Check: Block move if link is already generated
        if (sourceInfo?.token) {
            return NextResponse.json({ success: false, message: "Cannot move orders from a route that already has a generated link." }, { status: 400 });
        }
        if (targetInfo?.token) {
            return NextResponse.json({ success: false, message: "Cannot move orders to a route that already has a generated link." }, { status: 400 });
        }

        const { deliveryBoyName: targetStaff, date: targetDate } = targetInfo!;
        const targetDateStr = new Date(targetDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

        // 3. Execution using Transaction
        const result = await withTransaction(async (client) => {
            let movedCount = 0;

            for (const orderId of orderIds) {
                // Check if the order is actually in the source route and is pending
                const checkRes = await client.query(
                    `SELECT ro."id", db."name" as "sourceStaff"
                     FROM "RouteOrder" ro
                     JOIN "Route" r ON ro."routeId" = r."id"
                     JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
                     WHERE ro."orderId" = $1 AND ro."routeId" = $2 AND ro."deliveryStatus" = 'PENDING'`,
                    [orderId, sourceRouteId]
                );

                if (checkRes.rows.length > 0) {
                    const { sourceStaff } = checkRes.rows[0];

                    // A. Update RouteOrder to the new route and reset sequence
                    await client.query(
                        `UPDATE "RouteOrder" 
                         SET "routeId" = $1, "sequence" = 0, "updatedAt" = NOW() 
                         WHERE "orderId" = $2 AND "routeId" = $3`,
                        [targetRouteId, orderId, sourceRouteId]
                    );

                    // B. Add Activity Log for the order
                    await client.query(
                        `INSERT INTO "OrderActivityLog" ("id", "orderId", "action", "description", "metadata", "createdAt")
                         VALUES ($1, $2, $3, $4, $5, NOW())`,
                        [
                            crypto.randomUUID(),
                            orderId,
                            'REASSIGNED',
                            `Bulk moved from ${sourceStaff} to ${targetStaff} (${targetDateStr}) by Admin redistribution.`,
                            JSON.stringify({
                                action: 'REDISTRIBUTION',
                                fromRoute: sourceRouteId,
                                toRoute: targetRouteId,
                                fromStaff: sourceStaff,
                                toStaff: targetStaff
                            })
                        ]
                    );

                    // C. Ensure Order status is CONFIRMED (in case it was PENDING)
                    await client.query(
                        `UPDATE "Order" SET "status" = 'CONFIRMED', "updatedAt" = NOW() 
                         WHERE "id" = $1 AND "status" = 'PENDING'`,
                        [orderId]
                    );

                    movedCount++;
                }
            }

            return movedCount;
        });

        return NextResponse.json({
            success: true,
            message: `Successfully moved ${result} orders to ${targetStaff}.`,
            movedCount: result
        });

    } catch (error) {
        console.error("Error in redistribution API:", error);
        return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
    }
}


