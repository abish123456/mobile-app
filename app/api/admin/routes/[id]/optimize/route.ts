import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../../lib/db";
import { optimizeRoute, RouteStop } from "../../../../../../lib/route-optimizer";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../../lib/admin-auth";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: routeId } = await params;

    try {
        // 1. Verify Admin Session
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        // 2. Fetch all orders for this route with their GPS coordinates
        const ordersRes = await query<{
            id: string; // RouteOrder ID
            latitude: number | null;
            longitude: number | null;
        }>(
            `SELECT ro."id", a."latitude", a."longitude"
       FROM "RouteOrder" ro
       JOIN "Order" o ON o."id" = ro."orderId"
       JOIN "Address" a ON a."id" = o."addressId"
       WHERE ro."routeId" = $1
       AND ro."deliveryStatus" = 'PENDING'
       AND o."status" != 'CANCELLED'`,
            [routeId]
        );

        const pendingOrders = ordersRes.rows.filter(o => o.latitude !== null && o.longitude !== null);
        const missingGpsOrders = ordersRes.rows.filter(o => o.latitude === null || o.longitude === null);

        if (pendingOrders.length === 0) {
            return NextResponse.json({
                success: false,
                message: "No pending orders with GPS coordinates found in this route.",
                missingGpsCount: missingGpsOrders.length
            }, { status: 400 });
        }

        if (missingGpsOrders.length > 0) {
            // Technically we could optimize the partial route, but let's be strict for now
            // or return a warning. Actually, let's allow optimization if at least 1 order has GPS,
            // but the current code only takes pendingOrders.
            // If we want to BE HELPFUL, we should tell the user what's missing.
        }

        // 3. Define Hub/Starting Location
        let baseLocation = {
            lat: pendingOrders[0].latitude!,
            lng: pendingOrders[0].longitude!
        };

        const configRes = await query<{ value: string }>(
            `SELECT "value" FROM "SystemConfig" WHERE "key" = $1`,
            ['HUB_LOCATION']
        );

        if (configRes.rows.length > 0) {
            try {
                const hub = JSON.parse(configRes.rows[0].value);
                if (hub.lat && hub.lng) {
                    baseLocation = {
                        lat: Number(hub.lat),
                        lng: Number(hub.lng)
                    };
                }
            } catch (e) {
                console.error("Failed to parse HUB_LOCATION from DB", e);
            }
        }

        // 4. Run Optimization
        const stops: RouteStop[] = pendingOrders.map(o => ({
            id: o.id,
            lat: o.latitude!,
            lng: o.longitude!
        }));

        const { stops: optimizedStops, distance, duration } = await optimizeRoute(baseLocation, stops);

        // 5. Update sequences in DB
        await withTransaction(async (client) => {
            for (let i = 0; i < optimizedStops.length; i++) {
                await client.query(
                    `UPDATE "RouteOrder" SET "sequence" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
                    [i + 1, optimizedStops[i].id]
                );
            }
        });

        return NextResponse.json({
            success: true,
            message: `Successfully optimised ${optimizedStops.length} orders.${distance ? ` Total distance: ${distance} km.` : ''}`,
            count: optimizedStops.length,
            distance: distance ? `${distance} km` : undefined,
            duration: duration ? `${duration} mins` : undefined
        });

    } catch (error) {
        console.error("Route Optimization Error:", error);
        return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
    }
}
