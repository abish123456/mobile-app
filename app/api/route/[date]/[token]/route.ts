import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { getStartOfDayIST, formatDateToISO } from "../../../../../lib/timezone";

// Price is now stored in order.amount (in paise)

// GET /api/route/[date]/[token] - Get route details for delivery boy
// GET /api/route/[date]/[token] - Get route details for delivery boy
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ date: string; token: string }> }
) {
  try {
    const { date, token } = await params;

    // 1. First, find which delivery boy and date this token belongs to
    // Also including service route info here for basic page display
    const routeInfoRes = await query<{
      id: string;
      deliveryBoyId: string;
      date: Date;
      tokenExpiresAt: Date;
      serviceRouteId: string;
      serviceRouteName: string;
      deliveryBoyName: string;
      deliveryBoyPhone: string;
      isSubmitted: boolean;
      submittedAt: Date | null;
    }>(
      `SELECT 
        r."id",
        r."deliveryBoyId",
        r."date",
        r."tokenExpiresAt",
        r."serviceRouteId",
        sr."name" as "serviceRouteName",
        db."name" as "deliveryBoyName",
        db."phone" as "deliveryBoyPhone",
        r."isSubmitted",
        r."submittedAt"
       FROM "Route" r
       INNER JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr."id"
       INNER JOIN "DeliveryBoy" db ON r."deliveryBoyId" = db."id"
       WHERE r."token" = $1`,
      [token]
    );

    if (routeInfoRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Route not found or invalid token" },
        { status: 404 }
      );
    }

    const routeInfo = routeInfoRes.rows[0];
    const { deliveryBoyId, date: targetDate, id: routeId } = routeInfo;

    // Check if link is not active yet using UTC comparison
    const now = new Date();
    const activeFrom = getStartOfDayIST(new Date(targetDate));
    if (now.getTime() < activeFrom.getTime()) {
      return NextResponse.json(
        { success: false, message: "Route link is not active yet. It will be active on the delivery day." },
        { status: 403 }
      );
    }

    // Fetch deposit rate for calculating total cans
    const productRes = await query<{ depositAmount: number }>(
      `SELECT "depositAmount" FROM "Product" WHERE "active" = true AND "depositAmount" > 0 ORDER BY "createdAt" ASC LIMIT 1`
    );
    const depositRate = productRes.rows[0]?.depositAmount || 0;

    // 2. Fetch Orders for this route
    const ordersRes = await query<{
      orderId: string;
      orderQuantity: number;
      orderOriginalQuantity: number | null;
      orderAdditionalQuantity: number | null;
      orderAmount: number | null;
      orderPaymentStatus: string;
      orderPaymentMethod: string;
      orderStatus: string;
      customerId: string;
      customerName: string;
      depositWalletBalance: number;
      customerPhone: string;
      addressLine1: string;
      addressLine2: string | null;
      addressArea: string;
      addressCity: string;
      addressPincode: string;
      addressLandmark: string | null;
      deliveryStatus: string;
      notDeliveredReason: string | null;
      codCollected: boolean;
      routeOrderId: string;
    }>(
      `SELECT 
        o."id" as "orderId",
        o."orderNumber",
        o."quantity" as "orderQuantity",
        o."originalQuantity" as "orderOriginalQuantity",
        o."additionalQuantity" as "orderAdditionalQuantity",
        COALESCE(o."amount", o."quantity" * 50 * 100) as "orderAmount",
        o."paymentStatus" as "orderPaymentStatus",
        o."paymentMethod" as "orderPaymentMethod",
        o."status" as "orderStatus",
        c."id" as "customerId",
        c."name" as "customerName",
        c."phone" as "customerPhone",
        a."line1" as "addressLine1",
        a."line2" as "addressLine2",
        a."area" as "addressArea",
        a."city" as "addressCity",
        a."pincode" as "addressPincode",
        a."landmark" as "addressLandmark",
        a."nickname" as "addressNickname",
        a."contactName" as "addressContactName",
        a."contactPhone" as "addressContactPhone",
        a."latitude" as "addressLatitude",
        a."longitude" as "addressLongitude",
        ro."deliveryStatus",
        ro."notDeliveredReason",
        ro."codCollected",
        ro."id" as "routeOrderId",
        ro."sequence",
        c."depositWalletBalance",
        o."isQrPayment",
        (
          EXISTS (SELECT 1 FROM "RouteOrder" ro_check WHERE ro_check."orderId" = o."id" AND ro_check."deliveryStatus" = 'NOT_DELIVERED')
          OR ((o."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date > (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date)
        ) as "isReassignedHistory"
      FROM "RouteOrder" ro
      INNER JOIN "Order" o ON ro."orderId" = o."id"
      INNER JOIN "Customer" c ON o."customerId" = c."id"
      INNER JOIN "Address" a ON o."addressId" = a."id"
      WHERE ro."routeId" = $1
        AND o."status" != 'CANCELLED'
        AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
      ORDER BY ro."sequence" ASC, a."pincode" ASC, o."createdAt" ASC, o."id" ASC`,
      [routeId]
    );

    console.log(`[DEBUG_ROUTE] Token: ${token}, RouteId: ${routeId}, Orders Found: ${ordersRes.rows.length}`);

    if (ordersRes.rows.length === 0) {
      // Check if raw RouteOrders exist (without joins) to debug join failure
      const rawCount = await query(`SELECT COUNT(*) as count FROM "RouteOrder" WHERE "routeId" = $1`, [routeId]);
      console.log(`[DEBUG_ROUTE] Raw RouteOrders count: ${rawCount.rows[0].count}`);
    }

    // Use UTC timestamps for accurate comparison to avoid server timezone issues
    const expiresAt = routeInfo.tokenExpiresAt ? new Date(routeInfo.tokenExpiresAt) : null;
    const nowUTC = now.getTime();
    const expiresAtUTC = expiresAt ? expiresAt.getTime() : null;

    const isExpired = expiresAtUTC && expiresAtUTC < nowUTC;

    // Check if route is expired and block access
    if (isExpired) {
      // Perform lazy update: only mark PENDING orders (ones the delivery boy never touched)
      // as 'Delivery Staff Mistake'. Do NOT overwrite orders already explicitly marked
      // NOT_DELIVERED by the staff with their own reason.
      if (ordersRes.rows.length > 0) {
        await query(
          `UPDATE "RouteOrder"
           SET "deliveryStatus" = 'NOT_DELIVERED', 
               "notDeliveredReason" = 'Delivery Staff Mistake',
               "updatedAt" = NOW()
           WHERE "routeId" = $1 
             AND "deliveryStatus" = 'PENDING'`,
          [routeId]
        );

        await query(
          `UPDATE "Order" o
           SET "status" = 'NOT_DELIVERED', "updatedAt" = NOW()
           FROM "RouteOrder" ro
           WHERE ro."orderId" = o."id" 
             AND ro."routeId" = $1
             AND ro."deliveryStatus" = 'NOT_DELIVERED'
             AND ro."notDeliveredReason" = 'Delivery Staff Mistake'
             AND o."status" NOT IN ('NOT_DELIVERED', 'DELIVERED', 'CANCELLED')
          `,
          [routeId]
        );
      }

      // Block access to expired route
      return NextResponse.json(
        { success: false, message: "Route link has expired. You cannot access this route." },
        { status: 403 }
      );
    }

    // 3. Process Orders (Payments, Items, formatting)
    let formatOrders: any[] = [];
    if (ordersRes.rows.length > 0) {
      const orderIds = ordersRes.rows.map(row => row.orderId);

      // Fetch Payments
      const paymentsRes = await query<{
        orderId: string;
        routeOrderId: string | null;
        amount: number;
        status: string;
        method: string;
      }>(
        `SELECT "orderId", "routeOrderId", "amount", "status", "method"
           FROM "Payment"
           WHERE "orderId" = ANY($1::text[])`,
        [orderIds]
      );

      const paymentsMap = new Map<string, Array<{ amount: number; status: string; method: string; routeOrderId: string | null }>>();
      paymentsRes.rows.forEach(row => {
        const existing = paymentsMap.get(row.orderId) || [];
        existing.push({
          amount: Number(row.amount),
          status: row.status,
          method: row.method,
          routeOrderId: row.routeOrderId
        });
        paymentsMap.set(row.orderId, existing);
      });

      // Fetch Order Items
      const orderItemsRes = await query<{
        orderId: string;
        itemId: string;
        productId: string;
        productName: string;
        quantity: number;
        returnQuantity: number;
        price: number;
      }>(
        `SELECT 
            oi."orderId",
            oi."id" as "itemId",
            oi."productId",
            p."name" as "productName",
            oi."quantity",
            oi."returnQuantity",
            oi."price"
           FROM "OrderItem" oi
           JOIN "Product" p ON oi."productId" = p."id"
           WHERE oi."orderId" = ANY($1::text[])`,
        [orderIds]
      );

      const orderItemsMap = new Map<string, Array<{ id: string; productId: string; productName: string; quantity: number; returnQuantity: number; price: number }>>();
      orderItemsRes.rows.forEach(row => {
        const existing = orderItemsMap.get(row.orderId) || [];
        existing.push({
          id: row.itemId,
          productId: row.productId,
          productName: row.productName,
          quantity: row.quantity,
          returnQuantity: row.returnQuantity,
          price: row.price
        });
        orderItemsMap.set(row.orderId, existing);
      });

      // Format Orders
      formatOrders = ordersRes.rows.map((row) => {
        const orderAmountInPaise = row.orderAmount || 0;
        const orderPayments = (paymentsMap.get(row.orderId) || []).filter(p => p.status === 'SUCCESS');
        const totalPaidInPaise = orderPayments.reduce((sum, p) => sum + p.amount, 0);

        const cashPaidInPaise = orderPayments
          .filter(p => p.method === 'COD' && p.routeOrderId === row.routeOrderId)
          .reduce((sum, p) => sum + p.amount, 0);

        const outstandingAmountInPaise = Math.max(0, orderAmountInPaise - totalPaidInPaise);

        let effectivePaymentStatus = row.orderPaymentStatus;
        if (row.orderAdditionalQuantity && row.orderAdditionalQuantity > 0 && row.orderPaymentStatus !== 'SUCCESS') {
          if (totalPaidInPaise < orderAmountInPaise - 1) {
            if (row.orderPaymentStatus === 'SUCCESS') {
              effectivePaymentStatus = 'PENDING';
            }
          } else {
            effectivePaymentStatus = 'SUCCESS';
          }
        }

        let effectiveCollectedAmount = cashPaidInPaise;
        if (row.codCollected && cashPaidInPaise === 0) {
          effectiveCollectedAmount = outstandingAmountInPaise;
        }

        const isAwaitingCash = row.orderPaymentStatus === 'COD' ||
          row.orderPaymentStatus === 'PENDING' ||
          row.codCollected ||
          (row.orderPaymentStatus === 'SUCCESS' && outstandingAmountInPaise > 0);
        const expectedCODForThisOrder = cashPaidInPaise + (isAwaitingCash ? outstandingAmountInPaise : 0);

        const totalDepositCans = depositRate > 0 ? Math.floor((row.depositWalletBalance || 0) / depositRate) : 0;

        return {
          id: row.orderId,
          orderNumber: row.orderNumber,
          routeOrderId: row.routeOrderId,
          totalDepositCans,
          quantity: row.orderQuantity,
          originalQuantity: row.orderOriginalQuantity,
          additionalQuantity: row.orderAdditionalQuantity,
          amount: orderAmountInPaise / 100,
          outstandingAmount: outstandingAmountInPaise / 100,
          effectiveCollectedAmount: effectiveCollectedAmount / 100,
          paymentStatus: effectivePaymentStatus,
          paymentMethod: row.orderPaymentMethod,
          status: row.orderStatus,
          customer: {
            name: row.customerName,
            phone: row.customerPhone,
          },
          address: {
            line1: row.addressLine1,
            line2: row.addressLine2,
            area: row.addressArea,
            city: row.addressCity,
            pincode: row.addressPincode,
            landmark: row.addressLandmark,
            nickname: (row as any).addressNickname,
            contactName: (row as any).addressContactName,
            contactPhone: (row as any).addressContactPhone,
            latitude: (row as any).addressLatitude,
            longitude: (row as any).addressLongitude,
          },
          deliveryStatus: row.deliveryStatus,
          notDeliveredReason: row.notDeliveredReason,
          codCollected: row.codCollected,
          expectedCOD: expectedCODForThisOrder / 100,
          isQrPayment: (row as any).isQrPayment || false,
          isReassigned: (row as any).isReassignedHistory && !['NOT_DELIVERED', 'CANCELLED'].includes(row.orderStatus),
          items: orderItemsMap.get(row.orderId) || [],
        };
      });
    }

    // Calculate totals
    const totalOrders = formatOrders.length;
    const totalCans = formatOrders.reduce((sum, o) => sum + o.quantity, 0);
    const expectedCOD = formatOrders.reduce((sum, o) => sum + (o.expectedCOD || 0), 0);
    const codCollected = formatOrders.reduce((sum, o) => sum + o.effectiveCollectedAmount, 0);
    const deliveredCount = formatOrders.filter((o) => o.deliveryStatus === "DELIVERED").length;
    const pendingCount = formatOrders.filter((o) => o.deliveryStatus === "PENDING" && o.status !== "CANCELLED").length;


    // 4. Fetch assigned return requests
    const formattedTargetDate = date; // 'YYYY-MM-DD' from URL param
    const customerIds = Array.from(new Set(ordersRes.rows.map(r => r.orderId ? r.customerId : null))).filter(Boolean);

    const returnRequestsRes = await query<{
      id: string;
      customerName: string;
      customerPhone: string;
      quantity: number;
      refundAmount: number;
      status: string;
      addressLine1: string;
      addressArea: string;
      addressCity: string;
      addressPincode: string;
    }>(
      `SELECT 
        r."id",
        c."name" as "customerName",
        c."phone" as "customerPhone",
        r."quantity",
        r."refundAmount",
        r."status",
        a."line1" as "addressLine1",
        a."area" as "addressArea",
        a."city" as "addressCity",
        a."pincode" as "addressPincode",
        a."nickname" as "addressNickname",
        a."contactName" as "addressContactName",
        a."contactPhone" as "addressContactPhone",
        a."latitude" as "addressLatitude",
        a."longitude" as "addressLongitude"
       FROM "ReturnCanRequest" r
       JOIN "Customer" c ON r."customerId" = c."id"
       LEFT JOIN LATERAL (
         SELECT * FROM "Address" 
         WHERE "customerId" = c."id" AND "active" = true
         ORDER BY "isDefault" DESC, "updatedAt" DESC
         LIMIT 1
       ) a ON true
       LEFT JOIN "ServiceArea" sa ON a."pincode" = sa."pincode"
       WHERE r."deliveryPartnerId" = $1 
         AND r."status" IN ('ASSIGNED', 'COLLECTED')
         AND sa."serviceRouteId" = $3
         AND (
             r."collectedAt" IS NULL 
             OR (r."collectedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = $2::date
         )`,
      [deliveryBoyId, formattedTargetDate, routeInfo.serviceRouteId]
    );

    console.log('[RETURN_REQUESTS] Route ID:', routeInfo.id);
    console.log('[RETURN_REQUESTS] Service Route ID:', routeInfo.serviceRouteId);
    console.log('[RETURN_REQUESTS] Delivery Boy ID:', deliveryBoyId);
    console.log('[RETURN_REQUESTS] Found requests:', returnRequestsRes.rows.length);
    if (returnRequestsRes.rows.length > 0) {
      console.log('[RETURN_REQUESTS] Request details:', returnRequestsRes.rows.map(r => ({
        id: r.id,
        customer: r.customerName,
        pincode: r.addressPincode,
        status: r.status
      })));
    }

    const returnRequests = returnRequestsRes.rows.map(row => ({
      id: row.id,
      type: 'RETURN_CAN',
      customer: {
        name: row.customerName,
        phone: row.customerPhone
      },
      quantity: row.quantity,
      refundAmount: row.refundAmount,
      status: row.status,
      collected: false,
      address: {
        line1: row.addressLine1 || '',
        area: row.addressArea || '',
        city: row.addressCity || '',
        pincode: row.addressPincode || '',
        nickname: (row as any).addressNickname || '',
        contactName: (row as any).addressContactName || '',
        contactPhone: (row as any).addressContactPhone || '',
        latitude: (row as any).addressLatitude || null,
        longitude: (row as any).addressLongitude || null
      }
    }));

    // 5. Fetch Deposit Refund Requests
    // Ensure we fetch if there are customers OR the ServiceRoute covers them (even without orders)
    // We can filter by ServiceRouteId via ServiceArea
    const serviceRouteIds = [routeInfo.serviceRouteId];

    const depositRefundRes = await query<{
      id: string;
      customerId: string;
      customerName: string;
      customerPhone: string;
      amount: number;
      quantity: number;
      status: string;
      collected: boolean;
      addressLine1: string;
      addressArea: string;
      addressCity: string;
      addressPincode: string;
    }>(
      `SELECT 
        d."id",
        c."id" as "customerId",
        c."name" as "customerName",
        c."phone" as "customerPhone",
        d."amount",
        d."quantity",
        d."status",
        d."collected",
        a."line1" as "addressLine1",
        a."area" as "addressArea",
        a."city" as "addressCity",
        a."pincode" as "addressPincode",
        a."nickname" as "addressNickname",
        a."contactName" as "addressContactName",
        a."contactPhone" as "addressContactPhone",
        a."latitude" as "addressLatitude",
        a."longitude" as "addressLongitude"
       FROM "DepositRefundRequest" d
       JOIN "Customer" c ON d."customerId" = c."id"
       LEFT JOIN LATERAL (
         SELECT * FROM "Address" 
         WHERE "customerId" = c."id" AND "active" = true
         ORDER BY "isDefault" DESC, "updatedAt" DESC
         LIMIT 1
       ) a ON true
       LEFT JOIN "ServiceArea" sa ON a."pincode" = sa."pincode"
       WHERE sa."serviceRouteId" = $2
         AND (
             d."status" = 'REQUESTED' 
             OR (d."status" = 'PAID' AND d."collected" = false)
             OR (
                 d."status" = 'PAID'
                 AND d."collected" = true
                 AND (d."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = $1::date
             )
         )
      `,
      [formattedTargetDate, routeInfo.serviceRouteId]
    );

    const depositRefundRequestsFormatted = depositRefundRes.rows.map(row => ({
      id: row.id,
      type: 'DEPOSIT_REFUND',
      customer: {
        name: row.customerName,
        phone: row.customerPhone
      },
      quantity: row.quantity || 0,
      refundAmount: row.amount,
      status: row.collected ? 'COLLECTED' : row.status,
      collected: row.collected,
      address: {
        line1: row.addressLine1 || '',
        area: row.addressArea || '',
        city: row.addressCity || '',
        pincode: row.addressPincode || '',
        nickname: (row as any).addressNickname || '',
        contactName: (row as any).addressContactName || '',
        contactPhone: (row as any).addressContactPhone || '',
        latitude: (row as any).addressLatitude || null,
        longitude: (row as any).addressLongitude || null
      }
    }));

    const allReturnRequests = [...returnRequests, ...depositRefundRequestsFormatted];

    return NextResponse.json({
      success: true,
      route: {
        id: routeInfo.id,
        date: routeInfo.date,
        area: routeInfo.serviceRouteName,
        deliveryBoy: {
          name: routeInfo.deliveryBoyName,
          phone: routeInfo.deliveryBoyPhone,
        },
        orders: formatOrders,
        returnRequests: allReturnRequests,
        summary: {
          totalOrders,
          totalCans,
          expectedCOD,
          codCollected,
          deliveredCount,
          pendingCount,
        },
        isExpired,
        isSubmitted: routeInfo.isSubmitted || false,
        submittedAt: routeInfo.submittedAt,
        expiresAt: routeInfo.tokenExpiresAt,
        notDeliveredReasons: (await query(`SELECT reason FROM "NotDeliveredReason" WHERE "isActive" = true ORDER BY "reason" ASC`)).rows.map(r => r.reason)
      },
    });
  } catch (error) {
    console.error("Error in GET /api/route/[date]/[token]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/route/[date]/[token] - Submit / Complete route assignment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ date: string; token: string }> }
) {
  try {
    const { date, token } = await params;

    // 1. Find the Route
    const routeRes = await query<{ id: string; isSubmitted: boolean }>(
      `SELECT "id", "isSubmitted" FROM "Route" WHERE "token" = $1`,
      [token]
    );

    if (routeRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Route not found or invalid token" },
        { status: 404 }
      );
    }

    const route = routeRes.rows[0];

    if (route.isSubmitted) {
      return NextResponse.json(
        { success: false, message: "Route has already been submitted and is locked." },
        { status: 400 }
      );
    }

    // 2. Validate all orders are marked as DELIVERED or NOT_DELIVERED
    const pendingOrdersRes = await query<{ count: string }>(
      `SELECT COUNT(*)::int as count 
       FROM "RouteOrder" ro
       INNER JOIN "Order" o ON ro."orderId" = o."id"
       WHERE ro."routeId" = $1
         AND ro."deliveryStatus" = 'PENDING'
         AND o."status" != 'CANCELLED'
         AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')`,
      [route.id]
    );

    const pendingCount = pendingOrdersRes.rows[0].count;

    if (pendingCount > 0) {
      return NextResponse.json(
        { success: false, message: `Cannot submit route. There are still ${pendingCount} pending orders.` },
        { status: 400 }
      );
    }

    // 3. Mark Route as Submitted
    const submittedAt = new Date();
    await query(
      `UPDATE "Route"
       SET "isSubmitted" = true,
           "submittedAt" = $1,
           "updatedAt" = NOW()
       WHERE "id" = $2`,
      [submittedAt, route.id]
    );

    return NextResponse.json({
      success: true,
      message: "Route submitted successfully. Order modifications are now locked.",
      submittedAt: submittedAt.toISOString()
    });
  } catch (error) {
    console.error("Error in POST /api/route/[date]/[token]:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
