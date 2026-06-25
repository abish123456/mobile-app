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

// Generate admin session token (JWT-like format)
export function generateAdminToken(adminId: string): string {
  const timestamp = Date.now();
  const secret = process.env.ADMIN_SECRET || "fallback_dev_secret_sabol";
  const data = `${adminId}:${timestamp}:${secret}`;
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  // The token securely embeds the adminId
  return `${adminId}.${timestamp}.${hash}`;
}

// Verify admin token and get admin ID
export async function verifyAdminToken(
  token: string | null
): Promise<{ valid: boolean; adminId?: string }> {
  if (!token) return { valid: false };

  const parts = token.split('.');
  
  // Backwards compatibility for old tokens: if it's just a 64 char hex string, we can't extract ID from it reliably without DB mapping
  if (parts.length !== 3) {
    if (/^[a-f0-9]{64}$/i.test(token)) {
      return { valid: false }; // Force re-login to get the new secure token
    }
    return { valid: false };
  }

  const [adminId, timestamp, providedHash] = parts;
  const secret = process.env.ADMIN_SECRET || "fallback_dev_secret_sabol";
  const data = `${adminId}:${timestamp}:${secret}`;
  const expectedHash = crypto.createHash("sha256").update(data).digest("hex");

  if (providedHash !== expectedHash) {
    return { valid: false };
  }

  // Optional: check expiration (e.g. 7 days)
  const age = Date.now() - parseInt(timestamp);
  if (age > 7 * 24 * 60 * 60 * 1000) {
    return { valid: false };
  }

  return { valid: true, adminId };
}

// Main function to verify admin authentication
export async function verifyAdminAuth(
  req: NextRequest
): Promise<boolean> {
  const token = getAdminTokenFromHeader(req);
  const result = await verifyAdminToken(token);
  return result.valid;
}

// Extract admin ID from request
export async function getAdminIdFromRequest(req: NextRequest): Promise<string | null> {
  const token = getAdminTokenFromHeader(req);
  const result = await verifyAdminToken(token);
  return result.valid && result.adminId ? result.adminId : null;
}

// Check if an admin has a specific granular permission (or any of an array of permissions)
export async function checkAdminPermission(adminId: string, requiredPermission: string | string[]): Promise<boolean> {
  try {
    const adminRes = await query<{ roleId: string | null }>(
      `SELECT "roleId" FROM "Admin" WHERE "id" = $1 AND "active" = true`,
      [adminId]
    );

    if (adminRes.rows.length === 0) return false;

    const { roleId } = adminRes.rows[0];

    // If roleId is null, assume they are the Super Admin and have all permissions
    if (!roleId) return true;

    // Otherwise, fetch the role's permissions
    const roleRes = await query<{ permissions: string[] }>(
      `SELECT "permissions" FROM "AdminRole" WHERE "id" = $1`,
      [roleId]
    );

    if (roleRes.rows.length === 0) return false;

    const permissions = roleRes.rows[0].permissions || [];
    
    if (Array.isArray(requiredPermission)) {
      return requiredPermission.some(perm => permissions.includes(perm));
    }
    
    return permissions.includes(requiredPermission);
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

// Check auth and permission combined
export async function verifyAdminAuthWithPermission(
  req: NextRequest,
  requiredPermission: string | string[]
): Promise<boolean> {
  const adminId = await getAdminIdFromRequest(req);
  if (!adminId) return false;
  
  return await checkAdminPermission(adminId, requiredPermission);
}

// Get admin auth error response
export function getAdminAuthErrorResponse() {
  return {
    success: false,
    message: "Unauthorized. Admin authentication required.",
  };
}

// Get admin permission error response
export function getAdminPermissionErrorResponse() {
  return {
    success: false,
    message: "Forbidden. You do not have permission to perform this action.",
    status: 403
  };
}

// Get all permissions for a specific admin (used during login to send to frontend)
export async function getAdminPermissions(adminId: string): Promise<string[]> {
  try {
    const adminRes = await query<{ roleId: string | null }>(
      `SELECT "roleId" FROM "Admin" WHERE "id" = $1 AND "active" = true`,
      [adminId]
    );

    if (adminRes.rows.length === 0) return [];
    
    const { roleId } = adminRes.rows[0];
    if (!roleId) return ['SUPER_ADMIN']; // Indicator that they have all permissions

    const roleRes = await query<{ permissions: string[] }>(
      `SELECT "permissions" FROM "AdminRole" WHERE "id" = $1`,
      [roleId]
    );

    if (roleRes.rows.length === 0) return [];
    return roleRes.rows[0].permissions || [];
  } catch (error) {
    console.error("Error getting admin permissions:", error);
    return [];
  }
}

// Helper to hash password (for creating admins)
export function hashPasswordForStorage(password: string): string {
  return hashPassword(password);
}
