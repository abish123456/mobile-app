import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
// @ts-ignore
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_development_only";

// Helper to authenticate JWT
function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return decoded;
  } catch (error) {
    return null;
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user || !user.deliveryBoyId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { deliveryBoyId } = user;
    const body = await req.json();
    const { orderId, latitude, longitude } = body;

    if (!orderId || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { success: false, message: "orderId, latitude, and longitude are required" },
        { status: 400 }
      );
    }

    // 1. Get the Address associated with the Order
    const orderRes = await query(
      `SELECT "addressId", "customerId" FROM "Order" WHERE "id" = $1`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    const { addressId, customerId } = orderRes.rows[0];

    // 2. Fetch old coordinates for the Audit Log
    const addressRes = await query(
      `SELECT "latitude", "longitude" FROM "Address" WHERE "id" = $1`,
      [addressId]
    );

    const oldData = addressRes.rows.length > 0 ? addressRes.rows[0] : {};

    // 3. Update the Address
    await query(
      `UPDATE "Address"
       SET "latitude" = $1, "longitude" = $2, "updatedAt" = NOW()
       WHERE "id" = $3`,
      [latitude, longitude, addressId]
    );

    // 4. Fetch the DeliveryBoy's name for the log
    const dbRes = await query(
      `SELECT "name" FROM "DeliveryBoy" WHERE "id" = $1`,
      [deliveryBoyId]
    );
    const dbName = dbRes.rows.length > 0 ? dbRes.rows[0].name : "Delivery Staff";

    // 5. Create Audit Log Entry
    const auditId = crypto.randomUUID();
    const newData = { latitude, longitude };
    
    await query(
      `INSERT INTO "AuditLog" (
        "id", "actorId", "actorType", "actorName", "entity", "entityId", 
        "action", "oldData", "newData", "description", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        auditId,
        deliveryBoyId,
        "DELIVERY_BOY",
        dbName,
        "ADDRESS",
        addressId,
        "UPDATE_LOCATION",
        JSON.stringify(oldData),
        JSON.stringify(newData),
        `${dbName} (Delivery Staff) updated customer delivery location coordinates.`
      ]
    );

    return NextResponse.json({
      success: true,
      message: "Location updated successfully"
    });

  } catch (error) {
    console.error("Error in PUT /api/delivery/update-location:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
