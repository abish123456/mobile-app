import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getNowIST, formatDateToISO } from "../../../../../lib/timezone";
import { logAction } from "../../../../../lib/audit";
import { getNextWorkingDay } from "../../../../../lib/holidays";
import msg91 from "msg91";
import crypto from "crypto";

// Initialize MSG91 client
function getMsg91() {
    const authKey = process.env.MSG91_AUTH_KEY;
    if (!authKey) {
        return null;
    }
    msg91.initialize({ authKey });
    return msg91;
}

function formatPhoneNumber(phone: string, defaultCountryCode: string = "91"): string {
    // Remove any spaces, dashes, or special characters including +
    let cleaned = phone.replace(/[\s\-\(\)\+]/g, "");

    // If it's a 10-digit number, prepend default country code
    if (cleaned.length === 10) {
        cleaned = `${defaultCountryCode}${cleaned}`;
    }

    return cleaned;
}

export async function POST(req: NextRequest) {
    try {
        // Admin authentication check
        if (!(await verifyAdminAuthWithPermission(req, "reschedule_order"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const body = await req.json();
        const { orderId, date } = body;

        if (!orderId || !date) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            );
        }

        // 1. Fetch order details and validate status
        const orderRes = await query<{
            status: string;
            pincode: string;
            deliveryDate: Date;
            customerPhone: string;
            customerName: string;
        }>(
            `SELECT o."status",
                    a."pincode",
                    o."deliveryDate",
                    (SELECT "phone" FROM "Customer" WHERE "id" = o."customerId") as "customerPhone",
                    (SELECT "name" FROM "Customer" WHERE "id" = o."customerId") as "customerName"
             FROM "Order" o
             JOIN "Address" a ON a."id" = o."addressId"
             WHERE o."id" = $1`,
            [orderId]
        );

        if (orderRes.rowCount === 0) {
            return NextResponse.json(
                { success: false, message: "Order not found" },
                { status: 404 }
            );
        }

        const order = orderRes.rows[0];

        // Block reschedule for DELIVERED or CANCELLED orders
        if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
            return NextResponse.json(
                { success: false, message: `Cannot reschedule ${order.status.toLowerCase()} orders` },
                { status: 400 }
            );
        }

        // Block reschedule for ONLINE PENDING orders
        if (order.status === 'PENDING' && (req.url.includes('paymentMethod=ONLINE') || true)) { // We need to check the actual order payment status from DB
             const fullOrder = await query<{paymentMethod: string, paymentStatus: string}>(
                `SELECT "paymentMethod", "paymentStatus" FROM "Order" WHERE "id" = $1`,
                [orderId]
             );
             if (fullOrder.rows[0].paymentMethod === 'ONLINE' && fullOrder.rows[0].paymentStatus === 'PENDING') {
                return NextResponse.json(
                    { success: false, message: "Cannot reschedule an unpaid online order. Wait for payment success or cancel and create a COD order." },
                    { status: 400 }
                );
             }
        }

        // 2. Check if source route link has been generated (restricted to order's current delivery date)
        const orderDateStart = getStartOfDayIST(new Date(order.deliveryDate));
        const orderDateEnd = getEndOfDayIST(new Date(order.deliveryDate));

        const routeTokenRes = await query<{ token: string }>(
            `SELECT r."token" 
             FROM "Route" r
             JOIN "RouteOrder" ro ON ro."routeId" = r."id"
             WHERE ro."orderId" = $1 
               AND r."token" IS NOT NULL
               AND r."date" >= $2
               AND r."date" < $3
               AND ro."deliveryStatus" = 'PENDING'
             LIMIT 1`,
            [orderId, orderDateStart, orderDateEnd]
        );

        if (routeTokenRes.rowCount > 0) {
            return NextResponse.json(
                { success: false, message: "Cannot reschedule - route link has already been generated for this order's current delivery date" },
                { status: 400 }
            );
        }

        // 3. New: Check if target route link has been generated
        let selectedDateStart = getStartOfDayIST(new Date(date));
        
        // --- HOLIDAY LOGIC START ---
        const holidayCheck = await getNextWorkingDay(selectedDateStart);
        if (holidayCheck.adjusted) {
            selectedDateStart = holidayCheck.date;
        }
        // --- HOLIDAY LOGIC END ---

        const selectedDateEnd = getEndOfDayIST(selectedDateStart);

        const targetRouteTokenRes = await query<{ id: string }>(
            `SELECT r."id"
             FROM "Route" r
             JOIN "ServiceArea" sa ON sa."serviceRouteId" = r."serviceRouteId"
             WHERE sa."pincode" = $1 
               AND r."date" >= $2
               AND r."date" < $3
               AND r."token" IS NOT NULL
             LIMIT 1`,
            [order.pincode, selectedDateStart, selectedDateEnd]
        );

        if (targetRouteTokenRes.rowCount > 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Cannot reschedule to ${selectedDateStart.toLocaleDateString('en-IN')} - the delivery link for this route is already generated.`
                },
                { status: 400 }
            );
        }

        // 3. Check if order is currently assigned to a route
        const currentAssignmentRes = await query<{ id: string; routeId: string }>(
            `SELECT "id", "routeId" FROM "RouteOrder" WHERE "orderId" = $1`,
            [orderId]
        );

        // 4. Remove from old route if assigned
        if (currentAssignmentRes.rowCount > 0) {
            await query(
                `DELETE FROM "RouteOrder" WHERE "orderId" = $1`,
                [orderId]
            );
        }

        // 5. Calculate delivery slot based on date
        const today = getStartOfDayIST(getNowIST());
        const tomorrow = getStartOfDayIST(new Date(today.getTime() + 24 * 60 * 60 * 1000));

        // Use formatDateToISO to correctly get the YYYY-MM-DD string in IST timezone
        const deliverySlot = formatDateToISO(selectedDateStart);

        // 5.5 Log the reschedule action
        try {
            const oldDateStr = new Date(order.deliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
            const newDateStr = selectedDateStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

            await query(
                `INSERT INTO "OrderActivityLog" ("id", "orderId", "action", "description", "metadata", "createdAt")
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    crypto.randomUUID(),
                    orderId,
                    'RESCHEDULED',
                    `Order delivery date changed from ${oldDateStr} to ${newDateStr}.`,
                    JSON.stringify({
                        oldDate: order.deliveryDate,
                        newDate: selectedDateStart,
                        oldSlot: order.deliverySlot,
                        newSlot: deliverySlot
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
                description: `Rescheduled order from ${oldDateStr} to ${newDateStr}`,
                oldData: { deliveryDate: order.deliveryDate },
                newData: { deliveryDate: selectedDateStart }
            });
        } catch (logError) {
            console.error("Failed to log reschedule activity:", logError);
        }

        // 6. Update the order delivery date and slot
        // Set status to PENDING initially. Only confirm if assignment succeeds.
        await query(
            `UPDATE "Order"
             SET "deliveryDate" = $1,
                 "deliverySlot" = $2,
                 "status" = 'PENDING',
                 "updatedAt" = NOW()
             WHERE "id" = $3`,
            [selectedDateStart, deliverySlot, orderId]
        );

        // 7. Auto-assign to new route based on pincode
        const { assignOrderToRoute } = await import("../../../../../lib/order-assignment");

        let isAssigned = false;
        let assignmentReason = null;

        try {
            const assignmentResult = await assignOrderToRoute(orderId);

            if (assignmentResult.success) {
                isAssigned = true;
                // If successfully assigned (or already assigned), mark as CONFIRMED
                await query(
                    `UPDATE "Order"
                     SET "status" = 'CONFIRMED', "updatedAt" = NOW()
                     WHERE "id" = $1`,
                    [orderId]
                );
            } else {
                assignmentReason = assignmentResult.reason;
                console.log(`[RESCHEDULE] Auto-assignment failed for ${orderId}: ${assignmentResult.reason}`);
            }
        } catch (assignError) {
            console.error(`[RESCHEDULE] Error during auto-assignment for ${orderId}:`, assignError);
            // Status remains PENDING, which is correct for unassigned orders
        }

        // Attempt to send SMS (optional, don't fail if it doesn't work)
        let smsSent = false;
        try {
            const authKey = process.env.MSG91_AUTH_KEY;
            const flowId = process.env.MSG91_RESCHEDULE_FLOW_ID;

            if (authKey && flowId && order.customerPhone) {
                const formattedDate = new Date(date).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short'
                });

                const response = await fetch('https://control.msg91.com/api/v5/flow/', {
                    method: 'POST',
                    headers: {
                        'authkey': authKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        template_id: flowId,
                        recipients: [
                            {
                                mobiles: formatPhoneNumber(order.customerPhone),
                                name: order.customerName || 'Customer',
                                date: formattedDate
                            }
                        ]
                    })
                });

                const result = await response.json();
                if (result.type === 'success') {
                    smsSent = true;
                } else {
                    console.warn("MSG91 Flow API returned non-success:", result);
                }
            }
        } catch (smsError) {
            console.error("Failed to send reschedule SMS via MSG91:", smsError);
        }

        return NextResponse.json({
            success: true,
            message: isAssigned
                ? "Order rescheduled and assigned to route"
                : "Order rescheduled (Waiting for route assignment)",
            smsSent,
            reassigned: isAssigned,
            assignmentReason
        });

    } catch (error) {
        console.error("Error in POST /api/admin/orders/reschedule:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
