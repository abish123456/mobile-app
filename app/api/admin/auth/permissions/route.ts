import { NextRequest, NextResponse } from "next/server";
import { getAdminIdFromRequest, getAdminPermissions, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";

// GET /api/admin/auth/permissions - Get current logged-in admin's permissions
export async function GET(req: NextRequest) {
    try {
        const adminId = await getAdminIdFromRequest(req);
        
        if (!adminId) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const permissions = await getAdminPermissions(adminId);

        return NextResponse.json({
            success: true,
            permissions
        }, { status: 200 });

    } catch (error) {
        console.error("Error fetching admin permissions:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
