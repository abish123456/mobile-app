import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { id } = await params;
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

        return NextResponse.json({
            success: true,
            serviceArea: result.rows[0]
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
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { id } = await params;

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
