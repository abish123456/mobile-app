import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../../lib/admin-auth";

// GET /api/admin/orders/[id]/log — Full processing timeline for an order
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { id: orderId } = await params;

        // 1. Core order info
        const orderRes = await query<{
            id: string;
            orderNumber: string | null;
            quantity: number;
            originalQuantity: number | null;
            additionalQuantity: number | null;
            amount: number;
            depositAmount: number;
            deliveryDate: Date;
            deliverySlot: string;
            status: string;
            paymentStatus: string;
            paymentMethod: string;
            paymentInstrument: string | null;
            createdAt: Date;
            updatedAt: Date;
            customerName: string | null;
            customerPhone: string;
            customerId: string;
            addressLine1: string;
            addressLine2: string | null;
            area: string;
            city: string;
            pincode: string;
            landmark: string | null;
            productName: string | null;
        }>(
            `SELECT
        o."id",
        o."orderNumber",
        o."quantity",
        o."originalQuantity",
        o."additionalQuantity",
        o."amount",
        o."depositAmount",
        o."deliveryDate",
        o."deliverySlot",
        o."status",
        o."paymentStatus",
        o."paymentMethod",
        o."paymentInstrument",
        o."isQrPayment",
        o."createdAt",
        (o."updatedAt" AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC') as "updatedAt",
        c."name" as "customerName",
        c."phone" as "customerPhone",
        c."id" as "customerId",
        a."line1" as "addressLine1",
        a."line2" as "addressLine2",
        a."area",
        a."city",
        a."pincode",
        a."landmark",
        a."contactName",
        a."contactPhone",
        p."name" as "productName",
        c."id" as "customerInternalId"
      FROM "Order" o
      INNER JOIN "Customer" c ON o."customerId" = c."id"
      INNER JOIN "Address" a ON o."addressId" = a."id"
      LEFT JOIN "Product" p ON o."productId" = p."id"
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

        // 2. All RouteOrder records (every time the order was assigned to a route)
        const routeOrdersRes = await query<{
            routeOrderId: string;
            routeOrderCreatedAt: Date;
            routeOrderUpdatedAt: Date;
            deliveryStatus: string;
            notDeliveredReason: string | null;
            codCollected: boolean;
            sequence: number;
            routeId: string;
            routeDate: Date;
            routeToken: string | null;
            tokenExpiresAt: Date | null;
            deliveryBoyId: string;
            deliveryBoyName: string;
            serviceRouteName: string | null;
        }>(
            `SELECT
        ro."id" as "routeOrderId",
        ro."createdAt" as "routeOrderCreatedAt",
        ro."updatedAt" as "routeOrderUpdatedAt",
        ro."deliveryStatus",
        ro."notDeliveredReason",
        ro."codCollected",
        ro."sequence",
        r."id" as "routeId",
        r."date" as "routeDate",
        r."token" as "routeToken",
        r."tokenExpiresAt",
        db."id" as "deliveryBoyId",
        db."name" as "deliveryBoyName",
        sr."name" as "serviceRouteName"
      FROM "RouteOrder" ro
      INNER JOIN "Route" r ON ro."routeId" = r."id"
      INNER JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
      LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
      WHERE ro."orderId" = $1
      ORDER BY ro."createdAt" ASC`,
            [orderId]
        );

        // 3. All Payment records
        const paymentsRes = await query<{
            id: string;
            providerOrderId: string | null;
            providerPaymentId: string | null;
            amount: number;
            status: string;
            method: string;
            provider: string;
            createdAt: Date;
            updatedAt: Date;
        }>(
            `SELECT
        "id",
        "providerOrderId",
        "providerPaymentId",
        "amount",
        "status",
        "method",
        "provider",
        ("createdAt" AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC') as "createdAt",
        CASE 
            -- Auto-detect if updatedAt is UTC (shifted by ~5:30h from the IST digits in createdAt)
            -- If the digit difference is around -5.5 hours, it's UTC.
            WHEN "method" = 'ONLINE' AND "status" = 'SUCCESS' AND ("updatedAt" - "createdAt") < interval '-4 hours' THEN "updatedAt"
            -- Otherwise, it's likely IST digits (Manual confirmation or COD)
            ELSE ("updatedAt" AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC')
        END as "updatedAt"
      FROM "Payment"
      WHERE "orderId" = $1
      ORDER BY "createdAt" ASC`,
            [orderId]
        );

        // 4. Route token logs (when route links were generated)
        const tokenLogsRes = await query<{
            routeId: string;
            token: string;
            action: string;
            generatedAt: Date;
            deliveryBoyName: string;
            serviceRouteName: string | null;
        }>(
            `SELECT
        rtl."routeId",
        rtl."token",
        rtl."action",
        (rtl."generatedAt" AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC') as "generatedAt",
        db."name" as "deliveryBoyName",
        sr."name" as "serviceRouteName"
      FROM "RouteTokenLog" rtl
      INNER JOIN "Route" r ON rtl."routeId" = r."id"
      INNER JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
      LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
      WHERE r."id" IN (
        SELECT DISTINCT ro."routeId" FROM "RouteOrder" ro WHERE ro."orderId" = $1
      )
      AND rtl."action" != 'COPIED'
      ORDER BY rtl."generatedAt" ASC`,
            [orderId]
        );

        // 5. Wallet transactions related to this order
        const walletTxRes = await query<{
            id: string;
            amount: number;
            type: string;
            referenceType: string;
            description: string | null;
            createdAt: Date;
        }>(
            `SELECT "id", "amount", "type", "referenceType", "description", "createdAt"
       FROM "WalletTransaction"
       WHERE "referenceId" = $1
       ORDER BY "createdAt" ASC`,
            [orderId]
        );

        // 6. Order items breakdown
        const itemsRes = await query<{
            id: string;
            productName: string;
            quantity: number;
            price: number;
            gst: number;
        }>(
            `SELECT 
        oi."id", 
        p."name" as "productName", 
        oi."quantity", 
        oi."price", 
        oi."gst"
      FROM "OrderItem" oi
      INNER JOIN "Product" p ON oi."productId" = p."id"
      WHERE oi."orderId" = $1`,
            [orderId]
        );

        // 7. Order Activity Logs (New Audit Table)
        const activityLogsRes = await query<{
            id: string;
            action: string;
            description: string | null;
            metadata: any;
            createdAt: Date;
        }>(
            `SELECT "id", "action", "description", "metadata", "createdAt"
             FROM "OrderActivityLog"
             WHERE "orderId" = $1
             ORDER BY "createdAt" ASC`,
            [orderId]
        );

        // ── Build unified timeline ──
        const events: Array<{
            id: string;
            timestamp: string;
            type: string;
            title: string;
            description: string;
            meta?: Record<string, any>;
            badge?: string;
        }> = [];

        // 1. Order Received
        // Find if we have an explicit placement log (for constant initial delivery date)
        const placementLog = activityLogsRes.rows.find(l => l.action === 'ORDER_PLACED' || l.action === 'PLACED');

        let initialDeliveryDateDisplay = order.deliveryDate;
        if (placementLog && placementLog.metadata && placementLog.metadata.deliveryDate) {
            initialDeliveryDateDisplay = new Date(placementLog.metadata.deliveryDate);
        } else {
            // Fallback for old orders: use the first assignment or current delivery date
            const firstAssignment = routeOrdersRes.rows[0];
            initialDeliveryDateDisplay = firstAssignment ? firstAssignment.routeDate : order.deliveryDate;
        }

        events.push({
            id: `order-created`,
            timestamp: order.createdAt.toISOString(),
            type: "ORDER_PLACED",
            title: "Order Placed",
            description: `Order Placed for ${order.quantity} cans of ${order.productName || "Water Can"}.`,
            meta: {
                quantity: placementLog?.metadata?.quantity || order.quantity,
                amount: placementLog?.metadata?.amount ?? (order.amount / 100),

                paymentMethod: placementLog?.metadata?.paymentMethod || order.paymentMethod,
                paymentInstrument: placementLog?.metadata?.paymentInstrument || (placementLog?.metadata?.paymentMethod === 'ONLINE' ? 'Online' : null),
                deliverySlot: placementLog?.metadata?.deliverySlot || order.deliverySlot,
                expectedDeliveryDate: initialDeliveryDateDisplay.toISOString(),
            },
            badge: "info",
        });

        // Payment events
        for (const pay of paymentsRes.rows) {
            // Hide COD payments as per user request
            if (pay.method === "COD") continue;

            const amtRs = pay.amount / 100;
            if (pay.status === "SUCCESS") {
                const instrumentLabel = (order as any).paymentInstrument ? `${(order as any).paymentInstrument.toUpperCase()} - ` : "";
                const qrSuffix = order.isQrPayment ? " (via QR)" : "";
                
                let bankRrn = null;
                let upiId = null;
                let payerContact = null;

                if (pay.method === 'ONLINE' && pay.providerPaymentId) {
                    try {
                        const Razorpay = (await import('razorpay')).default;
                        if (process.env.RAZORPAY_KEY_SECRET) {
                            const razorpay = new Razorpay({
                                key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
                                key_secret: process.env.RAZORPAY_KEY_SECRET,
                            });
                            const rzpPayment = await razorpay.payments.fetch(pay.providerPaymentId);
                            bankRrn = rzpPayment.acquirer_data?.bank_transaction_id || rzpPayment.acquirer_data?.rrn || null;
                            upiId = rzpPayment.vpa || null;
                            payerContact = rzpPayment.contact || rzpPayment.email || null;
                        }
                    } catch (err) {
                        console.error('Error fetching details from Razorpay:', err);
                    }
                }

                events.push({
                    id: `payment-success-${pay.id}`,
                    timestamp: pay.updatedAt.toISOString(),
                    type: "PAYMENT_SUCCESS",
                    title: "Payment Confirmed",
                    description: `Payment of ₹${amtRs.toFixed(2)} received via ${pay.method}${qrSuffix} (${instrumentLabel}${pay.provider}).`,
                    meta: {
                        amount: amtRs,
                        method: pay.method,
                        isQrPayment: order.isQrPayment,
                        paymentInstrument: (order as any).paymentInstrument,
                        bankRrn: bankRrn,
                        upiId: upiId,
                        payerContact: payerContact,
                        provider: pay.provider,
                        providerPaymentId: pay.providerPaymentId,
                        providerOrderId: pay.providerOrderId,
                    },
                    badge: "success",
                });
            } else if (pay.status === "FAILED") {
                events.push({
                    id: `payment-failed-${pay.id}`,
                    timestamp: pay.updatedAt.toISOString(),
                    type: "PAYMENT_FAILED",
                    title: "Payment Failed",
                    description: `Payment attempt of ₹${amtRs.toFixed(2)} via ${pay.method} failed.`,
                    meta: {
                        amount: amtRs,
                        method: pay.method,
                        providerOrderId: pay.providerOrderId,
                    },
                    badge: "error",
                });
            } else {
                events.push({
                    id: `payment-initiated-${pay.id}`,
                    timestamp: pay.createdAt.toISOString(),
                    type: "PAYMENT_INITIATED",
                    title: "Payment Initiated",
                    description: `Payment of ₹${amtRs.toFixed(2)} initiated via ${pay.method}.`,
                    meta: {
                        amount: amtRs,
                        method: pay.method,
                        providerOrderId: pay.providerOrderId,
                    },
                    badge: "warning",
                });
            }
        }

        // Route assignment events
        for (let i = 0; i < routeOrdersRes.rows.length; i++) {
            const ro = routeOrdersRes.rows[i];
            const prevRo = i > 0 ? routeOrdersRes.rows[i - 1] : null;
            const isReassignment = i > 0;

            // Route assignment events are now handled via OrderActivityLog or are hidden as per user request

            // Status updates
            if (ro.deliveryStatus === "DELIVERED") {
                events.push({
                    id: `delivered-${ro.routeOrderId}`,
                    timestamp: ro.routeOrderUpdatedAt.toISOString(),
                    type: "DELIVERED",
                    title: "Order Delivered",
                    description: `Delivery confirmed by ${ro.deliveryBoyName}.`,
                    meta: {
                        deliveryBoy: ro.deliveryBoyName,
                        paymentMethod: order.paymentMethod,
                        paymentInstrument: order.paymentInstrument,
                        isQrPayment: (order as any).isQrPayment,
                    },
                    badge: "success",
                });
            } else if (ro.deliveryStatus === "NOT_DELIVERED") {
                events.push({
                    id: `not-delivered-${ro.routeOrderId}`,
                    timestamp: ro.routeOrderUpdatedAt.toISOString(),
                    type: "NOT_DELIVERED",
                    title: "Delivery Failed",
                    description: `Marked as not delivered by ${ro.deliveryBoyName}. Reason: ${ro.notDeliveredReason || "Not specified"}.`,
                    meta: {
                        deliveryBoy: ro.deliveryBoyName,
                        reason: ro.notDeliveredReason,
                    },
                    badge: "error",
                });
            }
        }

        // 4. Delivery in Progress (Route link generated)
        for (const tl of tokenLogsRes.rows) {
            events.push({
                id: `route-link-${tl.token}-${tl.generatedAt.toISOString()}`,
                timestamp: tl.generatedAt.toISOString(),
                type: "ROUTE_LINK_GENERATED",
                title: "Route Link Generated",
                description: `Delivery route started. Route link generated for ${tl.deliveryBoyName}${tl.serviceRouteName ? ` (${tl.serviceRouteName})` : ""}.`,
                meta: {
                    deliveryBoy: tl.deliveryBoyName,
                    serviceRoute: tl.serviceRouteName,
                    action: tl.action,
                },
                badge: "info",
            });
        }

        // 4. Wallet Transactions - Removed as per user request

        // 5. Activity Log events (Reschedules, Reassignments, etc. from the new audit table)
        for (const log of activityLogsRes.rows) {
            // Skip placement logs as they are handled by the 'order-created' event above
            // Skip status logs that are handled by the RouteOrder loop or explicit status checks
            if (["ORDER_PLACED", "PLACED", "DELIVERED", "NOT_DELIVERED", "CANCELLED", "STATUS_CHANGE", "RESCHEDULED"].includes(log.action)) continue;

            let title = log.action;
            let description = log.description || "";
            let badge = "info";

            if (log.action === "RESCHEDULED") {
                title = "Order Rescheduled";
                badge = "warning";
            } else if (log.action === "REASSIGNED") {
                title = "Order Reassigned";
                badge = "warning";
                description = "";
            }

            events.push({
                id: `activity-log-${log.id}`,
                timestamp: log.createdAt.toISOString(),
                type: log.action,
                title,
                description,
                meta: log.metadata,
                badge
            });
        }

        // Order cancellation event (if cancelled)
        const cancellationLog = activityLogsRes.rows.find(l => l.action === "CANCELLED");
        if (order.status === "CANCELLED") {
            events.push({
                id: `order-cancelled`,
                timestamp: (cancellationLog ? cancellationLog.createdAt : order.updatedAt).toISOString(),
                type: "CANCELLED",
                title: "Order Cancelled",
                description: cancellationLog?.description || "Order was cancelled.",
                meta: cancellationLog?.metadata,
                badge: "error",
            });
        }

        // Sort all events by timestamp ascending
        events.sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const deliveredRO = routeOrdersRes.rows.find(ro => ro.deliveryStatus === 'DELIVERED');
        const deliveredAt = deliveredRO ? deliveredRO.routeOrderUpdatedAt : null;

        return NextResponse.json({
            success: true,
            order: {
                id: order.id,
                orderNumber: order.orderNumber,
                quantity: order.quantity,
                originalQuantity: order.originalQuantity,
                additionalQuantity: order.additionalQuantity,
                amount: order.amount / 100,
                depositAmount: order.depositAmount / 100,
                deliveryDate: initialDeliveryDateDisplay.toISOString(),
                initialDeliveryDate: initialDeliveryDateDisplay.toISOString(),
                currentDeliveryDate: order.deliveryDate.toISOString(),
                deliveredAt: deliveredAt ? deliveredAt.toISOString() : null,
                deliverySlot: order.deliverySlot,
                status: order.status,
                paymentStatus: order.paymentStatus,
                paymentMethod: order.paymentMethod,
                paymentInstrument: order.paymentInstrument,
                createdAt: order.createdAt.toISOString(),
                updatedAt: order.updatedAt.toISOString(),
                customer: {
                    id: order.customerId,
                    name: order.customerName || "Unknown",
                    phone: order.customerPhone,
                    internalId: (order as any).customerInternalId,
                },
                address: {
                    line1: order.addressLine1,
                    line2: order.addressLine2,
                    area: order.area,
                    city: order.city,
                    pincode: order.pincode,
                    landmark: order.landmark,
                    contactName: (order as any).contactName,
                    contactPhone: (order as any).contactPhone,
                },
                productName: order.productName || "Water Can",
                items: itemsRes.rows,
            },
            routeOrders: routeOrdersRes.rows.map((ro) => ({
                id: ro.routeOrderId,
                createdAt: ro.routeOrderCreatedAt.toISOString(),
                updatedAt: ro.routeOrderUpdatedAt.toISOString(),
                deliveryStatus: ro.deliveryStatus,
                notDeliveredReason: ro.notDeliveredReason,
                codCollected: ro.codCollected,
                sequence: ro.sequence,
                routeDate: ro.routeDate.toISOString(),
                routeToken: ro.routeToken,
                tokenExpiresAt: ro.tokenExpiresAt?.toISOString() || null,
                deliveryBoy: {
                    id: ro.deliveryBoyId,
                    name: ro.deliveryBoyName,
                },
                serviceRoute: ro.serviceRouteName,
            })),
            payments: paymentsRes.rows.map((p) => ({
                id: p.id,
                providerOrderId: p.providerOrderId,
                providerPaymentId: p.providerPaymentId,
                amount: p.amount / 100,
                status: p.status,
                method: p.method,
                provider: p.provider,
                createdAt: p.createdAt.toISOString(),
                updatedAt: p.updatedAt.toISOString(),
            })),
            walletTransactions: walletTxRes.rows.map((tx) => ({
                id: tx.id,
                amount: tx.amount,
                type: tx.type,
                referenceType: tx.referenceType,
                description: tx.description,
                createdAt: tx.createdAt.toISOString(),
            })),
            timeline: events,
        });
    } catch (error) {
        console.error("Error in GET /api/admin/orders/[id]/log:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}


