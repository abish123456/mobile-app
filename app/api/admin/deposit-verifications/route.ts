import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";
import { formatDateIST } from "../../../../lib/timezone";

// GET /api/admin/deposit-verifications?status=PENDING|APPROVED|REJECTED
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get("status") || "PENDING").toUpperCase();
    const normalizedStatus = ["PENDING", "APPROVED", "REJECTED"].includes(status) ? status : "PENDING";

    const rows = await query<{
      id: string;
      customerId: string;
      customerPhone: string;
      customerName: string | null;
      productId: string;
      productName: string | null;
      quantity: number;
      depositAmount: number | null;
      status: "PENDING" | "APPROVED" | "REJECTED";
      adminNote: string | null;
      createdAt: Date;
      updatedAt: Date;
      approvedAt: Date | null;
      rejectedAt: Date | null;
    }>(
      `SELECT
         dvr."id",
         dvr."customerId",
         c."phone" as "customerPhone",
         c."name" as "customerName",
         dvr."productId",
         p."name" as "productName",
         dvr."quantity",
         p."depositAmount",
         dvr."status",
         dvr."adminNote",
         dvr."createdAt",
         dvr."updatedAt",
         dvr."approvedAt",
         dvr."rejectedAt"
       FROM "DepositVerificationRequest" dvr
       JOIN "Customer" c ON c."id" = dvr."customerId"
       LEFT JOIN "Product" p ON p."id" = dvr."productId"
       WHERE dvr."status" = $1::"DepositVerificationStatus"
       ORDER BY dvr."createdAt" DESC
       LIMIT 200`,
      [normalizedStatus],
    );

    return NextResponse.json({
      success: true,
      requests: rows.rows.map(r => ({
        ...r,
        createdAtIST: formatDateIST(new Date(r.createdAt), {
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
    console.error("Error in GET /api/admin/deposit-verifications:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

