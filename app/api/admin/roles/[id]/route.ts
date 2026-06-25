import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import { logAction } from "../../../../../lib/audit";

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_roles');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const resolvedParams = await Promise.resolve(context.params);
        const { id } = resolvedParams;

        const roleRes = await query(
            `SELECT id, name, description, permissions, "createdAt", "updatedAt"
             FROM "AdminRole"
             WHERE id = $1`,
            [id]
        );

        if (roleRes.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Role not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            role: roleRes.rows[0]
        });
    } catch (error) {
        console.error("[Get Role] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch role" },
            { status: 500 }
        );
    }
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'edit_roles');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const resolvedParams = await Promise.resolve(context.params);
        const { id } = resolvedParams;
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

        // Check if role exists
        const roleRes = await query(`SELECT id, name, description, permissions FROM "AdminRole" WHERE id = $1`, [id]);
        if (roleRes.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Role not found" },
                { status: 404 }
            );
        }
        const oldRole = roleRes.rows[0];

        // Check if another role has the same name
        const nameCheckRes = await query(
            `SELECT id FROM "AdminRole" WHERE name = $1 AND id != $2`,
            [name, id]
        );

        if (nameCheckRes.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "A role with this name already exists" },
                { status: 409 }
            );
        }

        const now = new Date();

        const updateRes = await query(
            `UPDATE "AdminRole"
             SET name = $1, description = $2, permissions = $3, "updatedAt" = $4
             WHERE id = $5
             RETURNING id, name, description, permissions`,
            [name, description, permissions, now, id]
        );

        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'ADMIN_ROLE',
            entityId: id,
            action: 'UPDATE',
            oldData: oldRole,
            newData: updateRes.rows[0],
            description: `Admin updated team role (${name})`
        });

        return NextResponse.json({
            success: true,
            message: "Role updated successfully",
            role: updateRes.rows[0]
        });
    } catch (error) {
        console.error("[Update Role] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to update role" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'delete_roles');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const resolvedParams = await Promise.resolve(context.params);
        const { id } = resolvedParams;

        // Check if role is in use
        const adminsUsingRole = await query(
            `SELECT id FROM "Admin" WHERE "roleId" = $1 LIMIT 1`,
            [id]
        );

        if (adminsUsingRole.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "Cannot delete role because it is assigned to one or more admins" },
                { status: 400 }
            );
        }

        const roleRes = await query(`SELECT name FROM "AdminRole" WHERE id = $1`, [id]);
        const oldRole = roleRes.rows[0];

        await query(`DELETE FROM "AdminRole" WHERE id = $1`, [id]);

        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'ADMIN_ROLE',
            entityId: id,
            action: 'DELETE',
            oldData: oldRole || null,
            description: `Admin deleted team role (${oldRole?.name || id})`
        });

        return NextResponse.json({
            success: true,
            message: "Role deleted successfully"
        });
    } catch (error) {
        console.error("[Delete Role] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to delete role" },
            { status: 500 }
        );
    }
}
