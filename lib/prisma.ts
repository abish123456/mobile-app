import { PrismaClient } from "@prisma/client";

// Ensure we don't create multiple PrismaClient instances in dev/hot-reload
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  // For Prisma 7, the connection URL is configured via prisma.config.ts / .env,
  // so we can instantiate the client without extra options here.
  new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}


