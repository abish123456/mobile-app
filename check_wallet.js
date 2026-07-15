const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  console.log('ORDERS:', orders.map(o => ({ id: o.id, amount: o.amount })));
  
  const tx = await prisma.walletTransaction.findMany({ orderBy: { createdAt: 'desc' }, take: 15 });
  console.log('TXS:', tx);
}
main().finally(() => prisma.$disconnect());
