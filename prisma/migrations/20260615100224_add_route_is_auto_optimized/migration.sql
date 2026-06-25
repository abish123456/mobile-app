-- DropIndex
DROP INDEX IF EXISTS "Route_serviceRouteId_date_idx";

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "isAutoOptimized" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SupportContact" ALTER COLUMN "updatedAt" DROP DEFAULT;
