import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";

// GET all attendance locations
export async function GET(req: NextRequest) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_attendance_locations');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const result = await query(`
            SELECT id, name, latitude, longitude, "radiusMeters", active, "createdAt", "updatedAt"
            FROM "AttendanceLocation"
            ORDER BY "createdAt" DESC
        `);

        return NextResponse.json({ success: true, locations: result.rows });
    } catch (error) {
        console.error("[AttendanceLocations GET] Error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch locations" }, { status: 500 });
    }
}

// POST create a new attendance location
export async function POST(req: NextRequest) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'create_attendance_locations');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const body = await req.json();
        const name = (body?.name || "").toString().trim();
        const latitude = parseFloat(body?.latitude);
        const longitude = parseFloat(body?.longitude);
        const radiusMeters = parseFloat(body?.radiusMeters);
        const active = body?.active ?? true;

        if (!name) {
            return NextResponse.json({ success: false, message: "Name is required" }, { status: 400 });
        }
        if (isNaN(latitude) || isNaN(longitude)) {
            return NextResponse.json({ success: false, message: "Valid latitude and longitude are required" }, { status: 400 });
        }
        if (isNaN(radiusMeters) || radiusMeters <= 0) {
            return NextResponse.json({ success: false, message: "Radius must be a positive number" }, { status: 400 });
        }

        const result = await query(`
            INSERT INTO "AttendanceLocation" (id, name, latitude, longitude, "radiusMeters", active, "createdAt", "updatedAt")
            VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING id, name, latitude, longitude, "radiusMeters", active, "createdAt"
        `, [name, latitude, longitude, radiusMeters, active]);

        const adminId = await getAdminIdFromRequest(req);
        await logAction({
            actorId: adminId,
            actorType: "ADMIN",
            entity: "ATTENDANCE_LOCATION",
            entityId: result.rows[0].id,
            action: "CREATE",
            newData: result.rows[0],
            description: `Created attendance location "${name}"`
        });

        return NextResponse.json({ success: true, location: result.rows[0] });
    } catch (error) {
        console.error("[AttendanceLocations POST] Error:", error);
        return NextResponse.json({ success: false, message: "Failed to create location" }, { status: 500 });
    }
}
