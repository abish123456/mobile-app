import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../lib/db';
import { verifyAdminAuthWithPermission, getAdminPermissionErrorResponse } from '../../../../lib/admin-auth';

// GET /api/admin/order-wallet
// Query params: page, limit, customerId, fromDate, toDate, type (CREDIT|DEBIT), export (csv)
export async function GET(req: NextRequest) {
  if (!(await verifyAdminAuthWithPermission(req, 'view_reports'))) {
    return NextResponse.json(getAdminPermissionErrorResponse(), { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page       = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit      = Math.min(200, parseInt(searchParams.get('limit') || '50'));
  const offset     = (page - 1) * limit;
  const customerId = searchParams.get('customerId') || null;
  const fromDate   = searchParams.get('fromDate') || null;
  const toDate     = searchParams.get('toDate') || null;
  const typeFilter = searchParams.get('type') || null; // CREDIT | DEBIT
  const isExport   = searchParams.get('export') === 'csv';

  try {
    // ── Wallet Transactions ────────────────────────────────────────────────
    const conditions: string[] = [`wt."walletType" = 'ORDER'`];
    const params: any[]        = [];
    let pIdx = 1;

    if (customerId) { conditions.push(`wt."customerId" = $${pIdx++}`); params.push(customerId); }
    if (fromDate)   { conditions.push(`wt."createdAt" >= $${pIdx++}`); params.push(new Date(fromDate)); }
    if (toDate)     { conditions.push(`wt."createdAt" <= $${pIdx++}`); params.push(new Date(toDate + 'T23:59:59Z')); }
    if (typeFilter) { conditions.push(`wt."type" = $${pIdx++}`);       params.push(typeFilter); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query<{ total: string }>(
      `SELECT COUNT(*) as total FROM "WalletTransaction" wt ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0');

    const txParams = isExport ? [...params] : [...params, limit, offset];
    const paginationClause = isExport ? '' : `LIMIT $${pIdx++} OFFSET $${pIdx++}`;

    const txRes = await query<{
      id: string;
      customerId: string;
      customerName: string | null;
      customerPhone: string | null;
      amount: number;
      type: string;
      referenceType: string | null;
      referenceId: string | null;
      description: string | null;
      createdAt: Date;
      orderNumber: string | null;
    }>(
      `SELECT
        wt."id",
        wt."customerId",
        c."name" as "customerName",
        c."phone" as "customerPhone",
        wt."amount",
        wt."type",
        wt."referenceType",
        wt."referenceId",
        wt."description",
        wt."createdAt",
        o."orderNumber"
       FROM "WalletTransaction" wt
       JOIN "Customer" c ON wt."customerId" = c."id"
       LEFT JOIN "Order" o ON wt."referenceId" = o."id"
       ${where}
       ORDER BY wt."createdAt" DESC
       ${paginationClause}`,
      txParams
    );

    // ── Summary stats ──────────────────────────────────────────────────────
    const summaryRes = await query<{
      totalCredits: string;
      totalDebits: string;
      txCount: string;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN wt."type" = 'CREDIT' THEN wt."amount" ELSE 0 END), 0) as "totalCredits",
        COALESCE(SUM(CASE WHEN wt."type" = 'DEBIT'  THEN wt."amount" ELSE 0 END), 0) as "totalDebits",
        COUNT(*) as "txCount"
       FROM "WalletTransaction" wt
       ${where}`,
      params
    );
    const summary = summaryRes.rows[0];

    // ── CSV Export ─────────────────────────────────────────────────────────
    if (isExport) {
      const rows = txRes.rows;
      const csvLines = [
        'ID,Date,Customer ID,Customer Name,Phone,Type,Amount (₹),Reference Type,Order #,Description',
        ...rows.map(r => [
          r.id,
          new Date(r.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          r.customerId,
          `"${(r.customerName || '').replace(/"/g, '""')}"`,
          r.customerPhone || '',
          r.type,
          r.amount.toFixed(2),
          r.referenceType || '',
          r.orderNumber || r.referenceId || '',
          `"${(r.description || '').replace(/"/g, '""')}"`,
        ].join(','))
      ].join('\n');

      return new Response(csvLines, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="order-wallet-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // ── Per-customer balances (top 20 by balance) ──────────────────────────
    const balancesRes = await query<{
      id: string;
      name: string | null;
      phone: string | null;
      orderWalletBalance: number;
    }>(
      `SELECT "id", "name", "phone", "orderWalletBalance"
       FROM "Customer"
       WHERE "orderWalletBalance" > 0
       ORDER BY "orderWalletBalance" DESC
       LIMIT 20`
    );

    return NextResponse.json({
      success: true,
      transactions: txRes.rows.map(r => ({
        id: r.id,
        customerId: r.customerId,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        amount: r.amount,
        type: r.type,
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        orderNumber: r.orderNumber || r.referenceId,
        description: r.description,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        totalCredits: parseFloat(summary.totalCredits),
        totalDebits: parseFloat(summary.totalDebits),
        net: parseFloat(summary.totalCredits) - parseFloat(summary.totalDebits),
        txCount: parseInt(summary.txCount),
      },
      topBalances: balancesRes.rows.map(r => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        balance: r.orderWalletBalance,
      })),
    });
  } catch (error) {
    console.error('Error in GET /api/admin/order-wallet:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
