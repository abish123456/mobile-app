import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { verifyAdminAuth, verifyAdminAuthWithPermission, getAdminAuthErrorResponse, getAdminPermissionErrorResponse, getAdminIdFromRequest } from "../../../../../lib/admin-auth";
import { logAction } from "../../../../../lib/audit";
import crypto from "crypto";

// GET /api/admin/orders/[id] - Get order details by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin authentication check (viewing an order)
    if (!(await verifyAdminAuthWithPermission(req, "view_orders"))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const { id: orderId } = await params;

    const orderRes = await query<{
      id: string;
      orderNumber: string | null;
      quantity: number;
      originalQuantity: number | null;
      additionalQuantity: number | null;
      amount: number | null;
      deliveryDate: Date;
      deliverySlot: string;
      status: string;
      paymentStatus: string;
      paymentMethod: string;
      createdAt: Date;
      customerId: string;
      customerName: string | null;
      customerPhone: string;
      addressLine1: string;
      addressLine2: string | null;
      area: string;
      city: string;
      pincode: string;
      landmark: string | null;
      productName: string | null;
      deliveryBoyId: string | null;
      deliveryBoyName: string | null;

      routeDate: Date | null;
      routeToken: string | null;
      updatedAt: Date;
      depositAmount: number | null;
      providerPaymentId: string | null;
      notDeliveredReason: string | null;
      isQrPayment: boolean;
    }>(
      `SELECT
        o."id",
        o."orderNumber",
        o."quantity",
        o."originalQuantity",
        o."additionalQuantity",
        o."amount",
        o."depositAmount",
        o."deliveryDate",
        o."deliverySlot",
        o."status",
        o."paymentStatus",
        o."paymentMethod",
        o."paymentInstrument",
        o."isQrPayment",
        o."createdAt",

        o."updatedAt",
        o."customerId",
        c."name" as "customerName",
        c."phone" as "customerPhone",
        a."line1" as "addressLine1",
        a."line2" as "addressLine2",
        a."contactName",
        a."contactPhone",
        a."area",
        a."city",
        a."pincode",
        a."landmark",
        a."nickname",
        p."name" as "productName",
        db."id" as "deliveryBoyId",
        db."name" as "deliveryBoyName",
        r."date" as "routeDate",
        r."token" as "routeToken",
        COALESCE(sr."id", sr_static."id") as "activeRouteId",
        COALESCE(sr."name", sr_static."name") as "activeRouteName",
        pay."providerPaymentId",
        (
          SELECT ro_reason."notDeliveredReason"
          FROM "RouteOrder" ro_reason
          WHERE ro_reason."orderId" = o."id"
          AND ro_reason."deliveryStatus" = 'NOT_DELIVERED'
          ORDER BY ro_reason."updatedAt" DESC
          LIMIT 1
        ) as "notDeliveredReason"
      FROM "Order" o
      INNER JOIN "Customer" c ON o."customerId" = c."id"
      INNER JOIN "Address" a ON o."addressId" = a."id"
      LEFT JOIN LATERAL (
          SELECT ro_inner."routeId"
          FROM "RouteOrder" ro_inner
          WHERE ro_inner."orderId" = o."id"
          AND ro_inner."deliveryStatus" != 'NOT_DELIVERED'
          ORDER BY ro_inner."updatedAt" DESC
          LIMIT 1
      ) ro ON true
      LEFT JOIN "Route" r ON ro."routeId" = r."id"
      LEFT JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
      -- Fallback: check if address pincode has a configured service route
      LEFT JOIN "ServiceArea" sa ON a."pincode" = sa."pincode" AND sa."active" = true
      LEFT JOIN "ServiceRoute" sr_static ON sa."serviceRouteId" = sr_static."id"
      LEFT JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
      LEFT JOIN "DeliveryBoy" db_static ON sr_static."currentDeliveryBoyId" = db_static."id"
      LEFT JOIN "Payment" pay ON o."id" = pay."orderId"
      LEFT JOIN "Product" p ON o."productId" = p."id"
      WHERE o."id" = $1
      LIMIT 1`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];
    const amountInRupees = order.amount ? order.amount / 100 : 0;

    // Determine actual payment method (UPI/Card)
    let actualPaymentMethod = order.paymentInstrument || order.paymentMethod; 
    let bankRrn = null;
    let upiId = null;
    let payerContact = null;

    if (order.paymentMethod === 'ONLINE' && !order.paymentInstrument && order.providerPaymentId) {
      try {
        // Initialize Razorpay if configured
        const Razorpay = (await import('razorpay')).default;
        if (process.env.RAZORPAY_KEY_SECRET) {
          const razorpay = new Razorpay({
            key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
            key_secret: process.env.RAZORPAY_KEY_SECRET,
          });
 
          const payment = await razorpay.payments.fetch(order.providerPaymentId);
          bankRrn = payment.acquirer_data?.bank_transaction_id || payment.acquirer_data?.rrn || null;
          upiId = payment.vpa || null;
          payerContact = payment.contact || payment.email || null;

          if (payment.method === 'upi') {
            actualPaymentMethod = 'UPI';
          } else if (payment.method === 'card') {
            actualPaymentMethod = 'Card';
          }
        }
      } catch (error) {
        console.error('Error fetching payment details from Razorpay:', error);
        // Keep default payment method if Razorpay fetch fails
      }
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        quantity: order.quantity,
        originalQuantity: order.originalQuantity,
        additionalQuantity: order.additionalQuantity,
        deliveryDate: order.deliveryDate.toISOString(),
        deliverySlot: order.deliverySlot,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: actualPaymentMethod,
        bankRrn: bankRrn,
        upiId: upiId,
        payerContact: payerContact,
        paymentBreakdown: (() => {
          if (order.additionalQuantity && order.additionalQuantity > 0 && order.originalQuantity) {
            // Check if mixed payment
            // Case 1: Original was ONLINE (implied by paymentMethod or providerPaymentId), Addition is COD (implied by lack of new payment link usage or simple convention)
            // Since we don't store "Addition Payment Method" explicitly but know the flow:
            // If original `paymentMethod` is ONLINE, and we have additional quantity with no second online payment record (which we don't support deeply yet), 
            // and `paymentStatus` is SUCCESS (meaning it was collected manually), then it's split.
            // Even simple rule: OriginalQty corresponds to `actualPaymentMethod`. AdditionalQty corresponds to COD (mostly).
            // But if original was COD, then both are COD.

            const originalMethod = actualPaymentMethod;
            const additionalMethod = 'COD'; // Currently mostly supports COD for additions or existing line

            if (originalMethod !== additionalMethod) {
              return `${order.originalQuantity} cans ${originalMethod}, ${order.additionalQuantity} cans ${additionalMethod}`;
            }
          }
          return null; // No split display needed
        })(),
        createdAt: order.createdAt.toISOString(),
        amount: amountInRupees,
        customer: {
          id: order.customerId,
          name: order.customerName || "Unknown",
          phone: order.customerPhone,
        },
        routeDate: order.routeDate ? order.routeDate.toISOString() : null,
        address: {
          line1: order.addressLine1,
          line2: order.addressLine2,
          contactName: order.contactName,
          contactPhone: order.contactPhone,
          area: order.area,
          city: order.city,
          pincode: order.pincode,
          landmark: order.landmark,
          nickname: order.nickname,
        },
        productName: order.productName || "Water Can",
        depositAmount: order.depositAmount ? order.depositAmount / 100 : 0,
        updatedAt: order.updatedAt.toISOString(),
        assignedDeliveryBoy: order.deliveryBoyName ? {
          id: order.deliveryBoyId,
          name: order.deliveryBoyName
        } : null,
        activeRouteId: order.activeRouteId,
        activeRouteName: order.activeRouteName,
        isAssigned: !!order.deliveryBoyName, // Only true if an actual RouteOrder assignment exists
        isRouteGenerated: !!order.routeToken,
        isQrPayment: order.isQrPayment,
        notDeliveredReason: order.notDeliveredReason,
        items: (await query<{
          id: string;
          productId: string;
          productName: string;
          quantity: number;
          price: number;
          gst: number;
          depositAmount: number;
        }>(
          `SELECT 
            oi."id",
            oi."productId",
            p."name" as "productName",
            oi."quantity",
            oi."price",
            oi."gst",
            p."depositAmount"
           FROM "OrderItem" oi
           JOIN "Product" p ON oi."productId" = p."id"
           WHERE oi."orderId" = $1`,
          [orderId]
        )).rows.map(item => ({
          ...item,
          price: item.price // still in rupees
        })),
        payments: (await query<{
          id: string;
          providerPaymentId: string;
          amount: number;
          status: string;
          method: string;
          createdAt: Date;
        }>(
          `SELECT "id", "providerPaymentId", "amount", "status", "method", "createdAt"
           FROM "Payment"
           WHERE "orderId" = $1
           ORDER BY "createdAt" DESC`,
          [orderId]
        )).rows.map(p => ({
          id: p.id,
          providerPaymentId: p.providerPaymentId,
          amount: p.amount / 100, // Convert paise to rupees
          status: p.status,
          method: p.method,
          createdAt: p.createdAt.toISOString()
        }))
      },
    });
  } catch (error) {
    console.error("Error in GET /api/admin/orders/[id]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/orders/[id] - Update order status (Wait for Cancel logic)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const body = await req.json();
    const { action } = body;

    // Granular permission check
    if (action === 'CANCEL') {
      if (!(await verifyAdminAuthWithPermission(req, "cancel_order"))) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
      }
    } else if (action === 'UPDATE_ADDRESS') {
      if (!(await verifyAdminAuthWithPermission(req, "edit_order_address"))) {
        return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
      }
    } else {
      return NextResponse.json(
        { success: false, message: "Invalid action" },
        { status: 400 }
      );
    }

    // Check current status and payment details
    const orderCheck = await query<{
      status: string;
      paymentStatus: string;
      depositAmount: number;
      customerId: string;
      addressId: string;
      deliveryDate: Date;
      pincode: string;
      routeToken: string | null;
    }>(
      `SELECT 
        o."status", 
        o."paymentStatus", 
        o."depositAmount", 
        o."customerId", 
        o."addressId", 
        o."deliveryDate", 
        a."pincode", 
        r."token" as "routeToken" 
       FROM "Order" o 
       INNER JOIN "Address" a ON o."addressId" = a."id"
       LEFT JOIN "RouteOrder" ro ON o."id" = ro."orderId" AND ro."deliveryStatus" = 'PENDING'
       LEFT JOIN "Route" r ON ro."routeId" = r."id"
       WHERE o."id" = $1`,
      [orderId]
    );

    if (orderCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    const { status: currentStatus, paymentStatus, depositAmount, customerId, addressId, deliveryDate, pincode: oldPincode, routeToken } = orderCheck.rows[0];

    if (currentStatus === 'DELIVERED' || currentStatus === 'CANCELLED') {
      return NextResponse.json(
        { success: false, message: `Cannot ${action === 'CANCEL' ? 'cancel' : 'update'} an order that is already ${currentStatus.toLowerCase()}` },
        { status: 400 }
      );
    }

    if (action === 'UPDATE_ADDRESS' && routeToken) {
      return NextResponse.json(
        { success: false, message: "Cannot update address after route link is generated" },
        { status: 400 }
      );
    }

    const { withTransaction } = await import("../../../../../lib/db");

    if (action === 'CANCEL') {
      // Perform cancellation in transaction
      await withTransaction(async (client) => {
        // 1. Update Order status
        await client.query(
          `UPDATE "Order" SET "status" = 'CANCELLED', "updatedAt" = NOW() WHERE "id" = $1`,
          [orderId]
        );

        // 2. Update RouteOrder status if any
        await client.query(
          `UPDATE "RouteOrder" 
           SET "deliveryStatus" = 'NOT_DELIVERED', 
               "notDeliveredReason" = 'Cancelled by Admin',
               "updatedAt" = NOW()
           WHERE "orderId" = $1 AND "deliveryStatus" = 'PENDING'`,
          [orderId]
        );

        // 3. Reverse Deposit if paid (Offline refund is handled manually, but system balance must match)
        if (paymentStatus === 'SUCCESS' && depositAmount && depositAmount > 0) {
          const depositInRupees = depositAmount / 100;

          // Decrement wallet balance
          await client.query(
            `UPDATE "Customer" 
             SET "depositWalletBalance" = "depositWalletBalance" - $1,
                 "updatedAt" = NOW()
             WHERE "id" = $2`,
            [depositInRupees, customerId]
          );

          // Log transaction (DEBIT)
          await client.query(
            `INSERT INTO "WalletTransaction"
             ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              crypto.randomUUID(),
              customerId,
              -depositInRupees, // Negative for DEBIT
              'DEBIT',
              'ORDER_CANCELLED',
              orderId,
              `Deposit reversal for Cancelled Order #${orderId.slice(-8).toUpperCase()}`
            ]
          );
        }
      });

      const adminId = await getAdminIdFromRequest(req);
      logAction({
        actorId: adminId,
        actorType: 'ADMIN',
        entity: 'ORDER',
        entityId: orderId,
        action: 'UPDATE',
        oldData: { status: currentStatus },
        newData: { status: 'CANCELLED' },
        description: `Order cancelled by Admin`,
      });

      return NextResponse.json({
        success: true,
        message: "Order cancelled successfully"
      });
    }

    if (action === 'UPDATE_ADDRESS') {
      const { address } = body;
      if (!address) {
        return NextResponse.json(
          { success: false, message: "Address data is required" },
          { status: 400 }
        );
      }

      const { getStartOfDayIST, getEndOfDayIST } = await import("../../../../../lib/timezone");

      const oldAddressRes = await query(`SELECT * FROM "Address" WHERE "id" = $1`, [addressId]);
      const oldAddress = oldAddressRes.rows[0];

      let newStatus = currentStatus;
      let newRouteName = null;
      let newStaffName = null;
      let routeOutcomeMsg = null;

      await withTransaction(async (client) => {
        // 1. Update the Address record
        await client.query(
          `UPDATE "Address" SET 
            "line1" = $1, "line2" = $2, "area" = $3, "city" = $4, "pincode" = $5, 
            "landmark" = $6, "contactName" = $7, "contactPhone" = $8, "nickname" = $9,
            "latitude" = $10, "longitude" = $11, "updatedAt" = NOW()
           WHERE "id" = $12`,
          [
            address.line1 || address.addressLine1,
            address.line2 || address.addressLine2,
            address.area,
            address.city,
            address.pincode,
            address.landmark,
            address.contactName,
            address.contactPhone,
            address.nickname,
            address.latitude ? parseFloat(address.latitude) : null,
            address.longitude ? parseFloat(address.longitude) : null,
            addressId
          ]
        );

        // 2. If pincode changed, handle dynamic reassignment
        const newPincode = address.pincode;
        
        // Skip reassignment logic for NOT_DELIVERED orders or past delivery dates
        const { getNowIST } = await import("../../../../../lib/timezone");
        const today = getStartOfDayIST(getNowIST());
        const isPastDate = new Date(deliveryDate) < today;

        if (newPincode !== oldPincode && currentStatus !== 'NOT_DELIVERED' && !isPastDate) {
          // A. Remove existing pending route assignments
          await client.query(
            `DELETE FROM "RouteOrder" WHERE "orderId" = $1 AND "deliveryStatus" = 'PENDING'`,
            [orderId]
          );

          // B. Find new ServiceRoute for the new pincode
          const serviceRouteRes = await client.query<{ serviceRouteId: string; currentDeliveryBoyId: string }>(
            `SELECT sa."serviceRouteId", sr."currentDeliveryBoyId"
             FROM "ServiceArea" sa
             JOIN "ServiceRoute" sr ON sa."serviceRouteId" = sr."id"
             WHERE sa."pincode" = $1 AND sa."active" = true`,
            [newPincode]
          );

          let finalRouteId = null;
          let isAssigned = false;

          if (serviceRouteRes.rows.length > 0) {
            const { serviceRouteId, currentDeliveryBoyId } = serviceRouteRes.rows[0];
            
            // Fetch names for logging
            const routeNameRes = await client.query(`SELECT "name" FROM "ServiceRoute" WHERE "id" = $1`, [serviceRouteId]);
            const staffNameRes = await client.query(`SELECT "name" FROM "DeliveryBoy" WHERE "id" = $1`, [currentDeliveryBoyId]);
            newRouteName = routeNameRes.rows[0]?.name || 'Unknown Route';
            newStaffName = staffNameRes.rows[0]?.name || 'Unknown Staff';

            const startOfDeliveryDay = getStartOfDayIST(new Date(deliveryDate));
            const endOfDeliveryDay = getEndOfDayIST(new Date(deliveryDate));

            // C. Find if a daily Route exists for this ServiceRoute on the same date
            const existingRouteRes = await client.query<{ id: string; token: string | null }>(
              `SELECT "id", "token" FROM "Route"
               WHERE "serviceRouteId" = $1 AND "date" >= $2 AND "date" < $3
               LIMIT 1`,
              [serviceRouteId, startOfDeliveryDay, endOfDeliveryDay]
            );

            if (existingRouteRes.rows.length > 0) {
              const route = existingRouteRes.rows[0];
              // Only auto-assign if the route hasn't been started yet (token is NULL)
              if (!route.token) {
                finalRouteId = route.id;
                isAssigned = true;
              } else {
                // Route is live! Do not assign and do not create a duplicate.
                isAssigned = false;
              }
            } else if (currentDeliveryBoyId) {
              // D. Auto-create daily route ONLY if no route exists at all
              finalRouteId = crypto.randomUUID();
              await client.query(
                `INSERT INTO "Route"("id", "date", "serviceRouteId", "deliveryBoyId", "createdAt", "updatedAt")
                 VALUES($1, $2, $3, $4, NOW(), NOW())`,
                [finalRouteId, startOfDeliveryDay, serviceRouteId, currentDeliveryBoyId]
              );
              isAssigned = true;
            }

            if (finalRouteId) {
              await client.query(
                `INSERT INTO "RouteOrder"("id", "routeId", "orderId", "deliveryStatus", "codCollected", "createdAt", "updatedAt")
                 VALUES($1, $2, $3, 'PENDING', false, NOW(), NOW())`,
                [crypto.randomUUID(), finalRouteId, orderId]
              );
            }
          }

          // E. Update Order confirmation status based on assignment
          await client.query(
            `UPDATE "Order" SET "status" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
            [isAssigned ? 'CONFIRMED' : 'PENDING', orderId]
          );
          
          newStatus = isAssigned ? 'CONFIRMED' : 'PENDING';

          if (!isAssigned) {
             routeOutcomeMsg = "No route available for new pincode, so order was unassigned and status reverted to PENDING.";
          } else {
             routeOutcomeMsg = `Order reassigned to ${newRouteName} (Staff: ${newStaffName}).`;
          }
        }
      });

      const adminId = await getAdminIdFromRequest(req);
      
      const newAddress = {
        ...oldAddress,
        line1: address.line1 || address.addressLine1 || oldAddress?.line1,
        line2: address.line2 !== undefined ? address.line2 : (address.addressLine2 !== undefined ? address.addressLine2 : oldAddress?.line2),
        area: address.area || oldAddress?.area,
        city: address.city || oldAddress?.city,
        pincode: address.pincode || oldAddress?.pincode,
        landmark: address.landmark !== undefined ? address.landmark : oldAddress?.landmark,
        contactName: address.contactName !== undefined ? address.contactName : oldAddress?.contactName,
        contactPhone: address.contactPhone !== undefined ? address.contactPhone : oldAddress?.contactPhone,
        nickname: address.nickname !== undefined ? address.nickname : oldAddress?.nickname,
        latitude: address.latitude ? parseFloat(address.latitude) : oldAddress?.latitude,
        longitude: address.longitude ? parseFloat(address.longitude) : oldAddress?.longitude,
      };

      let logDesc = `Updated delivery address for order.`;
      if (routeOutcomeMsg) {
         logDesc += `\n${routeOutcomeMsg}`;
      }

      const oldDataPayload: any = { address: oldAddress };
      const newDataPayload: any = { address: newAddress };

      if (newStatus !== currentStatus) {
         oldDataPayload.status = currentStatus;
         newDataPayload.status = newStatus;
      }

      logAction({
        actorId: adminId,
        actorType: 'ADMIN',
        entity: 'ORDER',
        entityId: orderId,
        action: 'UPDATE',
        oldData: oldDataPayload,
        newData: newDataPayload,
        description: logDesc,
      });

      return NextResponse.json({
        success: true,
        message: "Address updated successfully and route recalculated"
      });
    }

  } catch (error) {
    console.error("Error in PATCH /api/admin/orders/[id]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}


