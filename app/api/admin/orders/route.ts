import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse } from "../../../../lib/admin-auth";
import { formatDateIST, getStartOfDayIST, getEndOfDayIST } from "../../../../lib/timezone";

// Helper function to format timestamps for display while preserving original for sorting
function formatTimestampsForDisplay(order: any) {
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    createdAtIST: formatDateIST(order.createdAt, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata'
    })
  };
}

// Price is now stored in order.amount (in paise)

// GET /api/admin/orders - Fetch orders with filters
export async function GET(req: NextRequest) {
  try {
    // Admin authentication check
    if (!(await verifyAdminAuthWithPermission(req, ['view_orders', 'view_order_log']))) {
      return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const area = searchParams.get("area");
    const pincode = searchParams.get("pincode");
    const paymentStatus = searchParams.get("paymentStatus");
    const deliveryStatus = searchParams.get("deliveryStatus");
    const search = searchParams.get("search");
    const serviceRouteId = searchParams.get("serviceRouteId");
    const deliveredDate = searchParams.get("deliveredDate");
    const reason = searchParams.get("reason");

    // Pagination params
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;

    // Build query with filters
    let whereConditions = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // Search filter - filter by order ID, customer ID, or customer name (partial match)
    if (search) {
      whereConditions.push(`(
        o."id" ILIKE '%' || $${paramIndex} || '%' 
        OR o."orderNumber" ILIKE '%' || $${paramIndex} || '%'
        OR o."customerId" ILIKE '%' || $${paramIndex} || '%'
        OR c."name" ILIKE '%' || $${paramIndex} || '%'
        OR c."phone" ILIKE '%' || $${paramIndex} || '%'
      )`);
      queryParams.push(search);
      paramIndex += 1;
    }

    // Base filter: Show all orders
    if (date) {
      const startOfDay = getStartOfDayIST(new Date(date));
      const endOfDay = getEndOfDayIST(new Date(date));

      whereConditions.push(
        `o."createdAt" >= $${paramIndex} AND o."createdAt" <= $${paramIndex + 1}`
      );
      queryParams.push(startOfDay, endOfDay);
      paramIndex += 2;
    }

    const deliveryDate = searchParams.get("deliveryDate");
    if (deliveryDate) {
      const startOfDay = getStartOfDayIST(new Date(deliveryDate));
      const endOfDay = getEndOfDayIST(new Date(deliveryDate));

      whereConditions.push(
        `o."deliveryDate" >= $${paramIndex} AND o."deliveryDate" <= $${paramIndex + 1}`
      );
      queryParams.push(startOfDay, endOfDay);
      paramIndex += 2;
    }

    if (deliveredDate) {
      const startOfDay = getStartOfDayIST(new Date(deliveredDate));
      const endOfDay = getEndOfDayIST(new Date(deliveredDate));

      whereConditions.push(
        `o."status" = 'DELIVERED' AND o."updatedAt" >= $${paramIndex} AND o."updatedAt" <= $${paramIndex + 1}`
      );
      queryParams.push(startOfDay, endOfDay);
      paramIndex += 2;
    }

    // Area filter (case-insensitive, matches by related address)
    if (area) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM "Address" a
        WHERE a."id" = o."addressId"
        AND LOWER(a."area") = LOWER($${paramIndex})
      )`);
      queryParams.push(area);
      paramIndex += 1;
    }

    // Pincode filter (exact match)
    if (pincode) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM "Address" a
        WHERE a."id" = o."addressId"
        AND a."pincode" = $${paramIndex}
      )`);
      queryParams.push(pincode);
      paramIndex += 1;
    }

    // Payment status filter
    if (paymentStatus && paymentStatus !== "ALL") {
      if (paymentStatus === "PAID") {
        whereConditions.push(`o."paymentStatus" = 'SUCCESS'`);
      } else if (paymentStatus === "PENDING") {
        // Pending includes COD (which is pending collection), Online Pending, and Failed
        whereConditions.push(`o."paymentStatus" IN ('COD', 'PENDING', 'FAILED')`);
      } else {
        // Fallback for direct status matches if needed
        whereConditions.push(`o."paymentStatus" = $${paramIndex}`);
        queryParams.push(paymentStatus);
        paramIndex += 1;
      }
    }

    // Delivery status filter
    if (deliveryStatus && deliveryStatus !== "ALL") {
      if (deliveryStatus === "ORDER_RECEIVED") {
        // PENDING Status + Valid Payment + NOT Assigned
        whereConditions.push(`o."status" IN ('PENDING', 'CONFIRMED')`);
        whereConditions.push(`(o."paymentStatus" = 'SUCCESS' OR o."paymentMethod" = 'COD')`);
        whereConditions.push(`NOT EXISTS (
          SELECT 1 FROM "RouteOrder" ro 
          WHERE ro."orderId" = o."id"
          AND ro."deliveryStatus" != 'NOT_DELIVERED'
        )`);
      } else if (deliveryStatus === "CONFIRMED") {
        // Assigned + No Route Token Generated (The "Confirmed" intermediate state)
        whereConditions.push(`EXISTS (
          SELECT 1 FROM "RouteOrder" ro 
          WHERE ro."orderId" = o."id"
          AND ro."deliveryStatus" != 'NOT_DELIVERED'
        )`);
        whereConditions.push(`NOT EXISTS (
          SELECT 1 FROM "RouteOrder" ro
          INNER JOIN "Route" r ON ro."routeId" = r."id"
          WHERE ro."orderId" = o."id" AND r."token" IS NOT NULL
        )`);
        whereConditions.push(`o."status" NOT IN ('DELIVERED', 'NOT_DELIVERED', 'CANCELLED')`);
      } else if (deliveryStatus === "DELIVERY_IN_PROGRESS") {
        // Route Token Generated OR Status is explicitly OUT_FOR_DELIVERY
        // We must also exclude completed/failed statuses
        whereConditions.push(`(
          EXISTS (
            SELECT 1 FROM "RouteOrder" ro
            INNER JOIN "Route" r ON ro."routeId" = r."id"
            WHERE ro."orderId" = o."id" AND r."token" IS NOT NULL
          ) OR o."status" IN ('OUT_FOR_DELIVERY')
        )`);
        whereConditions.push(`o."status" NOT IN ('DELIVERED', 'NOT_DELIVERED', 'CANCELLED')`);
      } else if (deliveryStatus === "PENDING_ASSIGNMENT") {
        // Legacy support if needed, otherwise same as ORDER_RECEIVED basically
        whereConditions.push(`o."status" IN ('PENDING', 'CONFIRMED')`);
        whereConditions.push(`NOT EXISTS (
          SELECT 1 FROM "RouteOrder" ro 
          WHERE ro."orderId" = o."id"
          AND ro."deliveryStatus" != 'NOT_DELIVERED'
        )`);
      } else {
        // Direct status match for DELIVERED, NOT_DELIVERED, CANCELLED
        whereConditions.push(`o."status" = $${paramIndex}`);
        queryParams.push(deliveryStatus);
        paramIndex += 1;
      }
    }

    const deliveryBoyId = searchParams.get("deliveryBoyId");
    if (deliveryBoyId && deliveryBoyId !== "ALL") {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM "RouteOrder" ro
        INNER JOIN "Route" r ON ro."routeId" = r."id"
        WHERE ro."orderId" = o."id" AND r."deliveryBoyId" = $${paramIndex}
      )`);
      queryParams.push(deliveryBoyId);
      paramIndex += 1;
    }

    let routeIdParamIndex = -1;
    const routeId = searchParams.get("routeId");
    if (routeId) {
      routeIdParamIndex = paramIndex;
      whereConditions.push(`EXISTS (
        SELECT 1 FROM "RouteOrder" ro
        WHERE ro."orderId" = o."id"
        AND ro."routeId" = $${paramIndex}
      )`);
      // Exclude Online Pending orders (unpaid) and CANCELLED orders to match other route views
      whereConditions.push(`NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')`);
      whereConditions.push(`o."status" != 'CANCELLED'`);
      queryParams.push(routeId);
      paramIndex += 1;
    }

    if (serviceRouteId) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM "Address" a
        INNER JOIN "ServiceArea" sa ON a."pincode" = sa."pincode"
        WHERE a."id" = o."addressId"
        AND sa."serviceRouteId" = $${paramIndex}
      )`);
      // Only show unassigned, non-cancelled orders when filtering by serviceRouteId
      whereConditions.push(`NOT EXISTS (
        SELECT 1 FROM "RouteOrder" ro 
        WHERE ro."orderId" = o."id" 
        AND ro."deliveryStatus" != 'NOT_DELIVERED'
      )`);
      whereConditions.push(`o."status" NOT IN ('CANCELLED', 'DELIVERED', 'NOT_DELIVERED')`);
      queryParams.push(serviceRouteId);
      paramIndex += 1;
    }
    
    if (reason && reason !== "ALL") {
        whereConditions.push(`o."status" = 'NOT_DELIVERED'`);
        whereConditions.push(`EXISTS (
            SELECT 1 FROM "RouteOrder" ro_filter
            WHERE ro_filter."orderId" = o."id"
            AND ro_filter."deliveryStatus" = 'NOT_DELIVERED'
            AND ro_filter."notDeliveredReason" = $${paramIndex}
        )`);
        queryParams.push(reason);
        paramIndex += 1;
    }

    const whereClause =
      whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // Get total count for pagination
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(o."id") as "count"
       FROM "Order" o
       INNER JOIN "Customer" c ON o."customerId" = c."id"
       LEFT JOIN "Address" a ON a."id" = o."addressId"
       ${whereClause}`,
      queryParams
    );
    const totalOrders = parseInt(countRes.rows[0]?.count || '0');
    const totalPages = Math.ceil(totalOrders / limit);

    const ordersRes = await query<{
      id: string;
      orderNumber: string | null;
      quantity: number;
      originalQuantity: number | null;
      additionalQuantity: number | null;
      amount: number | null; // Amount in paise, may be null for old orders
      deliveryDate: Date;
      deliverySlot: string;
      status: string;
      paymentStatus: string;
      paymentMethod: string;
      paymentInstrument: string | null;
      createdAt: Date;
      customerName: string | null;
      customerPhone: string;
      productName: string | null;
      addressLine1: string | null;
      addressArea: string | null;
      addressCity: string | null;
      addressPincode: string | null;
      isAssigned: boolean;
      isRouteGenerated: boolean;
      itemsJson: any[] | null;
      deliveryBoyName: string | null;
      routeName: string | null;
      sequence: number;
      dailyPosition: number;
      dailyTotal: number;
      latitude: number | null;
      longitude: number | null;
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
        o."deliveryDate",
        o."deliverySlot",
        o."status",
        o."paymentStatus",
        o."paymentMethod",
        o."paymentInstrument",
        o."isQrPayment",
        o."createdAt",
        o."updatedAt" as "deliveredAt",
        c."name" as "customerName",
        c."phone" as "customerPhone",
        a."line1" as "addressLine1",
        a."line2" as "addressLine2",
        a."area" as "addressArea",
        a."city" as "addressCity",
        a."pincode" as "addressPincode",
        a."landmark" as "addressLandmark",
        a."contactName" as "addressContactName",
        a."contactPhone" as "addressContactPhone",
        a."nickname" as "addressNickname",
        a."latitude",
        a."longitude",
        (EXISTS (SELECT 1 FROM "RouteOrder" ro WHERE ro."orderId" = o."id" AND ro."deliveryStatus" != 'NOT_DELIVERED')) as "isAssigned",
        (EXISTS (
           SELECT 1 
           FROM "RouteOrder" ro 
           JOIN "Route" r ON ro."routeId" = r."id"
           WHERE ro."orderId" = o."id" 
           AND ro."deliveryStatus" != 'NOT_DELIVERED'
           AND r."token" IS NOT NULL
        )) as "isRouteGenerated",
        (
          EXISTS (SELECT 1 FROM "RouteOrder" ro_check WHERE ro_check."orderId" = o."id" AND ro_check."deliveryStatus" = 'NOT_DELIVERED')
          OR ((o."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date > (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date)
        ) as "isReassignedHistory",
        (
          SELECT ro_reason."notDeliveredReason"
          FROM "RouteOrder" ro_reason
          WHERE ro_reason."orderId" = o."id"
          AND ro_reason."deliveryStatus" = 'NOT_DELIVERED'
          ORDER BY ro_reason."updatedAt" DESC
          LIMIT 1
        ) as "notDeliveredReason",
        COALESCE(
          (SELECT json_agg(json_build_object(
            'productName', p_i."name",
            'quantity', oi_i."quantity",
            'price', oi_i."price"
          ))
          FROM "OrderItem" oi_i
          JOIN "Product" p_i ON oi_i."productId" = p_i."id"
          WHERE oi_i."orderId" = o."id"
          ),
          '[]'::json
        ) as "itemsJson",
        assign."deliveryBoyName",
        assign."routeName",
        ro_seq."sequence",
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
        RANK() OVER (PARTITION BY o."customerId", (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date ORDER BY o."createdAt" ASC) as "dailyPosition",
        COUNT(*) OVER (PARTITION BY o."customerId", (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date) as "dailyTotal"
      FROM "Order" o
      INNER JOIN "Customer" c ON o."customerId" = c."id"
      LEFT JOIN "Address" a ON a."id" = o."addressId"
      LEFT JOIN "Product" p ON p."id" = o."productId"
      LEFT JOIN LATERAL (
          SELECT 
            db."name" as "deliveryBoyName",
            sr."name" as "routeName"
          FROM "RouteOrder" ro_assign
          JOIN "Route" r_assign ON ro_assign."routeId" = r_assign."id"
          JOIN "DeliveryBoy" db ON r_assign."deliveryBoyId" = db."id"
          JOIN "ServiceRoute" sr ON r_assign."serviceRouteId" = sr."id"
          WHERE ro_assign."orderId" = o."id"
          AND ro_assign."deliveryStatus" != 'NOT_DELIVERED'
          ORDER BY ro_assign."updatedAt" DESC
          LIMIT 1
      ) assign ON true
      LEFT JOIN LATERAL (
          SELECT COALESCE(ro_seq_inner."sequence", 0) as "sequence"
          FROM "RouteOrder" ro_seq_inner
          WHERE ro_seq_inner."orderId" = o."id"
          ${routeId ? `AND ro_seq_inner."routeId" = $${routeIdParamIndex}` : 'AND ro_seq_inner."deliveryStatus" != \'NOT_DELIVERED\''}
          ORDER BY ro_seq_inner."updatedAt" DESC
          LIMIT 1
      ) ro_seq ON true
      -- LEFT JOIN "RouteOrder" removed to avoid duplicates
      ${whereClause}
      ORDER BY 
        ${routeId ? 'ro_seq."sequence" ASC, a."pincode" ASC,' : ''}
        CASE WHEN o."orderNumber" IS NOT NULL THEN o."orderNumber"::bigint ELSE 0 END DESC,
        o."createdAt" DESC, 
        o."id" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...queryParams, limit, offset]
    );

    // Debug: Log raw database response with sorting verification
    // Debug: Log raw database response with sorting verification

    const orders = ordersRes.rows.map((order) => {
      // Use stored amount (all new orders have amount stored)
      // For old orders without amount, return 0
      const amountInRupees = order.amount ? order.amount / 100 : 0;

      const createdAtISO = order.createdAt.toISOString();
      const createdAtIST = formatDateIST(order.createdAt, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      });

      const deliveredAtIST = order.status === 'DELIVERED' && order.deliveredAt ? formatDateIST(order.deliveredAt, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      }) : null;

      return {
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
        paymentInstrument: order.paymentInstrument,
        isQrPayment: order.isQrPayment,
        createdAt: createdAtISO,
        createdAtIST: createdAtIST,
        deliveredAt: order.status === 'DELIVERED' && order.deliveredAt ? order.deliveredAt.toISOString() : null,
        deliveredAtIST: deliveredAtIST,
        amount: amountInRupees,
        customer: {
          name: order.customerName || "Unknown",
          phone: order.customerPhone,
        },
        productName: order.productName || "Water Can",
        address: {
          line1: order.addressLine1 || null,
          line2: order.addressLine2 || null,
          area: order.addressArea || null,
          city: order.addressCity || null,
          pincode: order.addressPincode || null,
          landmark: order.addressLandmark || null,
          contactName: order.addressContactName || null,
          contactPhone: order.addressContactPhone || null,
          nickname: order.addressNickname || null,
          latitude: order.latitude ? Number(order.latitude) : null,
          longitude: order.longitude ? Number(order.longitude) : null,
        },
        isAssigned: order.isAssigned,
        isRouteGenerated: order.isRouteGenerated,
        isReassigned: order.isReassignedHistory &&
          !['NOT_DELIVERED', 'CANCELLED'].includes(order.status),
        items: order.itemsJson || [],
        deliveryBoyName: order.deliveryBoyName,
        routeName: order.routeName,
        sequence: order.sequence,
        dailyPosition: parseInt(String(order.dailyPosition || '0')),
        dailyTotal: parseInt(String(order.dailyTotal || '0')),
        notDeliveredReason: order.notDeliveredReason
      };
    });

    // Debug: Log formatted orders with UTC vs IST comparison
    // Debug: Log formatted orders with UTC vs IST comparison

    // Get unique areas for filter dropdown (case-insensitive grouping)
    // Group by lowercase area but return the first occurrence's original case
    const areasRes = await query<{ area: string }>(
      `SELECT DISTINCT ON (LOWER(a."area")) a."area"
       FROM "Address" a
       ORDER BY LOWER(a."area") ASC`
    );
    const areas = areasRes.rows.map((row) => row.area);

    // Get unique pincodes for filter/datalist
    const pincodesRes = await query<{ pincode: string | null }>(
      `SELECT DISTINCT a."pincode" FROM "Address" a WHERE a."pincode" IS NOT NULL ORDER BY a."pincode" ASC`
    );
    const pincodes = pincodesRes.rows
      .map((row) => row.pincode)
      .filter((pc): pc is string => !!pc);

    // Get unique reasons for filter dropdown
    const reasonsRes = await query<{ reason: string }>(
      `SELECT "reason" FROM "NotDeliveredReason" WHERE "isActive" = true ORDER BY "reason" ASC`
    );
    const reasons = reasonsRes.rows.map(r => r.reason);

    return NextResponse.json({
      success: true,
      orders,
      areas,
      pincodes,
      reasons,
      pagination: {
        page,
        limit,
        total: totalOrders,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/admin/orders:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
