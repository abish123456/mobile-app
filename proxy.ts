import { NextRequest, NextResponse } from "next/server";
import { addSecurityHeaders } from "./lib/security-headers";

/**
 * Next.js proxy for security headers and request processing
 * Runs on every request before it reaches the route handler
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // Add security headers to all responses
  addSecurityHeaders(response);

  // Add CORS headers for API routes (if needed)
  if (request.nextUrl.pathname.startsWith("/api")) {
    const origin = request.headers.get("origin");
    
    // Allow requests from same origin or configured origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
    const isAllowedOrigin =
      !origin ||
      origin === request.nextUrl.origin ||
      allowedOrigins.includes(origin);

    if (isAllowedOrigin && origin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With"
      );
    }

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 200,
        headers: response.headers,
      });
    }
  }

  return response;
}

/**
 * Configure which routes the proxy should run on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

