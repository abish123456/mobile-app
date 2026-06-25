import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";
import crypto from "crypto";

export async function GET(req: NextRequest) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_roles');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const rolesRes = await query(`
            SELECT id, name, description, permissions, "createdAt", "updatedAt"
            FROM "AdminRole"
            ORDER BY "createdAt" DESC
        `);

        return NextResponse.json({
            success: true,
            roles: rolesRes.rows
        });
    } catch (error) {
        console.error("[Get Roles] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch roles" },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'create_roles');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const body = await req.json();
        const name = (body?.name || "").toString().trim();
        const description = (body?.description || "").toString().trim();
        const permissions = Array.isArray(body?.permissions) ? body.permissions : [];

        if (!name) {
            return NextResponse.json(
                { success: false, message: "Role name is required" },
                { status: 400 }
            );
        }

        // Check if role name already exists
        const existingRes = await query(
            `SELECT id FROM "AdminRole" WHERE name = $1`,
            [name]
        );

        if (existingRes.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "A role with this name already exists" },
                { status: 409 }
            );
        }

        const id = crypto.randomUUID();
        const now = new Date();

        const insertRes = await query(
            `INSERT INTO "AdminRole" (id, name, description, permissions, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, description, permissions`,
            [id, name, description, permissions, now, now]
        );

        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'ADMIN_ROLE',
            entityId: id,
            action: 'CREATE',
            oldData: null,
            newData: insertRes.rows[0],
            description: `Admin created team role (${name})`
        });

        return NextResponse.json({
            success: true,
            message: "Role created successfully",
            role: insertRes.rows[0]
        });
    } catch (error) {
        console.error("[Create Role] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to create role" },
            { status: 500 }
        );
    }
}
