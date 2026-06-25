import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";

export async function GET(req: NextRequest) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, ["view_service_areas", "view_routes", "view_assign_routes"]))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const result = await query(
            `SELECT sa.*, sr.name as "serviceRouteName" 
             FROM "ServiceArea" sa 
             LEFT JOIN "ServiceRoute" sr ON sa."serviceRouteId" = sr.id 
             ORDER BY sa."pincode" ASC`
        );

        return NextResponse.json({
            success: true,
            serviceAreas: result.rows
        });
    } catch (error) {
        console.error("Error in GET /api/admin/service-areas:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "create_service_areas"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }
        
        const adminId = await getAdminIdFromRequest(req);

        const { pincode, areaName, active } = await req.json();

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

        // Check if pincode or area name already exists
        const existing = await query(
            `SELECT id, pincode, "areaName" FROM "ServiceArea" WHERE "pincode" = $1 OR "areaName" = $2`,
            [pincode, areaName]
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
            `INSERT INTO "ServiceArea" (id, pincode, "areaName", active, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
            [
                `sa_${Math.random().toString(36).substr(2, 9)}`,
                pincode,
                areaName,
                active !== undefined ? active : true
            ]
        );

        const newArea = result.rows[0];

        await logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'SERVICE_AREA',
            entityId: newArea.id,
            action: 'CREATE',
            oldData: null,
            newData: { pincode: newArea.pincode, areaName: newArea.areaName, active: newArea.active },
            description: `Created new service area "${newArea.areaName}" (${newArea.pincode}).`
        });

        return NextResponse.json({
            success: true,
            serviceArea: newArea
        });
    } catch (error) {
        console.error("Error in POST /api/admin/service-areas:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
