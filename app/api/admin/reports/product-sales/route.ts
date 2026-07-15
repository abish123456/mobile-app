import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../../lib/db';
import { verifyAdminAuthWithPermission } from '../../../../../lib/admin-auth';
import { getStartOfDayIST, getEndOfDayIST } from '../../../../../lib/timezone';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_product_sales_reports');
    if (!isAuthorized) {
      return NextResponse.json({ success: false, message: 'Unauthorized: Missing view_product_sales_reports permission' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const routeId = searchParams.get('routeId');

    let dateFilterStr = '';
    const params: any[] = [];

    if (startDateParam && endDateParam) {
      const startDate = getStartOfDayIST(new Date(startDateParam));
      const endDate = getEndOfDayIST(new Date(endDateParam));

      dateFilterStr = `AND (
        (o."deliveryDate" >= $1 AND o."deliveryDate" <= $2)
        OR EXISTS (
          SELECT 1 FROM "RouteOrder" ro_hist
          JOIN "Route" r_hist ON ro_hist."routeId" = r_hist."id"
          WHERE ro_hist."orderId" = o."id"
          AND r_hist."date" >= $1 AND r_hist."date" <= $2
        )
      )`;
      params.push(startDate, endDate);
    }

    let routeJoinStr = "";
    let routeFilterStr = "";
    if (routeId && routeId !== 'ALL') {
      routeJoinStr = "";
      const routeDateFilter = (startDateParam && endDateParam) 
          ? `AND r."date" >= $1 AND r."date" <= $2` 
          : '';
          
      routeFilterStr = `
        AND EXISTS (
          SELECT 1 FROM "RouteOrder" ro
          JOIN "Route" r ON r.id = ro."routeId"
          WHERE ro."orderId" = o.id AND r."serviceRouteId" = $${params.length + 1}
          ${routeDateFilter}
        )
      `;
      params.push(routeId);
    }

    const productsRes = await query(`SELECT id, name FROM "Product" WHERE active = true ORDER BY name ASC`, []);
    const products = productsRes.rows;

    let lateralJoinStr = `
      LEFT JOIN LATERAL (
        SELECT ro_inner."deliveryStatus"
        FROM "RouteOrder" ro_inner
        JOIN "Route" r_inner ON ro_inner."routeId" = r_inner."id"
        WHERE ro_inner."orderId" = o."id"
        ${(startDateParam && endDateParam) ? `AND r_inner."date" >= $1 AND r_inner."date" <= $2` : ''}
        ORDER BY ro_inner."updatedAt" DESC
        LIMIT 1
      ) ro_sr ON true
    `;

    const dataQuery = `
      SELECT 
        p.id AS "productId",
        SUM(oi.quantity) AS "taken",
        SUM(CASE 
              WHEN COALESCE(ro_sr."deliveryStatus"::text, o.status::text) = 'DELIVERED' THEN oi.quantity
              ELSE 0 
            END) AS "sales",
        SUM(CASE 
              WHEN COALESCE(ro_sr."deliveryStatus"::text, o.status::text) = 'NOT_DELIVERED' THEN oi.quantity
              ELSE 0 
            END) AS "unsoldReturn",
        SUM(CASE 
              WHEN COALESCE(ro_sr."deliveryStatus"::text, o.status::text) = 'DELIVERED' THEN COALESCE(oi."actualReturnQuantity", oi."returnQuantity", 0)
              ELSE 0 
            END) AS "emptyReturn",
        SUM(CASE 
              WHEN COALESCE(ro_sr."deliveryStatus"::text, o.status::text) = 'DELIVERED' THEN (oi.quantity - COALESCE(oi."actualReturnQuantity", oi."returnQuantity", 0))
              ELSE 0 
            END) AS "newIssued"
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      JOIN "Product" p ON oi."productId" = p.id
      ${routeJoinStr}
      ${lateralJoinStr}
      WHERE 1=1 ${dateFilterStr} ${routeFilterStr} AND o."status" != 'CANCELLED'
      GROUP BY p.id
    `;

    const dataRes = await query(dataQuery, params);
    const aggregates = dataRes.rows;

    const finalData = products.map(product => {
      const agg = aggregates.find(a => a.productId === product.id);

      // Determine if product is a 20 LTR Can to show '-' for empty returns on other products
      const is20Ltr = product.name.toLowerCase().includes('20 ltr') || product.name.toLowerCase().includes('20l') || product.name.toLowerCase().includes('20 liter');

      const sales = agg ? Number(agg.sales) : 0;
      const emptyReturn = agg ? Number(agg.emptyReturn) : 0;
      const newIssued = agg ? Number(agg.newIssued) : 0;

      return {
        productId: product.id,
        productName: product.name,
        taken: agg ? Number(agg.taken) : 0,
        sales: sales,
        unsoldReturn: agg ? Number(agg.unsoldReturn) : 0,
        emptyReturn: is20Ltr ? emptyReturn : null,
        newIssued: is20Ltr ? newIssued : null,
      };
    });

    // Filter out products with 0 taken
    const filteredData = finalData.filter(item => item.taken > 0);

    // Sort by highest 'taken' first
    filteredData.sort((a, b) => b.taken - a.taken);

    return NextResponse.json({
      success: true,
      data: filteredData
    });
  } catch (error) {
    console.error('Error fetching product sales report:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch product sales report' },
      { status: 500 }
    );
  }
}
