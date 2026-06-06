import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import { getStartOfDayIST, getEndOfDayIST, getNowIST, getTodayIST } from "../../../../../lib/timezone";

export async function GET(req: NextRequest) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const tab = searchParams.get('tab') || 'pending';
        const dateStr = searchParams.get('date');
        const reason = searchParams.get('reason');
        const search = searchParams.get('search');
        const todayDateIST = getTodayIST();

        let whereClause = '';
        let queryParams: any[] = [];

        if (dateStr) {
            const filterDate = getStartOfDayIST(new Date(dateStr));
            const endOfDay = getEndOfDayIST(new Date(dateStr));
            const isPastDate = dateStr < todayDateIST;

            whereClause = `WHERE (
                (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
                OR
                EXISTS (
                    SELECT 1 FROM "RouteOrder" ro_activity
                    JOIN "Route" r_activity ON ro_activity."routeId" = r_activity."id"
                    WHERE ro_activity."orderId" = o."id"
                    AND r_activity."date" >= $1 AND r_activity."date" <= $2
                )
            ) AND o."orderNumber" IS NOT NULL`;

            if (tab === 'reassigned') {
                whereClause += `
                AND o."status" NOT IN ('NOT_DELIVERED', 'CANCELLED') 
                AND EXISTS (
                    SELECT 1 FROM "RouteOrder" ro_check 
                    JOIN "Route" r_check ON ro_check."routeId" = r_check."id"
                    WHERE ro_check."orderId" = o."id" 
                    AND ro_check."deliveryStatus" = 'NOT_DELIVERED'
                    AND r_check."date" >= $1 AND r_check."date" <= $2
                )`;
            } else {
                if (isPastDate) {
                    // Past date: Show Failed OR Pending (Overdue) - but only if has ID
                    whereClause += ` AND (o."status" = 'NOT_DELIVERED' 
                    OR (o."status" NOT IN ('DELIVERED', 'CANCELLED', 'NOT_DELIVERED')))`;
                } else {
                    // Today or Future: Show ONLY Explicit Failures
                    whereClause += ` AND o."status" = 'NOT_DELIVERED'`;
                }

                // Exclude reasons marked as hidden
                whereClause += `
                AND NOT EXISTS (
                    SELECT 1 FROM "RouteOrder" ro_hide
                    JOIN "NotDeliveredReason" ndr_hide ON ro_hide."notDeliveredReason" = ndr_hide."reason"
                    WHERE ro_hide."orderId" = o."id"
                      AND ro_hide."deliveryStatus" = 'NOT_DELIVERED'
                      AND ndr_hide."hideFromExceptions" = true
                )`;
            }
            queryParams.push(filterDate, endOfDay);

            if (reason && reason !== 'ALL') {
                whereClause += ` AND o."status" = 'NOT_DELIVERED'`; // Filter only current failures
                whereClause += ` AND EXISTS (
                    SELECT 1 FROM "RouteOrder" ro_filter
                    WHERE ro_filter."orderId" = o."id"
                    AND ro_filter."deliveryStatus" = 'NOT_DELIVERED'
                    AND ro_filter."notDeliveredReason" = $${queryParams.length + 1}
                )`;
                queryParams.push(reason);
            }
        } else if (tab === 'reassigned') {
            whereClause = `
                WHERE o."status" NOT IN ('NOT_DELIVERED', 'CANCELLED')
                AND o."orderNumber" IS NOT NULL
                AND EXISTS (
                    SELECT 1 FROM "RouteOrder" ro_check 
                    WHERE ro_check."orderId" = o."id" 
                    AND ro_check."deliveryStatus" = 'NOT_DELIVERED'
                )
            `;
        } else {
            // Pending (Default): Explicit failure OR Overdue (Previous days)
            whereClause = `
                WHERE o."orderNumber" IS NOT NULL
                AND (
                    o."status" = 'NOT_DELIVERED'
                    OR ((o."deliveryDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date < $1::date 
                        AND o."status" NOT IN ('DELIVERED', 'CANCELLED', 'NOT_DELIVERED'))
                )
                -- Exclude reasons marked as hidden
                AND NOT EXISTS (
                    SELECT 1 FROM "RouteOrder" ro_hide
                    JOIN "NotDeliveredReason" ndr_hide ON ro_hide."notDeliveredReason" = ndr_hide."reason"
                    WHERE ro_hide."orderId" = o."id"
                      AND ro_hide."deliveryStatus" = 'NOT_DELIVERED'
                      AND ndr_hide."hideFromExceptions" = true
                )
            `;
            queryParams.push(todayDateIST);

            if (reason && reason !== 'ALL') {
                whereClause += ` AND o."status" = 'NOT_DELIVERED'`;
                whereClause += ` AND EXISTS (
                    SELECT 1 FROM "RouteOrder" ro_filter
                    WHERE ro_filter."orderId" = o."id"
                    AND ro_filter."deliveryStatus" = 'NOT_DELIVERED'
                    AND ro_filter."notDeliveredReason" = $${queryParams.length + 1}
                )`;
                queryParams.push(reason);
            }
        }

        if (search) {
            whereClause += ` AND (c."name" ILIKE $${queryParams.length + 1} OR c."phone" ILIKE $${queryParams.length + 1})`;
            queryParams.push(`%${search}%`);
        }


        const ordersRes = await query<{
            id: string;
            createdAt: Date;
            customerId: string;
            customerName: string;
            customerPhone: string;
            addressLine1: string;
            addressArea: string;
            addressCity: string;
            addressPincode: string;
            productName: string;
            quantity: number;
            amount: number;
            notDeliveredReason: string;
            deliveryBoyName: string;
            deliveryDate: Date;
            status: string;
            activeRouteId: string;
            activeRouteName: string;
        }>(
            `SELECT
                o."id",
                o."orderNumber",
                o."createdAt",
                c."id" as "customerId",
                c."name" as "customerName",
                c."phone" as "customerPhone",
                a."line1" as "addressLine1",
                a."area" as "addressArea",
                a."city" as "addressCity",
                a."pincode" as "addressPincode",
                COALESCE(
                  (SELECT 
                    CASE 
                      WHEN COUNT(*) = 1 THEN MAX(p_inner."name")
                      ELSE MAX(p_inner."name") || ' + ' || (COUNT(*) - 1) || ' more'
                    END
                   FROM "OrderItem" oi_inner
                   JOIN "Product" p_inner ON oi_inner."productId" = p_inner."id"
                   WHERE oi_inner."orderId" = o."id"
                  ),
                  p."name",
                  'Water Can'
                ) as "productName",
                o."quantity",
                o."amount",
                (
                    SELECT ro_fail."notDeliveredReason"
                    FROM "RouteOrder" ro_fail
                    JOIN "Route" r_fail ON ro_fail."routeId" = r_fail."id"
                    WHERE ro_fail."orderId" = o."id" AND ro_fail."deliveryStatus" = 'NOT_DELIVERED'
                    ${dateStr ? `AND r_fail."date" >= $1 AND r_fail."date" <= $2` : ''}
                    ORDER BY ro_fail."updatedAt" DESC
                    LIMIT 1
                ) as "notDeliveredReason",
                (
                    SELECT db_fail."name"
                    FROM "RouteOrder" ro_fail
                    JOIN "Route" r_fail ON ro_fail."routeId" = r_fail."id"
                    JOIN "DeliveryBoy" db_fail ON r_fail."deliveryBoyId" = db_fail."id"
                    WHERE ro_fail."orderId" = o."id" AND ro_fail."deliveryStatus" = 'NOT_DELIVERED'
                    ${dateStr ? `AND r_fail."date" >= $1 AND r_fail."date" <= $2` : ''}
                    ORDER BY ro_fail."updatedAt" DESC
                    LIMIT 1
                ) as "lastFailedDeliveryBoyName",
                COALESCE(db."name", db_static."name") as "deliveryBoyName",
                o."deliveryDate",
                o."updatedAt" as "reassignedAt",
                COALESCE(r."id", sr_static."id") as "activeRouteId",
                COALESCE(sr."name", sr_static."name") as "activeRouteName",
                o."status"
              FROM "Order" o
              JOIN "Customer" c ON o."customerId" = c."id"
              JOIN "Address" a ON o."addressId" = a."id"
              LEFT JOIN "Product" p ON o."productId" = p."id"
              -- Join latest active route info for display
              LEFT JOIN LATERAL (
                  SELECT ro_inner."routeId", ro_inner."deliveryStatus"
                  FROM "RouteOrder" ro_inner
                  WHERE ro_inner."orderId" = o."id" 
                  AND ro_inner."deliveryStatus" != 'NOT_DELIVERED'
                  ORDER BY ro_inner."updatedAt" DESC
                  LIMIT 1
              ) ro ON true
              LEFT JOIN "Route" r ON ro."routeId" = r."id"
              LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
              -- Fallback: check if address pincode has a configured service route
              LEFT JOIN "ServiceArea" sa ON a."pincode" = sa."pincode" AND sa."active" = true
              LEFT JOIN "ServiceRoute" sr_static ON sa."serviceRouteId" = sr_static."id"
              LEFT JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
              LEFT JOIN "DeliveryBoy" db_static ON sr_static."currentDeliveryBoyId" = db_static."id"
              ${whereClause}
              ORDER BY o."updatedAt" DESC
              LIMIT 100`,
            queryParams
        );

        // Deduplicate Logic (Basic Map)
        const uniqueOrdersMap = new Map();
        ordersRes.rows.forEach(item => {
            if (!uniqueOrdersMap.has(item.id)) {
                uniqueOrdersMap.set(item.id, item);
            }
        });
        const uniqueOrders = Array.from(uniqueOrdersMap.values());

        const orders = uniqueOrders.map(order => {
            let reason = order.notDeliveredReason;

            // If no explicit reason, determine based on status or history
            if (!reason) {
                if (order.status === 'NOT_DELIVERED') {
                    reason = 'Overdue - No Status Update';
                } else if (tab === 'reassigned') {
                    reason = 'Previously Failed';
                } else {
                    reason = 'Overdue - No Status Update';
                }
            }

            // Enhanced logic for Reassigned tab display
            let previousDbName = order.lastFailedDeliveryBoyName;
            if (!previousDbName) {
                // FALLBACK: For overdue orders that haven't explicitly "failed" yet,
                // use the delivery boy they are currently assigned to.
                previousDbName = order.deliveryBoyName || 'Unassigned';
            }

            return {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                customer: {
                    id: order.customerId,
                    name: order.customerName || 'Unknown',
                    phone: order.customerPhone,
                },
                address: {
                    line1: order.addressLine1,
                    area: order.addressArea,
                    city: order.addressCity,
                    pincode: order.addressPincode,
                },
                product: {
                    name: order.productName,
                    quantity: order.quantity,
                    amount: order.amount ? order.amount / 100 : 0,
                },
                notDeliveredReason: reason,
                lastDeliveryBoy: order.deliveryBoyName || 'Unassigned', // Current / Active
                previousDeliveryBoy: previousDbName, // The one who failed or Unassigned
                deliveryDate: order.deliveryDate,
                reassignedAt: order.reassignedAt,
                isOverdue: order.status !== 'NOT_DELIVERED' && tab === 'pending',
                activeRouteId: order.activeRouteId,
                activeRouteName: order.activeRouteName,
                status: order.status
            };
        });

        // Get unique reasons for filter dropdown
        const reasonsRes = await query<{ reason: string }>(
            `SELECT "reason" FROM "NotDeliveredReason" WHERE "isActive" = true ORDER BY "reason" ASC`
        );
        const reasons = reasonsRes.rows.map(r => r.reason);

        return NextResponse.json({
            success: true,
            orders,
            reasons
        });

    } catch (error) {
        console.error("Error fetching not delivered orders:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}

