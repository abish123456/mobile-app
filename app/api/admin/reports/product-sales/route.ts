import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../../lib/db';
import { verifyAdminAuth } from '../../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminAuth(req);
    if (!admin) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const routeId = searchParams.get('routeId');

    let dateFilterStr = '';
    const params: any[] = [];

    if (startDateParam && endDateParam) {
      const endDate = new Date(endDateParam);
      endDate.setHours(23, 59, 59, 999);

      dateFilterStr = `AND o."deliveryDate" >= $1 AND o."deliveryDate" <= $2`;
      params.push(new Date(startDateParam), endDate);
    }

    let routeJoinStr = "";
    let routeFilterStr = "";
    if (routeId && routeId !== 'ALL') {
      routeJoinStr = `
        JOIN "RouteOrder" ro ON ro."orderId" = o.id
        JOIN "Route" r ON r.id = ro."routeId"
      `;
      routeFilterStr = `AND r."serviceRouteId" = $${params.length + 1}`;
      params.push(routeId);
    }

    const productsRes = await query(`SELECT id, name FROM "Product" WHERE active = true ORDER BY name ASC`, []);
    const products = productsRes.rows;

    const dataQuery = `
      SELECT 
        p.id AS "productId",
        SUM(oi.quantity) AS "taken",
        SUM(CASE 
              WHEN o.status = 'DELIVERED' THEN oi.quantity
              ELSE 0 
            END) AS "sales",
        SUM(CASE 
              WHEN o.status IN ('NOT_DELIVERED', 'CANCELLED') THEN oi.quantity
              ELSE 0 
            END) AS "unsoldReturn",
        SUM(CASE 
              WHEN o.status = 'DELIVERED' THEN COALESCE(oi."actualReturnQuantity", oi."returnQuantity", 0)
              ELSE 0 
            END) AS "emptyReturn"
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      JOIN "Product" p ON oi."productId" = p.id
      ${routeJoinStr}
      WHERE 1=1 ${dateFilterStr} ${routeFilterStr}
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

      return {
        productId: product.id,
        productName: product.name,
        taken: agg ? Number(agg.taken) : 0,
        sales: sales,
        unsoldReturn: agg ? Number(agg.unsoldReturn) : 0,
        emptyReturn: is20Ltr ? emptyReturn : null,
        newIssued: is20Ltr ? (sales - emptyReturn) : null,
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
