import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../lib/admin-auth";
import { logAction } from "../../../../lib/audit";
import crypto from "crypto";

// GET /api/admin/customers - List all customers
export async function GET(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuthWithPermission(req, "view_customers"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const customersRes = await query<{
      id: string;
      name: string | null;
      phone: string;
      createdAt: Date;
      line1: string | null;
      line2: string | null;
      area: string | null;
      city: string | null;
      pincode: string | null;
      latitude: number | null;
      longitude: number | null;
      depositWalletBalance: number;
      cansInHand: number;
      active: boolean;
    }>(
      `SELECT 
        c."id",
        c."name",
        c."phone",
        c."createdAt",
        c."depositWalletBalance",
        c."cansInHand",
        c."active",
        a."line1",
        a."line2",
        a."area",
        a."city",
        a."pincode",
        a."latitude",
        a."longitude"
      FROM "Customer" c
      LEFT JOIN "Address" a ON c.id = a."customerId" AND a."isDefault" = true
      ORDER BY c."name" ASC NULLS LAST, c."phone" ASC`,
      []
    );

    // Fetch deposit rate from products to calculate total cans count (same logic as user profile API)
    const depositRateRes = await query<{
      depositAmount: number;
    }>(
      `SELECT "depositAmount"
       FROM "Product"
       WHERE "active" = true AND "inStock" = true AND "depositAmount" > 0
       ORDER BY "createdAt" ASC
       LIMIT 1`,
      []
    );

    const depositRate = depositRateRes.rows[0]?.depositAmount || 0;

    const customers = customersRes.rows.map(customer => ({
      ...customer,
      totalCansCount: depositRate > 0 ? Math.floor((customer.depositWalletBalance || 0) / depositRate) : 0
    }));

    return NextResponse.json({
      success: true,
      customers: customers,
      depositRate: depositRate
    });
  } catch (error) {
    console.error("Error in GET /api/admin/customers:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/customers - Update customer details
export async function PUT(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuthWithPermission(req, "edit_customer_details"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const body = await req.json();
    const { id, name, phone, address, active } = body;

    if (!id || !phone) {
      return NextResponse.json(
        { success: false, message: "Customer ID and Phone are required" },
        { status: 400 }
      );
    }

    // Check if phone number is already taken by another customer
    const existingCustomer = await query(
      `SELECT id FROM "Customer" WHERE phone = $1 AND id != $2`,
      [phone, id]
    );

    if (existingCustomer.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: "Phone number already exists for another customer" },
        { status: 400 }
      );
    }

    // Fetch current values to detect changes
    const currentCustomerRes = await query<{
      depositWalletBalance: number;
      cansInHand: number;
    }>(
      `SELECT "depositWalletBalance", "cansInHand" FROM "Customer" WHERE id = $1`,
      [id]
    );

    if (currentCustomerRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 }
      );
    }

    const currentCustomer = currentCustomerRes.rows[0];

    // Fetch full existing data specifically for the audit log to avoid "not set" issues
    const auditOldDataRes = await query(
      `SELECT c."id", c."name", c."phone", c."depositWalletBalance", c."cansInHand", c."active",
              a."line1", a."line2", a."area", a."city", a."pincode", a."latitude", a."longitude"
       FROM "Customer" c
       LEFT JOIN "Address" a ON a."customerId" = c."id" AND a."isDefault" = true
       WHERE c."id" = $1`,
      [id]
    );
    const auditOldData = auditOldDataRes.rows[0] || currentCustomer;

    // Update customer details in a transaction
    await withTransaction(async (client) => {
      // Update customer name, phone, depositWalletBalance, and cansInHand
      const depositWalletBalance = body.depositWalletBalance !== undefined ? parseFloat(body.depositWalletBalance) : undefined;
      const cansInHand = body.cansInHand !== undefined ? parseInt(body.cansInHand) : undefined;

      let updateQuery = `UPDATE "Customer" SET name = $1, phone = $2`;
      const queryParams: any[] = [name, phone];
      let paramIndex = 3;

      if (active !== undefined) {
        updateQuery += `, "active" = $${paramIndex}`;
        queryParams.push(active);
        paramIndex++;
      }

      if (depositWalletBalance !== undefined) {
        updateQuery += `, "depositWalletBalance" = $${paramIndex}`;
        queryParams.push(depositWalletBalance);
        paramIndex++;
      }

      if (cansInHand !== undefined) {
        updateQuery += `, "cansInHand" = $${paramIndex}`;
        queryParams.push(cansInHand);
        paramIndex++;
      }

      updateQuery += `, "updatedAt" = NOW() WHERE id = $${paramIndex}`;
      queryParams.push(id);

      await client.query(updateQuery, queryParams);

      // Create Wallet Transaction for manual adjustment if deposit balance or cans in hand changed
      const balanceChanged = depositWalletBalance !== undefined && Math.abs(depositWalletBalance - currentCustomer.depositWalletBalance) > 0.01;
      const cansChanged = cansInHand !== undefined && cansInHand !== (currentCustomer.cansInHand || 0);

      if (balanceChanged || cansChanged) {
        const balanceDelta = depositWalletBalance !== undefined ? (depositWalletBalance - currentCustomer.depositWalletBalance) : 0;
        const cansDelta = cansInHand !== undefined ? (cansInHand - (currentCustomer.cansInHand || 0)) : 0;

        let description = "Manual adjustment by Admin: ";
        if (cansChanged) description += `Cans adjusted (${currentCustomer.cansInHand} -> ${cansInHand}). `;
        if (balanceChanged) description += `Balance adjusted (₹${currentCustomer.depositWalletBalance} -> ₹${depositWalletBalance}).`;

        await client.query(
          `INSERT INTO "WalletTransaction" ("id", "customerId", "amount", "type", "referenceType", "description", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            crypto.randomUUID(),
            id,
            balanceDelta,
            balanceDelta >= 0 ? "CREDIT" : "DEBIT",
            "MANUAL_ADJUSTMENT",
            description
          ]
        );
      }

      // Handle Address Update if provided
      if (address) {
        const { line1, line2, area, city, pincode, latitude, longitude } = address;

        // Check if default address exists
        const addressCheck = await client.query(
          `SELECT id FROM "Address" WHERE "customerId" = $1 AND "isDefault" = true`,
          [id]
        );

        if (addressCheck.rows.length > 0) {
          // Update existing default address
          await client.query(
            `UPDATE "Address"
             SET line1 = $1, line2 = $2, area = $3, city = $4, pincode = $5, 
                 "latitude" = $7, "longitude" = $8, "updatedAt" = NOW()
             WHERE id = $6`,
            [line1, line2, area, city, pincode, addressCheck.rows[0].id, latitude || null, longitude || null]
          );
        } else {
          // Create new default address
          await client.query(
            `INSERT INTO "Address" (id, "customerId", line1, line2, area, city, pincode, "latitude", "longitude", "isDefault", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())`,
            [crypto.randomUUID(), id, line1, line2, area, city, pincode, latitude || null, longitude || null]
          );
        }
      }
    });

    const adminId = await getAdminIdFromRequest(req);
    logAction({
      actorId: adminId,
      actorType: 'ADMIN',
      entity: 'CUSTOMER',
      entityId: id,
      action: 'UPDATE',
      oldData: auditOldData,
      newData: { ...auditOldData, ...body, ...(address || {}) },
      description: `Updated customer profile details for ${phone}`,
    });

    return NextResponse.json({
      success: true,
      message: "Customer profile updated successfully",
    });
  } catch (error) {
    console.error("Error in PUT /api/admin/customers:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}


