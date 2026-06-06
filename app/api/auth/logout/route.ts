import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "../../../../lib/db";
import { createSecureResponse } from "../../../../lib/security-headers";

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get("sessionData")?.value;

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
