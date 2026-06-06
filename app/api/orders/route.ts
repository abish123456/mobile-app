import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "../../../lib/db";
import { assignOrderToRoute } from "../../../lib/order-assignment";
import { getCustomerIdFromSession } from "../../../lib/session-auth";
import crypto from "crypto";
import { validateQuantity, validateDeliverySlot, validateAddressLine, validateArea, validateCity, validatePincode } from "../../../lib/validation";
import { checkRateLimit, RATE_LIMITS, getRateLimitHeaders } from "../../../lib/rate-limit";
import { createSecureResponse } from "../../../lib/security-headers";
import { createRequestLogger } from "../../../lib/request-logger";
import { getNowIST, formatDateIST, getStartOfDayIST, getEndOfDayIST, formatDateToISO, addDaysIST, createISTDate } from "../../../lib/timezone";
import { getNextWorkingDay } from "../../../lib/holidays";

// Helper function to format timestamps for display while preserving original for sorting
function formatTimestampsForDisplay(order: any) {
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    createdAtIST: formatDateIST(order.createdAt, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata'
    }),
    updatedAtIST: formatDateIST(order.updatedAt, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata'
    })
  };
}

// GET /api/orders/me - Fetch customer's orders
export async function GET(req: NextRequest) {
  try {
    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    // Fetch orders with address details
    // Fetch orders with address details

    // Get pagination params
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get('limit') || '10')));
    const offset = (page - 1) * limit;

    // First, let's check all orders for this customer to find 61E8ECC4
    const allOrdersRes = await query<{ id: string; paymentStatus: string; status: string; createdAt: Date }>(
      `SELECT o."id", o."paymentStatus", o."status", o."createdAt"
       FROM "Order" o
       WHERE o."customerId" = $1
       ORDER BY o."createdAt" DESC
       LIMIT 10`,
      [customerId],
    );

    // First, let's check all orders for this customer to find 61E8ECC4

    // Get total count for pagination
    const countRes = await query<{ count: string }>(
      `SELECT COUNT("id") as "count"
       FROM "Order"
       WHERE "customerId" = $1
       AND NOT ("paymentMethod" = 'ONLINE' AND "paymentStatus" = 'PENDING')`,
      [customerId]
    );
    const totalOrders = parseInt(countRes.rows[0]?.count || '0');
    const totalPages = Math.ceil(totalOrders / limit);

    const ordersRes = await query<{
      id: string;
      quantity: number;
      originalQuantity: number | null;
      additionalQuantity: number | null;
      amount: number | null; // Amount in paise, may be null for old orders
      deliveryDate: Date;
      deliverySlot: string;
      status: string;
      paymentStatus: string;
      paymentMethod: string;
      createdAt: Date;
      updatedAt: Date;
      addressLine1: string;
      addressLine2: string | null;
      area: string;
      city: string;
      pincode: string;
      productName: string | null;
      isAssigned: boolean;
      isRouteGenerated: boolean;
    }>(
      `SELECT 
        o."id",
        o."orderNumber",
        o."quantity",
        o."originalQuantity",
        o."additionalQuantity",
        o."amount",
        o."deliveryDate",
        o."deliverySlot",
        o."status",
        o."paymentStatus",
        o."paymentMethod",
        o."createdAt",
        o."updatedAt",
        a."line1" as "addressLine1",
        a."line2" as "addressLine2",
        a."area",
        a."city",
        a."pincode",
        COALESCE(
          (SELECT 
            CASE 
              WHEN COUNT(*) = 1 THEN MAX(p_inner."name")
              ELSE MAX(p_inner."name") || ' + ' || (COUNT(*) - 1) || ' more'
            END
           FROM "OrderItem" oi_inner
           JOIN "Product" p_inner ON oi_inner."productId" = p_inner."id"
           WHERE oi_inner."orderId" = o."id"
          ),
          p."name",
          'Water Can'
        ) as "productName",
        COALESCE((
          SELECT SUM(p."amount")::bigint
          FROM "Payment" p
          WHERE p."orderId" = o."id" AND p."status" = 'SUCCESS'
        ), 0) as "paidAmount",
        (EXISTS (SELECT 1 FROM "RouteOrder" ro WHERE ro."orderId" = o."id" AND ro."deliveryStatus" != 'NOT_DELIVERED')) as "isAssigned",
        (EXISTS (
           SELECT 1 
           FROM "RouteOrder" ro 
           JOIN "Route" r ON ro."routeId" = r."id"
           WHERE ro."orderId" = o."id" 
           AND ro."deliveryStatus" != 'NOT_DELIVERED'
           AND r."token" IS NOT NULL
        )) as "isRouteGenerated"
       FROM "Order" o
       INNER JOIN "Address" a ON o."addressId" = a."id"
       LEFT JOIN "Product" p ON o."productId" = p."id"
       WHERE o."customerId" = $1
       AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
       ORDER BY o."createdAt" DESC
       LIMIT $2 OFFSET $3`,
      [customerId, limit, offset],
    );

    // Debug: Log raw database response with sorting verification
    // Debug: Log raw database response with sorting verification

    const orders = ordersRes.rows.map((order) => {
      // Use stored amount if available (all new orders will have amount stored)
      // For old orders without amount, we can't calculate without product info, so use stored amount or 0
      const amountInRupees = order.amount ? order.amount / 100 : 0;

      const createdAtISO = order.createdAt.toISOString();
      const updatedAtISO = order.updatedAt.toISOString();
      const createdAtIST = formatDateIST(order.createdAt, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      });
      const updatedAtIST = formatDateIST(order.updatedAt, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      });

      // Create order object with all required fields including IST formatting
      const orderWithIST = {
        id: order.id,
        orderNumber: order.orderNumber,
        quantity: order.quantity,
        originalQuantity: order.originalQuantity,
        additionalQuantity: order.additionalQuantity,
        deliveryDate: order.deliveryDate.toISOString(),
        deliverySlot: order.deliverySlot,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        amount: amountInRupees,
        createdAt: createdAtISO,
        updatedAt: updatedAtISO,
        createdAtIST: createdAtIST,
        updatedAtIST: updatedAtIST,
        paidAmount: order.paidAmount ? Number(order.paidAmount) / 100 : 0,
        address: {
          line1: order.addressLine1,
          line2: order.addressLine2,
          area: order.area,
          city: order.city,
          pincode: order.pincode,
        },
        productName: order.productName || "Water Can",
        isAssigned: order.isAssigned,
        isRouteGenerated: order.isRouteGenerated,
      };

      return orderWithIST;
    });

    // Debug log to check order data with UTC vs IST comparison
    // Debug log removed

    return NextResponse.json({
      success: true,
      orders,
      pagination: {
        page,
        limit,
        total: totalOrders,
        totalPages,
      }
    });
  } catch (error) {
    console.error("Error in GET /api/orders:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const logger = createRequestLogger()(req);

  try {
    // Rate limiting - moderate for order creation
    const rateLimitResponse = checkRateLimit(req, RATE_LIMITS.API);
    if (rateLimitResponse) {
      logger.log({ statusCode: 429 });
      return rateLimitResponse;
    }

    const customerId = await getCustomerIdFromSession();
    if (!customerId) {
      logger.log({ statusCode: 401 });
      return createSecureResponse(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const quantity = Number(body?.quantity ?? 0);
    const deliverySlot = (body?.deliverySlot ?? "").toString().trim(); // e.g. "TODAY_MORNING"
    const paymentMethodId = body?.paymentMethodId; // Payment method ID for online payments
    const addressId = body?.addressId; // Existing address ID
    const nickname = body?.nickname?.toString().trim() || null;
    const contactName = body?.contactName?.toString().trim() || null;
    const contactPhone = body?.contactPhone?.toString().trim() || null;
    const addressLine1 = body?.addressLine1?.toString().trim() || "";
    const addressLine2 = body?.addressLine2?.toString().trim() || "";
    const area = body?.area?.toString().trim() || "";
    const city = body?.city?.toString().trim() || "";
    const pincode = body?.pincode?.toString().trim() || "";
    const landmark = body?.landmark?.toString().trim() || null;
    const latitude = body?.latitude ? parseFloat(body.latitude) : null;
    const longitude = body?.longitude ? parseFloat(body.longitude) : null;
    const hasAddressOverride = !addressId && !!(addressLine1 || area || city || pincode || landmark || addressLine2 || latitude || longitude);

    // Validate contact phonet for new address or override
    if (!addressId || hasAddressOverride) {
      if (!contactPhone || contactPhone.toString().trim().length !== 10) {
        return NextResponse.json(
          { success: false, message: "Valid 10-digit contact phone is required" },
          { status: 400 },
        );
      }
    }
    const now = getNowIST(); // Use IST timezone for order creation timestamp

    // Get payment type from request, default to ONLINE for backward compatibility
    const paymentType = (body?.paymentType === 'COD') ? 'COD' : 'ONLINE';

    // Validate quantity (min: 1, max: 100)
    const quantityValidation = validateQuantity(quantity, 1, 100);
    if (!quantityValidation.valid) {
      return NextResponse.json(
        { success: false, message: quantityValidation.message || "Invalid quantity" },
        { status: 400 },
      );
    }

    // Validate delivery slot
    const slotValidation = validateDeliverySlot(deliverySlot);
    if (!slotValidation.valid) {
      return NextResponse.json(
        { success: false, message: slotValidation.message || "Invalid delivery slot" },
        { status: 400 },
      );
    }

    // Use normalized delivery slot
    const normalizedSlot = slotValidation.normalized!;

    // Payment method ID is only required for ONLINE payments
    if (paymentType === 'ONLINE' && !paymentMethodId) {
      return NextResponse.json(
        { success: false, message: "Payment method is required" },
        { status: 400 },
      );
    }

    // Get customer details using session customer ID
    const customerRes = await query<{
      id: string;
      depositWalletBalance: number;
      cansInHand: number;
    }>(
      `SELECT "id", "depositWalletBalance", "cansInHand"
       FROM "Customer"
       WHERE "id" = $1`,
      [customerId],
    );

    const customer = customerRes.rows[0];
    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 },
      );
    }

    // If customer has a pending deposit verification request,
    // block new orders until admin approves or rejects it.
    const pendingDepositRes = await query<{ count: string }>(
      `SELECT COUNT("id") as "count"
       FROM "DepositVerificationRequest"
       WHERE "customerId" = $1
         AND "status" = 'PENDING'`,
      [customer.id],
    );

    if (parseInt(pendingDepositRes.rows[0]?.count || "0", 10) > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Your existing deposit verification is pending. Once admin approves it, you can place new orders.",
        },
        { status: 400 },
      );
    }

    // Pre-validate override address but defer insertion until after idempotency check
    if (hasAddressOverride) {
      const addressValidations = [
        validateAddressLine(addressLine1, "Address Line 1"),
        validateArea(area),
        validateCity(city),
        validatePincode(pincode),
      ];

      const invalid = addressValidations.find((v) => !v.valid);
      if (invalid) {
        return NextResponse.json(
          { success: false, message: invalid.message || "Invalid address" },
          { status: 400 },
        );
      }
    }

    // Check for same-day delivery cutoff
    const configRes = await query<{ key: string; value: string }>(
      'SELECT "key", "value" FROM "SystemConfig" WHERE "key" IN (\'SAME_DAY_CUTOFF_HOUR\', \'SAME_DAY_CUTOFF_MINUTE\')'
    );
    const configs = configRes.rows.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    const cutoffHour = parseInt(configs.SAME_DAY_CUTOFF_HOUR || '11');
    const cutoffMinute = parseInt(configs.SAME_DAY_CUTOFF_MINUTE || '0');

    const nowOrder = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });

    const [istTimePart] = formatter.format(nowOrder).split(' ');
    const [currentHourIST, currentMinuteIST] = istTimePart.split(':').map(Number);

    const todayISTStr = formatDateToISO(nowOrder);
    const isSameDayDeliveryRequested = normalizedSlot.match(/^\d{4}-\d{2}-\d{2}$/) && normalizedSlot === todayISTStr;

    if (isSameDayDeliveryRequested) {
      const isPastCutoff = (currentHourIST > cutoffHour) || (currentHourIST === cutoffHour && currentMinuteIST >= cutoffMinute);

      if (isPastCutoff) {
        const formattedCutoff = `${cutoffHour > 12 ? cutoffHour - 12 : (cutoffHour === 0 ? 12 : cutoffHour)}:${cutoffMinute.toString().padStart(2, '0')} ${cutoffHour >= 12 ? 'PM' : 'AM'}`;
        return NextResponse.json(
          { success: false, message: `Same-day delivery is only available until ${formattedCutoff}. Please select tomorrow or a later date.` },
          { status: 400 }
        );
      }
    }

    // Fetch pending return requests to compensate in this order
    const returnRequestsRes = await query<{ id: string; quantity: number }>(
      `SELECT "id", "quantity" FROM "ReturnCanRequest" 
       WHERE "customerId" = $1 AND "status" = 'REQUESTED'`,
      [customer.id]
    );
    const pendingReturnRequests = returnRequestsRes.rows;
    const totalPendingReturnQuantity = pendingReturnRequests.reduce((sum, req) => sum + req.quantity, 0);
    const pendingReturnRequestIds = pendingReturnRequests.map(req => req.id);

    // Fetch cart items with product prices to calculate total
    // Use customer-specific prices if available, otherwise use default product price
    const cartRes = await query<{
      productId: string;
      quantity: number;
      returnQuantity: number;
      price: number | null;
      customerPrice: number | null;
      gst: number | null;
      depositAmount: number | null;
      active: boolean | null;
      inStock: boolean | null;
    }>(
      `SELECT
         c."productId",
         c."quantity",
         c."returnQuantity",
         p."price",
         cpp."price" as "customerPrice",
         p."gst",
         p."depositAmount",
         p."active",
         p."inStock"
       FROM "CartItem" c
       LEFT JOIN "Product" p ON p."id" = c."productId"
       LEFT JOIN "CustomerProductPrice" cpp ON cpp."productId" = p."id" AND cpp."customerId" = $1
       WHERE c."customerId" = $1`,
      [customer.id],
    );

    // Validate all cart items are available and calculate subtotal, GST, and DEPOSIT
    let subtotal = 0;
    let totalGstAmount = 0;
    let totalDepositRequired = 0;
    let totalReturnQuantity = 0;
    let remainingPendingReturns = totalPendingReturnQuantity;

    for (const item of cartRes.rows) {
      if (!item.price || item.active !== true || item.inStock !== true) {
        return NextResponse.json(
          { success: false, message: "One or more products are no longer available. Please update your cart." },
          { status: 400 },
        );
      }
      // Use customer-specific price if available, otherwise use default price
      const finalPrice = item.customerPrice ?? item.price;
      const itemSubtotal = finalPrice * item.quantity;
      subtotal += itemSubtotal;

      // Calculate GST for this item
      const itemGstRate = item.gst ?? 5.0;
      const itemGstAmount = itemSubtotal * (itemGstRate / 100);
      totalGstAmount += itemGstAmount;

      // Calculate net cans needed for this item (only for items with deposit)
      // Only track deposit for items that have depositAmount > 0
      if ((item.depositAmount || 0) > 0) {
        // Apply pending returns to the first available item(s) with deposit
        if (remainingPendingReturns > 0) {
          item.returnQuantity += remainingPendingReturns;
          remainingPendingReturns = 0; // Consumed all pending returns
        }

        const itemNetCans = item.quantity - item.returnQuantity;
        totalDepositRequired += itemNetCans; // Track net cans, not deposit yet
        // Only count returns for items with deposit (products without deposit don't have empty cans to return)
        totalReturnQuantity += item.returnQuantity;
      }
    }

    // Validate returns against cansInHand
    // Calculate committed ordered and returned cans from active orders (not delivered/cancelled/failed)
    // Only count products with deposit amounts
    // 1. Calculate committed ordered and returned cans (from active delivery commitments)
    const committedQuantityRes = await query<{
      committedOrdered: string;
      committedReturned: string;
    }>(
      `SELECT 
          COALESCE(SUM(oi."quantity"), 0)::bigint as "committedOrdered",
          COALESCE(SUM(oi."returnQuantity"), 0)::bigint as "committedReturned"
       FROM "OrderItem" oi
       JOIN "Order" o ON o."id" = oi."orderId"
       JOIN "Product" p ON p."id" = oi."productId"
       WHERE o."customerId" = $1
         AND o."status" NOT IN ('DELIVERED', 'CANCELLED', 'NOT_DELIVERED')
         AND (o."paymentMethod" = 'COD' OR o."paymentStatus" = 'SUCCESS')
         AND p."depositAmount" > 0`,
      [customer.id]
    );

    // 2. Calculate pending deposit credits (total financial deposit committed in unpaid orders)
    // This includes DELIVERED but not yet SUCCESS orders (for COD)
    const committedDepositRes = await query<{ committedDeposit: string }>(
      `SELECT COALESCE(SUM("depositAmount"), 0)::bigint as "committedDeposit"
       FROM "Order"
       WHERE "customerId" = $1
         AND "status" NOT IN ('CANCELLED', 'NOT_DELIVERED')
         AND "paymentStatus" != 'SUCCESS'
         AND ("paymentMethod" = 'COD' OR "paymentStatus" = 'SUCCESS')`, // consistent filter
      [customer.id]
    );
    // Wait, let's refine the committedDeposit filter. 
    // If it's ONLINE and PENDING, we SHOULD ignore it because it's an unpaid attempt.
    // If it's COD, we count it. If it's SUCCESS, it's already in walletBalance.

    // Actually, the most robust filter for 'Planned/Paid Deposit Asset' is:
    // Any order that is NOT cancelled AND (is COD OR is PAID).
    // EXCEPT that PAID orders' deposits are already in the wallet balance.
    // So for committedDeposit (things NOT in wallet yet), we only care about COD orders.

    // Correct logic:
    // Wallet Balance = Deposits from PAID orders.
    // Pending Deposit = Deposits from COD orders (until delivered/marked success).

    const committedOrdered = parseInt(committedQuantityRes.rows[0]?.committedOrdered || '0', 10);
    const committedReturned = parseInt(committedQuantityRes.rows[0]?.committedReturned || '0', 10);

    // We only care about orders that are (COD OR PAID) but NOT yet SUCCESS (which means mostly COD orders in various delivery states)
    const committedDepositQuery = `
      SELECT COALESCE(SUM("depositAmount"), 0)::bigint as "committedDeposit"
      FROM "Order" 
      WHERE "customerId" = $1 
        AND "status" NOT IN ('CANCELLED', 'NOT_DELIVERED')
        AND "paymentStatus" != 'SUCCESS'
        AND ("paymentMethod" = 'COD' OR "paymentStatus" = 'SUCCESS')
    `;
    const finalPendingDepositRes = await query<{ committedDeposit: string }>(committedDepositQuery, [customer.id]);
    const committedDeposit = (parseInt(finalPendingDepositRes.rows[0]?.committedDeposit || '0', 10)) / 100; // to Rupees

    const availableCans = Math.max(0, customer.cansInHand - committedReturned);

    if (totalReturnQuantity > availableCans) {
      return NextResponse.json(
        {
          success: false,
          message: `You have ${customer.cansInHand} cans, but ${committedReturned} are committed to other orders. You can only return ${availableCans} cans.`,
          errorType: 'INSUFFICIENT_CANS'
        },
        { status: 400 },
      );
    }

    // Target Balance Deposit Model:
    // - Instead of simple per-order skip/swap, we look at the TOTAL cans the customer will have
    //   after all pending orders (including this one) are delivered.
    // - Formula: Total Cans = current + pending_net + cart_net
    // - Wallet should always equal Total Cans * Deposit Rate.
    // - Pay the difference if Wallet < Required.

    const totalOrderedInCart = cartRes.rows.reduce((sum, item) => (item.depositAmount || 0) > 0 ? sum + item.quantity : sum, 0);
    const totalReturnedInCart = totalReturnQuantity;

    // Get deposit rate from first item with deposit (assuming uniform rate)
    const depositItem = cartRes.rows.find(item => (item.depositAmount || 0) > 0);
    const depositRate = depositItem?.depositAmount ?? 0;

    // STALE CART CHECK:
    // Re-calculate what the correct returnQuantity should be right now (same logic as /api/cart POST).
    // If it differs from what is stored in the cart, the customer's cart is stale (they left the page
    // open and conditions changed, e.g. a previous order was delivered, unlocking their cans).
    // In that case, reject with STALE_CART so the frontend can clear the cart and send them back.
    if (depositRate > 0) {
      const correctReturnQty = Math.min(totalOrderedInCart, availableCans);
      if (correctReturnQty !== totalReturnedInCart) {
        return NextResponse.json(
          {
            success: false,
            message: 'Your cart information is outdated. Your deposit amount may have changed. Please review your cart and place the order again.',
            errorType: 'STALE_CART'
          },
          { status: 400 },
        );
      }
    }

    // Prediction of future cans count
    const futureCansInHand = customer.cansInHand + (committedOrdered - committedReturned) + (totalOrderedInCart - totalReturnedInCart);

    // Calculate required wallet balance for that future state
    const requiredDepositBalance = Math.max(0, futureCansInHand * depositRate);

    // Any deficit is what needs to be paid now
    // Account for both existing wallet balance AND deposits already committed in other active orders
    const depositToPay = Math.max(0, requiredDepositBalance - (customer.depositWalletBalance || 0) - committedDeposit);

    // IMPORTANT:
    // At order creation we DO NOT change depositWalletBalance or cansInHand.
    // - depositWalletBalance should change only when deposit is actually paid or refunded.
    // - cansInHand is adjusted only on delivery, based on actual delivered vs returned cans.
    const walletDelta = 0;
    const cansDelta = 0;
    const totalAmount = Math.round(subtotal + totalGstAmount + depositToPay);


    // Verify total quantity matches
    const totalCartQuantity = cartRes.rows.reduce((sum, item) => sum + item.quantity, 0);
    if (totalCartQuantity !== quantity) {
      return NextResponse.json(
        { success: false, message: "Cart quantity mismatch. Please refresh and try again." },
        { status: 400 },
      );
    }

    // Compute deliveryDate based on slot
    let deliveryDate: Date;

    // Date format: YYYY-MM-DD
    const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = normalizedSlot.match(datePattern);
    
    if (match) {
      const [, year, month, day] = match;
      // Create a date object in IST, then normalize to start of day
      const parsedDate = createISTDate(parseInt(year), parseInt(month) - 1, parseInt(day));
      deliveryDate = getStartOfDayIST(parsedDate);
    } else {
      return NextResponse.json(
        { success: false, message: "Invalid delivery date format. Must be YYYY-MM-DD." },
        { status: 400 },
      );
    }
    // deliveryDate is already normalized to start of day in IST via getStartOfDayIST helper Above

    // Holiday check — roll forward to the next working day if delivery date is a holiday
    const holidayCheck = await getNextWorkingDay(deliveryDate);
    deliveryDate = holidayCheck.date;
    const deliveryDateAdjusted = holidayCheck.adjusted;
    const adjustedReason = holidayCheck.adjustedReason;

    // totalAmount (with GST) is already calculated above
    const totalAmountInPaise = Math.round(totalAmount * 100); // Convert to paise (smallest currency unit)

    // Avoid duplicate orders when customer retries payment by reusing a recent pending order
    const existingOrderRes = await query<{
      id: string;
      quantity: number;
      amount: number;
      deliveryDate: Date;
      deliverySlot: string;
      createdAt: Date;
      paymentMethod: string;
      paymentStatus: string;
      orderNumber: string | null;
      addressLine1: string;
      addressLine2: string | null;
      area: string;
      city: string;
      pincode: string;
      landmark: string | null;
    }>(
      `SELECT 
         o."id",
         o."quantity",
         o."amount",
         o."deliveryDate",
         o."deliverySlot",
         o."createdAt",
         o."paymentMethod",
         o."paymentStatus",
         o."orderNumber",
         a."line1" as "addressLine1",
         a."line2" as "addressLine2",
         a."area",
         a."city",
         a."pincode",
         a."landmark"
       FROM "Order" o
       INNER JOIN "Address" a ON a."id" = o."addressId"
       WHERE o."customerId" = $1
         AND o."paymentStatus" = 'PENDING'
         AND o."status" = 'PENDING'
         AND o."deliverySlot" = $2
         AND o."deliveryDate" = $3
         AND o."amount" = $4
         AND o."quantity" = $5
         AND o."createdAt" > NOW() - INTERVAL '2 hours'
       ORDER BY o."createdAt" DESC
       LIMIT 1`,
      [customer.id, normalizedSlot, deliveryDate, totalAmountInPaise, quantity],
    );

    const existingOrder = existingOrderRes.rows[0];
    if (existingOrder) {
      const deliveryDateMatches = existingOrder.deliveryDate.toISOString() === deliveryDate.toISOString();
      const addressMatches =
        !hasAddressOverride ||
        (existingOrder.addressLine1.trim().toLowerCase() === addressLine1.toLowerCase() &&
          (existingOrder.addressLine2 || "").trim().toLowerCase() === (addressLine2 || "").toLowerCase() &&
          existingOrder.area.trim().toLowerCase() === area.toLowerCase() &&
          existingOrder.city.trim().toLowerCase() === city.toLowerCase() &&
          existingOrder.pincode.trim() === pincode.trim() &&
          (existingOrder.landmark || "").trim().toLowerCase() === (landmark || "").toLowerCase());

      if (deliveryDateMatches && addressMatches) {
        // Handle conversion from ONLINE to COD if requested
        // Keep the same order number — no need to generate a new one.
        // The order is the same delivery, just the payment method changed.
        if (paymentType === 'COD' && existingOrder.paymentMethod === 'ONLINE') {
          await query(
            `UPDATE "Order" 
             SET "paymentMethod" = 'COD', 
                 "paymentStatus" = 'COD', 
                 "updatedAt" = NOW() 
             WHERE "id" = $1`,
            [existingOrder.id]
          );

          existingOrder.paymentMethod = 'COD';
          existingOrder.paymentStatus = 'COD';
        }

        // Auto-assign to route if it's COD (either converted or reused existing COD)
        let finalStatus = "PENDING";
        if (paymentType === 'COD') {
          try {
            const assignmentResult = await assignOrderToRoute(existingOrder.id);
            if (assignmentResult.success) {
              finalStatus = "CONFIRMED";
            }
          } catch (err) {
            console.error("Failed to auto-assign reused COD order:", err);
          }
        }

        const response = createSecureResponse(
          {
            success: true,
            order: {
              id: existingOrder.id,
              orderNumber: existingOrder.orderNumber,
              quantity: existingOrder.quantity,
              deliveryDate: existingOrder.deliveryDate,
              deliverySlot: existingOrder.deliverySlot,
              status: finalStatus,
              paymentStatus: existingOrder.paymentStatus,
              paymentMethod: existingOrder.paymentMethod,
              amount: existingOrder.amount / 100, // back to rupees for UI
              reused: true,
            },
          },
          {
            headers: getRateLimitHeaders(req, RATE_LIMITS.API),
          },
        );
        logger.log({ statusCode: 200, userId: customer.id });
        return response;
      }
    }


    let address: { id: string; area: string; pincode: string; isDefault: boolean };
    if (addressId) {
      // If addressId is provided, check if we need to update it with new fields
      const addressRes = await query<{
        id: string;
        area: string;
        pincode: string;
        isDefault: boolean;
      }>(
        `SELECT "id", "area", "pincode", "isDefault"
         FROM "Address"
         WHERE "id" = $1 AND "customerId" = $2`,
        [addressId, customerId],
      );
      if (addressRes.rows.length === 0) {
        return NextResponse.json(
          { success: false, message: "Selected address not found" },
          { status: 400 },
        );
      }

      // Update existing address if fields are provided (Address Persistence Fix with Copy-on-Write)
      if (addressLine1 || area || city || pincode) {
        // CHECK IF ADDRESS IS USED IN ANY ORDERS (Copy-on-Write logic)
        const orderCheck = await query(
          `SELECT "id" FROM "Order" WHERE "addressId" = $1 LIMIT 1`,
          [addressId]
        );

        const isLinkedToOrders = orderCheck.rows.length > 0;

        if (isLinkedToOrders) {
          console.log('[CHECKOUT_UPDATE] COPY-ON-WRITE: Address linked to orders, creating new address');
          // COPY-ON-WRITE: Create NEW address, SOFT-DELETE old one

          const newAddressId = crypto.randomUUID();

          const originalIsDefault = addressRes.rows[0].isDefault;

          // 1. Soft delete the old address
          await query(
            `UPDATE "Address" 
             SET "active" = false, "isDefault" = false 
             WHERE "id" = $1`,
            [addressId]
          );

          // 2. If the original was default, ensure no other address is mistakenly marked default
          if (originalIsDefault) {
            await query(
              `UPDATE "Address" SET "isDefault" = false WHERE "customerId" = $1`,
              [customer.id]
            );
          }

          // 3. Create NEW address record
          await query(
            `INSERT INTO "Address" (
                "id", "customerId", "nickname", "contactName", "contactPhone", 
                "line1", "line2", "area", "city", "pincode", "landmark", 
                "latitude", "longitude",
                "isDefault", "active", "createdAt", "updatedAt"
            ) VALUES (
                $1, $2, $3, $4, $5, 
                $6, $7, $8, $9, $10, $11, 
                $14, $15,
                $12, true, $13, $13
            )`,
            [newAddressId, customer.id, nickname, contactName, contactPhone,
              addressLine1, addressLine2, area, city, pincode, landmark,
              originalIsDefault, now, latitude, longitude]
          );

          // Use the new address for this order
          address = { id: newAddressId, area, pincode, isDefault: originalIsDefault };
        } else {
          console.log('[CHECKOUT_UPDATE] NO ORDERS: Updating address in place');
          // NO LINKED ORDERS: Update in place
          await query(
            `UPDATE "Address"
             SET "nickname" = $1, "contactName" = $2, "contactPhone" = $3, 
                 "line1" = $4, "line2" = $5, "area" = $6, "city" = $7, 
                 "pincode" = $8, "landmark" = $9, "latitude" = $13, "longitude" = $14, "updatedAt" = $10
             WHERE "id" = $11 AND "customerId" = $12`,
            [nickname, contactName, contactPhone, addressLine1, addressLine2, area, city, pincode, landmark, now, addressId, customer.id, latitude, longitude]
          );
          const originalIsDefault = addressRes.rows[0].isDefault;
          address = { id: addressId, area, pincode, isDefault: originalIsDefault };
        }
      } else {
        address = addressRes.rows[0];
      }
    } else if (hasAddressOverride) {
      const newAddressId = crypto.randomUUID();

      // Check if this is the first address, if so, make it default
      const countRes = await query(
        `SELECT COUNT(*) FROM "Address" WHERE "customerId" = $1 AND "active" = true`,
        [customer.id]
      );
      const isFirst = parseInt(countRes.rows[0].count) === 0;

      // If setting as default, unset others first
      if (isFirst) {
        await query(
          `UPDATE "Address" SET "isDefault" = false WHERE "customerId" = $1`,
          [customer.id]
        );
      }

      await query(
        `INSERT INTO "Address"
         ("id", "customerId", "nickname", "contactName", "contactPhone", "line1", "line2", "area", "city", "pincode", "landmark", "latitude", "longitude", "isDefault", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $14, $15, $12, $13, $13)`,
        [newAddressId, customer.id, nickname, contactName, contactPhone, addressLine1, addressLine2, area, city, pincode, landmark, isFirst, now, latitude, longitude],
      );
      address = { id: newAddressId, area, pincode, isDefault: isFirst };
    } else {
      const addressRes = await query<{
        id: string;
        area: string;
        pincode: string;
        isDefault: boolean;
      }>(
        `SELECT "id", "area", "pincode", "isDefault"
         FROM "Address"
         WHERE "customerId" = $1 AND "isDefault" = true
         ORDER BY "createdAt" DESC
         LIMIT 1`,
        [customer.id],
      );

      const defaultAddress = addressRes.rows[0];
      if (!defaultAddress) {
        return NextResponse.json(
          { success: false, message: "No default address found. Please complete profile first." },
          { status: 400 },
        );
      }
      address = defaultAddress;
    }

    // Check if the area is in our ServiceArea table (lookup valid service areas)
    const serviceAreaRes = await query<{ count: string }>(
      `SELECT COUNT("id") as "count"
       FROM "ServiceArea"
       WHERE "pincode" = $1 AND "active" = true`,
      [address.pincode.toString().trim()]
    );

    if (parseInt(serviceAreaRes.rows[0].count) === 0) {
      return NextResponse.json(
        { success: false, message: "We don't serve this area yet." },
        { status: 400 }
      );
    }

    // Map to enum values used in schema
    const paymentMethod = paymentType === 'COD' ? 'COD' : 'ONLINE'; // matches PaymentMethod enum: ONLINE or COD
    const paymentStatus = paymentType === 'COD' ? 'COD' : 'PENDING'; // PaymentStatus enum: PENDING or COD
    const orderStatus = 'PENDING'; // All orders start as PENDING, confirmed on assignment or payment success.

    const orderId = crypto.randomUUID();
    let orderNumber: string | null = null;

    // Use transaction to create order and order items
    await withTransaction(async (client) => {
      // 1. Assign Sequential Order Number to ALL orders (including ONLINE)
      // This ensures every order has a number, even if payment fails later
      const seqResult = await client.query(`SELECT nextval('order_id_seq') as num`);
      orderNumber = seqResult.rows[0].num.toString();


      // 2. Create Order
      await client.query(
        `INSERT INTO "Order"
         ("id", "orderNumber", "customerId", "addressId", "productId", "quantity", "amount", "depositAmount", "deliveryDate", "deliverySlot",
          "status", "paymentStatus", "paymentMethod", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
        [
          orderId,
          orderNumber,
          customer.id,
          address.id,
          cartRes.rows[0]?.productId || null, // Keep the first product ID for backward compatibility
          quantity,
          totalAmountInPaise,
          Math.round(depositToPay * 100),
          deliveryDate,
          normalizedSlot,
          orderStatus,
          paymentStatus,
          paymentMethod,
          now,
        ],
      );

      // 2. Create OrderItems for each product in cart
      for (const item of cartRes.rows) {
        const finalPrice = item.customerPrice ?? item.price;
        await client.query(
          `INSERT INTO "OrderItem"
           ("id", "orderId", "productId", "quantity", "price", "gst", "returnQuantity")
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            crypto.randomUUID(),
            orderId,
            item.productId,
            item.quantity,
            finalPrice,
            item.gst ?? 5.0,
            item.returnQuantity
          ]
        );
      }

      // 3. Log Wallet Transaction for deposit-related changes
      if (walletDelta !== 0) {
        await client.query(
          `INSERT INTO "WalletTransaction"
           ("id", "customerId", "amount", "type", "referenceType", "referenceId", "description", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            crypto.randomUUID(),
            customer.id,
            walletDelta,
            walletDelta > 0 ? 'CREDIT' : 'DEBIT',
            'DEPOSIT',
            orderId,
            walletDelta > 0
              ? `Credit for extra returns in Order #${orderId.slice(-8).toUpperCase()}`
              : `Used wallet balance for deposit in Order #${orderId.slice(-8).toUpperCase()}`,
            now
          ]
        );
      }

      // 4. Update Customer Wallet and Cans In Hand
      await client.query(
        `UPDATE "Customer"
         SET "depositWalletBalance" = "depositWalletBalance" + $1, 
             "cansInHand" = "cansInHand" + $2, 
             "updatedAt" = $3
         WHERE "id" = $4`,
        [walletDelta, cansDelta, now, customer.id]
      );

      // 5. Update Return Requests status
      if (pendingReturnRequestIds.length > 0) {
        await client.query(
          `UPDATE "ReturnCanRequest" 
           SET "status" = 'COMPLETED', "updatedAt" = $1 
           WHERE "id" = ANY($2)`,
          [now, pendingReturnRequestIds]
        );
      }

      // 6. Log Initial Activity
      await client.query(
        `INSERT INTO "OrderActivityLog" ("id", "orderId", "action", "description", "metadata", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          crypto.randomUUID(),
          orderId,
          'ORDER_PLACED',
          `Order Placed for delivery on ${deliveryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
          JSON.stringify({
            deliveryDate,
            deliverySlot: normalizedSlot,
            quantity: quantity,
            amount: totalAmount,
            paymentMethod
          }),
          now
        ]
      );
    });

    // If COD, run auto-assignment logic
    if (paymentType === 'COD') {
      try {
        await assignOrderToRoute(orderId);
      } catch (err) {
        console.error("Failed to auto-assign COD order:", err);
      }
    }

    const response = createSecureResponse(
      {
        success: true,
        order: {
          id: orderId,
          quantity,
          deliveryDate,
          deliverySlot: normalizedSlot,
          status: orderStatus,
          paymentStatus,
          paymentMethod,
          amount: totalAmount, // Includes GST
        },
        deliveryDateAdjusted,
        adjustedReason,
      },
      {
        headers: getRateLimitHeaders(req, RATE_LIMITS.API),
      }
    );
    logger.log({ statusCode: 200, userId: customer.id });
    return response;
  } catch (error) {
    console.error("Error in POST /api/orders:", error);
    console.error("Error details:", {
      message: (error as Error)?.message,
      stack: (error as Error)?.stack,
      name: (error as Error)?.name,
    });
    logger.logError(error as Error, { statusCode: 500 });
    return createSecureResponse(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}





