import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../../lib/admin-auth";
import { getNowIST } from "../../../../../../lib/timezone";
import { logAction } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "reject_refunds"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const { id: requestId } = await params;
        console.log(`[DepositRefund] Rejecting request ID: ${requestId}`);

        const body = await req.json();
        const { reason } = body; // Optional reason for rejection

        // Fetch request details
        const requestRes = await query<{
            id: string;
            customerId: string;
            amount: number;
            status: string;
        }>(
            `SELECT "id", "customerId", "amount", "status" FROM "DepositRefundRequest" WHERE "id" = $1`,
            [requestId]
        );
        const request = requestRes.rows[0];

        if (!request) {
            console.error(`[DepositRefund] Request not found for ID: ${requestId}`);
            return NextResponse.json({ message: "Request not found", requestId }, { status: 404 });
        }

        if (request.status !== 'REQUESTED') {
            return NextResponse.json({ message: `Request is already ${request.status}` }, { status: 400 });
        }

        const now = getNowIST();

        // 1. Update Request Status to REJECTED
        await query(
            `UPDATE "DepositRefundRequest" 
             SET "status" = 'REJECTED', 
                 "updatedAt" = $1 
             WHERE "id" = $2`,
            [now, requestId]
        );

        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'CUSTOMER',
            entityId: request.customerId,
            action: 'REJECT_DEPOSIT_REFUND',
            oldData: { status: 'REQUESTED' },
            newData: { status: 'REJECTED' },
            description: `Admin rejected deposit refund of ₹${request.amount}`
        });

        return NextResponse.json({
            success: true,
            message: "Refund request rejected",
        });

    } catch (error) {
        console.error("Error rejecting deposit refund:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
