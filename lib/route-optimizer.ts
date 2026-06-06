import { getOptimizedRoute } from './mappls';

export interface Location {
    lat: number;
    lng: number;
}

export interface RouteStop extends Location {
    id: string;
    [key: string]: any;
}

/**
 * Calculates the Haversine distance between two points in km (Fallback)
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
 * Optimizes the route using actual driving distances from Mappls
 */
export async function optimizeRoute(base: Location, orders: RouteStop[]): Promise<{
    stops: RouteStop[],
    distance?: string,
    duration?: number
}> {
    if (orders.length <= 1) {
        return { stops: orders };
    }

    try {
        console.log(`Optimizing route for ${orders.length} orders using Mappls Cloud API...`);
        const result = await getOptimizedRoute(base, orders);
        
        if (result && result.order) {
            // Reorder the original orders array based on Mappls' optimized indices
            const optimizedStops = result.order.map((idx: number) => orders[idx]);
            return {
                stops: optimizedStops,
                distance: result.distance,
                duration: result.duration
            };
        }
        
        throw new Error("No optimization results from Mappls");
    } catch (error) {
        console.warn("Mappls cloud optimization failed, falling back to local optimization:", error);
        return { stops: optimizeRouteLocal(base, orders) };
    }
}

/**
 * Local TSP solver using Haversine distance (Fallback)
 */
function optimizeRouteLocal(base: Location, orders: RouteStop[]): RouteStop[] {
    if (orders.length <= 1) return orders;

    // 1. Nearest Neighbor to get an initial path
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

    // 2. 2-opt refinement
    return twoOptLocal(base, route);
}


function totalDistanceLocal(base: Location, path: RouteStop[]): number {
    let dist = 0;
    let prev = base;
    for (const stop of path) {
        dist += calculateDistance(prev, stop);
        prev = stop;
    }
    return dist;
}

function twoOptLocal(base: Location, path: RouteStop[]): RouteStop[] {
    let improved = true;
    let bestPath = [...path];
    let bestDistance = totalDistanceLocal(base, bestPath);

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

                const candidateDistance = totalDistanceLocal(base, candidate);
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
