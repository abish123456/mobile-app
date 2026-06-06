/*
  Warnings:

  - You are about to drop the column `currentLat` on the `DeliveryBoy` table. All the data in the column will be lost.
  - You are about to drop the column `currentLng` on the `DeliveryBoy` table. All the data in the column will be lost.
  - You are about to drop the column `locationUpdatedAt` on the `DeliveryBoy` table. All the data in the column will be lost.
  - You are about to drop the column `zoneId` on the `Route` table. All the data in the column will be lost.
  - You are about to drop the column `assignmentStatus` on the `RouteOrder` table. All the data in the column will be lost.
  - You are about to drop the column `offeredAt` on the `RouteOrder` table. All the data in the column will be lost.
  - You are about to drop the column `respondedAt` on the `RouteOrder` table. All the data in the column will be lost.
  - You are about to drop the `Zone` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ZoneDeliveryBoy` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Route" DROP CONSTRAINT "Route_zoneId_fkey";

-- DropForeignKey
ALTER TABLE "ZoneDeliveryBoy" DROP CONSTRAINT "ZoneDeliveryBoy_deliveryBoyId_fkey";

-- DropForeignKey
ALTER TABLE "ZoneDeliveryBoy" DROP CONSTRAINT "ZoneDeliveryBoy_zoneId_fkey";

-- DropIndex
DROP INDEX "RouteOrder_assignmentStatus_idx";

-- AlterTable
ALTER TABLE "DeliveryBoy" DROP COLUMN "currentLat",
DROP COLUMN "currentLng",
DROP COLUMN "locationUpdatedAt";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "additionalQuantity" INTEGER,
ADD COLUMN     "originalQuantity" INTEGER;

-- AlterTable
ALTER TABLE "Route" DROP COLUMN "zoneId";

-- AlterTable
ALTER TABLE "RouteOrder" DROP COLUMN "assignmentStatus",
DROP COLUMN "offeredAt",
DROP COLUMN "respondedAt",
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "Zone";

-- DropTable
DROP TABLE "ZoneDeliveryBoy";
