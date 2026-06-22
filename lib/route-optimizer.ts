export interface Location {
    lat: number;
    lng: number;
}

export interface RouteStop extends Location {
    id: string;
    [key: string]: any;
}

/**
 * Calculates the Haversine distance between two points in km
 */
export function calculateDistance(a: Location, b: Location): number {
    if (!a || !b || a.lat === undefined || a.lng === undefined || b.lat === undefined || b.lng === undefined) {
        return Infinity;
    }
    const R = 6371; // Earth's radius in km
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const x =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c; // Distance in km
}

/**
 * Optimizes the route using Mappls Trip Optimization API,
 * with a fallback to Nearest Neighbor + 2-opt refinement.
 */
export async function optimizeRoute(base: Location, orders: RouteStop[]): Promise<RouteStop[]> {
    if (orders.length <= 1) return orders;

    const restKey = process.env.MAPPLS_TRIP_OPTIMIZATION_KEY;

    // Try Mappls API if key is available and stop count is reasonable (under 100)
    if (restKey && orders.length < 100) {
        try {
            const allPoints = [base, ...orders];
            // Format: lng,lat;lng,lat
            const coordsString = allPoints.map(p => `${p.lng},${p.lat}`).join(';');
            
            const url = `https://route.mappls.com/route/optimization/trip_optimization/driving/${coordsString}?access_token=${restKey}`;
            
            console.log(`[RouteOptimizer] Calling Mappls Trip Optimization API with ${allPoints.length} points...`);
            const startTime = Date.now();
            const res = await fetch(url);
            
            if (res.ok) {
                const data = await res.json();
                if (data.code === 'Ok' && data.waypoints && data.waypoints.length === allPoints.length) {
                    console.log(`[RouteOptimizer] Mappls API Success! Optimization took ${Date.now() - startTime}ms`);
                    // waypoints[i] contains waypoint_index indicating the optimized sequence
                    const sortedOrders = [...orders].sort((a, b) => {
                        const indexAInInput = orders.indexOf(a) + 1;
                        const indexBInInput = orders.indexOf(b) + 1;
                        const optimizedIndexA = data.waypoints[indexAInInput].waypoint_index;
                        const optimizedIndexB = data.waypoints[indexBInInput].waypoint_index;
                        return optimizedIndexA - optimizedIndexB;
                    });
                    
                    return sortedOrders;
                } else {
                    console.warn(`[RouteOptimizer] Mappls API returned unexpected data:`, JSON.stringify(data));
                }
            } else {
                console.warn(`Mappls API failed with status: ${res.status}. Falling back to local optimization.`);
            }
        } catch (error) {
            console.error("Mappls optimization error, falling back to local:", error);
        }
    }

    // FALLBACK: 1. Nearest Neighbor to get an initial path
    const route: RouteStop[] = [];
    let current: Location = base;
    let remaining = [...orders];

    while (remaining.length > 0) {
        let nearestIndex = 0;
        let minDist = calculateDistance(current, remaining[0]);

        for (let i = 1; i < remaining.length; i++) {
            const d = calculateDistance(current, remaining[i]);
            if (d < minDist) {
                minDist = d;
                nearestIndex = i;
            }
        }

        const next = remaining.splice(nearestIndex, 1)[0];
        route.push(next);
        current = next;
    }

    // 2. 2-opt refinement to remove crossings and shorten total path
    return twoOpt(base, route);
}

function totalDistance(base: Location, path: RouteStop[]): number {
    let dist = 0;
    let prev = base;
    for (const stop of path) {
        dist += calculateDistance(prev, stop);
        prev = stop;
    }
    return dist;
}

function twoOpt(base: Location, path: RouteStop[]): RouteStop[] {
    let improved = true;
    let bestPath = [...path];
    let bestDistance = totalDistance(base, bestPath);

    // Limit iterations to prevent heavy load if many orders
    let iterations = 0;
    const maxIterations = 500;

    while (improved && iterations < maxIterations) {
        improved = false;
        iterations++;

        for (let i = 0; i < bestPath.length - 1; i++) {
            for (let j = i + 1; j < bestPath.length; j++) {
                const candidate = [
                    ...bestPath.slice(0, i),
                    ...bestPath.slice(i, j + 1).reverse(),
                    ...bestPath.slice(j + 1),
                ];

                const candidateDistance = totalDistance(base, candidate);
                if (candidateDistance + 0.0001 < bestDistance) {
                    bestDistance = candidateDistance;
                    bestPath = candidate;
                    improved = true;
                }
            }
        }
    }

    return bestPath;
}
