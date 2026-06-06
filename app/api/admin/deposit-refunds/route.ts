import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";
import { formatDateIST } from "../../../../lib/timezone";

export async function GET(req: NextRequest) {
    try {
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');
        const search = searchParams.get('search');
        const date = searchParams.get('date');

        let queryText = `
            SELECT 
                r.*,
                to_char(r."createdAt" AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
                c.name as "customerName",
                c.phone as "customerPhone",
                c."cansInHand" as "customerCansInHand"
            FROM "DepositRefundRequest" r
            JOIN "Customer" c ON r."customerId" = c."id"
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (status) {
            queryText += ` AND r."status" = $${paramIndex++}`;
            params.push(status.toUpperCase());
        }

        if (search) {
            queryText += ` AND (c.name ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (date) {
            queryText += ` AND DATE(r."createdAt" AT TIME ZONE 'Asia/Kolkata') = $${paramIndex++}`;
            params.push(date);
        }

        queryText += ` ORDER BY r."createdAt" DESC`;

        const res = await query(queryText, params);

        return NextResponse.json({
            success: true,
            requests: res.rows.map(r => ({
                ...r,
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }))
        });

    } catch (error) {
        console.error("Error fetching deposit refund requests:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
