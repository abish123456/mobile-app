import { NextRequest, NextResponse } from "next/server";

// POST /api/admin/delivery-boys/manage-areas
export async function POST(req: NextRequest) {
  return NextResponse.json(
    { success: false, message: "This API endpoint is deprecated. Use PUT /api/admin/delivery-boys/[id] for assignment." },
    { status: 410 }
  );
}

// GET /api/admin/delivery-boys/manage-areas
export async function GET(req: NextRequest) {
  return NextResponse.json(
    { success: false, message: "This API endpoint is deprecated." },
    { status: 410 }
  );
}
