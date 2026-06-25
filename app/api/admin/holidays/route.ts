import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";
import { createISTDate, getStartOfDayIST, formatDateToISO } from "../../../../lib/timezone";

// GET /api/admin/holidays
// Returns all holidays, optionally filtered by ?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, 'view_delivery_settings'))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const from = searchParams.get("from");
        const to = searchParams.get("to");

        let sql = `SELECT "id", "date", "name", "createdAt", "updatedAt" FROM "Holiday"`;
        const params: Date[] = [];

        if (from && to) {
            const fromDate = getStartOfDayIST(new Date(`${from}T00:00:00+05:30`));
            const toDate = getStartOfDayIST(new Date(`${to}T00:00:00+05:30`));
            sql += ` WHERE "date" >= $1 AND "date" <= $2`;
            params.push(fromDate, toDate);
        }

        sql += ` ORDER BY "date" ASC`;

        const result = await query<{
            id: string;
            date: Date;
            name: string | null;
            createdAt: Date;
            updatedAt: Date;
        }>(sql, params);

        return NextResponse.json({
            success: true,
            holidays: result.rows.map((h) => ({
                id: h.id,
                date: formatDateToISO(h.date), // YYYY-MM-DD in IST
                name: h.name,
                createdAt: h.createdAt.toISOString(),
                updatedAt: h.updatedAt.toISOString(),
            })),
        });
    } catch (error) {
        console.error("Error in GET /api/admin/holidays:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}

// POST /api/admin/holidays
// Body: { date: "YYYY-MM-DD", name?: string }
export async function POST(req: NextRequest) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, 'edit_delivery_settings'))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const body = await req.json();
        const dateStr: string = body?.date?.toString().trim();
        const name: string | null = body?.name?.toString().trim() || null;

        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return NextResponse.json(
                { success: false, message: "date is required and must be in YYYY-MM-DD format" },
                { status: 400 }
            );
        }

        // Normalize to start-of-day in IST (same convention as Order.deliveryDate)
        const [year, month, day] = dateStr.split("-").map(Number);
        const parsedDate = createISTDate(year, month - 1, day);
        const normalizedDate = getStartOfDayIST(parsedDate);

        // Upsert — adding the same date again just updates the name
        const id = `hol_${Math.random().toString(36).substring(2, 11)}`;
        const result = await query<{ id: string; date: Date; name: string | null }>(
            `INSERT INTO "Holiday" ("id", "date", "name", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, NOW(), NOW())
             ON CONFLICT ("date") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = NOW()
             RETURNING "id", "date", "name"`,
            [id, normalizedDate, name]
        );

        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'HOLIDAY',
            entityId: result.rows[0].id,
            action: 'CREATE',
            oldData: null,
            newData: { date: dateStr, name: name },
            description: `Admin scheduled holiday on ${dateStr} (${name || 'No Name'})`
        });

        return NextResponse.json({
            success: true,
            holiday: {
                id: result.rows[0].id,
                date: formatDateToISO(result.rows[0].date),
                name: result.rows[0].name,
            },
        });
    } catch (error) {
        console.error("Error in POST /api/admin/holidays:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/admin/holidays
// Body: { id: string }
export async function DELETE(req: NextRequest) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, 'delete_delivery_settings'))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const body = await req.json();
        const id: string = body?.id?.toString().trim();

        if (!id) {
            return NextResponse.json({ success: false, message: "Holiday id is required" }, { status: 400 });
        }

        const result = await query(`DELETE FROM "Holiday" WHERE "id" = $1 RETURNING "id"`, [id]);

        if (result.rows.length === 0) {
            return NextResponse.json({ success: false, message: "Holiday not found" }, { status: 404 });
        }

        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'HOLIDAY',
            entityId: id,
            action: 'DELETE',
            description: `Admin removed holiday record (${id})`
        });

        return NextResponse.json({ success: true, message: "Holiday removed successfully" });
    } catch (error) {
        console.error("Error in DELETE /api/admin/holidays:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
