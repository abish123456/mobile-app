import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const query = searchParams.get('q');

    let url = '';
    if (query) {
        url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`;
    } else if (lat && lon) {
        url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    } else {
        return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'WaterCanDeliveryApp/1.0',
                'Referer': 'https://watercan-app.com'
            }
        });

        if (!response.ok) {
            throw new Error(`Nominatim API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Geocoding error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch geocoding data' }, { status: 500 });
    }
}
