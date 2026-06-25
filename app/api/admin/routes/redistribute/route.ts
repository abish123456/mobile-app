import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import crypto from "crypto";
import { logAction } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
    try {
        // 1. Verify Admin Session
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const adminId = await getAdminIdFromRequest(req);

        const body = await req.json();
        const { sourceRouteId, targetRouteId, orderIds } = body;

        if (!sourceRouteId || !targetRouteId || !orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return NextResponse.json(
                { success: false, message: "Source Route, Target Route, and at least one Order ID are required." },
                { status: 400 }
            );
        }

        const routeInfoRes = await query<{ id: string, routeName: string, deliveryBoyName: string, date: Date, token: string | null }>(
            `SELECT r."id", sr."name" as "routeName", db."name" as "deliveryBoyName", r."date", r."token"
             FROM "Route" r
             JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
             LEFT JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
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

        const { routeName: sourceRouteName, deliveryBoyName: sourceStaff } = sourceInfo!;
        const { routeName: targetRouteName, deliveryBoyName: targetStaff, date: targetDate } = targetInfo!;
        const targetDateStr = new Date(targetDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

        // 3. Execution using Transaction
        const { movedCount, successfullyMovedOrderIds, movedUUIDs } = await withTransaction(async (client) => {
            let count = 0;
            const movedIds: string[] = [];
            const movedUUIDArray: string[] = [];
            const currentDate = new Date();

            for (const orderId of orderIds) {
                // Check if the order is actually in the source route and is pending
                const checkRes = await client.query(
                    `SELECT ro."id", db."name" as "sourceStaff", o."status" as "currentStatus", o."orderNumber"
                     FROM "RouteOrder" ro
                     JOIN "Route" r ON ro."routeId" = r."id"
                     JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
                     JOIN "Order" o ON ro."orderId" = o."id"
                     WHERE ro."orderId" = $1 AND ro."routeId" = $2 AND ro."deliveryStatus" = 'PENDING'`,
                    [orderId, sourceRouteId]
                );

                if (checkRes.rows.length > 0) {
                    const { sourceStaff, currentStatus, orderNumber } = checkRes.rows[0];

                    // A. Update RouteOrder to the new route and reset sequence
                    await client.query(
                        `UPDATE "RouteOrder" 
                         SET "routeId" = $1, "sequence" = 0, "updatedAt" = $4 
                         WHERE "orderId" = $2 AND "routeId" = $3`,
                        [targetRouteId, orderId, sourceRouteId, currentDate]
                    );

                    // B. Add Activity Log for the order
                    await client.query(
                        `INSERT INTO "OrderActivityLog" ("id", "orderId", "action", "description", "metadata", "createdAt")
                         VALUES ($1, $2, $3, $4, $5, $6)`,
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
                            }),
                            currentDate
                        ]
                    );

                    // C. Ensure Order status is CONFIRMED (in case it was PENDING)
                    await client.query(
                        `UPDATE "Order" SET "status" = 'CONFIRMED', "updatedAt" = $2 
                         WHERE "id" = $1 AND "status" = 'PENDING'`,
                        [orderId, currentDate]
                    );

                    count++;
                    movedIds.push(orderNumber ? `#${orderNumber}` : `#${orderId.substring(0, 8)}`);
                    movedUUIDArray.push(orderId);
                }
            }

            return { movedCount: count, successfullyMovedOrderIds: movedIds, movedUUIDs: movedUUIDArray };
        });

        // 4. Create log entries
        if (movedCount > 0) {
            // Bulk Route log
            logAction({
                actorId: adminId,
                actorType: 'ADMIN',
                entity: 'ROUTE',
                entityId: sourceRouteId,
                action: 'UPDATE',
                oldData: { targetRouteId: null, movedOrders: [] },
                newData: { targetRouteId: targetRouteId, movedOrders: successfullyMovedOrderIds },
                description: `Bulk redistributed ${movedCount} orders from ${sourceRouteName} to ${targetRouteName}`
            });

            // Individual Order logs
            for (const orderId of movedUUIDs) {
                logAction({
                    actorId: adminId,
                    actorType: 'ADMIN',
                    entity: 'ORDER',
                    entityId: orderId,
                    action: 'UPDATE',
                    oldData: { routeId: sourceRouteId, deliveryBoy: sourceStaff || null },
                    newData: { routeId: targetRouteId, deliveryBoy: targetStaff || null },
                    description: `Order reassigned from ${sourceRouteName} to ${targetRouteName} (Delivery staff: ${targetStaff}).`
                });
            }
        }

        return NextResponse.json({
            success: true,
            message: `Successfully moved ${movedCount} orders to ${targetStaff}.`,
            movedCount: movedCount
        });

    } catch (error) {
        console.error("Error in redistribution API:", error);
        return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
    }
}


