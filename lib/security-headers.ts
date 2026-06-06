import { NextRequest, NextResponse } from "next/server";

/**
 * Security headers configuration
 */
export const SECURITY_HEADERS = {
  // Prevent clickjacking
  "X-Frame-Options": "DENY",
  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",
  // Enable XSS protection (legacy, but still useful)
  "X-XSS-Protection": "1; mode=block",
  // Referrer policy
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Content Security Policy (can be customized per route)
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://checkout.razorpay.com https://*.mappls.com; style-src 'self' 'unsafe-inline' https://*.mappls.com; img-src 'self' data: blob: https: https://*.mappls.com; font-src 'self' data: https://*.mappls.com; connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com https://*.mappls.com; frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com; child-src 'self' blob: https://api.razorpay.com https://checkout.razorpay.com; worker-src 'self' blob:;",
  // Permissions policy
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  // Strict Transport Security (only in production with HTTPS)
  ...(process.env.NODE_ENV === "production" && {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  }),
} as const;

/**
 * Add security headers to response
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/**
 * Create a response with security headers
 */
export function createSecureResponse(
  body: any,
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json(body, init);
  return addSecurityHeaders(response);
}

