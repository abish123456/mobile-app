import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, verifyAdminAuthWithPermission, getAdminAuthErrorResponse, getAdminPermissionErrorResponse } from "../../../../../lib/admin-auth";
import crypto from "crypto";
import { getStartOfDayIST, getEndOfDayIST, getNowIST } from "../../../../../lib/timezone";
import { getNextWorkingDay } from "../../../../../lib/holidays";
import { getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import { logAction } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
    try {
        const hasChangeOrderRoute = await verifyAdminAuthWithPermission(req, "change_order_route");
        const hasReassignExceptions = await verifyAdminAuthWithPermission(req, "reassign_delivery_exceptions");

        if (!hasChangeOrderRoute && !hasReassignExceptions) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const body = await req.json();
        const { orderId, deliveryBoyId, newDate } = body;

        if (!orderId) {
            return NextResponse.json(
                { success: false, message: "Order ID is required" },
                { status: 400 }
            );
        }

        // 1. Get Order Details and Current Status
        const orderRes = await query<{
            id: string;
            deliveryDate: Date;
            status: string;
            pincode: string;
            area: string;
        }>(
            `SELECT o."id", o."deliveryDate", o."status", a."pincode", a."area"
       FROM "Order" o
       LEFT JOIN "Address" a ON o."addressId" = a."id"
       WHERE o."id" = $1`,
            [orderId]
        );

        if (orderRes.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Order not found" },
                { status: 404 }
            );
        }

        const order = orderRes.rows[0];

        // Block reassignment for terminal statuses
        if (order.status === 'CANCELLED' || order.status === 'DELIVERED') {
            return NextResponse.json(
                { success: false, message: `Cannot reassign an order that is already ${order.status.toLowerCase()}` },
                { status: 400 }
            );
        }

        const today = getStartOfDayIST(getNowIST());

        // Determine effective delivery date
        let effectiveDate = getStartOfDayIST(new Date(order.deliveryDate));
        
        if (newDate) {
            effectiveDate = getStartOfDayIST(new Date(newDate));
        }

        // --- HOLIDAY LOGIC START ---
        // Ensure the target date is a working day
        const holidayCheck = await getNextWorkingDay(effectiveDate);
        if (holidayCheck.adjusted) {
            effectiveDate = holidayCheck.date;
        }
        // --- HOLIDAY LOGIC END ---

        // 2. Prevent reassigning to past dates
        if (effectiveDate < today) {
            return NextResponse.json(
                { success: false, message: "Cannot reassign to a past date. Please select a valid date." },
                { status: 400 }
            );
        }

        const startOfDay = getStartOfDayIST(effectiveDate);
        const endOfDay = getEndOfDayIST(effectiveDate);

        // 3. New Check: Block reassignment if target route for "Today" is already "Live"
        // This mirrors the logic in the Reschedule API
        if (effectiveDate.getTime() === today.getTime()) {
            const liveRouteCheck = await query<{ id: string }>(
                `SELECT r."id"
                 FROM "Route" r
                 JOIN "ServiceArea" sa ON sa."serviceRouteId" = r."serviceRouteId"
                 WHERE sa."pincode" = $1 
                   AND r."date" >= $2
                   AND r."date" < $3
                   AND r."token" IS NOT NULL
                   AND (r."tokenExpiresAt" IS NULL OR r."tokenExpiresAt" > NOW())
                 LIMIT 1`,
                [order.pincode, startOfDay, endOfDay]
            );

            if (liveRouteCheck.rowCount > 0) {
                return NextResponse.json(
                    { 
                        success: false, 
                        message: "Cannot reassign to Today - the delivery link for this route is already live (generated and not expired)." 
                    },
                    { status: 400 }
                );
            }
        }

        // 4. Find the ServiceRoute and its default staff for this pincode
        const serviceRouteRes = await query<{ serviceRouteId: string; currentDeliveryBoyId: string }>(
            `SELECT sa."serviceRouteId", sr."currentDeliveryBoyId"
             FROM "ServiceArea" sa
             JOIN "ServiceRoute" sr ON sa."serviceRouteId" = sr."id"
             WHERE sa."pincode" = $1 AND sa."active" = true`,
            [order.pincode]
        );

        if (serviceRouteRes.rows.length === 0 || !serviceRouteRes.rows[0].serviceRouteId) {
            return NextResponse.json(
                { success: false, message: "No service route configured for this pincode" },
                { status: 400 }
            );
        }

        const { serviceRouteId, currentDeliveryBoyId: defaultDeliveryBoyId } = serviceRouteRes.rows[0];

        // Determine who should be assigned: override from request OR default from service route
        const preferredDeliveryBoyId = deliveryBoyId || defaultDeliveryBoyId;

        // Pre-fetch current assignment for logging BEFORE we potentially delete/change it
        const currentAssignmentRes = await query<{ id: string; routeId: string; deliveryBoyName: string; routeDate: Date }>(
            `SELECT ro."id", ro."routeId", db."name" as "deliveryBoyName", r."date" as "routeDate"
             FROM "RouteOrder" ro
             JOIN "Route" r ON ro."routeId" = r."id"
             JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
             WHERE ro."orderId" = $1 AND ro."deliveryStatus" = 'PENDING'`,
            [orderId]
        );

        // 4. Verification Check: Try to find an already assigned daily route
        let finalRouteId = null;
        let isDirectlyLinked = false;

        // Try to find if a Route (daily instance) already exists for this ServiceRoute on the target date
        const existingRouteRes = await query<{ id: string; deliveryBoyId: string; token: string | null }>(
            `SELECT "id", "deliveryBoyId", "token"
             FROM "Route"
             WHERE "serviceRouteId" = $1
               AND "date" >= $2
               AND "date" < $3
             LIMIT 1`,
            [serviceRouteId, startOfDay, endOfDay]
        );

        // 5. Logic Flow:
        // Case A: dailyRoute already exists -> Use it.
        // Case B: No daily route but we have a preferred staff (manual or default) -> Create route.
        // Case C: No route, no default staff -> Just update order date (remains unassigned).

        if (existingRouteRes.rows.length > 0) {
            const existingRoute = existingRouteRes.rows[0];
            finalRouteId = existingRoute.id;
            isDirectlyLinked = true;

            // If a manual override deliveryBoyId was provided, update the existing route's staff
            if (deliveryBoyId && existingRoute.deliveryBoyId !== deliveryBoyId) {
                // Check if token exists
                if (existingRoute.token) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: "Cannot change delivery staff after magic link is generated for this route."
                        },
                        { status: 400 }
                    );
                }

                await query(
                    `UPDATE "Route" SET "deliveryBoyId" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
                    [deliveryBoyId, finalRouteId]
                );
            }
        } else if (preferredDeliveryBoyId) {
            // Case B: Check if staff is active/not on leave before auto-creating route
            const dbCheckRes = await query<{ active: boolean; onLeave: boolean }>(
                `SELECT "active", "onLeave" FROM "DeliveryBoy" WHERE "id" = $1`,
                [preferredDeliveryBoyId]
            );

            if (dbCheckRes.rows.length > 0 && dbCheckRes.rows[0].active && !dbCheckRes.rows[0].onLeave) {
                finalRouteId = crypto.randomUUID();
                await query(
                    `INSERT INTO "Route"("id", "date", "serviceRouteId", "deliveryBoyId", "token", "tokenExpiresAt", "createdAt", "updatedAt")
                     VALUES($1, $2, $3, $4, NULL, NULL, NOW(), NOW())`,
                    [finalRouteId, startOfDay, serviceRouteId, preferredDeliveryBoyId]
                );
                isDirectlyLinked = true;
            }
        }

        // 5.5 Log the reassignment action
        try {
            if (currentAssignmentRes.rowCount > 0) {
                const oldAssign = currentAssignmentRes.rows[0];
                const oldDateStr = new Date(oldAssign.routeDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
                const newDateStr = effectiveDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

                // Get new delivery boy name and route name for the log
                let newDbName = "Unknown";
                let newRouteName = "Unknown Route";
                try {
                    const newDbRes = await query<{ dbName: string, srName: string }>(
                        `SELECT a."name" as "dbName", sr."name" as "srName" 
                         FROM "DeliveryBoy" a
                         LEFT JOIN "Route" r ON r."id" = $1
                         LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
                         WHERE a."id" = $2`, 
                        [finalRouteId, preferredDeliveryBoyId]
                    );
                    if (newDbRes.rows.length > 0) {
                        newDbName = newDbRes.rows[0].dbName || newDbName;
                        newRouteName = newDbRes.rows[0].srName || newRouteName;
                    }
                } catch (e) {
                    console.error("Failed to fetch route names for reassignment log:", e);
                }

                // Create new query to get old route name
                let oldRouteName = "Unknown Route";
                try {
                    const oldRouteRes = await query<{ srName: string }>(
                        `SELECT sr."name" as "srName"
                         FROM "Route" r
                         LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
                         WHERE r."id" = $1`,
                        [oldAssign.routeId]
                    );
                    if (oldRouteRes.rows.length > 0) {
                        oldRouteName = oldRouteRes.rows[0].srName || oldRouteName;
                    }
                } catch (e) {
                    console.error("Failed to fetch old route name:", e);
                }

                await query(
                    `INSERT INTO "OrderActivityLog" ("id", "orderId", "action", "description", "metadata", "createdAt")
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        crypto.randomUUID(),
                        orderId,
                        'REASSIGNED',
                        `Order moved from ${oldAssign.deliveryBoyName} (${oldDateStr}) to ${newDateStr}.\nRoute Name : ${newRouteName} | Delivery staff : ${newDbName}`,
                        JSON.stringify({
                            oldDeliveryBoy: oldAssign.deliveryBoyName,
                            newDeliveryBoy: newDbName,
                            newRoute: newRouteName,
                            oldDate: oldAssign.routeDate,
                            newDate: effectiveDate
                        }),
                        new Date()
                    ]
                );

                // Log to central AuditLog
                const adminId = await getAdminIdFromRequest(req);
                logAction({
                    actorId: adminId,
                    actorType: 'ADMIN',
                    entity: 'ORDER',
                    entityId: orderId,
                    action: 'UPDATE',
                    description: `Reassigned order from ${oldAssign.deliveryBoyName} (${oldDateStr}) to ${newDateStr}.\nRoute Name : ${newRouteName} | Delivery staff : ${newDbName}`,
                    oldData: { deliveryDate: oldAssign.routeDate, routeName: oldRouteName, deliveryBoyName: oldAssign.deliveryBoyName },
                    newData: { deliveryDate: effectiveDate, routeName: newRouteName, deliveryBoyName: newDbName }
                });
            } else {
                // Log to central AuditLog even if there was no previous assignment
                const adminId = await getAdminIdFromRequest(req);
                const newDateStr = effectiveDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
                
                let newDbName = "Unknown";
                let newRouteName = "Unknown Route";
                if (finalRouteId) {
                    try {
                        const newDbRes = await query<{ dbName: string, srName: string }>(
                            `SELECT a."name" as "dbName", sr."name" as "srName" 
                             FROM "DeliveryBoy" a
                             LEFT JOIN "Route" r ON r."id" = $1
                             LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
                             WHERE a."id" = $2`, 
                            [finalRouteId, preferredDeliveryBoyId]
                        );
                        if (newDbRes.rows.length > 0) {
                            newDbName = newDbRes.rows[0].dbName || newDbName;
                            newRouteName = newDbRes.rows[0].srName || newRouteName;
                        }
                    } catch (e) {
                        console.error("Failed to fetch route names for reassignment log:", e);
                    }
                }

                logAction({
                    actorId: adminId,
                    actorType: 'ADMIN',
                    entity: 'ORDER',
                    entityId: orderId,
                    action: 'UPDATE',
                    description: finalRouteId ? `Assigned order on ${newDateStr}.\nRoute Name : ${newRouteName} | Delivery staff : ${newDbName}` : `Assigned order to a new delivery date (${newDateStr}).`,
                    oldData: { deliveryDate: order.deliveryDate, routeName: null, deliveryBoyName: null },
                    newData: { deliveryDate: effectiveDate, routeName: finalRouteId ? newRouteName : null, deliveryBoyName: finalRouteId ? newDbName : null }
                });
            }
        } catch (logError) {
            console.error("Failed to log reassign activity:", logError);
        }

        // 6. Execution: Remove from old route and (optionally) add to new route
        // We delete active route links for this order to avoid duplicates.
        await query(
            `DELETE FROM "RouteOrder" WHERE "orderId" = $1 AND "deliveryStatus" != 'NOT_DELIVERED'`,
            [orderId]
        );

        if (finalRouteId) {
            const routeOrderId = crypto.randomUUID();
            await query(
                `INSERT INTO "RouteOrder"("id", "routeId", "orderId", "deliveryStatus", "codCollected", "createdAt", "updatedAt")
                 VALUES($1, $2, $3, 'PENDING', false, NOW(), NOW())
                 ON CONFLICT ("orderId", "routeId") DO UPDATE 
                 SET "deliveryStatus" = 'PENDING',
                     "codCollected" = false,
                     "updatedAt" = NOW()`,
                [routeOrderId, finalRouteId, orderId]
            );
        }

        // 7. Update Order status and date
        // If linked to a route, status = CONFIRMED. If not linked (waiting for staff assignment), status = PENDING.
        // Guard: Never overwrite a CANCELLED or DELIVERED status.
        const newStatus = isDirectlyLinked ? 'CONFIRMED' : 'PENDING';

        await query(
            `UPDATE "Order" SET "status" = $1, "deliveryDate" = $2, "updatedAt" = NOW()
             WHERE "id" = $3 AND "status" NOT IN ('CANCELLED', 'DELIVERED')`,
            [newStatus, effectiveDate, orderId]
        );

        return NextResponse.json({
            success: true,
            message: finalRouteId ? "Reassigned to route" : "Rescheduled (awaiting assignment)",
            routeId: finalRouteId,
            linked: !!finalRouteId
        });

    } catch (error) {
        console.error("Error in POST /api/admin/orders/reassign:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
