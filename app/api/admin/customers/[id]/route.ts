import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import { formatDateIST } from "../../../../../lib/timezone";
import { logAction } from "../../../../../lib/audit";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

// GET /api/admin/customers/[id] - Get customer details with transaction history
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        // Admin authentication check
        if (!(await verifyAdminAuthWithPermission(req, "view_customers"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const customerId = params.id;

        // Fetch Customer Profile
        const customerRes = await query(
            `SELECT 
        c."id", c."name", c."phone", c."depositWalletBalance", c."cansInHand", c."createdAt",
        a."line1", a."line2", a."area", a."city", a."pincode", a."isDefault"
       FROM "Customer" c
       LEFT JOIN "Address" a ON c."id" = a."customerId"
       WHERE c."id" = $1`,
            [customerId]
        );

        if (customerRes.rows.length === 0) {
            return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
        }

        // Identify default address or first address
        const addresses = customerRes.rows.map(r => ({
            line1: r.line1, line2: r.line2, area: r.area, city: r.city, pincode: r.pincode, isDefault: r.isDefault
        })).filter(a => a.line1); // Filter out nulls if no address

        const customer = {
            ...customerRes.rows[0],
            addresses // Return array of addresses
        };
        // Clean up flat join
        delete customer.line1; delete customer.line2; delete customer.area; delete customer.city; delete customer.pincode; delete customer.isDefault;


        // Fetch Wallet Transactions
        const transactionsRes = await query(
            `SELECT "id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt"
             FROM "WalletTransaction" 
             WHERE "customerId" = $1 
             ORDER BY "createdAt" DESC`,
            [customerId]
        );

        // Fetch Orders (Optional, limited to last 10)
        const ordersRes = await query(
            `SELECT id, status, amount, "createdAt", "paymentStatus" 
         FROM "Order" 
         WHERE "customerId" = $1 
         ORDER BY "createdAt" DESC LIMIT 10`,
            [customerId]
        );

        return NextResponse.json({
            success: true,
            customer,
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
            })),
            orders: ordersRes.rows
        });

    } catch (error) {
        console.error("Error in GET /api/admin/customers/[id]:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}

// POST /api/admin/customers/[id] - Manual Adjustment (Add/Deduct Money, Adjust Cans)
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        const adminId = await getAdminIdFromRequest(req);
        if (!(await verifyAdminAuthWithPermission(req, "edit_customer_details")) || !adminId) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const customerId = params.id;
        const body = await req.json();
        const { type, amount, description, adjustCans, cansAmount } = body;

        if (!type && !adjustCans) {
            return NextResponse.json({ success: false, message: "No action specified" }, { status: 400 });
        }

        // Fetch old data for Audit Log
        const oldCustomerRes = await query(`SELECT "depositWalletBalance", "cansInHand" FROM "Customer" WHERE "id" = $1`, [customerId]);
        const oldData = oldCustomerRes.rows[0] || {};

        await withTransaction(async (client) => {
            // Wallet Adjustment
            if (amount && amount > 0) {
                const walletDelta = type === 'CREDIT' ? amount : -amount;
                const walletType = type; // CREDIT or DEBIT

                await client.query(
                    `INSERT INTO "WalletTransaction" 
                     ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                    [
                        crypto.randomUUID(),
                        customerId,
                        walletDelta,
                        walletType,
                        'MANUAL_ADJUSTMENT',
                        null,
                        description || 'Manual Admin Adjustment',
                    ]
                );

                await client.query(
                    `UPDATE "Customer" SET "depositWalletBalance" = "depositWalletBalance" + $1, "updatedAt" = NOW() WHERE "id" = $2`,
                    [walletDelta, customerId]
                );
            }

            // Cans Adjustment
            if (adjustCans && cansAmount !== 0) {
                await client.query(
                    `UPDATE "Customer" SET "cansInHand" = "cansInHand" + $1, "updatedAt" = NOW() WHERE "id" = $2`,
                    [cansAmount, customerId]
                );
            }
        });

        // Fetch new data for Audit Log
        const newCustomerRes = await query(`SELECT "depositWalletBalance", "cansInHand" FROM "Customer" WHERE "id" = $1`, [customerId]);
        const newData = newCustomerRes.rows[0] || {};

        // Async log action
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'CUSTOMER',
            entityId: customerId,
            action: 'UPDATE',
            oldData,
            newData,
            description: `Admin manually adjusted customer profile: ${description || 'No description'}`,
        });

        return NextResponse.json({ success: true, message: "Customer adjusted successfully" });

    } catch (error) {
        console.error("Error in POST /api/admin/customers/[id]:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}

