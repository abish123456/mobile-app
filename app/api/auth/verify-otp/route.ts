import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { query } from "../../../../lib/db";
import { hashOtp } from "../send-otp/route";
import { checkRateLimit, RATE_LIMITS, getRateLimitHeaders } from "../../../../lib/rate-limit";
import { createSecureResponse } from "../../../../lib/security-headers";
import { createRequestLogger } from "../../../../lib/request-logger";

export async function POST(req: NextRequest) {
  const logger = createRequestLogger()(req);

  try {
    // Rate limiting - strict for auth endpoints
    const rateLimitResponse = checkRateLimit(req, RATE_LIMITS.AUTH);
    if (rateLimitResponse) {
      logger.log({ statusCode: 429 });
      return rateLimitResponse;
    }

    const body = await req.json();
    const phone = (body?.phone ?? "").toString().trim();
    const otp = (body?.otp ?? "").toString().trim();
    const reqId = body?.reqId;
    const force = body?.force === true;
    const preAuthToken = body?.preAuthToken ?? null;

    if (!phone || phone.length < 10) {
      return NextResponse.json(
        { success: false, message: "Invalid phone number" },
        { status: 400 },
      );
    }

    const now = new Date();

    // ── FORCE LOGIN PATH ────────────────────────────────────────────────────────
    // If force=true with a preAuthToken, skip OTP re-verification.
    // The preAuthToken was issued by this server during the 409 EXISTING_SESSION
    // response, proving the OTP was already verified in a prior request.
    if (force && preAuthToken) {
      const preAuthRes = await query<{ id: string }>(
        `SELECT "id" FROM "OtpSession"
         WHERE "otpHash" = $1 AND "phone" = $2
           AND "consumed" = false AND "expiresAt" > $3
         LIMIT 1`,
        [preAuthToken, phone, now]
      );

      if (!preAuthRes.rows[0]) {
        return NextResponse.json(
          { success: false, message: "Session confirmation expired. Please enter your OTP again." },
          { status: 400 }
        );
      }

      // Mark the preAuth token as consumed so it can't be reused
      await query(`UPDATE "OtpSession" SET "consumed" = true WHERE "id" = $1`, [preAuthRes.rows[0].id]);

      // Skip to customer lookup — OTP was already verified
    } else {
      // ── NORMAL OTP VERIFICATION PATH ──────────────────────────────────────────
      if (!otp || otp.length !== 6) {
        return NextResponse.json(
          { success: false, message: "Invalid OTP format" },
          { status: 400 },
        );
      }

    // 1. Try to verify with MSG91 first if we are using the Widget/Flow API
    const authKey = process.env.MSG91_AUTH_KEY;
    const widgetId = process.env.MSG91_WIDGET_ID || process.env.MSG91_OTP_TEMPLATE_ID;

    // We check if it's likely a Widget ID (usually hex-like and provided by user as working)
    if (authKey && widgetId) {
      try {

        // Format phone for MSG91 verification
        const formattedPhone = phone.replace(/[\s\-\(\)\+]/g, "").replace(/^0/, "");
        const finalPhone = formattedPhone.length === 10 ? `91${formattedPhone}` : formattedPhone;

        const verifyUrl = `https://api.msg91.com/api/v5/widget/verifyOtp`;
        const verifyRes = await fetch(verifyUrl, {
          method: 'POST',
          headers: {
            'authkey': authKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            widgetId: widgetId,
            mobile: finalPhone,
            otp: otp,
            reqId: reqId
          })
        });
        const verifyData = await verifyRes.json() as any;



        if (verifyData.type === "success") {

          // Continue to login the user
        } else {
          // If MSG91 fails, we can optionally fallback to local DB check 
          // but usually if Widget API is used, the local DB check will always fail
          // because the OTP values won't match.
          return NextResponse.json(
            { success: false, message: verifyData.message || "Invalid OTP" },
            { status: 400 },
          );
        }
      } catch (error) {
        console.error("[OTP] MSG91 Verify API Error:", error);
        // If API is down, maybe fallback to local DB as last resort?
      }
    } else {
      // 2. Legacy/Local Database Fallback (only if MSG91 not configured)
      const sessionRes = await query<{
        id: string;
        otpHash: string;
      }>(
        `SELECT "id", "otpHash"
         FROM "OtpSession"
         WHERE "phone" = $1
           AND "consumed" = false
           AND "expiresAt" > $2
         ORDER BY "createdAt" DESC
         LIMIT 1`,
        [phone, now],
      );

      const session = sessionRes.rows[0];
      if (!session) {
        return NextResponse.json(
          { success: false, message: "OTP expired or not found" },
          { status: 400 },
        );
      }

      const incomingHash = hashOtp(otp);
      if (incomingHash !== session.otpHash) {
        return NextResponse.json(
          { success: false, message: "Invalid OTP" },
          { status: 400 },
        );
      }

      // Mark session as consumed
      await query(
        `UPDATE "OtpSession" SET "consumed" = true WHERE "id" = $1`,
        [session.id],
      );
    }
    } // end of OTP verification block

    // ── CUSTOMER LOOKUP ──────────────────────────────────────────────────────
    // This ensures they get a brand new account (clean state)
    const existingRes = await query<{
      id: string;
      active: boolean;
    }>(`SELECT "id", "active" FROM "Customer" WHERE "phone" = $1`, [phone]);

    const existingCustomer = existingRes.rows[0];

    if (existingCustomer && !existingCustomer.active) {
      // Archive the old deactivated account by renaming the phone
      // This frees up the phone number for a new registration
      const archivedPhone = `${phone}_deactivated_${Date.now()}`;
      await query(
        `UPDATE "Customer" SET "phone" = $1 WHERE "id" = $2`,
        [archivedPhone, existingCustomer.id]
      );
    }

    // Upsert customer by phone
    // If the previous user was archived, this will be a clean INSERT
    const newCustomerId = crypto.randomUUID();

    const customerRes = await query<{
      id: string;
      phone: string;
      name: string | null;
      active: boolean;
    }>(
      `INSERT INTO "Customer" ("id", "phone", "createdAt", "updatedAt", "active")
       VALUES ($2, $1, $3, $3, true)
       ON CONFLICT ("phone")
       DO UPDATE
         SET "updatedAt" = $3
       RETURNING "id", "phone", "name", "active"`,
      [phone, newCustomerId, now],
    );

    const customer = customerRes.rows[0];
    const isNewUser = !customer.name;

    // Create a new session
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Check if an active session already exists for this customer
    const existingSessionRes = await query<{ id: string }>(
      `SELECT "id" FROM "UserSession" WHERE "customerId" = $1 AND "expiresAt" > $2 LIMIT 1`,
      [customer.id, now]
    );
    const hasActiveSession = existingSessionRes.rows.length > 0;

    if (hasActiveSession && !force) {
      // OTP is verified but another device is active — issue a short-lived preAuthToken
      // so the client can call us back with force=true WITHOUT re-verifying the OTP.
      const preAuthId = crypto.randomUUID();
      const preAuthUUID = crypto.randomUUID(); // this becomes the token
      const preAuthExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await query(
        `INSERT INTO "OtpSession" ("id", "phone", "otpHash", "consumed", "expiresAt", "createdAt")
         VALUES ($1, $2, $3, false, $4, $5)`,
        [preAuthId, phone, preAuthUUID, preAuthExpiry, now]
      );

      return createSecureResponse(
        {
          success: false,
          errorType: 'EXISTING_SESSION',
          message: 'You are already logged in on another device.',
          preAuthToken: preAuthUUID,
        },
        { status: 409 }
      );
    }

    // Enforce single-device login: Delete all existing sessions for this customer
    await query(
      `DELETE FROM "UserSession" WHERE "customerId" = $1`,
      [customer.id]
    );

    // Use raw query for consistency with this file, or switch to prisma
    // Since I added the table, I can use raw query:
    await query(
      `INSERT INTO "UserSession" ("id", "customerId", "token", "expiresAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), customer.id, sessionToken, expiresAt, now]
    );

    // Set HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set("sessionData", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

    const response = createSecureResponse(
      { success: true, customer, isNewUser, token: sessionToken }, 
      {
        headers: getRateLimitHeaders(req, RATE_LIMITS.AUTH),
      }
    );
    logger.log({ statusCode: 200, userId: customer.id });
    return response;
  } catch (error) {
    logger.logError(error as Error, { statusCode: 500 });
    return createSecureResponse(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

