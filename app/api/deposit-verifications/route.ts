import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "../../../lib/db";
import { getCustomerIdFromSession } from "../../../lib/session-auth";

// GET /api/deposit-verifications - list customer's deposit verification requests
export async function GET(req: NextRequest) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const rows = await query<{
      id: string;
      productId: string;
      quantity: number;
      status: "PENDING" | "APPROVED" | "REJECTED";
      adminNote: string | null;
      createdAt: Date;
      updatedAt: Date;
      approvedAt: Date | null;
      rejectedAt: Date | null;
      productName: string | null;
      depositAmount: number | null;
    }>(
      `SELECT
         dvr."id",
         dvr."productId",
         dvr."quantity",
         dvr."status",
         dvr."adminNote",
         dvr."createdAt",
         dvr."updatedAt",
         dvr."approvedAt",
         dvr."rejectedAt",
         p."name" as "productName",
         p."depositAmount" as "depositAmount"
       FROM "DepositVerificationRequest" dvr
       LEFT JOIN "Product" p ON p."id" = dvr."productId"
       WHERE dvr."customerId" = $1
       ORDER BY dvr."createdAt" DESC
       LIMIT 20`,
      [customerId],
    );

    return NextResponse.json({ success: true, requests: rows.rows });
  } catch (error) {
    console.error("Error in GET /api/deposit-verifications:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

// POST /api/deposit-verifications - create a deposit verification request
// Body: { productId: string, quantity?: number }
export async function POST(req: NextRequest) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const productId = (body?.productId ?? "").toString().trim();
    const quantity = Math.max(1, Math.min(50, Number(body?.quantity ?? 1)));

    if (!productId) {
      return NextResponse.json({ success: false, message: "Product is required" }, { status: 400 });
    }

    const customerRes = await query<{ id: string; cansInHand: number }>(
      `SELECT "id", "cansInHand" FROM "Customer" WHERE "id" = $1`,
      [customerId],
    );
    const customer = customerRes.rows[0];
    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }

    // Validate product exists & is active (so admin can map it)
    const productRes = await query<{ id: string }>(
      `SELECT "id" FROM "Product" WHERE "id" = $1 AND "active" = true`,
      [productId],
    );
    if (productRes.rows.length === 0) {
      return NextResponse.json({ success: false, message: "Product not found or inactive" }, { status: 404 });
    }

    // If user already has cans, request isn't needed.
    if ((customer.cansInHand ?? 0) > 0) {
      return NextResponse.json({
        success: false,
        message: "You already have cans in hand. No verification needed.",
      }, { status: 400 });
    }

    // Prevent spamming: allow only one pending request per customer
    const pendingRes = await query<{ id: string }>(
      `SELECT "id"
       FROM "DepositVerificationRequest"
       WHERE "customerId" = $1 AND "status" = 'PENDING'
       LIMIT 1`,
      [customer.id],
    );
    if (pendingRes.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: "You already have a pending verification request." },
        { status: 409 },
      );
    }

    const id = crypto.randomUUID();
    await query(
      `INSERT INTO "DepositVerificationRequest"
        ("id", "customerId", "productId", "quantity", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'PENDING', NOW(), NOW())`,
      [id, customer.id, productId, quantity],
    );

    return NextResponse.json({ success: true, requestId: id, message: "Verification request submitted." });
  } catch (error) {
    console.error("Error in POST /api/deposit-verifications:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

