import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../../lib/db';
import { verifyAdminAuthWithPermission } from '../../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_deposit_reports');
    if (!isAuthorized) {
      return NextResponse.json({ success: false, message: 'Unauthorized: Missing view_deposit_reports permission' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get('tab') || 'snapshot';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    if (tab === 'history') {
      let dateFilterStr = '';
      const params: any[] = [];
      let paramCount = 1;

      if (startDateParam && endDateParam) {
        const endDate = new Date(endDateParam);
        endDate.setHours(23, 59, 59, 999);
        
        dateFilterStr = `AND wt."createdAt" >= $${paramCount} AND wt."createdAt" <= $${paramCount + 1}`;
        params.push(new Date(startDateParam), endDate);
      }

      const transactionsQuery = `
        SELECT 
          wt."id" AS "transactionId",
          c."id" AS "customerId",
          c."name",
          c."phone",
          wt."amount" AS "amount",
          wt."createdAt" AS "createdAt",
          wt."description" AS "description",
          wt."referenceId" AS "referenceId",
          wt."referenceType" AS "referenceType",
          o."orderNumber",
          o."paymentMethod",
          o."paymentInstrument",
          o."isQrPayment"
        FROM "WalletTransaction" wt
        JOIN "Customer" c ON wt."customerId" = c."id"
        LEFT JOIN "Order" o ON wt."referenceId" = o."id"
        WHERE wt."type" = 'CREDIT'
        AND wt."description" NOT ILIKE 'Manual adjustment%'
        ${dateFilterStr}
        ORDER BY wt."createdAt" DESC
      `;

      const transactionsRes = await query(transactionsQuery, params);
      const history = transactionsRes.rows;

      const summary = {
        totalDepositsCollected: history.reduce((sum, t) => sum + Number(t.amount || 0), 0),
        totalTransactions: history.length
      };

      return NextResponse.json({
        success: true,
        summary,
        history
      });
    } else {
      const result = await query(`
        SELECT "id", "name", "phone", "active", "cansInHand", "depositWalletBalance"
        FROM "Customer"
        WHERE "cansInHand" > 0 OR "depositWalletBalance" > 0
        ORDER BY "depositWalletBalance" DESC
      `);
      
      const customers = result.rows;

      const summary = customers.reduce((acc, customer) => {
        acc.totalCansInHand += customer.cansInHand || 0;
        acc.totalDepositWalletBalance += Number(customer.depositWalletBalance || 0);
        return acc;
      }, {
        totalCansInHand: 0,
        totalDepositWalletBalance: 0
      });

      return NextResponse.json({
        success: true,
        summary,
        customers
      });
    }
  } catch (error) {
    console.error('Error fetching deposit report:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch deposit report' },
      { status: 500 }
    );
  }
}
