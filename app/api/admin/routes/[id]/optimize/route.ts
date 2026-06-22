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
        // Fetch hub location from SystemConfig, fallback to first order's location if no hub is specified
        const configRes = await query<{ value: string }>(
            `SELECT value FROM "SystemConfig" WHERE key = $1`,
            ['HUB_LOCATION']
        );
        let baseLocation = {
            lat: pendingOrders[0].latitude!,
            lng: pendingOrders[0].longitude!
        };
        if (configRes.rows.length > 0) {
            try {
                const parsedLocation = JSON.parse(configRes.rows[0].value);
                if (parsedLocation && parsedLocation.lat && parsedLocation.lng) {
                    baseLocation = {
                        lat: parsedLocation.lat,
                        lng: parsedLocation.lng
                    };
                }
            } catch (e) {
                console.error("Error parsing HUB_LOCATION from DB", e);
            }
        }

        // 4. Run Optimization
        const stops: RouteStop[] = pendingOrders.map(o => ({
            id: o.id,
            lat: o.latitude!,
            lng: o.longitude!
        }));

        console.log(`[OptimizeAPI] Starting optimization for Route ${routeId}. Base Location: ${JSON.stringify(baseLocation)}. Total Stops: ${stops.length}`);

        const optimizedStops = await optimizeRoute(baseLocation, stops);

        console.log(`[OptimizeAPI] Optimization complete. Saving ${optimizedStops.length} stops to DB.`);

        // 5. Update sequences in DB
        await withTransaction(async (client) => {
            for (let i = 0; i < optimizedStops.length; i++) {
                await client.query(
                    `UPDATE "RouteOrder" SET "sequence" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
                    [i + 1, optimizedStops[i].id]
                );
            }
            
            // Mark the route as auto-optimized
            await client.query(
                `UPDATE "Route" SET "isAutoOptimized" = true, "updatedAt" = NOW() WHERE "id" = $1`,
                [routeId]
            );
        });

        return NextResponse.json({
            success: true,
            message: `Successfully optimised ${optimizedStops.length} orders.`,
            count: optimizedStops.length
        });

    } catch (error) {
        console.error("Route Optimization Error:", error);
        return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
    }
}
