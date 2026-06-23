import { NextRequest } from "next/server";
import { query } from "../../../../lib/db";
import { createSecureResponse } from "../../../../lib/security-headers";
import { cookies, headers } from "next/headers";

export async function POST(req: NextRequest) {
    try {
        const headersList = await headers();
        const authHeader = headersList.get('authorization') || '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        const cookieStore = await cookies();
        const cookieToken = cookieStore.get("sessionData")?.value;

        const sessionToken = bearerToken || cookieToken;

        if (!sessionToken) {
            return createSecureResponse(
                { success: false, message: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { pushToken } = body;

        if (!pushToken) {
            return createSecureResponse(
                { success: false, message: "pushToken is required" },
                { status: 400 }
            );
        }

        // Update the UserSession with the push token
        await query(
            `UPDATE "UserSession" SET "pushToken" = $1 WHERE "token" = $2`,
            [pushToken, sessionToken]
        );

        return createSecureResponse({ success: true, message: "Push token registered successfully" });
    } catch (error) {
        console.error("Push token registration error:", error);
        return createSecureResponse(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
