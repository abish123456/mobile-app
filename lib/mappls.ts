
/**
 * Search for a place by query (Geocoding)
 */
export async function searchPlaces(query: string) {
    const restKey = process.env.MAPPLS_REST_API_KEY;
    if (!restKey) {
        console.error('MAPPLS_REST_API_KEY is missing');
        return [];
    }

    try {
        const response = await fetch(`https://search.mappls.com/search/places/autosuggest/json?query=${encodeURIComponent(query)}&access_token=${restKey}`, {
            headers: {
                Accept: 'application/json'
            }
        });

        const data = await response.json();
        return data.suggestedLocations || data.copResults || [];
    } catch (error: any) {
        console.error('Mappls Search Error:', error.message);
        return [];
    }
}

/**
 * Reverse Geocode coordinates to an address
 */
export async function reverseGeocode(lat: number, lng: number) {
    const restKey = process.env.MAPPLS_REST_API_KEY;
    if (!restKey) {
        console.error('MAPPLS_REST_API_KEY is missing');
        return null;
    }

    try {
        const url = `https://search.mappls.com/search/address/rev-geocode?lat=${lat}&lng=${lng}&access_token=${restKey}`;
        const response = await fetch(url);

        if (response.ok) {
            const data = await response.json();
            const result = data.results?.[0] || data.response?.[0];
            if (result) return result;
        }
        return null;
    } catch (error: any) {
        console.error('Mappls Reverse Geocode Exception:', error.message);
        return null;
    }
}


/**
 * Get an optimized route for a set of locations
 * Attempts to use Mappls Trip Optimization API first.
 * If API access is denied (or fails), it will return null.
 */
export async function getOptimizedRoute(start: { lat: number, lng: number }, locations: { lat: number, lng: number }[]) {
    const allPoints = [start, ...locations];
    const coords = allPoints.map(l => `${l.lng},${l.lat}`).join(';');
    // Allow user to use a dedicated key specifically for Trip Optimization (e.g. while waiting for activation)
    const restKey = process.env.MAPPLS_TRIP_OPTIMIZATION_KEY || process.env.MAPPLS_REST_API_KEY;
    if (!restKey) throw new Error('Mappls API key is not defined in environment variables');

    // 1. Attempt Mappls Trip Optimization API
    try {
        console.log(`Attempting Mappls Trip Optimization API for ${locations.length} orders...`);
        // Updated to use the correct Route Optimization endpoint that accepts static keys via access_token
        const url = `https://route.mappls.com/route/optimization/trip_optimization/driving/${coords}?access_token=${restKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok && data.trips && data.waypoints) {
            console.log("Trip Optimization successful via Mappls API!");
            
            // The Mappls/OSRM waypoints array natively maps 1:1 with the input coordinates array.
            // We MUST inject the original array index BEFORE sorting to map it back correctly.
            const mappedWaypoints = data.waypoints.map((wp: any, idx: number) => ({
                ...wp,
                original_index: idx
            }));

            let optimizedOrder: number[] = [];

            // Sort by waypoint_index (which represents the optimal visit order)
            const sequence = mappedWaypoints.sort((a: any, b: any) => a.waypoint_index - b.waypoint_index);
            
            for (const wp of sequence) {
                // If original_index > 0, it means it's one of the delivery locations (not the start point at 0)
                if (wp.original_index > 0) {
                    optimizedOrder.push(wp.original_index - 1); // -1 to map back to the 'locations' array
                }
            }

            // If the parse succeeded and gave us the right number of stops
            if (optimizedOrder.length === locations.length) {
                const distanceKm = (data.trips[0].distance / 1000).toFixed(2);
                return {
                    order: optimizedOrder,
                    distance: distanceKm,
                    duration: Math.round(data.trips[0].duration / 60), // Convert seconds to minutes
                    routeData: data
                };
            }
        }

        if (data.error || data.msg) {
            console.warn(`Trip Optimization API returned error: ${data.error || data.msg}`);
        }
    } catch (apiError: any) {
        console.warn(`Mappls Trip Optimization failed: ${apiError.message}`);
    }

    return null;
}
