import { NextRequest, NextResponse } from "next/server";

// In-memory rate limit store (for MVP - use Redis in production)
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxRequests: number; // Maximum requests allowed
  windowMs: number; // Time window in milliseconds
  message?: string; // Custom error message
}

/**
 * Default rate limit configurations for different route types
 */
export const RATE_LIMITS = {
  // Strict limits for authentication endpoints
  AUTH: {
    maxRequests: 30,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: "Too many authentication attempts. Please try again later.",
  },
  // Moderate limits for payment endpoints
  PAYMENT: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
    message: "Too many payment requests. Please wait a moment.",
  },
  // Standard limits for general API endpoints
  API: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
    message: "Too many requests. Please slow down.",
  },
  // Lenient limits for read-only endpoints
  READ: {
    maxRequests: 200,
    windowMs: 60 * 1000, // 1 minute
    message: "Too many requests. Please slow down.",
  },
} as const;

/**
 * Get client identifier from request
 * Uses IP address or user identifier
 */
function getClientId(req: NextRequest): string {
  // Try to get IP from various headers (for proxy/load balancer scenarios)
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";

  // For authenticated requests, use phone/admin ID if available
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    // Use token as identifier for authenticated users
    return `auth:${token.substring(0, 20)}`;
  }

  return `ip:${ip}`;
}

/**
 * Check if request exceeds rate limit
 * @returns null if allowed, or NextResponse with error if rate limited
 */
export function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): NextResponse | null {
  const clientId = getClientId(req);
  const now = Date.now();
  const key = `${clientId}:${config.windowMs}`;

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    // Create new entry or reset expired one
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return null; // Allowed
  }

  if (entry.count >= config.maxRequests) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return NextResponse.json(
      {
        success: false,
        message: config.message || "Rate limit exceeded",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": config.maxRequests.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": new Date(entry.resetTime).toISOString(),
        },
      }
    );
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);

  // Add rate limit headers to response
  const remaining = config.maxRequests - entry.count;
  return null; // Allowed, but we'll add headers in the route handler
}

/**
 * Rate limit middleware wrapper
 * Returns a function that can be used in route handlers
 */
export function withRateLimit(config: RateLimitConfig) {
  return (req: NextRequest): NextResponse | null => {
    return checkRateLimit(req, config);
  };
}

/**
 * Get rate limit headers for successful requests
 */
export function getRateLimitHeaders(
  req: NextRequest,
  config: RateLimitConfig
): Record<string, string> {
  const clientId = getClientId(req);
  const key = `${clientId}:${config.windowMs}`;
  const entry = rateLimitStore.get(key);

  if (!entry) {
    return {
      "X-RateLimit-Limit": config.maxRequests.toString(),
      "X-RateLimit-Remaining": (config.maxRequests - 1).toString(),
    };
  }

  const remaining = Math.max(0, config.maxRequests - entry.count);
  return {
    "X-RateLimit-Limit": config.maxRequests.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": new Date(entry.resetTime).toISOString(),
  };
}

