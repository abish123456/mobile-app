import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query, withTransaction } from "../../../../lib/db";
import { getCustomerIdFromSession } from "../../../../lib/session-auth";
import {
  validateName,
  validateAddressLine,
  validateArea,
  validateCity,
  validatePincode,
} from "../../../../lib/validation";

export async function GET(req: NextRequest) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const customerRes = await query<{
      id: string;
      name: string | null;
      depositWalletBalance: number;
      cansInHand: number;
    }>(
      `SELECT "id", "name", "depositWalletBalance", "cansInHand"
       FROM "Customer"
       WHERE "id" = $1`,
      [customerId],
    );

    const customer = customerRes.rows[0];

    if (!customer) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    // Calculate pending orders' total ordered and returned cans (for deposit products only)
    const pendingOrdersRes = await query<{
      quantity: string;
      returnQuantity: string;
    }>(
      `SELECT COALESCE(SUM(oi."quantity"), 0)::bigint as "quantity", 
              COALESCE(SUM(oi."returnQuantity"), 0)::bigint as "returnQuantity"
       FROM "Order" o
       INNER JOIN "OrderItem" oi ON o."id" = oi."orderId"
       JOIN "Product" p ON p."id" = oi."productId"
       WHERE o."customerId" = $1
         AND o."status" NOT IN ('DELIVERED', 'CANCELLED', 'NOT_DELIVERED')
         AND p."depositAmount" > 0
         AND (o."paymentMethod" = 'COD' OR o."paymentStatus" = 'SUCCESS')`,
      [customer.id]
    );

    const pendingOrdered = Number(pendingOrdersRes.rows[0]?.quantity) || 0;
    const pendingReturned = Number(pendingOrdersRes.rows[0]?.returnQuantity) || 0;

    // Calculate pending deposit (amount already committed in active but unpaid orders)
    const pendingDepositRes = await query<{ pendingDeposit: string }>(
      `SELECT COALESCE(SUM("depositAmount"), 0)::bigint as "pendingDeposit"
       FROM "Order"
       WHERE "customerId" = $1
         AND "status" NOT IN ('CANCELLED', 'NOT_DELIVERED')
         AND "paymentStatus" != 'SUCCESS'
         AND ("paymentMethod" = 'COD' OR "paymentStatus" = 'SUCCESS')`,
      [customer.id]
    );
    const pendingDeposit = (Number(pendingDepositRes.rows[0]?.pendingDeposit) || 0) / 100; // to Rupees


    const allAddressesRes = await query<{
      id: string;
      nickname: string | null;
      contactName: string | null;
      contactPhone: string | null;
      line1: string;
      line2: string | null;
      area: string;
      city: string;
      pincode: string;
      landmark: string | null;
      latitude: number | null;
      longitude: number | null;
      isDefault: boolean;
    }>(
      `SELECT "id", "nickname", "contactName", "contactPhone", "line1", "line2", "area", "city", "pincode", "landmark", "latitude", "longitude", "isDefault"
       FROM "Address"
       WHERE "customerId" = $1 AND "active" = true
       ORDER BY "isDefault" DESC, "createdAt" DESC`,
      [customer.id],
    );

    const addresses = allAddressesRes.rows;
    const defaultAddress = addresses.find(a => a.isDefault) || addresses[0] || null;

    // Fetch deposit rate from products to calculate total cans count
    const depositRateRes = await query<{
      depositAmount: number;
    }>(
      `SELECT "depositAmount"
       FROM "Product"
       WHERE "active" = true AND "inStock" = true AND "depositAmount" > 0
       ORDER BY "createdAt" ASC
       LIMIT 1`,
      [],
    );

    const depositRate = depositRateRes.rows[0]?.depositAmount || 0;
    // Calculate total cans count based on total deposit paid
    const totalCansCount = depositRate > 0 ? Math.floor((customer.depositWalletBalance || 0) / depositRate) : 0;

    // Fetch all payment methods
    // Try to fetch with new columns, fallback to old columns if migration not applied
    let paymentMethodsRes;
    try {
      paymentMethodsRes = await query<{
        id: string;
        type: string;
        details: string;
        isDefault: boolean;
        verified: boolean;
        stripePaymentMethodId: string | null;
        razorpayTokenId: string | null;
        cardBrand: string | null;
        cardLast4: string | null;
      }>(
        `SELECT "id", "type", "details", "isDefault", 
                COALESCE("verified", false) as "verified",
                "stripePaymentMethodId", "razorpayTokenId", "cardBrand", "cardLast4"
         FROM "CustomerPaymentMethod"
         WHERE "customerId" = $1
         ORDER BY "isDefault" DESC, "createdAt" ASC`,
        [customer.id],
      );
    } catch (error: any) {
      // Fallback if migration not applied yet
      if (error.code === '42703') { // column does not exist
        // Try to fetch with all available columns
        try {
          paymentMethodsRes = await query<{
            id: string;
            type: string;
            details: string;
            isDefault: boolean;
            razorpayTokenId: string | null;
            cardBrand: string | null;
            cardLast4: string | null;
          }>(
            `SELECT "id", "type", "details", "isDefault", 
                    "razorpayTokenId", 
                    COALESCE("cardBrand", NULL) as "cardBrand",
                    COALESCE("cardLast4", NULL) as "cardLast4"
             FROM "CustomerPaymentMethod"
             WHERE "customerId" = $1
             ORDER BY "isDefault" DESC, "createdAt" ASC`,
            [customer.id],
          );
          // Add default values for missing columns
          paymentMethodsRes.rows = paymentMethodsRes.rows.map((pm: any) => ({
            ...pm,
            verified: false,
            stripePaymentMethodId: null,
            // cardBrand and cardLast4 are already in the query result
          }));
        } catch (fallbackError: any) {
          // If some columns don't exist, try with just razorpayTokenId
          if (fallbackError.code === '42703') {
            try {
              paymentMethodsRes = await query<{
                id: string;
                type: string;
                details: string;
                isDefault: boolean;
                razorpayTokenId: string | null;
              }>(
                `SELECT "id", "type", "details", "isDefault", "razorpayTokenId"
                 FROM "CustomerPaymentMethod"
                 WHERE "customerId" = $1
                 ORDER BY "isDefault" DESC, "createdAt" ASC`,
                [customer.id],
              );
              // Add default values for missing columns
              paymentMethodsRes.rows = paymentMethodsRes.rows.map((pm: any) => ({
                ...pm,
                verified: false,
                stripePaymentMethodId: null,
                cardBrand: null,
                cardLast4: null,
              }));
            } catch (minimalError: any) {
              // If razorpayTokenId also doesn't exist, use minimal query
              if (minimalError.code === '42703') {
                paymentMethodsRes = await query<{
                  id: string;
                  type: string;
                  details: string;
                  isDefault: boolean;
                }>(
                  `SELECT "id", "type", "details", "isDefault"
                   FROM "CustomerPaymentMethod"
                   WHERE "customerId" = $1
                   ORDER BY "isDefault" DESC, "createdAt" ASC`,
                  [customer.id],
                );
                // Add default values for missing columns
                paymentMethodsRes.rows = paymentMethodsRes.rows.map((pm: any) => ({
                  ...pm,
                  verified: false,
                  stripePaymentMethodId: null,
                  razorpayTokenId: null,
                  cardBrand: null,
                  cardLast4: null,
                }));
              } else {
                throw minimalError;
              }
            }
          } else {
            throw fallbackError;
          }
        }
      } else {
        throw error;
      }
    }

    const paymentMethods = paymentMethodsRes.rows;
    const upiMethods = paymentMethods.filter((pm) => pm.type === "upi");
    const cardMethods = paymentMethods.filter((pm) => pm.type === "card");

    // Payment methods loaded

    // Find default payment method for backward compatibility
    const defaultPaymentMethod = paymentMethods.find((pm) => pm.isDefault) || paymentMethods[0] || null;

    const profile = {
      id: customer.id, // Customer ID for admin reference
      name: customer.name || "",
      depositWalletBalance: customer.depositWalletBalance || 0,
      cansInHand: customer.cansInHand || 0, // RAW DB value
      pendingOrdered: pendingOrdered,
      pendingReturned: pendingReturned,
      pendingDeposit: pendingDeposit,
      totalCansCount: totalCansCount, // Total cans count based on total deposit paid
      availableEmptyCans: Math.max(0, (customer.cansInHand || 0) - pendingReturned), // Consistent with cansInHand limit
      addressId: defaultAddress?.id || "",
      nickname: defaultAddress?.nickname || "",
      contactName: defaultAddress?.contactName || "",
      contactPhone: defaultAddress?.contactPhone || "",
      addressLine1: defaultAddress?.line1 || "",
      addressLine2: defaultAddress?.line2 || "",
      area: defaultAddress?.area || "",
      city: defaultAddress?.city || "",
      pincode: defaultAddress?.pincode || "",
      landmark: defaultAddress?.landmark || "",
      latitude: defaultAddress?.latitude || null,
      longitude: defaultAddress?.longitude || null,
      addresses: addresses,
      // Payment methods grouped by type
      paymentMethods: {
        upi: upiMethods.map((pm) => ({
          id: pm.id,
          details: pm.details,
          isDefault: pm.isDefault,
          verified: pm.verified,
        })),
        card: cardMethods.map((pm) => ({
          id: pm.id,
          details: pm.details,
          isDefault: pm.isDefault,
          verified: pm.verified,
          stripePaymentMethodId: pm.stripePaymentMethodId,
          razorpayTokenId: pm.razorpayTokenId || null, // Token for quick payments
          cardBrand: pm.cardBrand,
          cardLast4: pm.cardLast4,
        })),
      },
      // Default payment method for backward compatibility (order page)
      defaultPaymentMethod: defaultPaymentMethod
        ? {
          type: defaultPaymentMethod.type,
          details: defaultPaymentMethod.details,
        }
        : null,
    };

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Error in GET /api/user/profile:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await req.json();


    const {
      name,
      nickname,
      contactName,
      contactPhone,
      addressLine1,
      addressLine2,
      area,
      city,
      pincode,
      landmark,
      latitude,
      longitude,
      paymentMethods, // Array of { id?, type, details, isDefault?, action: 'add' | 'update' | 'remove' }
      hasExistingDeposit, // Boolean indicating if user has existing deposit
      depositProducts, // Array of { productId: string, quantity: number }
    } = body || {};

    if (!contactPhone || contactPhone.toString().trim().length !== 10) {
      return NextResponse.json(
        { message: "Valid 10-digit contact phone is required" },
        { status: 400 },
      );
    }

    if (contactPhone.toString().trim().startsWith('0')) {
      return NextResponse.json(
        { message: "Contact phone cannot start with 0" },
        { status: 400 },
      );
    }

    // customerId is already validated, use it directly
    const customer = { id: customerId };

    const newAddressId = crypto.randomUUID();
    const now = new Date();
    let depositRequestsCreated = false;

    await withTransaction(async (client) => {
      try {
        // Update customer name
        await client.query(
          `UPDATE "Customer"
           SET "name" = $1,
               "updatedAt" = $2
           WHERE "id" = $3`,
          [name?.toString().trim() || null, now, customer.id],
        );
        // Customer name updated
      } catch (error: any) {
        console.error('Error updating customer name:', {
          code: error.code,
          message: error.message,
          detail: error.detail,
          constraint: error.constraint,
        });
        throw error;
      }

      // Update or create default address
      const addrRes = await client.query<{
        id: string;
      }>(
        `SELECT "id"
         FROM "Address"
         WHERE "customerId" = $1 AND "isDefault" = true
         ORDER BY "createdAt" DESC
         LIMIT 1`,
        [customer.id],
      );

      const defaultAddress = addrRes.rows[0] || null;

      try {
        if (defaultAddress) {
          // CHECK IF ADDRESS IS USED IN ANY ORDERS (Copy-on-Write logic)
          const orderCheck = await client.query(
            `SELECT "id" FROM "Order" WHERE "addressId" = $1 LIMIT 1`,
            [defaultAddress.id]
          );

          const isLinkedToOrders = orderCheck.rows.length > 0;

          console.log('[PROFILE_UPDATE] Address ID:', defaultAddress.id);
          console.log('[PROFILE_UPDATE] Is linked to orders:', isLinkedToOrders);
          console.log('[PROFILE_UPDATE] Order count:', orderCheck.rows.length);

          if (isLinkedToOrders) {
            console.log('[PROFILE_UPDATE] COPY-ON-WRITE: Creating new address');
            // COPY-ON-WRITE: Create NEW address, SOFT-DELETE old one

            // 1. Unset all existing default flags for this customer to ensure strict single-default
            await client.query(
              `UPDATE "Address" SET "isDefault" = false WHERE "customerId" = $1`,
              [customer.id]
            );

            // 2. Soft delete the old address (it was already unset above, but we mark it inactive)
            await client.query(
              `UPDATE "Address" SET "active" = false WHERE "id" = $1`,
              [defaultAddress.id]
            );

            // 2. Create NEW address record with the updated details
            await client.query(
              `INSERT INTO "Address" (
                  "id", "customerId", "nickname", "contactName", "contactPhone", 
                  "line1", "line2", "area", "city", "pincode", "landmark", 
                  "latitude", "longitude",
                  "isDefault", "active", "createdAt", "updatedAt"
              ) VALUES (
                  $1, $2, $3, $4, $5, 
                  $6, $7, $8, $9, $10, $11, 
                  $13, $14,
                  true, true, $12, $12
              )`,
              [
                newAddressId, // Use the pre-generated UUID
                customer.id,
                nickname?.toString().trim() || null,
                contactName?.toString().trim() || null,
                contactPhone?.toString().trim() || null,
                addressLine1?.toString().trim() || "",
                addressLine2?.toString().trim() || "",
                area?.toString().trim() || "",
                city?.toString().trim() || "",
                pincode?.toString().trim() || "",
                landmark?.toString().trim() || null,
                now,
                latitude || null,
                longitude || null
              ]
            );
            console.log('[PROFILE_UPDATE] New address created:', newAddressId);
          } else {
            // Ensure no other address is marked default (safeguard)
            await client.query(
              `UPDATE "Address" SET "isDefault" = false WHERE "customerId" = $1 AND "id" != $2`,
              [customer.id, defaultAddress.id]
            );

            // NO LINKED ORDERS: Update in place
            await client.query(
              `UPDATE "Address"
               SET "nickname" = $1,
                   "contactName" = $2,
                   "contactPhone" = $3,
                   "line1" = $4,
                   "line2" = $5,
                   "area" = $6,
                   "city" = $7,
                   "pincode" = $8,
                   "landmark" = $9,
                   "latitude" = $12,
                   "longitude" = $13,
                   "isDefault" = true,
                   "updatedAt" = $10
               WHERE "id" = $11`,
              [
                nickname?.toString().trim() || null,
                contactName?.toString().trim() || null,
                contactPhone?.toString().trim() || null,
                addressLine1?.toString().trim() || "",
                addressLine2?.toString().trim() || "",
                area?.toString().trim() || "",
                city?.toString().trim() || "",
                pincode?.toString().trim() || "",
                landmark?.toString().trim() || null,
                now,
                defaultAddress.id,
                latitude || null,
                longitude || null
              ],
            );
          }
        } else {
          // If creating a brand new default address, unset any existing ones
          await client.query(
            `UPDATE "Address" SET "isDefault" = false WHERE "customerId" = $1`,
            [customer.id]
          );

          await client.query(
            `INSERT INTO "Address"
             ("id", "customerId", "nickname", "contactName", "contactPhone", "line1", "line2", "area", "city", "pincode", "landmark", "latitude", "longitude", "isDefault", "active", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $13, $14, true, true, $12, $12)`,
            [
              newAddressId,
              customer.id,
              nickname?.toString().trim() || null,
              contactName?.toString().trim() || null,
              contactPhone?.toString().trim() || null,
              addressLine1?.toString().trim() || "",
              addressLine2?.toString().trim() || "",
              area?.toString().trim() || "",
              city?.toString().trim() || "",
              pincode?.toString().trim() || "",
              landmark?.toString().trim() || null,
              now,
              latitude || null,
              longitude || null
            ],
          );
        }
      } catch (error: any) {
        console.error('Error updating/inserting address:', {
          code: error.code,
          message: error.message,
          detail: error.detail,
          constraint: error.constraint,
        });
        throw error;
      }

      // Handle payment methods: add, update, remove
      if (Array.isArray(paymentMethods)) {
        // Processing payment methods
        for (let i = 0; i < paymentMethods.length; i++) {
          const pm = paymentMethods[i];
          const action = pm.action || "add"; // 'add', 'update', 'remove'
          const type = pm.type?.toString().trim();
          const details = pm.details?.toString().trim();
          const isDefault = pm.isDefault === true;
          const pmId = pm.id?.toString().trim();

          // Processing payment method

          try {
            if (action === "remove" && pmId) {
              // Remove payment method
              // Removing payment method
              await client.query(
                `DELETE FROM "CustomerPaymentMethod"
                 WHERE "id" = $1 AND "customerId" = $2`,
                [pmId, customer.id],
              );
              // Payment method removed
            } else if (action === "update" && pmId && type && details) {
              // Update existing payment method
              // If setting as default, unset other defaults of same type first
              if (isDefault) {
                try {
                  await client.query(
                    `UPDATE "CustomerPaymentMethod"
                   SET "isDefault" = false
                   WHERE "customerId" = $1 AND "type" = $2 AND "id" != $3`,
                    [customer.id, type, pmId],
                  );
                } catch (error: any) {
                  if (error.code === '25P02') {
                    throw new Error('Transaction aborted: ' + (error.message || 'Unknown error'));
                  }
                  throw error;
                }
              }

              // Check if new columns exist BEFORE trying to update (to avoid aborting transaction)
              let useNewColumns = false;
              try {
                const columnCheck = await client.query(
                  `SELECT column_name 
                 FROM information_schema.columns 
                 WHERE table_name = 'CustomerPaymentMethod' 
                 AND column_name IN ('verified', 'stripePaymentMethodId', 'cardBrand', 'cardLast4')
                 LIMIT 1`
                );
                useNewColumns = columnCheck.rows.length > 0;
                // New columns check completed
              } catch (checkError: any) {
                // If check fails, assume columns don't exist for safety
                useNewColumns = false;
              }

              // Update with or without new columns based on check
              if (useNewColumns) {
                const verified = pm.verified === true;
                const stripePaymentMethodId = pm.stripePaymentMethodId || null;
                const cardBrand = pm.cardBrand || null;
                const cardLast4 = pm.cardLast4 || null;

                await client.query(
                  `UPDATE "CustomerPaymentMethod"
                 SET "type" = $1,
                     "details" = $2,
                     "isDefault" = $3,
                     "verified" = $4,
                     "stripePaymentMethodId" = $5,
                     "cardBrand" = $6,
                     "cardLast4" = $7,
                     "updatedAt" = $8
                 WHERE "id" = $9 AND "customerId" = $10`,
                  [type, details, isDefault, verified, stripePaymentMethodId, cardBrand, cardLast4, now, pmId, customer.id],
                );
                // Payment method updated
              } else {
                // Fallback: update without new columns
                await client.query(
                  `UPDATE "CustomerPaymentMethod"
                 SET "type" = $1,
                     "details" = $2,
                     "isDefault" = $3,
                     "updatedAt" = $4
                 WHERE "id" = $5 AND "customerId" = $6`,
                  [type, details, isDefault, now, pmId, customer.id],
                );
                // Payment method updated (fallback)
              }
            } else if (action === "add" && type && details) {
              // Add new payment method
              // Adding new payment method

              // If setting as default, unset other defaults of same type first
              if (isDefault) {
                try {
                  await client.query(
                    `UPDATE "CustomerPaymentMethod"
                     SET "isDefault" = false
                     WHERE "customerId" = $1 AND "type" = $2`,
                    [customer.id, type],
                  );
                  // Other default payment methods unset
                } catch (error: any) {
                  console.error(`Error unsetting default ${type} payment methods:`, {
                    code: error.code,
                    message: error.message,
                  });
                  if (error.code === '25P02') {
                    throw new Error('Transaction aborted. A previous query failed: ' + (error.message || 'Unknown error'));
                  }
                  throw error;
                }
              }

              const newPmId = crypto.randomUUID();
              const verified = pm.verified === true;
              const stripePaymentMethodId = pm.stripePaymentMethodId || null;
              const cardBrand = pm.cardBrand || null;
              const cardLast4 = pm.cardLast4 || null;

              // Inserting payment method

              // Check if new columns exist BEFORE trying to insert (to avoid aborting transaction)
              // Use information_schema which won't abort transaction if columns don't exist
              let useNewColumns = false;
              try {
                const columnCheck = await client.query(
                  `SELECT column_name 
                   FROM information_schema.columns 
                   WHERE table_name = 'CustomerPaymentMethod' 
                   AND column_name IN ('verified', 'stripePaymentMethodId', 'cardBrand', 'cardLast4')
                   LIMIT 1`
                );
                useNewColumns = columnCheck.rows.length > 0;
              } catch (checkError: any) {
                // If check fails, assume columns don't exist for safety
                useNewColumns = false;
              }

              try {
                if (useNewColumns) {
                  await client.query(
                    `INSERT INTO "CustomerPaymentMethod"
                     ("id", "customerId", "type", "details", "isDefault", "verified", 
                      "stripePaymentMethodId", "cardBrand", "cardLast4", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
                    [newPmId, customer.id, type, details, isDefault, verified,
                      stripePaymentMethodId, cardBrand, cardLast4, now],
                  );
                  // Payment method inserted
                } else {
                  await client.query(
                    `INSERT INTO "CustomerPaymentMethod"
                     ("id", "customerId", "type", "details", "isDefault", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
                    [newPmId, customer.id, type, details, isDefault, now],
                  );
                  // Payment method inserted (fallback)
                }
              } catch (error: any) {
                // Check if transaction is aborted - if so, rethrow immediately
                if (error.code === '25P02') {
                  throw new Error('Transaction aborted. A previous query failed: ' + (error.message || 'Unknown error'));
                }

                // Log the actual error for debugging
                console.error('Error inserting payment method:', {
                  code: error.code,
                  message: error.message,
                  detail: error.detail,
                  constraint: error.constraint,
                  table: error.table,
                  column: error.column,
                  useNewColumns,
                });
                throw error;
              }
            } else {
              // Skipping payment method: invalid action/data
            }
          } catch (error: any) {
            console.error(`Error processing payment method ${i + 1}:`, {
              code: error.code,
              message: error.message,
              detail: error.detail,
              constraint: error.constraint,
            });
            throw error;
          }
        }
        // All payment methods processed
      }

      // DIRECTLY UPDATE deposit for existing deposits (No Admin Approval Needed)
      depositRequestsCreated = false;
      if (hasExistingDeposit === true && Array.isArray(depositProducts) && depositProducts.length > 0) {
        for (const depositProduct of depositProducts) {
          const productId = (depositProduct?.productId ?? "").toString().trim();
          const quantity = Math.max(1, Math.min(50, Number(depositProduct?.quantity ?? 1)));

          if (!productId) {
            continue; // Skip invalid products
          }

          // Validate product exists and get its deposit amount
          const productRes = await client.query<{ id: string; depositAmount: number }>(
            `SELECT "id", "depositAmount" FROM "Product" WHERE "id" = $1 AND "active" = true`,
            [productId]
          );

          if (productRes.rows.length === 0) {
            continue; // Skip non-existent or inactive products
          }

          const product = productRes.rows[0];
          const depositAmount = Number(product.depositAmount) || 0;
          const totalDepositValue = quantity * depositAmount;

          // DIRECT UPDATE: Add to cansInHand and depositWalletBalance
          await client.query(
            `UPDATE "Customer"
             SET "cansInHand" = COALESCE("cansInHand", 0) + $1,
                 "depositWalletBalance" = COALESCE("depositWalletBalance", 0) + $2,
                 "updatedAt" = NOW()
             WHERE "id" = $3`,
            [quantity, totalDepositValue, customer.id]
          );

          // No request created, but we flag it as processed
          depositRequestsCreated = true;
        }
      }
    });

    return NextResponse.json({
      message: "Profile saved successfully",
      hasDepositRequests: depositRequestsCreated
    });
  } catch (error) {
    console.error("Error in POST /api/user/profile:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
