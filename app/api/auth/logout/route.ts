import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { query } from "../../../../lib/db";
import { createSecureResponse } from "../../../../lib/security-headers";

export async function POST(req: NextRequest) {
    try {
        const headersList = await headers();
        const authHeader = headersList.get('authorization') || '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        const cookieStore = await cookies();
        const cookieToken = cookieStore.get("sessionData")?.value;

        const sessionToken = bearerToken || cookieToken;

        if (sessionToken) {
            // Delete from DB (best effort)
            await query('DELETE FROM "UserSession" WHERE token = $1', [sessionToken]);
        }

        // Clear cookie
        cookieStore.delete("sessionData");

        return createSecureResponse({ success: true, message: "Logged out successfully" });
    } catch (error) {
        console.error("Logout error:", error);
        return createSecureResponse(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
