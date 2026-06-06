import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../../lib/admin-auth";
import { formatDateIST } from "../../../../../../lib/timezone";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        // Admin authentication check
        if (!(await verifyAdminAuth(req))) {
            return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
        }

        const customerId = params.id;

        // Fetch Wallet Transactions
        const transactionsRes = await query(
            `SELECT "id", "customerId", "amount", "type", "referenceType", "referenceId", "description", 
                   to_char("createdAt" AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
             FROM "WalletTransaction" 
             WHERE "customerId" = $1 
             ORDER BY "createdAt" DESC`,
            [customerId]
        );

        return NextResponse.json({
            success: true,
            transactions: transactionsRes.rows.map(t => ({
                ...t,
                createdAtIST: formatDateIST(new Date(t.createdAt), {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                })
            }))
        });

    } catch (error) {
        console.error("Error in GET /api/admin/customers/[id]/wallet-history:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
