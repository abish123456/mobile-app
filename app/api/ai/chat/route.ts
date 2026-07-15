import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createSecureResponse } from "../../../../lib/security-headers";
import { getCustomerIdFromSession } from "../../../../lib/session-auth";

const FASTAPI_URL = process.env.FASTAPI_URL || "http://127.0.0.1:8000";

// POST /api/ai/chat - proxy chat requests to FastAPI backend
// Forwards the session cookie so the backend can authenticate the user
export async function POST(req: NextRequest) {
    try {
        const customerId = await getCustomerIdFromSession();

        if (!customerId) {
            return createSecureResponse(
                { success: false, message: "Your session has expired. Please log out and log in again." },
                { status: 401 }
            );
        }

        const headersList = await headers();
        const authHeader = headersList.get('authorization') || '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        const cookieStore = await cookies();
        const cookieToken = cookieStore.get("sessionData")?.value;

        const sessionToken = bearerToken || cookieToken;

        console.log(`[AI Chat] Incoming auth header: "${authHeader}"`);
        console.log(`[AI Chat] Resolved sessionToken: "${sessionToken}"`);

        const body = await req.json();
        const { message } = body;

        if (!message || typeof message !== "string" || message.trim().length === 0) {
            return createSecureResponse(
                { success: false, message: "Message is required" },
                { status: 400 }
            );
        }

        // Forward request to FastAPI backend with the session cookie
        const response = await fetch(`${FASTAPI_URL}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Cookie": `sessionData=${sessionToken}`,
            },
            body: JSON.stringify({ message: message.trim() }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const status = response.status;
            const detail = (errorData as any)?.detail || "AI service error";

            console.error(`[AI Chat] FastAPI returned ${status}:`, detail);

            return createSecureResponse(
                { success: false, message: detail },
                { status }
            );
        }

        const data = await response.json();

        return createSecureResponse({
            success: true,
            response: (data as any).response,
        });
    } catch (error) {
        console.error("[AI Chat] Proxy error:", error);

        // Check if FastAPI is unreachable
        const isConnectionError =
            error instanceof TypeError &&
            (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED"));

        if (isConnectionError) {
            return createSecureResponse(
                { success: false, message: "AI service is currently unavailable. Please try again later." },
                { status: 503 }
            );
        }

        return createSecureResponse(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
