import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import { logAction } from "../../../../../lib/audit";

// PUT update an attendance location
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'create_attendance_locations');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const { id } = await params;
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

        // Get old data for audit
        const oldRes = await query(`SELECT * FROM "AttendanceLocation" WHERE id = $1`, [id]);
        if (oldRes.rows.length === 0) {
            return NextResponse.json({ success: false, message: "Location not found" }, { status: 404 });
        }

        const result = await query(`
            UPDATE "AttendanceLocation"
            SET name = $1, latitude = $2, longitude = $3, "radiusMeters" = $4, active = $5, "updatedAt" = NOW()
            WHERE id = $6
            RETURNING id, name, latitude, longitude, "radiusMeters", active, "createdAt", "updatedAt"
        `, [name, latitude, longitude, radiusMeters, active, id]);

        const adminId = await getAdminIdFromRequest(req);
        await logAction({
            actorId: adminId,
            actorType: "ADMIN",
            entity: "ATTENDANCE_LOCATION",
            entityId: id,
            action: "UPDATE",
            oldData: oldRes.rows[0],
            newData: result.rows[0],
            description: `Updated attendance location "${name}"`
        });

        return NextResponse.json({ success: true, location: result.rows[0] });
    } catch (error) {
        console.error("[AttendanceLocation PUT] Error:", error);
        return NextResponse.json({ success: false, message: "Failed to update location" }, { status: 500 });
    }
}

// DELETE an attendance location
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'create_attendance_locations');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const { id } = await params;

        const oldRes = await query(`SELECT * FROM "AttendanceLocation" WHERE id = $1`, [id]);
        if (oldRes.rows.length === 0) {
            return NextResponse.json({ success: false, message: "Location not found" }, { status: 404 });
        }

        await query(`DELETE FROM "AttendanceLocation" WHERE id = $1`, [id]);

        const adminId = await getAdminIdFromRequest(req);
        await logAction({
            actorId: adminId,
            actorType: "ADMIN",
            entity: "ATTENDANCE_LOCATION",
            entityId: id,
            action: "DELETE",
            oldData: oldRes.rows[0],
            description: `Deleted attendance location "${oldRes.rows[0].name}"`
        });

        return NextResponse.json({ success: true, message: "Location deleted" });
    } catch (error) {
        console.error("[AttendanceLocation DELETE] Error:", error);
        return NextResponse.json({ success: false, message: "Failed to delete location" }, { status: 500 });
    }
}
