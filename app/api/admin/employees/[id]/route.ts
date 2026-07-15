import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, hashPasswordForStorage, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import { logAction } from "../../../../../lib/audit";
import crypto from "crypto";

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_employees');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const resolvedParams = await Promise.resolve(context.params);
        const { id } = resolvedParams;

        const employeeRes = await query(`
            SELECT e.id, e."employeeCode", e.name, e.mobile, e.email, e.address, 
                   e."dateOfJoining", e.active, e."adminId", e."createdAt", e."updatedAt",
                   a.username as "softwareLoginId",
                   COALESCE(
                     (SELECT json_agg(json_build_object('id', ar.id, 'name', ar.name))
                      FROM "AdminRole" ar
                      JOIN "_AdminToAdminRole" atr ON ar.id = atr."B"
                      WHERE atr."A" = e."adminId"),
                     '[]'::json
                   ) as "roles"
            FROM "Employee" e
            LEFT JOIN "Admin" a ON e."adminId" = a.id
            WHERE e.id = $1`,
            [id]
        );

        if (employeeRes.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Employee not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            employee: employeeRes.rows[0]
        });
    } catch (error) {
        console.error("[Get Employee] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch employee" },
            { status: 500 }
        );
    }
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'edit_employees');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const resolvedParams = await Promise.resolve(context.params);
        const { id } = resolvedParams;
        const body = await req.json();

        const employeeCode = (body?.employeeCode || "").toString().trim();
        const name = (body?.name || "").toString().trim();
        const mobile = (body?.mobile || "").toString().trim();
        const email = (body?.email || "").toString().trim();
        const address = (body?.address || "").toString().trim();
        const dateOfJoiningStr = body?.dateOfJoining;
        const active = body?.active ?? true;
        const enableLogin = !!body?.enableLogin;

        const username = (body?.username || "").toString().trim();
        const password = (body?.password || "").toString();
        const roleIds = Array.isArray(body?.roleIds) ? body.roleIds : [];

        // Basic validation
        if (!employeeCode || !name || !mobile || !email || !dateOfJoiningStr) {
            return NextResponse.json(
                { success: false, message: "Employee Code, Name, Mobile, Email, and Date of Joining are required" },
                { status: 400 }
            );
        }

        if (enableLogin && !username) {
            return NextResponse.json(
                { success: false, message: "Username is required when software login is enabled" },
                { status: 400 }
            );
        }

        // Check if employee exists
        const employeeCheck = await query(`SELECT * FROM "Employee" WHERE id = $1`, [id]);
        if (employeeCheck.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Employee not found" },
                { status: 404 }
            );
        }
        const oldEmployee = employeeCheck.rows[0];

        // Check uniqueness of code/email for other employees
        const codeCheck = await query(`SELECT id FROM "Employee" WHERE "employeeCode" = $1 AND id != $2`, [employeeCode, id]);
        if (codeCheck.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "Another employee with this Employee Code already exists" },
                { status: 409 }
            );
        }

        const emailCheck = await query(`SELECT id FROM "Employee" WHERE "email" = $1 AND id != $2`, [email, id]);
        if (emailCheck.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "Another employee with this Email ID already exists" },
                { status: 409 }
            );
        }

        // Check software login uniqueness
        if (enableLogin) {
            if (oldEmployee.adminId) {
                const adminCheck = await query(
                    `SELECT id FROM "Admin" WHERE (username = $1 OR email = $2) AND id != $3`,
                    [username, email, oldEmployee.adminId]
                );
                if (adminCheck.rows.length > 0) {
                    return NextResponse.json(
                        { success: false, message: "Another software login with this username or email already exists" },
                        { status: 409 }
                    );
                }
            } else {
                const adminCheck = await query(
                    `SELECT id FROM "Admin" WHERE username = $1 OR email = $2`,
                    [username, email]
                );
                if (adminCheck.rows.length > 0) {
                    return NextResponse.json(
                        { success: false, message: "A software login with this username or email already exists" },
                        { status: 409 }
                    );
                }
            }
        }

        const now = new Date();
        const dateOfJoining = new Date(dateOfJoiningStr);
        let finalAdminId = oldEmployee.adminId;

        await withTransaction(async (client) => {
            if (enableLogin) {
                if (finalAdminId) {
                    // Update existing Admin details
                    if (password) {
                        const passwordHash = hashPasswordForStorage(password);
                        await client.query(
                            `UPDATE "Admin"
                             SET username = $1, email = $2, name = $3, "passwordHash" = $4, active = $5, "updatedAt" = $6
                             WHERE id = $7`,
                            [username, email, name, passwordHash, active, now, finalAdminId]
                        );
                    } else {
                        await client.query(
                            `UPDATE "Admin"
                             SET username = $1, email = $2, name = $3, active = $4, "updatedAt" = $5
                             WHERE id = $6`,
                            [username, email, name, active, now, finalAdminId]
                        );
                    }

                    // Reset and map roles
                    await client.query(`DELETE FROM "_AdminToAdminRole" WHERE "A" = $1`, [finalAdminId]);
                    if (roleIds.length > 0) {
                        for (const rId of roleIds) {
                            await client.query(
                                `INSERT INTO "_AdminToAdminRole" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                                [finalAdminId, rId]
                            );
                        }
                    }
                } else {
                    // Create new Admin record
                    finalAdminId = crypto.randomUUID();
                    if (!password) {
                        throw new Error("Password is required when creating a new software login");
                    }
                    const passwordHash = hashPasswordForStorage(password);

                    await client.query(
                        `INSERT INTO "Admin" (id, username, email, name, "passwordHash", active, "createdAt", "updatedAt")
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [finalAdminId, username, email, name, passwordHash, active, now, now]
                    );

                    if (roleIds.length > 0) {
                        for (const rId of roleIds) {
                            await client.query(
                                `INSERT INTO "_AdminToAdminRole" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                                [finalAdminId, rId]
                            );
                        }
                    }
                }
            } else {
                // If login is disabled but they previously had one, delete the Admin account
                if (finalAdminId) {
                    // 1. Set adminId to NULL in Employee so we break the relation
                    await client.query(`UPDATE "Employee" SET "adminId" = NULL WHERE id = $1`, [id]);
                    // 2. Clear references in DeliveryBoy
                    await client.query(`UPDATE "DeliveryBoy" SET "adminId" = NULL WHERE "adminId" = $1`, [finalAdminId]);
                    // 3. Clear junction table
                    await client.query(`DELETE FROM "_AdminToAdminRole" WHERE "A" = $1`, [finalAdminId]);
                    // 4. Delete the Admin record itself
                    await client.query(`DELETE FROM "Admin" WHERE id = $1`, [finalAdminId]);
                    finalAdminId = null;
                }
            }

            // Update Employee record
            await client.query(
                `UPDATE "Employee"
                 SET "employeeCode" = $1, name = $2, mobile = $3, email = $4, address = $5, 
                     "dateOfJoining" = $6, active = $7, "adminId" = $8, "updatedAt" = $9
                 WHERE id = $10`,
                [employeeCode, name, mobile, email, address || null, dateOfJoining, active, finalAdminId, now, id]
            );
        });

        const requesterAdminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: requesterAdminId,
            actorType: 'ADMIN',
            entity: 'EMPLOYEE',
            entityId: id,
            action: 'UPDATE',
            oldData: oldEmployee,
            newData: {
                id,
                employeeCode,
                name,
                mobile,
                email,
                address,
                dateOfJoining,
                active,
                adminId: finalAdminId
            },
            description: `Employee updated: ${name} (${employeeCode})`
        });

        return NextResponse.json({
            success: true,
            message: "Employee updated successfully"
        });
    } catch (error: any) {
        console.error("[Update Employee] Error:", error);
        return NextResponse.json(
            { success: false, message: error?.message || "Failed to update employee" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'delete_employees');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const resolvedParams = await Promise.resolve(context.params);
        const { id } = resolvedParams;

        // Fetch Employee
        const employeeCheck = await query(`SELECT name, "adminId" FROM "Employee" WHERE id = $1`, [id]);
        if (employeeCheck.rows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Employee not found" },
                { status: 404 }
            );
        }
        const oldEmployee = employeeCheck.rows[0];
        const adminId = oldEmployee.adminId;

        await withTransaction(async (client) => {
            // Break relation in Employee
            await client.query(`UPDATE "Employee" SET "adminId" = NULL WHERE id = $1`, [id]);

            if (adminId) {
                // Clear references in DeliveryBoy
                await client.query(`UPDATE "DeliveryBoy" SET "adminId" = NULL WHERE "adminId" = $1`, [adminId]);
                // Clear roles
                await client.query(`DELETE FROM "_AdminToAdminRole" WHERE "A" = $1`, [adminId]);
                // Delete Admin account
                await client.query(`DELETE FROM "Admin" WHERE id = $1`, [adminId]);
            }

            // Delete Employee
            await client.query(`DELETE FROM "Employee" WHERE id = $1`, [id]);
        });

        const requesterAdminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: requesterAdminId,
            actorType: 'ADMIN',
            entity: 'EMPLOYEE',
            entityId: id,
            action: 'DELETE',
            oldData: oldEmployee,
            description: `Employee deleted: ${oldEmployee.name}`
        });

        return NextResponse.json({
            success: true,
            message: "Employee deleted successfully"
        });
    } catch (error) {
        console.error("[Delete Employee] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to delete employee" },
            { status: 500 }
        );
    }
}
