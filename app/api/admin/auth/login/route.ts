import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials, generateAdminToken } from "../../../../../lib/admin-auth";
import { checkRateLimit, RATE_LIMITS, getRateLimitHeaders } from "../../../../../lib/rate-limit";
import { createSecureResponse } from "../../../../../lib/security-headers";
import { createRequestLogger } from "../../../../../lib/request-logger";

export async function POST(req: NextRequest) {
  const logger = createRequestLogger()(req);

  try {
    // Rate limiting - strict for admin login
    const rateLimitResponse = checkRateLimit(req, RATE_LIMITS.AUTH);
    if (rateLimitResponse) {
      logger.log({ statusCode: 429 });
      return rateLimitResponse;
    }

    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      logger.log({ statusCode: 400 });
      return createSecureResponse(
        { success: false, message: "Username and password are required" },
        { status: 400 }
      );
    }

    // Verify credentials against database
    const result = await verifyAdminCredentials(username, password);

    // Debug logging removed

    if (!result.valid || !result.adminId) {
      logger.log({ statusCode: 401 });
      return createSecureResponse(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Generate admin token
    const token = generateAdminToken(result.adminId);

    const response = createSecureResponse(
      {
        success: true,
        token,
        message: "Login successful",
      },
      {
        headers: getRateLimitHeaders(req, RATE_LIMITS.AUTH),
      }
    );
    logger.log({ statusCode: 200, userId: result.adminId });
    return response;
  } catch (error: any) {
    logger.logError(error, { statusCode: 500 });
    return createSecureResponse(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

