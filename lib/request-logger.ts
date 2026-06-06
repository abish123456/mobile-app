import { NextRequest } from "next/server";

/**
 * Log request for monitoring and debugging
 * In production, this should integrate with a logging service (e.g., Sentry, LogRocket)
 */
export function logRequest(
  req: NextRequest,
  metadata?: {
    method?: string;
    path?: string;
    statusCode?: number;
    duration?: number;
    error?: Error;
    userId?: string;
    ip?: string;
  }
): void {
  const method = metadata?.method || req.method;
  const path = metadata?.path || req.nextUrl.pathname;
  const statusCode = metadata?.statusCode || 200;
  const duration = metadata?.duration;
  const error = metadata?.error;
  const userId = metadata?.userId;

  // Get IP address
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";

  const logData = {
    timestamp: new Date().toISOString(),
    method,
    path,
    statusCode,
    ip,
    userAgent: req.headers.get("user-agent") || "unknown",
    ...(duration && { duration: `${duration}ms` }),
    ...(userId && { userId }),
    ...(error && {
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
    }),
  };

  // In development, log to console
  if (process.env.NODE_ENV === "development") {
    if (error) {
      console.error("[REQUEST ERROR]", logData);
    } else if (statusCode >= 400) {
      console.warn("[REQUEST WARN]", logData);
    } else {
      // console.log("[REQUEST]", logData);
    }
  } else {
    // In production, you would send to a logging service
    // Example: Sentry, LogRocket, CloudWatch, etc.
    if (error) {
      // Send error to error tracking service
      console.error(JSON.stringify(logData));
    } else if (statusCode >= 400) {
      // Log warnings
      console.warn(JSON.stringify(logData));
    }
    // Successful requests can be logged to a separate service or filtered
  }
}

/**
 * Measure request duration
 */
export function measureRequestDuration(
  startTime: number
): number {
  return Date.now() - startTime;
}

/**
 * Create a request logger middleware
 */
export function createRequestLogger() {
  return (req: NextRequest) => {
    const startTime = Date.now();

    return {
      log: (metadata?: Parameters<typeof logRequest>[1]) => {
        const duration = measureRequestDuration(startTime);
        logRequest(req, { ...metadata, duration });
      },
      logError: (error: Error, metadata?: Parameters<typeof logRequest>[1]) => {
        const duration = measureRequestDuration(startTime);
        logRequest(req, { ...metadata, error, duration });
      },
    };
  };
}

