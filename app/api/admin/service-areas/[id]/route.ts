import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import { logAction } from "../../../../../lib/audit";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "edit_service_areas"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }
        
        const adminId = await getAdminIdFromRequest(req);

        const { id } = await params;
        const { pincode, areaName, active } = await req.json();
        
        // Fetch old data
        const oldRes = await query<{pincode: string, areaName: string, active: boolean}>(
            `SELECT pincode, "areaName", active FROM "ServiceArea" WHERE id = $1`,
            [id]
        );
        const oldData = oldRes.rows[0];

        if (!pincode || !areaName) {
            return NextResponse.json(
                { success: false, message: "Pincode and Area Name are required" },
                { status: 400 }
            );
        }

        if (pincode.length !== 6) {
            return NextResponse.json(
                { success: false, message: "Pincode must be exactly 6 digits" },
                { status: 400 }
            );
        }

        // Check if another service area has the same pincode or area name
        const existing = await query(
            `SELECT id, pincode, "areaName" FROM "ServiceArea" WHERE ("pincode" = $1 OR "areaName" = $2) AND id != $3`,
            [pincode, areaName, id]
        );

        if (existing.rows.length > 0) {
            const conflict = existing.rows[0];
            const message = conflict.pincode === pincode
                ? "Pincode already exists"
                : "Area name already exists";
            return NextResponse.json(
                { success: false, message },
                { status: 400 }
            );
        }

        const result = await query(
            `UPDATE "ServiceArea"
       SET pincode = $1, "areaName" = $2, active = $3, "updatedAt" = NOW()
       WHERE id = $4
       RETURNING *`,
            [pincode, areaName, active !== undefined ? active : true, id]
        );

        if (result.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Service area not found" },
                { status: 404 }
            );
        }

        const newArea = result.rows[0];

        await logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'SERVICE_AREA',
            entityId: id,
            action: 'UPDATE',
            oldData: { pincode: oldData?.pincode, areaName: oldData?.areaName, active: oldData?.active },
            newData: { pincode: newArea.pincode, areaName: newArea.areaName, active: newArea.active },
            description: `Updated service area "${newArea.areaName}".`
        });

        return NextResponse.json({
            success: true,
            serviceArea: newArea
        });
    } catch (error) {
        console.error("Error in PUT /api/admin/service-areas/[id]:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "delete_service_areas"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }
        
        const adminId = await getAdminIdFromRequest(req);

        const { id } = await params;
        
        // Fetch old data
        const oldRes = await query<{pincode: string, areaName: string}>(
            `SELECT pincode, "areaName" FROM "ServiceArea" WHERE id = $1`,
            [id]
        );
        const oldData = oldRes.rows[0] || { pincode: 'Unknown', areaName: 'Unknown' };

        const result = await query(
            `DELETE FROM "ServiceArea" WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Service area not found" },
                { status: 404 }
            );
        }

        await logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'SERVICE_AREA',
            entityId: id,
            action: 'DELETE',
            oldData: { pincode: oldData.pincode, areaName: oldData.areaName },
            newData: null,
            description: `Deleted service area "${oldData.areaName}" (${oldData.pincode}).`
        });

        return NextResponse.json({
            success: true,
            message: "Service area deleted successfully"
        });
    } catch (error) {
        console.error("Error in DELETE /api/admin/service-areas/[id]:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
