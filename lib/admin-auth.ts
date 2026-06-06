import { NextRequest } from "next/server";
import crypto from "crypto";
import { query } from "./db";

// Get admin token from Authorization header
export function getAdminTokenFromHeader(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  const [, token] = auth.split(" ");
  return token?.trim() || null;
}

// Hash password (use bcrypt in production, but for MVP this works)
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Verify password
function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// Verify admin credentials against database
export async function verifyAdminCredentials(
  username: string,
  password: string
): Promise<{ valid: boolean; adminId?: string }> {
  try {
    const adminRes = await query<{
      id: string;
      passwordHash: string;
      active: boolean;
    }>(
      `SELECT "id", "passwordHash", "active"
       FROM "Admin"
       WHERE ("username" = $1 OR "email" = $1) AND "active" = true
       LIMIT 1`,
      [username]
    );

    // Debug logging removed

    if (adminRes.rows.length === 0) {
      return { valid: false };
    }

    const admin = adminRes.rows[0];

    const isValid = verifyPassword(password, admin.passwordHash);

    return {
      valid: isValid,
      adminId: isValid ? admin.id : undefined,
    };
  } catch (error) {
    console.error("Error verifying admin credentials:", error);
    return { valid: false };
  }
}

// Generate admin session token
export function generateAdminToken(adminId: string): string {
  const timestamp = Date.now();
  const secret = process.env.ADMIN_SECRET || crypto.randomBytes(32).toString("hex");
  const data = `${adminId}:${timestamp}:${secret}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

// Verify admin token and get admin ID
export async function verifyAdminToken(
  token: string | null
): Promise<{ valid: boolean; adminId?: string }> {
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return { valid: false };
  }

  // For MVP: Simple token validation
  // In production, store tokens in database with expiration
  // For now, we'll just validate format
  // You can enhance this to check token in AdminSession table

  return { valid: true }; // Simplified for MVP
}

// Main function to verify admin authentication
export async function verifyAdminAuth(
  req: NextRequest
): Promise<boolean> {
  const token = getAdminTokenFromHeader(req);
  const result = await verifyAdminToken(token);
  return result.valid;
}

// Get admin auth error response
export function getAdminAuthErrorResponse() {
  return {
    success: false,
    message: "Unauthorized. Admin authentication required.",
  };
}

// Helper to hash password (for creating admins)
export function hashPasswordForStorage(password: string): string {
  return hashPassword(password);
}
