import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../../lib/admin-auth";

// POST /api/admin/orders/cleanup-abandoned
export async function POST(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    // Find all ONLINE PENDING orders older than 15 minutes
    // And mark them as CANCELLED
    // replace AND "createdAt" < NOW() - INTERVAL '24 hours' this with AND "createdAt" < NOW() - INTERVAL '15 minutes' for 15 min testing
    const result = await query(`
      UPDATE "Order"
      SET "status" = 'CANCELLED',
          "updatedAt" = NOW()
      WHERE "paymentMethod" = 'ONLINE' 
      AND "paymentStatus" = 'PENDING'
      AND "status" = 'PENDING'
      AND "createdAt" < NOW() - INTERVAL '24 hours'
      RETURNING "id"
    `);

    const cancelledCount = result.rowCount || 0;

    return NextResponse.json({
      success: true,
      message: `Successfully cleaned up ${cancelledCount} abandoned orders`,
      cancelledCount
    });
  } catch (error) {
    console.error("Error in POST /api/admin/orders/cleanup-abandoned:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
