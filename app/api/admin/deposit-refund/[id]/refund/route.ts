import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../../lib/admin-auth";
import crypto from "crypto";
import { getNowIST } from "../../../../../../lib/timezone";
import { logAction } from "../../../../../../lib/audit";
import * as https from "https";

// ─── RazorpayX API Helper ───
const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAYX_ACCOUNT_NUMBER = process.env.RAZORPAYX_ACCOUNT_NUMBER || "";
const RAZORPAY_AUTH = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

function razorpayRequest(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
    return new Promise((resolve) => {
        const bodyStr = body ? JSON.stringify(body) : null;
        const headers: Record<string, string> = {
            "Authorization": `Basic ${RAZORPAY_AUTH}`,
            "Content-Type": "application/json",
        };
        if (method === "POST") {
            headers["X-Payout-Idempotency"] = `payout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        }
        if (bodyStr) {
            headers["Content-Length"] = String(Buffer.byteLength(bodyStr));
        }

        const req = https.request(
            { hostname: "api.razorpay.com", path, method, headers },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try {
                        resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
                    } catch {
                        resolve({ status: res.statusCode || 0, body: data });
                    }
                });
            }
        );
        req.on("error", (err) => resolve({ status: 0, body: { error: err.message } }));
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!(await verifyAdminAuthWithPermission(req, "approve_refunds"))) {
            return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
        }

        const { id: requestId } = await params;
        console.log(`[DepositRefund] Processing refund for request ID: ${requestId}`);

        const body = await req.json();
        const {
            refundType,       // 'ONLINE' or 'COD'
            upiId,            // UPI ID for refund
            accountNumber,    // Bank account for refund
            ifscCode,         // IFSC code for refund
            bankName,         // Bank name for refund
            accountHolderName,// Account holder name for refund
            sendingAccount,   // Source account (e.g. 'Sabols GPay', 'RazorpayX')
            transactionId,    // Manual transaction reference for COD
        } = body;

        // Fetch request details
        const requestRes = await query<{
            id: string;
            customerId: string;
            amount: number;
            status: string;
            quantity: number | null;
            upiId: string | null;
            accountNumber: string | null;
            ifscCode: string | null;
            bankName: string | null;
            accountHolderName: string | null;
        }>(
            `SELECT "id", "customerId", "amount", "status", "quantity", "upiId", "accountNumber", "ifscCode", "bankName", "accountHolderName" FROM "DepositRefundRequest" WHERE "id" = $1`,
            [requestId]
        );
        const refundRequest = requestRes.rows[0];

        if (!refundRequest) {
            console.error(`[DepositRefund] Request not found for ID: ${requestId}`);
            return NextResponse.json({ message: "Request not found" }, { status: 404 });
        }

        if (refundRequest.status !== 'REQUESTED') {
            return NextResponse.json({ message: `Request is already ${refundRequest.status}` }, { status: 400 });
        }

        // Get customer details
        const customerRes = await query<{ cansInHand: number; name: string; phone: string }>(
            'SELECT "cansInHand", "name", "phone" FROM "Customer" WHERE "id" = $1',
            [refundRequest.customerId]
        );
        const customer = customerRes.rows[0];
        if (!customer) {
            return NextResponse.json({ message: "Customer not found" }, { status: 404 });
        }

        const cansInHand = customer.cansInHand || 0;

        // Determine if this is a full refund (user will be deactivated)
        const isFullRefund = refundRequest.quantity !== null && refundRequest.quantity >= cansInHand;

        // Calculate cans to deduct
        const productRes = await query<{ depositAmount: number }>(
            `SELECT "depositAmount" FROM "Product" WHERE "active" = true AND "depositAmount" > 0 ORDER BY "createdAt" ASC LIMIT 1`
        );
        const depositRate = productRes.rows[0]?.depositAmount || 100;
        const cansToDeduct = Math.round(refundRequest.amount / depositRate);

        const now = getNowIST();
        let finalTransactionId = transactionId || null;
        let finalSendingAccount = sendingAccount || null;
        let razorpayPayoutId: string | null = null;
        let razorpayContactId: string | null = null;
        let razorpayFundAccountId: string | null = null;
        let razorpayPayoutStatus: string | null = null;

        // ─── ONLINE REFUND via RazorpayX Payout ───
        // Sends money to ANY UPI/bank account (not limited to original payment source)
        if (refundType === 'ONLINE') {
            if (!RAZORPAY_KEY_SECRET || !RAZORPAYX_ACCOUNT_NUMBER) {
                return NextResponse.json({
                    message: "RazorpayX not configured. Please set RAZORPAY_KEY_SECRET and RAZORPAYX_ACCOUNT_NUMBER."
                }, { status: 503 });
            }

            // Determine the payout destination from the refund request
            const refundUpiId = upiId || refundRequest.upiId;
            const refundAccountNumber = accountNumber || refundRequest.accountNumber;
            const refundIfscCode = ifscCode || refundRequest.ifscCode;
            const refundAccountHolderName = accountHolderName || refundRequest.accountHolderName || customer.name;

            if (!refundUpiId && !refundAccountNumber) {
                return NextResponse.json({
                    message: "No UPI ID or bank account found for this customer. Please provide payment details or use manual refund."
                }, { status: 400 });
            }

            try {
                // Step 1: Create RazorpayX Contact
                console.log(`[DepositRefund] Creating RazorpayX contact for ${customer.name}`);
                const contactRes = await razorpayRequest("POST", "/v1/contacts", {
                    name: refundAccountHolderName || customer.name,
                    contact: customer.phone?.replace(/[^0-9]/g, "").slice(-10) || undefined,
                    type: "customer",
                    reference_id: refundRequest.customerId,
                    notes: {
                        depositRefundRequestId: requestId,
                        customerId: refundRequest.customerId,
                    },
                });

                if (contactRes.status !== 200 && contactRes.status !== 201) {
                    console.error("[DepositRefund] Failed to create contact:", contactRes.body);
                    return NextResponse.json({
                        message: `RazorpayX error: ${contactRes.body?.error?.description || "Failed to create contact"}. Please try manual refund.`
                    }, { status: 500 });
                }

                razorpayContactId = contactRes.body.id;
                console.log(`[DepositRefund] Contact created: ${razorpayContactId}`);

                // Step 2: Create Fund Account (UPI or Bank Account)
                let fundAccountPayload: any;
                let payoutMode: string;

                if (refundUpiId) {
                    // UPI Payout
                    fundAccountPayload = {
                        contact_id: razorpayContactId,
                        account_type: "vpa",
                        vpa: { address: refundUpiId },
                    };
                    payoutMode = "UPI";
                } else {
                    // Bank Account Payout (IMPS)
                    fundAccountPayload = {
                        contact_id: razorpayContactId,
                        account_type: "bank_account",
                        bank_account: {
                            name: refundAccountHolderName || customer.name,
                            ifsc: refundIfscCode,
                            account_number: refundAccountNumber,
                        },
                    };
                    payoutMode = "IMPS";
                }

                console.log(`[DepositRefund] Creating fund account (${refundUpiId ? 'UPI: ' + refundUpiId : 'Bank: ' + refundAccountNumber})`);
                const fundAccountResApi = await razorpayRequest("POST", "/v1/fund_accounts", fundAccountPayload);

                if (fundAccountResApi.status !== 200 && fundAccountResApi.status !== 201) {
                    console.error("[DepositRefund] Failed to create fund account:", fundAccountResApi.body);
                    return NextResponse.json({
                        message: `RazorpayX error: ${fundAccountResApi.body?.error?.description || "Failed to create fund account"}. Please verify the ${refundUpiId ? 'UPI ID' : 'bank details'} and try again.`
                    }, { status: 500 });
                }

                razorpayFundAccountId = fundAccountResApi.body.id;
                console.log(`[DepositRefund] Fund account created: ${razorpayFundAccountId}`);

                // Step 3: Create Payout
                const refundAmountPaise = Math.round(refundRequest.amount * 100);

                console.log(`[DepositRefund] Creating payout of ₹${refundRequest.amount} via ${payoutMode}`);
                const payoutRes = await razorpayRequest("POST", "/v1/payouts", {
                    account_number: RAZORPAYX_ACCOUNT_NUMBER,
                    fund_account_id: razorpayFundAccountId,
                    amount: refundAmountPaise,
                    currency: "INR",
                    mode: payoutMode,
                    purpose: "refund",
                    queue_if_low_balance: true,
                    reference_id: `dep_ref_${requestId.slice(-12)}`,
                    narration: `Sabols Deposit Refund`,
                    notes: {
                        depositRefundRequestId: requestId,
                        customerId: refundRequest.customerId,
                        customerName: customer.name,
                        reason: "Deposit refund",
                    },
                });

                if (payoutRes.status !== 200 && payoutRes.status !== 201) {
                    console.error("[DepositRefund] Failed to create payout:", payoutRes.body);
                    return NextResponse.json({
                        message: `RazorpayX payout failed: ${payoutRes.body?.error?.description || "Unknown error"}. Please try manual refund.`
                    }, { status: 500 });
                }

                razorpayPayoutId = payoutRes.body.id;
                razorpayPayoutStatus = payoutRes.body.status; // 'processing', 'processed', 'queued'
                finalTransactionId = payoutRes.body.utr || payoutRes.body.id;
                finalSendingAccount = "RazorpayX";

                console.log(`[DepositRefund] Payout created: ${razorpayPayoutId} (Status: ${razorpayPayoutStatus})`);

            } catch (razorpayError: any) {
                console.error("[DepositRefund] RazorpayX payout failed:", razorpayError);
                return NextResponse.json({
                    message: `RazorpayX error: ${razorpayError.message || "Unknown error"}. Please try manual refund.`
                }, { status: 500 });
            }
        }
        // ─── COD / MANUAL REFUND ───
        else if (refundType === 'COD') {
            // Validate required fields for manual refund
            if (!upiId && !accountNumber) {
                return NextResponse.json({
                    message: "Please provide either a UPI ID or Bank Account details for the refund."
                }, { status: 400 });
            }
            if (accountNumber && !ifscCode) {
                return NextResponse.json({
                    message: "IFSC code is required when providing a bank account number."
                }, { status: 400 });
            }
            if (!sendingAccount) {
                return NextResponse.json({
                    message: "Please select the sending account."
                }, { status: 400 });
            }
            if (!transactionId) {
                return NextResponse.json({
                    message: "Please enter the transaction reference ID."
                }, { status: 400 });
            }
        } else {
            return NextResponse.json({ message: "Invalid refund type. Must be 'ONLINE' or 'COD'." }, { status: 400 });
        }

        // ─── EXECUTE REFUND TRANSACTION ───
        await withTransaction(async (client) => {
            // 1. Update DepositRefundRequest status and payout details
            // ONLINE: Set to PROCESSING (webhook will update to PAID when payout is confirmed)
            // COD: Set to PAID immediately (manual transfer already done)
            const refundStatus = refundType === 'ONLINE' ? 'PROCESSING' : 'PAID';

            await client.query(
                `UPDATE "DepositRefundRequest"
                 SET "status" = $14,
                     "transactionId" = $1,
                     "sendingAccount" = $2,
                     "sentAt" = $3,
                     "approvedAt" = $3,
                     "updatedAt" = $3,
                     "upiId" = COALESCE($4, "upiId"),
                     "accountNumber" = COALESCE($5, "accountNumber"),
                     "ifscCode" = COALESCE($6, "ifscCode"),
                     "bankName" = COALESCE($7, "bankName"),
                     "accountHolderName" = COALESCE($8, "accountHolderName"),
                     "razorpayPayoutId" = $10,
                     "razorpayPayoutStatus" = $11,
                     "razorpayContactId" = $12,
                     "razorpayFundAccountId" = $13
                 WHERE "id" = $9`,
                [
                    finalTransactionId,
                    finalSendingAccount,
                    now,
                    upiId || null,
                    accountNumber || null,
                    ifscCode || null,
                    bankName || null,
                    accountHolderName || null,
                    requestId,
                    razorpayPayoutId,
                    razorpayPayoutStatus,
                    razorpayContactId,
                    razorpayFundAccountId,
                    refundStatus,
                ]
            );

            // 2. Log Wallet Transaction (DEBIT)
            await client.query(
                `INSERT INTO "WalletTransaction"
                 ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
                 VALUES ($1, $2, $3, 'DEBIT', 'REFUND', $4, $5, NOW())`,
                [
                    crypto.randomUUID(),
                    refundRequest.customerId,
                    -refundRequest.amount,
                    requestId,
                    `Deposit Refund ${refundType === 'ONLINE' ? '(RazorpayX Payout)' : '(Manual Transfer)'} - ₹${refundRequest.amount} (Ref: ${requestId.slice(-8)})`
                ]
            );

            // 3. Update Customer Balance and Cans
            if (isFullRefund) {
                // Full refund: zero out everything and deactivate
                await client.query(
                    `UPDATE "Customer"
                     SET "depositWalletBalance" = 0,
                         "cansInHand" = 0,
                         "active" = false,
                         "phone" = "phone" || '_deactivated_' || $3,
                         "updatedAt" = $1
                     WHERE "id" = $2`,
                    [now, refundRequest.customerId, Date.now()]
                );
            } else {
                // Partial refund: deduct amount and cans
                await client.query(
                    `UPDATE "Customer"
                     SET "depositWalletBalance" = "depositWalletBalance" - $1,
                         "cansInHand" = GREATEST(0, "cansInHand" - $2),
                         "updatedAt" = $3
                     WHERE "id" = $4`,
                    [refundRequest.amount, cansToDeduct, now, refundRequest.customerId]
                );
            }
        });

        // 4. Log audit trail
        const adminId = await getAdminIdFromRequest(req);
        logAction({
            actorId: adminId,
            actorType: 'ADMIN',
            entity: 'CUSTOMER',
            entityId: refundRequest.customerId,
            action: isFullRefund ? 'FULL_REFUND_DEACTIVATE' : 'APPROVE_DEPOSIT_REFUND',
            oldData: { status: 'REQUESTED' },
            newData: {
                status: refundType === 'ONLINE' ? 'PROCESSING' : 'PAID',
                refundType,
                sendingAccount: finalSendingAccount,
                transactionId: finalTransactionId,
                razorpayPayoutId,
                razorpayPayoutStatus,
                isFullRefund,
            },
            description: `Admin processed deposit refund of ₹${refundRequest.amount} via ${refundType === 'ONLINE' ? 'RazorpayX Payout' : 'Manual Transfer'}${isFullRefund ? ' (Full Refund & Deactivated)' : ''}`
        });

        return NextResponse.json({
            success: true,
            message: isFullRefund
                ? "Refund processed and customer deactivated successfully"
                : "Refund processed successfully",
            refundType,
            transactionId: finalTransactionId,
            sendingAccount: finalSendingAccount,
            deductedCans: cansToDeduct,
            isFullRefund,
            razorpayPayoutId,
            razorpayPayoutStatus,
        });

    } catch (error) {
        console.error("Error processing deposit refund:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
