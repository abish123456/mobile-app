const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const orders = await prisma.order.findMany({
    where: { paymentMethod: 'ONLINE' },
    select: { id: true, paymentMethod: true, paymentInstrument: true, isQrPayment: true },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  console.log(orders);
}
main().catch(console.error).finally(() => prisma.$disconnect());
