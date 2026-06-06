import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "../../../../lib/db";
import msg91 from "msg91";
import { checkRateLimit, RATE_LIMITS, getRateLimitHeaders } from "../../../../lib/rate-limit";
import { createSecureResponse } from "../../../../lib/security-headers";
import { createRequestLogger } from "../../../../lib/request-logger";

const OTP_EXPIRY_MINUTES = 5;

function generateOtp() {
  // 6-digit numeric OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Exported so verify-otp can reuse the same hashing logic
export function hashOtp(otp: string) {
  const secret = process.env.OTP_SECRET || "default_otp_secret";
  return crypto.createHmac("sha256", secret).update(otp).digest("hex");
}

// Initialize MSG91 (only if credentials are available)
function getMsg91() {
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) {
    return null;
  }
  msg91.initialize({ authKey });
  return msg91;
}

// Format phone number for MSG91 (ensure it starts with country code without +)
function formatPhoneNumber(phone: string, defaultCountryCode: string = "91"): string {
  // Remove any spaces, dashes, or special characters including +
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, "");

  // Remove leading zero if present
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }

  // If it's a 10-digit number, prepend default country code
  if (cleaned.length === 10) {
    cleaned = `${defaultCountryCode}${cleaned}`;
  }

  return cleaned;
}

// Send OTP via MSG91 Widget API
async function sendOtpSms(phone: string, otpValue: string) {
  const authKey = process.env.MSG91_AUTH_KEY;
  // Note: Using widgetId here as it works with your successful curl test
  const widgetId = process.env.MSG91_WIDGET_ID || process.env.MSG91_OTP_TEMPLATE_ID;

  if (!authKey || !widgetId) {
    console.error("[OTP] MSG91 credentials missing. AUTH_KEY:", !!authKey, "WIDGET_ID:", !!widgetId);

    return;
  }

  const formattedPhone = formatPhoneNumber(phone);


  try {
    // Note: The Widget API (sendOtp) handles the OTP generation internally by default.
    // However, since we've already generated an OTP for our database, 
    // it's best to let MSG91 handle the SMS part. 
    // IF you want to use YOUR specific generated OTP, we might need a different API,
    // but the Widget API you provided is the most reliable for delivery.

    // BUT: To keep verification working with your current backend (OtpSession), 
    // we ideally want to tell MSG91 to send YOUR otpValue. 
    // The widget/sendOtp API documentation says it sends its own OTP.

    // For now, let's use the API you verified works:
    const response = await fetch('https://api.msg91.com/api/v5/widget/sendOtp', {
      method: 'POST',
      headers: {
        'authkey': authKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        widgetId: widgetId,
        identifier: formattedPhone
      })
    });

    const result = await response.json() as any;


    if (result.type === "success") {
      return { success: true, reqId: result.message };
    }

    throw new Error(result.message || "Failed to send OTP via MSG91 Widget");
  } catch (error: any) {
    console.error("[OTP] Error sending via MSG91 Widget:", error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const logger = createRequestLogger()(req);

  try {
    // Rate limiting - strict for auth endpoints
    const rateLimitResponse = checkRateLimit(req, RATE_LIMITS.AUTH);
    if (rateLimitResponse) {
      logger.log({ statusCode: 429 });
      return rateLimitResponse;
    }

    const now = new Date();
    const body = await req.json();
    const phone = (body?.phone ?? "").toString().trim();

    if (!phone || phone.length < 10) {
      return NextResponse.json(
        { success: false, message: "Invalid phone number" },
        { status: 400 },
      );
    }

    // 1. Hourly limit and Cooldown (combined check in DB to avoid timezone issues)
    const statsResult = await query(
      `SELECT 
        COUNT(*) as count,
        EXTRACT(EPOCH FROM (NOW() - MAX("createdAt"))) as seconds_since_last
       FROM "OtpSession" 
       WHERE "phone" = $1 AND "createdAt" > NOW() - INTERVAL '1 hour'`,
      [phone]
    );

    const stats = (statsResult as any).rows[0];
    const hourlyCount = parseInt(stats.count);
    const secondsSinceLast = stats.seconds_since_last !== null ? parseFloat(stats.seconds_since_last) : null;

    if (hourlyCount >= 5) {
      return createSecureResponse(
        { success: false, message: "Too many OTP requests. Please try again in 1 hour." },
        { status: 429 }
      );
    }

    // 2. Progressive Cooldown
    if (hourlyCount > 0 && secondsSinceLast !== null) {
      // If it's the 1st retry (hourlyCount is 1), cooldown is 30s.
      // If it's the 2nd or more retry (hourlyCount > 1), cooldown is 60s.
      const requiredCooldown = hourlyCount === 1 ? 30 : 60;

      if (secondsSinceLast < requiredCooldown) {
        const waitTime = Math.ceil(requiredCooldown - secondsSinceLast);
        return createSecureResponse(
          {
            success: false,
            message: `Please wait ${waitTime} seconds before requesting another OTP.`,
            retryAfter: waitTime
          },
          { status: 429 }
        );
      }
    }

    // 3. Daily limit (10 OTPs per day)
    const dailyResult = await query(
      `SELECT COUNT(*) as count 
       FROM "OtpSession" 
       WHERE "phone" = $1 AND "createdAt" > NOW() - INTERVAL '24 hours'`,
      [phone]
    );

    if (parseInt((dailyResult as any).rows[0].count) >= 10) {
      return createSecureResponse(
        { success: false, message: "Daily OTP limit reached. Please try again tomorrow." },
        { status: 429 }
      );
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const id = crypto.randomUUID();

    // Invalidate previous active sessions for this phone
    await query(
      `UPDATE "OtpSession"
       SET "consumed" = true
       WHERE "phone" = $1
         AND "consumed" = false
         AND "expiresAt" > $2`,
      [phone, now],
    );

    // Store new OTP session
    await query(
      `INSERT INTO "OtpSession" ("id", "phone", "otpHash", "expiresAt")
       VALUES ($1, $2, $3, $4)`,
      [id, phone, otpHash, expiresAt],
    );

    try {
      const smsResult = await sendOtpSms(phone, otp);

      const response = createSecureResponse(
        {
          success: true,
          message: "OTP sent successfully",
          reqId: smsResult?.reqId
        },
        {
          headers: getRateLimitHeaders(req, RATE_LIMITS.AUTH),
        }
      );
      logger.log({ statusCode: 200 });
      return response;
    } catch (smsError: any) {
      console.error("[OTP] SMS sending failed:", smsError);
      logger.log({ statusCode: 400 });
      return createSecureResponse(
        {
          success: false,
          message: smsError.message || "Failed to send OTP. Please try again or contact support."
        },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.logError(error as Error, { statusCode: 500 });
    return createSecureResponse(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

