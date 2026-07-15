import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, hashPasswordForStorage, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";
import crypto from "crypto";

export async function GET(req: NextRequest) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_employees');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
        const employeesRes = await query(`
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
            ORDER BY e."createdAt" DESC
        `);

        return NextResponse.json({
            success: true,
            employees: employeesRes.rows
        });
    } catch (error) {
        console.error("[Get Employees] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch employees" },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'create_employees');
    if (!isAuthorized) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    try {
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

        if (enableLogin && (!username || !password)) {
            return NextResponse.json(
                { success: false, message: "Username and password are required when software login is enabled" },
                { status: 400 }
            );
        }

        // Validate uniqueness of employeeCode and email
        const codeCheck = await query(`SELECT id FROM "Employee" WHERE "employeeCode" = $1`, [employeeCode]);
        if (codeCheck.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "An employee with this Employee Code already exists" },
                { status: 409 }
            );
        }

        const emailCheck = await query(`SELECT id FROM "Employee" WHERE "email" = $1`, [email]);
        if (emailCheck.rows.length > 0) {
            return NextResponse.json(
                { success: false, message: "An employee with this Email ID already exists" },
                { status: 409 }
            );
        }

        if (enableLogin) {
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

        const employeeId = crypto.randomUUID();
        const now = new Date();
        const dateOfJoining = new Date(dateOfJoiningStr);

        let createdAdmin: any = null;
        let assignedRoleNames: string[] = [];

        await withTransaction(async (client) => {
            let adminId: string | null = null;

            if (enableLogin) {
                adminId = crypto.randomUUID();
                const passwordHash = hashPasswordForStorage(password);

                // Create Admin account
                await client.query(
                    `INSERT INTO "Admin" (id, username, email, name, "passwordHash", active, "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [adminId, username, email, name, passwordHash, active, now, now]
                );

                // Map roles
                if (roleIds.length > 0) {
                    for (const rId of roleIds) {
                        await client.query(
                            `INSERT INTO "_AdminToAdminRole" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                            [adminId, rId]
                        );
                    }
                    const rolesRes = await client.query(`SELECT name FROM "AdminRole" WHERE id = ANY($1)`, [roleIds]);
                    assignedRoleNames = rolesRes.rows.map(r => r.name);
                }

                createdAdmin = {
                    id: adminId,
                    username,
                    email,
                    name,
                    active,
                    roles: assignedRoleNames
                };
            }

            // Create Employee record
            await client.query(
                `INSERT INTO "Employee" (id, "employeeCode", name, mobile, email, address, "dateOfJoining", active, "adminId", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [employeeId, employeeCode, name, mobile, email, address || null, dateOfJoining, active, adminId, now, now]
            );
        });

        const requesterAdminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: requesterAdminId,
            actorType: 'ADMIN',
            entity: 'EMPLOYEE',
            entityId: employeeId,
            action: 'CREATE',
            oldData: null,
            newData: {
                id: employeeId,
                employeeCode,
                name,
                mobile,
                email,
                address,
                dateOfJoining,
                active,
                admin: createdAdmin
            },
            description: `Employee created: ${name} (${employeeCode})` + (enableLogin ? ` with software login "${username}"` : "")
        });

        return NextResponse.json({
            success: true,
            message: "Employee created successfully",
            employeeId
        });
    } catch (error) {
        console.error("[Create Employee] Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to create employee" },
            { status: 500 }
        );
    }
}
