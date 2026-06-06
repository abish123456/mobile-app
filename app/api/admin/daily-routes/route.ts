import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import crypto from "crypto";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST } from "../../../../lib/timezone";
import { getNextWorkingDay } from "../../../../lib/holidays";

// POST /api/admin/daily-routes - Create or Update a Daily Route Assignment
export async function POST(req: NextRequest) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const body = await req.json();
        const { serviceRouteId, deliveryBoyId, date } = body;

        if (!serviceRouteId || !date) {
            return NextResponse.json(
                { success: false, message: "Service Route and Date are required" },
                { status: 400 }
            );
        }

        // deliveryBoyId can be null if unassigning
        const routeDate = getStartOfDayIST(new Date(date));
        
        // --- HOLIDAY LOGIC START ---
        const holidayCheck = await getNextWorkingDay(routeDate);
        if (holidayCheck.adjusted) {
            return NextResponse.json(
                { 
                    success: false, 
                    message: `Cannot create route for ${routeDate.toLocaleDateString('en-IN')}. It is a marked holiday or weekly off-day.` 
                },
                { status: 400 }
            );
        }
        // --- HOLIDAY LOGIC END ---

        const startOfDay = getStartOfDayIST(routeDate);
        const endOfDay = getEndOfDayIST(routeDate);

        // Check if a route exists for this ServiceRoute + Date (Range based, timezone safe)
        const existingRoute = await query<{ id: string, token: string | null, deliveryBoyId: string }>(
            `SELECT "id", "token", "deliveryBoyId" FROM "Route" 
       WHERE "serviceRouteId" = $1 
         AND "date" >= $2 
         AND "date" < $3`,
            [serviceRouteId, startOfDay, endOfDay]
        );

        let routeId;
        let isNewRoute = false;

        if (existingRoute.rows.length > 0) {
            // Update existing
            const route = existingRoute.rows[0];
            routeId = route.id;

            if (deliveryBoyId) {
                // If token exists, do NOT allow changing deliveryBoyId
                if (route.token && route.deliveryBoyId !== deliveryBoyId) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: "Cannot change delivery staff after magic link is generated."
                        },
                        { status: 400 }
                    );
                }

                // Assign/Reassign
                await query(
                    `UPDATE "Route"
            SET "deliveryBoyId" = $1, "updatedAt" = NOW()
            WHERE "id" = $2`,
                    [deliveryBoyId, routeId]
                );
            } else {
                // Delete if unassigning
                await query(`DELETE FROM "Route" WHERE "id" = $1`, [routeId]);
                return NextResponse.json({
                    success: true,
                    message: "Route assignment removed",
                    removed: true
                });
            }
        } else {
            // Create new
            if (!deliveryBoyId) {
                return NextResponse.json(
                    { success: false, message: "Delivery staff is required for new assignment" },
                    { status: 400 }
                );
            }

            isNewRoute = true;
            routeId = crypto.randomUUID();
            await query(
                `INSERT INTO "Route" ("id", "date", "serviceRouteId", "deliveryBoyId", "token", "tokenExpiresAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NULL, NULL, NOW(), NOW())`,
                [routeId, routeDate, serviceRouteId, deliveryBoyId]
            );
        }

        // Update ServiceRoute's current staff to this delivery boy for carry-forward logic
        if (deliveryBoyId) {
            await query(
                `UPDATE "ServiceRoute" SET "currentDeliveryBoyId" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
                [deliveryBoyId, serviceRouteId]
            );
        }

        // Handle order assignment based on whether this is a new route or update

        // Get all pincodes for this service route
        const pincodesRes = await query<{ pincode: string }>(
            `SELECT "pincode" FROM "ServiceArea" WHERE "serviceRouteId" = $1 AND "active" = true`,
            [serviceRouteId]
        );

        let assignedCount = 0;

        if (pincodesRes.rows.length > 0) {
            const pincodes = pincodesRes.rows.map(r => r.pincode);

            if (!isNewRoute && existingRoute.rows.length > 0) {
                // For existing routes (reassignment), just count the orders already on this route
                // The Route.deliveryBoyId update (line 54-59) already reassigns them to the new staff
                const existingOrdersRes = await query<{ count: string }>(
                    `SELECT COUNT(DISTINCT ro."orderId") as count
                     FROM "RouteOrder" ro
                     JOIN "Route" r ON r."id" = ro."routeId"
                     JOIN "Order" o ON o."id" = ro."orderId"
                     WHERE r."id" = $1
                       AND ro."deliveryStatus" != 'NOT_DELIVERED'
                       AND o."status" != 'CANCELLED'`,
                    [routeId]
                );
                assignedCount = parseInt(existingOrdersRes.rows[0]?.count || '0');
            }

            // Find ALL unassigned orders for this service route (Area) across ALL dates
            const pendingOrdersRes = await query<{ id: string }>(
                `SELECT DISTINCT o."id"
         FROM "Order" o
         JOIN "Address" a ON a."id" = o."addressId"
         WHERE a."pincode" = ANY($1::text[])
           AND (o."paymentStatus" = 'SUCCESS' OR o."paymentStatus" = 'COD')
           AND o."status" IN ('PENDING', 'CONFIRMED')
           AND o."status" NOT IN ('CANCELLED', 'DELIVERED', 'NOT_DELIVERED')
           AND NOT EXISTS (
             SELECT 1 FROM "RouteOrder" ro 
             WHERE ro."orderId" = o."id" 
             AND ro."deliveryStatus" != 'NOT_DELIVERED'
           )`,
                [pincodes]
            );

            // Import the shared assignment function
            const { assignOrderToRoute } = await import("../../../../lib/order-assignment");

            // Assign each unassigned order using the shared function
            let newlyAssigned = 0;
            for (const orderRow of pendingOrdersRes.rows) {
                try {
                    const result = await assignOrderToRoute(orderRow.id);
                    if (result.success && !result.alreadyAssigned) {
                        newlyAssigned++;
                    }
                } catch (err) {
                    console.error(`Failed to assign order ${orderRow.id}:`, err);
                }
            }

            // For new routes, count newly assigned. For updates, add newly assigned to existing count
            if (isNewRoute) {
                assignedCount = newlyAssigned;
            } else {
                assignedCount += newlyAssigned;
            }
        }

        return NextResponse.json({
            success: true,
            message: isNewRoute
                ? `Daily route created and ${assignedCount} order(s) assigned`
                : `Daily route updated${assignedCount > 0 ? ` with ${assignedCount} order(s)` : ''}`,
            routeId,
            assignedOrders: assignedCount
        });

    } catch (error: any) {
        console.error("Error in POST /api/admin/daily-routes:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
