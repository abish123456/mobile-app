const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const routes = await prisma.route.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      deliveryBoy: true,
      serviceRoute: true
    }
  });
  console.log(JSON.stringify(routes, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
