import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import crypto from "crypto";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";
import { getStartOfDayIST, getEndOfDayIST, getNowIST } from "../../../../lib/timezone";

// GET /api/admin/service-routes - List all service routes
export async function GET(req: NextRequest) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "view_routes")) && !(await verifyAdminAuthWithPermission(req, "view_assign_routes"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const dateStr = searchParams.get("date"); // Optional: for fetching daily assignment
        const targetDate = dateStr ? new Date(dateStr) : getStartOfDayIST(getNowIST());

        const startOfDay = getStartOfDayIST(targetDate);
        const endOfDay = getEndOfDayIST(targetDate);

        // Fetch routes and their daily assignment for the target date
        const result = await query(
            `SELECT 
        sr."id",
        sr."name",
        sr."description",
        sr."currentDeliveryBoyId",
        sr."createdAt",
        sr."updatedAt",
        -- Get daily assignment for the target date OR the current (carried forward) staff
        COALESCE(
          (SELECT json_build_object(
             'id', r.id,
             'deliveryBoyId', r."deliveryBoyId",
             'deliveryBoyName', db."name",
             'isOverride', true
           )
           FROM "Route" r
           JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
           WHERE r."serviceRouteId" = sr."id"
             AND DATE(r."date" AT TIME ZONE 'Asia/Kolkata') = DATE($1 AT TIME ZONE 'Asia/Kolkata')
           LIMIT 1),
          (SELECT json_build_object(
             'id', NULL,
             'deliveryBoyId', db."id",
             'deliveryBoyName', db."name",
             'isOverride', false
           )
           FROM "DeliveryBoy" db
           WHERE db."id" = sr."currentDeliveryBoyId")
        ) as "dailyAssignment",
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', sa.id,
              'pincode', sa.pincode,
              'areaName', sa."areaName"
            )
          )
           FROM "ServiceArea" sa
           WHERE sa."serviceRouteId" = sr."id"),
          '[]'
        ) as "serviceAreas",
        -- Count unassigned orders matching this route's pincodes for the target date
        COALESCE(
          (SELECT COUNT(DISTINCT o."id")::int
           FROM "Order" o
           INNER JOIN "Address" a ON o."addressId" = a."id"
           INNER JOIN "ServiceArea" sa ON a."pincode" = sa."pincode"
           WHERE sa."serviceRouteId" = sr."id"
             AND o."deliveryDate" >= $2
             AND o."deliveryDate" <= $3
             AND (o."paymentStatus" = 'SUCCESS' OR o."paymentStatus" = 'COD')
             AND o."status" NOT IN ('CANCELLED', 'DELIVERED')
             AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
             -- Only count if not ALREADY assigned to an active (non-failed) route for that date
             AND NOT EXISTS (
               SELECT 1 FROM "RouteOrder" ro 
               WHERE ro."orderId" = o."id" 
               AND ro."deliveryStatus" != 'NOT_DELIVERED'
             )
          ),
          0
        ) as "unassignedOrderCount"
      FROM "ServiceRoute" sr
      ORDER BY 
        substring(sr."name" FROM '^[^0-9]+') ASC, 
        NULLIF(substring(sr."name" FROM '[0-9]+'), '')::int ASC NULLS FIRST`,
            [targetDate, startOfDay, endOfDay]
        );

        return NextResponse.json({
            success: true,
            serviceRoutes: result.rows,
        });
    } catch (error) {
        console.error("Error in GET /api/admin/service-routes:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}

// POST /api/admin/service-routes - Create new service route
export async function POST(req: NextRequest) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "create_routes"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }
        const adminId = await getAdminIdFromRequest(req);

        const body = await req.json();
        const { name, description, assignedPincodes } = body;

        // Validation
        if (!name || typeof name !== "string" || name.trim().length === 0) {
            return NextResponse.json(
                { success: false, message: "Route name is required" },
                { status: 400 }
            );
        }

        // Check if name exists
        const existingName = await query(
            `SELECT id FROM "ServiceRoute" WHERE "name" = $1`,
            [name.trim()]
        );

        if (existingName.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "Route name already exists" },
                { status: 400 }
            );
        }

        // Check if any pincodes are already assigned to another route
        if (assignedPincodes && Array.isArray(assignedPincodes) && assignedPincodes.length > 0) {
            const conflictingAreas = await query<{ pincode: string, routeName: string }>(
                `SELECT sa.pincode, sr.name as "routeName"
                 FROM "ServiceArea" sa
                 JOIN "ServiceRoute" sr ON sa."serviceRouteId" = sr.id
                 WHERE sa.pincode = ANY($1) AND sa."serviceRouteId" IS NOT NULL`,
                [assignedPincodes]
            );

            if (conflictingAreas.rows.length > 0) {
                const conflicts = conflictingAreas.rows.map(c => `${c.pincode} (${c.routeName})`).join(", ");
                return NextResponse.json(
                    { success: false, message: `The following pincodes are already assigned to other routes: ${conflicts}` },
                    { status: 400 }
                );
            }
        }

        const id = crypto.randomUUID();
        const now = new Date();

        // Create Route
        await query(
            `INSERT INTO "ServiceRoute" ("id", "name", "description", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $4)`,
            [id, name.trim(), description || null, now]
        );

        // Assign Pincodes
        if (assignedPincodes && Array.isArray(assignedPincodes) && assignedPincodes.length > 0) {
            await query(
                `UPDATE "ServiceArea"
         SET "serviceRouteId" = $1, "updatedAt" = NOW()
         WHERE "pincode" = ANY($2)`,
                [id, assignedPincodes]
            );
        }

        await logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'SERVICE_ROUTE',
            entityId: id,
            action: 'CREATE',
            oldData: null,
            newData: { name: name.trim(), description, assignedPincodes: assignedPincodes || [] },
            description: `Created new service route "${name.trim()}".`
        });

        return NextResponse.json({
            success: true,
            message: "Service Route created successfully",
            serviceRoute: {
                id,
                name: name.trim(),
                description
            }
        });

    } catch (error: any) {
        console.error("Error in POST /api/admin/service-routes:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
