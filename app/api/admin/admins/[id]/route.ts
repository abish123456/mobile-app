import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, hashPasswordForStorage, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import { logAction } from "../../../../../lib/audit";

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_admins');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const resolvedParams = await Promise.resolve(context.params);
        const { id } = resolvedParams;

        const adminRes = await query(
            `SELECT a.id, a.email, a.username, a.name, a.active, a."createdAt", a."updatedAt",
                    db.phone as "deliveryBoyPhone",
                    COALESCE(
                      (SELECT json_agg(json_build_object('id', ar.id, 'name', ar.name))
                       FROM "AdminRole" ar
                       JOIN "_AdminToAdminRole" atr ON ar.id = atr."B"
                       WHERE atr."A" = a.id),
                      '[]'::json
                    ) as "roles"
             FROM "Admin" a
             LEFT JOIN "DeliveryBoy" db ON db."adminId" = a.id
             WHERE a.id = $1`,
            [id]
        );

        if (adminRes.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Admin not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            admin: adminRes.rows[0]
        });
    } catch (error) {
        console.error("[Get Admin] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch admin" },
            { status: 500 }
        );
    }
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'edit_admins');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const resolvedParams = await Promise.resolve(context.params);
        const { id } = resolvedParams;
        const body = await req.json();

        const username = (body?.username || "").toString().trim();
        const email = (body?.email || "").toString().trim();
        const name = (body?.name || "").toString().trim();
        const password = (body?.password || "").toString();
        const roleIds = Array.isArray(body?.roleIds) ? body.roleIds : [];
        const active = body?.active ?? true;
        let phone = (body?.phone || "").toString().trim();

        if (!username || !email) {
            return NextResponse.json(
                { success: false, message: "Username and email are required" },
                { status: 400 }
            );
        }

        // Check if admin exists
        const adminRes = await query(`SELECT id, username, email, name, active FROM "Admin" WHERE id = $1`, [id]);
        if (adminRes.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Admin not found" },
                { status: 404 }
            );
        }
        const oldAdmin = adminRes.rows[0];

        // Fetch old roles to log the diff
        const oldRolesRes = await query(
            `SELECT ar.name FROM "AdminRole" ar JOIN "_AdminToAdminRole" atr ON ar.id = atr."B" WHERE atr."A" = $1`,
            [id]
        );
        const oldRoleNames = oldRolesRes.rows.map(r => r.name);

        // Check if another admin has the same username or email
        const existCheckRes = await query(
            `SELECT id FROM "Admin" WHERE (username = $1 OR email = $2) AND id != $3`,
            [username, email, id]
        );

        if (existCheckRes.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "Another admin with this username or email already exists" },
                { status: 409 }
            );
        }

        const now = new Date();

        let updateRes;
        if (password) {
            const passwordHash = hashPasswordForStorage(password);
            updateRes = await query(
                `UPDATE "Admin"
                 SET username = $1, email = $2, name = $3, "passwordHash" = $4, active = $5, "updatedAt" = $6
                 WHERE id = $7
                 RETURNING id, username, email, name, active`,
                [username, email, name, passwordHash, active, now, id]
            );
        } else {
            updateRes = await query(
                `UPDATE "Admin"
                 SET username = $1, email = $2, name = $3, active = $4, "updatedAt" = $5
                 WHERE id = $6
                 RETURNING id, username, email, name, active`,
                [username, email, name, active, now, id]
            );
        }

        // Delete old roles
        await query(`DELETE FROM "_AdminToAdminRole" WHERE "A" = $1`, [id]);

        let isDeliveryStaff = false;
        const newRoleNames: string[] = [];

        if (roleIds.length > 0) {
            for (const rId of roleIds) {
                await query(`INSERT INTO "_AdminToAdminRole" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, rId]);
            }
            const rolesRes = await query(`SELECT name FROM "AdminRole" WHERE id = ANY($1)`, [roleIds]);
            rolesRes.rows.forEach(r => {
                newRoleNames.push(r.name);
                if (r.name.toLowerCase() === 'delivery staff') isDeliveryStaff = true;
            });
        }
        
        const addedRoles = newRoleNames.filter(r => !oldRoleNames.includes(r));
        const removedRoles = oldRoleNames.filter(r => !newRoleNames.includes(r));

        if (isDeliveryStaff && phone) {
            if (!phone.startsWith('+91')) {
                phone = '+91' + phone;
            }
            // Check if DeliveryBoy already exists for this admin
            const dbCheck = await query(`SELECT id FROM "DeliveryBoy" WHERE "adminId" = $1`, [id]);
            if (dbCheck.rows.length > 0) {
                await query(
                    `UPDATE "DeliveryBoy" SET phone = $1, name = $2, active = $3, "updatedAt" = $4 WHERE "adminId" = $5`,
                    [phone, name, active, now, id]
                );
            } else {
                await query(
                    `INSERT INTO "DeliveryBoy" (id, phone, name, active, "adminId", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [crypto.randomUUID(), phone, name, active, id, now, now]
                );
            }
        } else if (!isDeliveryStaff) {
             // If role changed from delivery staff to something else, we might want to deactivate or remove the DeliveryBoy.
             // But for safety, let's just deactivate it if it exists.
             await query(`UPDATE "DeliveryBoy" SET active = false, "updatedAt" = $1 WHERE "adminId" = $2`, [now, id]);
        }

        let roleAuditDesc = '';
        if (addedRoles.length > 0 || removedRoles.length > 0) {
            roleAuditDesc = ` (Roles Added: [${addedRoles.join(', ')}], Removed: [${removedRoles.join(', ')}])`;
        }

        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'ADMIN',
            entityId: id,
            action: 'UPDATE',
            oldData: { ...oldAdmin, roles: oldRoleNames },
            newData: { ...updateRes.rows[0], roles: newRoleNames },
            description: `Admin updated team member details for ${name}${roleAuditDesc}`
        });

        return NextResponse.json({
            success: true,
            message: "Admin updated successfully",
            admin: updateRes.rows[0]
        });
    } catch (error) {
        console.error("[Update Admin] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to update admin" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'delete_admins');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const resolvedParams = await Promise.resolve(context.params);
        const { id } = resolvedParams;

        // Fetch the old admin first
        const adminRes = await query(`SELECT name FROM "Admin" WHERE id = $1`, [id]);
        const oldAdmin = adminRes.rows[0];

        // Prevent deleting oneself? We could check the token, but verifyAdminAuth doesn't return the admin id directly right now in the generic check.
        // For MVP, just delete
        await query(`DELETE FROM "Admin" WHERE id = $1`, [id]);

        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'ADMIN',
            entityId: id,
            action: 'DELETE',
            oldData: oldAdmin || null,
            description: `Admin deleted team member (${oldAdmin?.name || id})`
        });

        return NextResponse.json({
            success: true,
            message: "Admin deleted successfully"
        });
    } catch (error) {
        console.error("[Delete Admin] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to delete admin" },
            { status: 500 }
        );
    }
}
