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
        COALESCE(
          (SELECT wt."amount"
           FROM "WalletTransaction" wt
           WHERE wt."referenceId" = o."id"
             AND wt."walletType" = 'ORDER'
             AND wt."type" = 'DEBIT'
           LIMIT 1), 0
        ) as "walletAmountApplied",

        o."updatedAt",
        o."customerId",
        c."name" as "customerName",
        c."phone" as "customerPhone",
        c."cansInHand" as "customerCansInHand",
        c."depositWalletBalance" as "customerDepositWalletBalance",
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
    const amountInRupees = order.amount ? Math.round(order.amount / 100) : 0;

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

    const committedQtyRes = await query<{ committedOrdered: string, committedReturned: string }>(`
      SELECT 
        COALESCE(SUM(oi."quantity"), 0)::bigint as "committedOrdered",
        COALESCE(SUM(oi."returnQuantity"), 0)::bigint as "committedReturned"
      FROM "Order" o
      LEFT JOIN "OrderItem" oi ON o."id" = oi."orderId"
      JOIN "Product" p ON p."id" = oi."productId"
      WHERE o."customerId" = $1 AND o."id" != $2
        AND o."status" IN ('PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY')
        AND (o."paymentMethod" = 'COD' OR o."paymentStatus" = 'SUCCESS')
        AND p."depositAmount" > 0
    `, [order.customerId, orderId]);
    const committedOrdered = parseInt(committedQtyRes.rows[0]?.committedOrdered || '0', 10);
    const committedReturned = parseInt(committedQtyRes.rows[0]?.committedReturned || '0', 10);

    const committedDepositRes = await query<{ committedDeposit: string }>(`
      SELECT COALESCE(SUM("depositAmount"), 0)::bigint as "committedDeposit"
      FROM "Order" 
      WHERE "customerId" = $1 AND "id" != $2
        AND "status" NOT IN ('CANCELLED', 'NOT_DELIVERED')
        AND "paymentStatus" != 'SUCCESS'
        AND ("paymentMethod" = 'COD' OR "paymentStatus" = 'SUCCESS')
    `, [order.customerId, orderId]);
    const committedDeposit = (parseInt(committedDepositRes.rows[0]?.committedDeposit || '0', 10)) / 100;

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
        paymentMethod: Number(order.walletAmountApplied || 0) > 0
          ? (amountInRupees === 0 ? 'WALLET' : `WALLET + ${actualPaymentMethod}`)
          : actualPaymentMethod,
        bankRrn: bankRrn,
        upiId: upiId,
        payerContact: payerContact,
        paymentBreakdown: (() => {
          const walletAmountApplied = Number(order.walletAmountApplied || 0);
          let parts = [];
          if (walletAmountApplied > 0) {
            parts.push(`Wallet: ₹${walletAmountApplied.toFixed(2)}`);
          }
          if (amountInRupees > 0 || walletAmountApplied === 0) {
            parts.push(`${actualPaymentMethod}: ₹${amountInRupees.toFixed(2)}`);
          }
          const walletText = parts.join(' + ');

          if (order.additionalQuantity && order.additionalQuantity > 0 && order.originalQuantity) {
            const originalMethod = actualPaymentMethod;
            const additionalMethod = 'COD'; // Currently mostly supports COD for additions or existing line

            if (originalMethod !== additionalMethod) {
              return `${order.originalQuantity} cans ${originalMethod}, ${order.additionalQuantity} cans ${additionalMethod}${walletAmountApplied > 0 ? ` (via ${walletText})` : ''}`;
            }
          }
          return walletAmountApplied > 0 ? walletText : null; // No split display needed
        })(),
        createdAt: order.createdAt.toISOString(),
        amount: amountInRupees,
        codAdjustmentAmount: (order.codAdjustmentAmount ? order.codAdjustmentAmount / 100 : 0),
        onlinePaidAmount: order.paymentMethod === 'ONLINE' ? Math.max(0, amountInRupees - (order.codAdjustmentAmount ? order.codAdjustmentAmount / 100 : 0)) : 0,
        walletAmountApplied: Number(order.walletAmountApplied || 0),
        customer: {
          id: order.customerId,
          name: order.customerName || "Unknown",
          phone: order.customerPhone,
          cansInHand: order.customerCansInHand || 0,
          depositWalletBalance: order.customerDepositWalletBalance ? Number(order.customerDepositWalletBalance) : 0,
          committedOrdered,
          committedReturned,
          committedDeposit,
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
    } else if (action === 'EDIT_ITEMS') {
      if (!(await verifyAdminAuthWithPermission(req, "edit_order_items"))) {
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
      paymentMethod: string;
      amount: number;
      depositAmount: number;
      customerId: string;
      addressId: string;
      deliveryDate: Date;
      pincode: string;
      routeToken: string | null;
      shiftStatus: string | null;
      customerPhone: string;
      orderNumber: string | null;
    }>(
      `SELECT 
        o."status", 
        o."paymentStatus",
        o."paymentMethod",
        o."amount",
        o."depositAmount", 
        o."customerId", 
        o."addressId", 
        o."deliveryDate", 
        a."pincode", 
        r."token" as "routeToken",
        rs."status" as "shiftStatus",
        c."phone" as "customerPhone",
        o."orderNumber"
       FROM "Order" o 
       INNER JOIN "Address" a ON o."addressId" = a."id"
       INNER JOIN "Customer" c ON o."customerId" = c."id"
       LEFT JOIN "RouteOrder" ro ON o."id" = ro."orderId" AND ro."deliveryStatus" = 'PENDING'
       LEFT JOIN "Route" r ON ro."routeId" = r."id"
       LEFT JOIN "RouteShift" rs ON rs."routeId" = r."id"
       WHERE o."id" = $1`,
      [orderId]
    );

    if (orderCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    const { status: currentStatus, paymentStatus, paymentMethod, amount: currentAmount, depositAmount, customerId, addressId, deliveryDate, pincode: oldPincode, routeToken, shiftStatus, customerPhone, orderNumber } = orderCheck.rows[0];

    if (currentStatus === 'DELIVERED' || currentStatus === 'CANCELLED') {
      return NextResponse.json(
        { success: false, message: `Cannot ${action === 'CANCEL' ? 'cancel' : 'update'} an order that is already ${currentStatus.toLowerCase()}` },
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
             ("id", "customerId", "amount", "type", "walletType", "referenceType", "referenceId", "description", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [
              crypto.randomUUID(),
              customerId,
              -depositInRupees,
              'DEBIT',
              'DEPOSIT',
              'ORDER_CANCELLED',
              orderId,
              `Deposit reversal for Cancelled Order #${orderId.slice(-8).toUpperCase()}`
            ]
          );
        }

        // 4. For ONLINE paid orders, credit product amount to Order Wallet
        if (paymentStatus === 'SUCCESS' && paymentMethod === 'ONLINE') {
          const productAmountPaise = Math.max(0, (currentAmount || 0) - (depositAmount || 0));
          if (productAmountPaise > 0) {
            const productAmountRupees = productAmountPaise / 100;
            await client.query(
              `UPDATE "Customer" SET "orderWalletBalance" = "orderWalletBalance" + $1, "updatedAt" = NOW() WHERE "id" = $2`,
              [productAmountRupees, customerId]
            );
            await client.query(
              `INSERT INTO "WalletTransaction"
               ("id", "customerId", "amount", "type", "walletType", "referenceType", "referenceId", "description", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
              [
                crypto.randomUUID(),
                customerId,
                productAmountRupees,
                'CREDIT',
                'ORDER',
                'ORDER_CANCELLED',
                orderId,
                `Order Wallet credit for cancelled Online Order #${(orderNumber || orderId.slice(-8)).toUpperCase()}`
              ]
            );
          }
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

    // ──────────────────────────────────────────────────────────────────────────
    // EDIT_ITEMS action
    // ──────────────────────────────────────────────────────────────────────────
    if (action === 'EDIT_ITEMS') {
      const { items: newItems } = body as {
        items: { productId: string; quantity: number; price: number; gst: number; depositAmount: number }[];
      };

      if (!Array.isArray(newItems) || newItems.length === 0) {
        return NextResponse.json({ success: false, message: 'items array is required and cannot be empty' }, { status: 400 });
      }

      // Validate each item
      for (const item of newItems) {
        if (!item.productId || !item.quantity || item.quantity < 1) {
          return NextResponse.json({ success: false, message: 'Each item must have a valid productId and quantity >= 1' }, { status: 400 });
        }
      }

      // Fetch current items (old snapshot)
      const oldItemsRes = await query<{
        id: string; productId: string; productName: string; quantity: number; price: number; gst: number; depositAmount: number; returnQuantity: number;
      }>(
        `SELECT oi."id", oi."productId", p."name" as "productName", oi."quantity", oi."price", oi."gst", p."depositAmount", oi."returnQuantity"
         FROM "OrderItem" oi
         JOIN "Product" p ON oi."productId" = p."id"
         WHERE oi."orderId" = $1`,
        [orderId]
      );
      const oldItems = oldItemsRes.rows;

      // Fetch product info for new items (for deposit amounts)
      const productIds = newItems.map(i => i.productId);
      const productRes = await query<{ id: string; name: string; depositAmount: number; gst: number; price: number; }>(
        `SELECT "id", "name", "depositAmount", "gst", "price" FROM "Product" WHERE "id" = ANY($1::text[])`,
        [productIds]
      );
      const productMap = new Map<string, { id: string; name: string; depositAmount: number; gst: number; price: number; }>(
        productRes.rows.map(p => [p.id, p])
      );

      // Compute old amounts (paise)
      const oldProductAmountPaise = oldItems.reduce((sum, item) => {
        const lineTotal = item.price * item.quantity;
        const gst = lineTotal * ((item.gst || 5) / 100);
        return sum + Math.round((lineTotal + gst) * 100);
      }, 0);
      
      // Use the ACTUAL deposit amount from the order, not a theoretical calculation
      const oldDepositPaise = depositAmount ? Math.round(depositAmount) : 0;
      const oldTotalPaise = oldProductAmountPaise + oldDepositPaise;

      // Fetch customer and committed quantities first for empty cans swap check
      const customerRes = await query(`SELECT "cansInHand" FROM "Customer" WHERE "id" = $1`, [customerId]);
      const customer = customerRes.rows[0] || { cansInHand: 0 };

      const committedQtyRes = await query<{ committedReturned: string }>(`
        SELECT 
          COALESCE(SUM(oi."returnQuantity"), 0)::bigint as "committedReturned"
        FROM "Order" o
        LEFT JOIN "OrderItem" oi ON o."id" = oi."orderId"
        JOIN "Product" p ON p."id" = oi."productId"
        WHERE o."customerId" = $1 AND o."id" != $2
          AND o."status" IN ('PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY')
          AND (o."paymentMethod" = 'COD' OR o."paymentStatus" = 'SUCCESS')
          AND p."name" = 'Water Can 20L'
      `, [customerId, orderId]);
      const committedReturned = parseInt(committedQtyRes.rows[0]?.committedReturned || '0', 10);
      let remainingAvailableCans = Math.max(0, customer.cansInHand - committedReturned);

      // Compute new amounts (paise)
      let newProductAmountPaise = 0;
      let newDepositPaise = 0;
      const enrichedNewItems: any[] = [];

      for (const item of newItems) {
        const product = productMap.get(item.productId);
        if (!product) {
          return NextResponse.json({ success: false, message: `Product ${item.productId} not found` }, { status: 400 });
        }
        
        let retQty = 0;
        if (product.name === 'Water Can 20L') {
          retQty = Math.min(item.quantity, remainingAvailableCans);
          remainingAvailableCans = Math.max(0, remainingAvailableCans - retQty);
        }

        // Deposit amount is calculated purely on a per-order basis:
        // (quantity - returnQuantity) * product.depositAmount
        const itemDepositPaise = Math.max(0, (item.quantity - retQty) * (product.depositAmount || 0) * 100);
        newDepositPaise += Math.round(itemDepositPaise);

        // Use the price from the request body (admin sets it, defaults to product price)
        const unitPrice = item.price || product.price;
        const gstRate = item.gst ?? product.gst ?? 5;
        const depositPerUnit = product.depositAmount || 0;
        const lineTotal = unitPrice * item.quantity;
        const gstAmount = lineTotal * (gstRate / 100);
        newProductAmountPaise += Math.round((lineTotal + gstAmount) * 100);
        
        enrichedNewItems.push({
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          returnQuantity: retQty,
          price: unitPrice,
          gst: gstRate,
          depositAmount: depositPerUnit,
        });
      }

      const newTotalPaise = newProductAmountPaise + newDepositPaise;
      const amountDiff = newTotalPaise - oldTotalPaise; // positive = increase, negative = reduction
      const depositDiff = newDepositPaise - oldDepositPaise;
      const productAmountDiff = newProductAmountPaise - oldProductAmountPaise;

      let codAmountAdded = 0;
      let orderWalletCredit = 0;
      let depositWalletCredit = 0;

      const adminId = await getAdminIdFromRequest(req);

      const { withTransaction } = await import("../../../../../lib/db");
      const { sendPushNotification } = await import("../../../../../lib/push");

      await withTransaction(async (client) => {
        // 1. Delete old OrderItems
        await client.query(`DELETE FROM "OrderItem" WHERE "orderId" = $1`, [orderId]);

        // 2. Insert new OrderItems
        for (const item of enrichedNewItems) {
          await client.query(
            `INSERT INTO "OrderItem" ("id", "orderId", "productId", "quantity", "returnQuantity", "price", "gst")
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [crypto.randomUUID(), orderId, item.productId, item.quantity, item.returnQuantity, item.price, item.gst]
          );
        }

        // 3. Update Order amount, depositAmount, quantity
        const newTotalQty = enrichedNewItems.reduce((s, i) => s + i.quantity, 0);
        
        // Fetch wallet amount applied at checkout (ORDER wallet type, referenceType = 'ORDER')
        const walletRes = await client.query(
          `SELECT SUM("amount") as "walletApplied" FROM "WalletTransaction" 
           WHERE "referenceId" = $1 AND "walletType" = 'ORDER' AND "type" = 'DEBIT' AND "referenceType" = 'ORDER'`,
          [orderId]
        );
        const walletAppliedPaise = Math.round((walletRes.rows[0]?.walletApplied || 0) * 100);
        const newNetAmountPaise = Math.max(0, newTotalPaise - walletAppliedPaise);

        await client.query(
          `UPDATE "Order" SET "amount" = $1, "depositAmount" = $2, "quantity" = $3, "updatedAt" = NOW() WHERE "id" = $4`,
          [newNetAmountPaise, newDepositPaise, newTotalQty, orderId]
        );

        // 4. Handle product amount reduction → Order Wallet
        if (productAmountDiff < 0 && paymentStatus === 'SUCCESS') {
          orderWalletCredit = Math.abs(productAmountDiff);
          const creditRupees = orderWalletCredit / 100;
          await client.query(
            `UPDATE "Customer" SET "orderWalletBalance" = "orderWalletBalance" + $1, "updatedAt" = NOW() WHERE "id" = $2`,
            [creditRupees, customerId]
          );
          await client.query(
            `INSERT INTO "WalletTransaction" ("id", "customerId", "amount", "type", "walletType", "referenceType", "referenceId", "description", "createdAt")
             VALUES ($1, $2, $3, 'CREDIT', 'ORDER', 'ORDER_EDIT', $4, $5, NOW())`,
            [crypto.randomUUID(), customerId, creditRupees, orderId,
             `Order Wallet credit: order items edited — reduced by ₹${creditRupees.toFixed(2)} (Order #${(orderNumber || orderId.slice(-8)).toUpperCase()})`]
          );
        }

        // 5. Handle deposit reduction → Deposit Wallet
        if (depositDiff < 0 && paymentStatus === 'SUCCESS') {
          depositWalletCredit = Math.abs(depositDiff); // This is the refund amount
          const depositCreditRupees = depositWalletCredit / 100;
          
          // Since they no longer need this deposit, we REDUCE the deposit wallet balance
          await client.query(
            `UPDATE "Customer" SET "depositWalletBalance" = "depositWalletBalance" - $1, "updatedAt" = NOW() WHERE "id" = $2`,
            [depositCreditRupees, customerId]
          );
          await client.query(
            `INSERT INTO "WalletTransaction" ("id", "customerId", "amount", "type", "walletType", "referenceType", "referenceId", "description", "createdAt")
             VALUES ($1, $2, $3, 'DEBIT', 'DEPOSIT', 'ORDER_EDIT', $4, $5, NOW())`,
            [crypto.randomUUID(), customerId, depositCreditRupees, orderId,
             `Deposit Wallet adjustment: deposit reduced by ₹${depositCreditRupees.toFixed(2)} (Order #${(orderNumber || orderId.slice(-8)).toUpperCase()})`]
          );
          
          // And we REFUND this amount to their Order Wallet so they can spend it
          await client.query(
            `UPDATE "Customer" SET "orderWalletBalance" = "orderWalletBalance" + $1, "updatedAt" = NOW() WHERE "id" = $2`,
            [depositCreditRupees, customerId]
          );
          await client.query(
            `INSERT INTO "WalletTransaction" ("id", "customerId", "amount", "type", "walletType", "referenceType", "referenceId", "description", "createdAt")
             VALUES ($1, $2, $3, 'CREDIT', 'ORDER', 'ORDER_EDIT', $4, $5, NOW())`,
            [crypto.randomUUID(), customerId, depositCreditRupees, orderId,
             `Order Wallet credit: deposit refund of ₹${depositCreditRupees.toFixed(2)} (Order #${(orderNumber || orderId.slice(-8)).toUpperCase()})`]
          );
        }

        // 6. Handle total amount increase → extra amount to collect (either COD or Online)
        if (amountDiff > 0) {
          codAmountAdded = amountDiff;
          await client.query(
            `UPDATE "Order" SET "codAdjustmentAmount" = COALESCE("codAdjustmentAmount", 0) + $1, "updatedAt" = NOW() WHERE "id" = $2`,
            [codAmountAdded, orderId]
          );
        }

        // 7. Insert OrderEditLog
        await client.query(
          `INSERT INTO "OrderEditLog" ("id", "orderId", "adminId", "editType", "oldSnapshot", "newSnapshot", "oldAmount", "newAmount", "amountDiff", "depositDiff", "codAmountAdded", "orderWalletCredit", "depositWalletCredit", "description", "createdAt")
           VALUES ($1, $2, $3, 'ITEMS_EDITED', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
          [
            crypto.randomUUID(), orderId, adminId,
            JSON.stringify(oldItems), JSON.stringify(enrichedNewItems),
            oldTotalPaise, newTotalPaise, amountDiff, depositDiff,
            codAmountAdded, orderWalletCredit, depositWalletCredit,
            `Admin edited order items. Amount changed from ₹${(oldTotalPaise/100).toFixed(2)} to ₹${(newTotalPaise/100).toFixed(2)}`
          ]
        );

        // 8. Insert OrderActivityLog
        await client.query(
          `INSERT INTO "OrderActivityLog" ("id", "orderId", "action", "description", "metadata", "createdAt")
           VALUES ($1, $2, 'ITEMS_EDITED', $3, $4, NOW())`,
          [
            crypto.randomUUID(), orderId,
            `Items edited by admin. Old total: ₹${(oldTotalPaise/100).toFixed(2)}, New total: ₹${(newTotalPaise/100).toFixed(2)}${codAmountAdded > 0 ? `, Extra COD: ₹${(codAmountAdded/100).toFixed(2)}` : ''}${orderWalletCredit > 0 ? `, Order Wallet credited: ₹${(orderWalletCredit/100).toFixed(2)}` : ''}`,
            JSON.stringify({ performedBy: adminId || 'ADMIN' })
          ]
        );
      });

      // 9. Audit log (async, outside transaction)
      logAction({
        actorId: adminId,
        actorType: 'ADMIN',
        entity: 'ORDER',
        entityId: orderId,
        action: 'ITEMS_EDITED',
        oldData: { items: oldItems, amount: oldTotalPaise / 100 },
        newData: { items: enrichedNewItems, amount: newTotalPaise / 100, codAdjustmentAdded: codAmountAdded / 100, orderWalletCredited: orderWalletCredit / 100, depositWalletCredited: depositWalletCredit / 100 },
        description: `Admin edited order items. Amount: ₹${(oldTotalPaise/100).toFixed(2)} → ₹${(newTotalPaise/100).toFixed(2)}`,
      });

      // 10. Push notification to customer
      try {
        const sessionRes = await query<{ pushToken: string }>(
          `SELECT "pushToken" FROM "UserSession" WHERE "customerId" = $1 AND "pushToken" IS NOT NULL ORDER BY "updatedAt" DESC LIMIT 1`,
          [customerId]
        );
        const pushToken = sessionRes.rows[0]?.pushToken;
        if (pushToken) {
          const notifBody = codAmountAdded > 0
            ? `Your order #${(orderNumber || orderId.slice(-8)).toUpperCase()} was updated. New total: ₹${(newTotalPaise/100).toFixed(0)}. Additional COD to pay: ₹${(codAmountAdded/100).toFixed(0)}.`
            : orderWalletCredit > 0
            ? `Your order #${(orderNumber || orderId.slice(-8)).toUpperCase()} was updated. ₹${(orderWalletCredit/100).toFixed(0)} credited to your Order Wallet.`
            : `Your order #${(orderNumber || orderId.slice(-8)).toUpperCase()} items were updated by our team.`;
          await sendPushNotification(pushToken, 'Order Updated', notifBody);
        }
      } catch (notifErr) {
        console.error('Push notification failed (non-critical):', notifErr);
      }

      return NextResponse.json({
        success: true,
        message: 'Order items updated successfully',
        changes: {
          oldAmount: oldTotalPaise / 100,
          newAmount: newTotalPaise / 100,
          amountDiff: amountDiff / 100,
          codAmountAdded: codAmountAdded / 100,
          orderWalletCredited: orderWalletCredit / 100,
          depositWalletCredited: depositWalletCredit / 100,
        }
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


