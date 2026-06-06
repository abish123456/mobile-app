import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";
import crypto from "crypto";
import { getNowIST } from "../../../../../lib/timezone";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const action = (body?.action || "").toString().toUpperCase(); // APPROVE | REJECT
    const adminNote = body?.adminNote ? body.adminNote.toString().trim() : null;
    const modifiedQuantity = body?.modifiedQuantity ? parseInt(body.modifiedQuantity) : null;

    if (!id) {
      return NextResponse.json({ success: false, message: "Request ID is required" }, { status: 400 });
    }
    if (!["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
    }

    // Validate modifiedQuantity if provided
    if (modifiedQuantity !== null && (isNaN(modifiedQuantity) || modifiedQuantity < 1)) {
      return NextResponse.json({ success: false, message: "Modified quantity must be a positive integer" }, { status: 400 });
    }

    const result = await withTransaction(async (client) => {
      const reqRes = await client.query<{
        id: string;
        customerId: string;
        productId: string;
        quantity: number;
        status: "PENDING" | "APPROVED" | "REJECTED";
      }>(
        `SELECT "id", "customerId", "productId", "quantity", "status"
         FROM "DepositVerificationRequest"
         WHERE "id" = $1
         FOR UPDATE`,
        [id],
      );

      if (reqRes.rows.length === 0) {
        return { ok: false as const, status: 404 as const, message: "Request not found" };
      }

      const row = reqRes.rows[0];
      if (row.status !== "PENDING") {
        return { ok: false as const, status: 409 as const, message: "Request already processed" };
      }

      if (action === "APPROVE") {
        // Use modified quantity if provided, otherwise use original quantity
        const finalQuantity = modifiedQuantity !== null ? modifiedQuantity : row.quantity;

        // Create audit trail if quantity was modified
        let finalAdminNote = adminNote || "";
        if (modifiedQuantity !== null && modifiedQuantity !== row.quantity) {
          const auditNote = `[Quantity Modified] Original: ${row.quantity}, Approved: ${finalQuantity}`;
          finalAdminNote = finalAdminNote ? `${auditNote}\n${finalAdminNote}` : auditNote;
        }

        // Fetch product details to calculate wallet balance increase and for logging
        const productRes = await client.query<{ name: string; depositAmount: number }>(
          `SELECT "name", "depositAmount" FROM "Product" WHERE "id" = $1`,
          [row.productId]
        );

        if (productRes.rows.length === 0) {
          return { ok: false as const, status: 404 as const, message: "Product not found" };
        }

        const depositAmount = productRes.rows[0].depositAmount || 0;
        const productName = productRes.rows[0].name || "20L Can";
        const totalDepositValue = depositAmount * finalQuantity;
        const now = getNowIST();

        // 1. Increase customer's cansInHand and depositWalletBalance
        await client.query(
          `UPDATE "Customer"
           SET "cansInHand" = COALESCE("cansInHand", 0) + $1,
               "depositWalletBalance" = COALESCE("depositWalletBalance", 0) + $2,
               "updatedAt" = $3
           WHERE "id" = $4`,
          [finalQuantity, totalDepositValue, now, row.customerId],
        );

        // 2. Log Wallet Transaction
        await client.query(
          `INSERT INTO "WalletTransaction"
           ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
           VALUES ($1, $2, $3, 'CREDIT', 'DEPOSIT_VERIFICATION', $4, $5, NOW())`,
          [
            crypto.randomUUID(),
            row.customerId,
            totalDepositValue,
            id,
            `Deposit verified `
          ]
        );

        // 3. Update Request Status
        await client.query(
          `UPDATE "DepositVerificationRequest"
           SET "status" = 'APPROVED',
               "adminNote" = $2,
               "quantity" = $3,
               "approvedAt" = $4,
               "updatedAt" = $4
           WHERE "id" = $1`,
          [id, finalAdminNote || null, finalQuantity, now],
        );
      } else {
        const now = getNowIST();
        await client.query(
          `UPDATE "DepositVerificationRequest"
           SET "status" = 'REJECTED',
               "adminNote" = $2,
               "rejectedAt" = $3,
               "updatedAt" = $3
           WHERE "id" = $1`,
          [id, adminNote, now],
        );
      }

      return { ok: true as const };
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/admin/deposit-verifications/[id]:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

