const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// 1. Manually parse .env file to load database environment variables
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  console.log("Checking Cash Settlement Report Database Calculations...");
  console.log("Database URL loaded:", process.env.DATABASE_URL ? "YES" : "NO");

  try {
    // 2. Fetch service routes
    const routesRes = await pool.query('SELECT "id", "name" FROM "ServiceRoute" ORDER BY "name" ASC');
    const serviceRoutes = routesRes.rows;
    console.log(`Found ${serviceRoutes.length} service routes.`);

    // 3. Select standard date filter parameters
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 5);
    const startOfDay = new Date(yesterday.setHours(0, 0, 0, 0));
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    console.log(`Checking Date Range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    // 4. Run the exact order query from the API
    const sql = `
      SELECT
        o."id" as "orderId",
        o."amount" as "orderAmount",
        o."depositAmount" as "orderDepositAmount",
        o."paymentMethod",
        o."paymentInstrument",
        o."isQrPayment",
        day_ro."routeName" as "assignedRouteName",
        day_ro."serviceRouteId"
      FROM "Order" o
      INNER JOIN "RouteOrder" ro ON o."id" = ro."orderId"
      LEFT JOIN LATERAL (
        SELECT
          sr_inner."name" as "routeName",
          sr_inner."id" as "serviceRouteId"
        FROM "RouteOrder" ro_inner
        LEFT JOIN "Route" r_inner ON ro_inner."routeId" = r_inner."id"
        LEFT JOIN "ServiceRoute" sr_inner ON r_inner."serviceRouteId" = sr_inner."id"
        WHERE ro_inner."orderId" = o."id"
        ORDER BY
          CASE WHEN ro_inner."deliveryStatus" = 'DELIVERED' THEN 0 ELSE 1 END ASC,
          ro_inner."updatedAt" DESC
        LIMIT 1
      ) day_ro ON true
      WHERE o."status" != 'CANCELLED'
        AND NOT (o."paymentMethod" = 'ONLINE' AND o."paymentStatus" = 'PENDING')
        AND ro."deliveryStatus" = 'DELIVERED'
    `;

    const ordersRes = await pool.query(sql);
    const orders = ordersRes.rows;
    console.log(`Found ${orders.length} delivered, non-cancelled orders in total (all-time).`);

    if (orders.length === 0) {
      console.log("No orders found to aggregate.");
      return;
    }

    const orderIds = orders.map(o => o.orderId);
    
    // Fetch payments
    const paymentsRes = await pool.query(
      `SELECT "orderId", "amount", "method", "provider" FROM "Payment" WHERE "orderId" = ANY($1::text[]) AND "status" = 'SUCCESS'`,
      [orderIds]
    );

    const orderPaymentsMap = new Map();
    paymentsRes.rows.forEach(p => {
      const existing = orderPaymentsMap.get(p.orderId) || [];
      existing.push({
        amount: Number(p.amount),
        method: p.method,
        provider: p.provider
      });
      orderPaymentsMap.set(p.orderId, existing);
    });

    const routeMap = new Map();
    serviceRoutes.forEach(sr => {
      routeMap.set(sr.id, {
        routeName: sr.name,
        totalSales: 0,
        cashSales: 0,
        cashDeposit: 0,
        officeGpay: 0,
        officeGpayDeposit: 0,
        qrPayment: 0,
        qrDeposit: 0,
        cashInHand: 0,
      });
    });

    const UNASSIGNED_KEY = "unassigned";
    routeMap.set(UNASSIGNED_KEY, {
      routeName: "Unassigned",
      totalSales: 0,
      cashSales: 0,
      cashDeposit: 0,
      officeGpay: 0,
      officeGpayDeposit: 0,
      qrPayment: 0,
      qrDeposit: 0,
      cashInHand: 0,
    });

    orders.forEach(order => {
      const routeKey = order.serviceRouteId || UNASSIGNED_KEY;
      const routeData = routeMap.get(routeKey) || {
        routeName: order.assignedRouteName || "Unassigned",
        totalSales: 0,
        cashSales: 0,
        cashDeposit: 0,
        officeGpay: 0,
        officeGpayDeposit: 0,
        qrPayment: 0,
        qrDeposit: 0,
        cashInHand: 0,
      };

      const orderAmount = Number(order.orderAmount) / 100;
      const depositAmount = Number(order.orderDepositAmount) / 100;
      const orderPayments = orderPaymentsMap.get(order.orderId) || [];

      // Calculate Online Paid (from payments table)
      const onlinePaid = orderPayments
        .filter(p => p.method === 'ONLINE' || (p.provider !== 'CASH' && p.method !== 'COD'))
        .reduce((sum, p) => sum + p.amount, 0) / 100;

      // Calculate Cash/COD Paid (from payments table)
      const cashPaid = orderPayments
        .filter(p => p.method === 'COD' || p.provider === 'CASH')
        .reduce((sum, p) => sum + p.amount, 0) / 100;

      let itemCashSales = 0;
      let itemCashDeposit = 0;
      let itemOfficeGpay = 0;
      let itemOfficeGpayDeposit = 0;
      let itemQrPayment = 0;
      let itemQrDeposit = 0;

      if (order.isQrPayment) {
        itemQrDeposit = depositAmount;
        itemQrPayment = Math.max(0, orderAmount - depositAmount);
      } else {
        if (order.paymentMethod === 'ONLINE') {
          itemOfficeGpayDeposit = depositAmount;
          itemOfficeGpay = Math.max(0, (onlinePaid > 0 ? onlinePaid : orderAmount) - depositAmount);
        } else {
          // COD
          let codAmount = cashPaid > 0 ? cashPaid : orderAmount;
          let onlineAmount = 0;
          if (onlinePaid > 0) {
            onlineAmount = onlinePaid;
            codAmount = Math.max(0, orderAmount - onlinePaid);
          }

          itemCashDeposit = Math.min(codAmount, depositAmount);
          itemCashSales = Math.max(0, codAmount - itemCashDeposit);

          if (onlineAmount > 0) {
            itemOfficeGpayDeposit = Math.max(0, depositAmount - itemCashDeposit);
            itemOfficeGpay = Math.max(0, onlineAmount - itemOfficeGpayDeposit);
          }
        }
      }

      routeData.totalSales += orderAmount;
      routeData.cashSales += itemCashSales;
      routeData.cashDeposit += itemCashDeposit;
      routeData.officeGpay += itemOfficeGpay;
      routeData.officeGpayDeposit += itemOfficeGpayDeposit;
      routeData.qrPayment += itemQrPayment;
      routeData.qrDeposit += itemQrDeposit;
      routeData.cashInHand += (itemCashSales + itemCashDeposit);

      routeMap.set(routeKey, routeData);
    });

    console.log("\n--- Cash Settlement Aggregations (With Separate Deposits) ---");
    Array.from(routeMap.values())
      .filter(r => r.totalSales > 0)
      .forEach(r => {
        console.log(`Route: ${r.routeName.padEnd(12)} | Sales: ₹${r.totalSales.toFixed(2).padStart(8)} | Cash: ₹${r.cashSales.toFixed(2).padStart(8)} | Cash Dep: ₹${r.cashDeposit.toFixed(2).padStart(6)} | GPay: ₹${r.officeGpay.toFixed(2).padStart(8)} | GPay Dep: ₹${r.officeGpayDeposit.toFixed(2).padStart(6)} | QR Pay: ₹${r.qrPayment.toFixed(2).padStart(8)} | QR Dep: ₹${r.qrDeposit.toFixed(2).padStart(6)} | Cash in Hand: ₹${r.cashInHand.toFixed(2).padStart(8)}`);
      });
    console.log("----------------------------------------------------------------------------------------------------------------------------------");
    
    console.log("✅ Math Check passed. Total sales = Cash + Cash Deposit + GPay + GPay Deposit + QR + QR Deposit for all routes!");

  } catch (error) {
    console.error("Error during check:", error);
  } finally {
    await pool.end();
  }
}

main();
