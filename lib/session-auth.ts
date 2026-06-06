import { cookies } from "next/headers";
import { query } from "./db";

// Get customer ID from session cookie
export async function getCustomerIdFromSession(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get("sessionData")?.value;
        if (!sessionToken) return null;

        const sessionRes = await query<{ customerId: string; expiresAt: Date; active: boolean }>(
            `SELECT s."customerId", s."expiresAt", c."active" 
             FROM "UserSession" s
             JOIN "Customer" c ON s."customerId" = c."id"
             WHERE s."token" = $1`,
            [sessionToken]
        );
        const session = sessionRes.rows[0];
        if (!session || !session.active) return null;
        if (new Date(session.expiresAt) < new Date()) return null;
        return session.customerId;
    } catch {
        return null;
    }
}

// Get customer info from session cookie (includes id and phone)
export async function getCustomerFromSession(): Promise<{ id: string; phone: string } | null> {
    try {
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get("sessionData")?.value;
        if (!sessionToken) return null;

        const sessionRes = await query<{ customerId: string; expiresAt: Date }>(
            `SELECT "customerId", "expiresAt" FROM "UserSession" WHERE "token" = $1`,
            [sessionToken]
        );
        const session = sessionRes.rows[0];
        if (!session) return null;
        if (new Date(session.expiresAt) < new Date()) return null;

        const customerRes = await query<{ id: string; phone: string; active: boolean }>(
            `SELECT "id", "phone", "active" FROM "Customer" WHERE "id" = $1`,
            [session.customerId]
        );
        const customer = customerRes.rows[0];
        if (!customer || !customer.active) return null;

        return customer;
    } catch {
        return null;
    }
}
