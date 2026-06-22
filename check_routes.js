const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    const routes = await prisma.route.findMany({
        where: {
            date: {
                gte: new Date('2025-12-23T00:00:00Z'),
                lte: new Date('2025-12-24T23:59:59Z'),
            },
        },
        include: {
            deliveryBoy: true,
            routeOrders: true
        }
    });

    console.log('Routes found: ' + routes.length);
    routes.forEach(r => {
        console.log(`ID: ${r.id}, Date: ${r.date.toISOString()}, ServiceRouteId: ${r.serviceRouteId}, Driver: ${r.deliveryBoy.name} (${r.deliveryBoyId}), Orders: ${r.routeOrders.length}`);
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
