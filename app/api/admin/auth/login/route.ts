import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials, generateAdminToken, getAdminPermissions } from "../../../../../lib/admin-auth";
import { checkRateLimit, RATE_LIMITS, getRateLimitHeaders } from "../../../../../lib/rate-limit";
import { logAction } from "../../../../../lib/audit";
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

    if (!result.valid || !result.adminId) {
      logger.log({ statusCode: 401 });
      return createSecureResponse(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Generate admin token
    const token = generateAdminToken(result.adminId);
    
    // Get their permissions
    const permissions = await getAdminPermissions(result.adminId);

    // Log the successful login
    logAction({
      actorId: result.adminId,
      actorType: 'ADMIN',
      actorName: username,
      entity: 'SESSION',
      entityId: result.adminId,
      action: 'LOGIN',
      description: `Admin ${username} logged in successfully`,
    });

    const response = createSecureResponse(
      {
        success: true,
        token,
        permissions,
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

