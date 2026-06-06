import { NextRequest, NextResponse } from 'next/server';
import { searchPlaces, reverseGeocode } from '@/lib/mappls';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const query = searchParams.get('q');

    try {
        if (query) {
            const results = await searchPlaces(query);
            if (!results || !Array.isArray(results)) {
                return NextResponse.json([]);
            }
            
            const transformed = results.map((item: any) => ({
                display_name: item.formattedAddress || item.placeAddress || item.formatted_address || '',
                lat: (item.latitude || item.lat || 0).toString(),
                lon: (item.longitude || item.lng || 0).toString(),
                address: {
                    road: item.street || item.poi || '',
                    suburb: item.locality || item.subLocality || '',
                    city: item.city || item.district || '',
                    state: item.state || '',
                    postcode: item.pincode || item.postCode || ''
                }
            }));
            
            return NextResponse.json(transformed);
        } else if (lat && lon) {
            const result = await reverseGeocode(parseFloat(lat), parseFloat(lon));
            if (!result) {
                return NextResponse.json({ error: 'Not found' }, { status: 404 });
            }
            
            const transformed = {
                display_name: result.formatted_address || result.formattedAddress || '',
                address: {
                    road: result.street || result.poi || '',
                    suburb: result.locality || result.subLocality || '',
                    city: result.city || result.district || '',
                    state: result.state || '',
                    postcode: result.pincode || result.postCode || ''
                }
            };
            
            return NextResponse.json(transformed);
        } else {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }
    } catch (error: any) {
        console.error('Geocoding error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch geocoding data' }, { status: 500 });
    }
}
