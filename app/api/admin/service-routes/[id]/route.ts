import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import crypto from "crypto";
import { getStartOfDayIST, getEndOfDayIST, getNowIST } from "../../../../../lib/timezone";

// PUT /api/admin/service-routes/[id] - Update service route
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { name, description, assignedPincodes } = body;

        // Validation
        if (!name || typeof name !== "string" || name.trim().length === 0) {
            return NextResponse.json(
                { success: false, message: "Route name is required" },
                { status: 400 }
            );
        }

        // Check availability of name (excluding current route)
        const existingName = await query(
            `SELECT id FROM "ServiceRoute" WHERE "name" = $1 AND "id" != $2`,
            [name.trim(), id]
        );

        if (existingName.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "Route name already exists" },
                { status: 400 }
            );
        }

        // Check if any pincodes are already assigned to a DIFFERENT route
        if (assignedPincodes && Array.isArray(assignedPincodes) && assignedPincodes.length > 0) {
            const conflictingAreas = await query<{ pincode: string, routeName: string }>(
                `SELECT sa.pincode, sr.name as "routeName"
                 FROM "ServiceArea" sa
                 JOIN "ServiceRoute" sr ON sa."serviceRouteId" = sr.id
                 WHERE sa.pincode = ANY($1) AND sa."serviceRouteId" IS NOT NULL AND sa."serviceRouteId" != $2`,
                [assignedPincodes, id]
            );

            if (conflictingAreas.rows.length > 0) {
                const conflicts = conflictingAreas.rows.map(c => `${c.pincode} (${c.routeName})`).join(", ");
                return NextResponse.json(
                    { success: false, message: `The following pincodes are already assigned to other routes: ${conflicts}` },
                    { status: 400 }
                );
            }
        }

        const now = new Date();

        // Update Route
        await query(
            `UPDATE "ServiceRoute"
       SET "name" = $1, "description" = $2, "updatedAt" = $3
       WHERE "id" = $4`,
            [name.trim(), description || null, now, id]
        );

        // Update Pincodes if provided
        if (assignedPincodes !== undefined) {
            // Get currently assigned pincodes to identify affected areas
            const currentPincodesRes = await query<{ pincode: string }>(
                `SELECT pincode FROM "ServiceArea" WHERE "serviceRouteId" = $1`,
                [id]
            );
            const oldPincodes = currentPincodesRes.rows.map(r => r.pincode);

            // 1. Unassign all areas from this route
            await query(
                `UPDATE "ServiceArea"
                 SET "serviceRouteId" = NULL, "updatedAt" = NOW()
                 WHERE "serviceRouteId" = $1`,
                [id]
            );

            // 2. Assign new areas
            if (Array.isArray(assignedPincodes) && assignedPincodes.length > 0) {
                await query(
                    `UPDATE "ServiceArea"
                     SET "serviceRouteId" = $1, "updatedAt" = NOW()
                     WHERE "pincode" = ANY($2)`,
                    [id, assignedPincodes]
                );
            }

            // 3. Trigger bulk reassignment for all affected pincodes (old and new)
            // This ensures orders for removed pincodes are unlinked, 
            // and orders for added pincodes are moved to this route.
            const affectedPincodes = Array.from(new Set([...oldPincodes, ...(assignedPincodes || [])]));
            if (affectedPincodes.length > 0) {
                const { reassignOrdersByPincodeBulk } = await import("../../../../../lib/order-assignment");
                const bulkResult = await reassignOrdersByPincodeBulk(affectedPincodes);
                console.log(`[BULK REASSIGN] ServiceRoute ${id} update: Moved: ${bulkResult.totalMoved}, Skipped (link generated): ${bulkResult.totalSkipped}`);
            }
        }


        return NextResponse.json({
            success: true,
            message: "Service Route updated successfully",
        });

    } catch (error: any) {
        console.error("Error in PUT /api/admin/service-routes/[id]:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}

// DELETE /api/admin/service-routes/[id] - Delete service route
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { id } = await params;

        // 0. Check for active daily assignments (Routes)
        const activeRoutes = await query(
            `SELECT id FROM "Route" WHERE "serviceRouteId" = $1 LIMIT 1`,
            [id]
        );

        if (activeRoutes.rows.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Cannot delete route with active daily assignments. Please remove assignments for this route first."
                },
                { status: 400 }
            );
        }

        // 1. Unassign service areas
        await query(
            `UPDATE "ServiceArea"
       SET "serviceRouteId" = NULL, "updatedAt" = NOW()
       WHERE "serviceRouteId" = $1`,
            [id]
        );

        // 2. Delete Route
        await query(
            `DELETE FROM "ServiceRoute" WHERE "id" = $1`,
            [id]
        );

        return NextResponse.json({
            success: true,
            message: "Service Route deleted successfully",
        });

    } catch (error: any) {
        console.error("Error in DELETE /api/admin/service-routes/[id]:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
