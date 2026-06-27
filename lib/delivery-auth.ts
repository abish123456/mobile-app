// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwt = require("jsonwebtoken");
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_development_only";

export interface DeliveryUser {
    deliveryBoyId: string;
    name?: string;
}

/**
 * Authenticates a delivery staff JWT from the Authorization header.
 * Returns the decoded user payload or null if invalid/missing.
 */
export function authenticateDelivery(req: NextRequest): DeliveryUser | null {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    try {
        const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
        if (!decoded?.deliveryBoyId) return null;
        return { deliveryBoyId: decoded.deliveryBoyId, name: decoded.name };
    } catch {
        return null;
    }
}
