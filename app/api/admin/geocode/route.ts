import { NextRequest, NextResponse } from "next/server";

// Proxy for Nominatim geocoding (avoids browser CORS issues)
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');

    if (!q || !q.trim()) {
        return NextResponse.json({ results: [] });
    }

    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=in`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'SabolsAdmin/1.0 (attendance-locations)',
                'Accept': 'application/json'
            }
        });
        const data = await res.json();
        return NextResponse.json({ success: true, results: data || [] });
    } catch (error) {
        console.error("[Geocode Proxy] Error:", error);
        return NextResponse.json({ success: false, results: [], message: "Geocoding failed" }, { status: 500 });
    }
}
