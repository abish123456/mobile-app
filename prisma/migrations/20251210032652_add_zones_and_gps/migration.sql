/*
  Warnings:

  - You are about to drop the column `lat` on the `Address` table. All the data in the column will be lost.
  - You are about to drop the column `lng` on the `Address` table. All the data in the column will be lost.
  - You are about to drop the column `serviceRadiusKm` on the `DeliveryBoy` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Address" DROP COLUMN "lat",
DROP COLUMN "lng";

-- AlterTable
ALTER TABLE "DeliveryBoy" DROP COLUMN "serviceRadiusKm";

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "zoneId" TEXT;

-- AlterTable
ALTER TABLE "RouteOrder" ADD COLUMN     "assignmentStatus" TEXT,
ADD COLUMN     "offeredAt" TIMESTAMP(3),
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "polygon" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneDeliveryBoy" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "deliveryBoyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoneDeliveryBoy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Zone_active_idx" ON "Zone"("active");

-- CreateIndex
CREATE INDEX "ZoneDeliveryBoy_zoneId_idx" ON "ZoneDeliveryBoy"("zoneId");

-- CreateIndex
CREATE INDEX "ZoneDeliveryBoy_deliveryBoyId_idx" ON "ZoneDeliveryBoy"("deliveryBoyId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoneDeliveryBoy_zoneId_deliveryBoyId_key" ON "ZoneDeliveryBoy"("zoneId", "deliveryBoyId");

-- CreateIndex
CREATE INDEX "RouteOrder_assignmentStatus_idx" ON "RouteOrder"("assignmentStatus");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneDeliveryBoy" ADD CONSTRAINT "ZoneDeliveryBoy_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneDeliveryBoy" ADD CONSTRAINT "ZoneDeliveryBoy_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "DeliveryBoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
