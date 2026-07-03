import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
// @ts-ignore
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_development_only";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const { deliveryBoyId } = decoded;

    if (!deliveryBoyId) {
      return NextResponse.json(
        { success: false, message: "Invalid token payload" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { pushToken } = body;

    if (!pushToken) {
      return NextResponse.json(
        { success: false, message: "pushToken is required" },
        { status: 400 }
      );
    }

    // Update the DeliveryBoy with the push token
    await query(
      `UPDATE "DeliveryBoy" SET "pushToken" = $1 WHERE "id" = $2`,
      [pushToken, deliveryBoyId]
    );

    return NextResponse.json({
      success: true,
      message: "Push token registered successfully",
    });
  } catch (error) {
    console.error("Push token registration error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
