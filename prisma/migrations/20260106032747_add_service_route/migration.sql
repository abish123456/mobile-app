/*
  Warnings:

  - You are about to drop the column `deliveryBoyId` on the `ServiceArea` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ServiceArea" DROP CONSTRAINT "ServiceArea_deliveryBoyId_fkey";

-- DropIndex
DROP INDEX "ServiceArea_deliveryBoyId_idx";

-- AlterTable
ALTER TABLE "ServiceArea" DROP COLUMN "deliveryBoyId",
ADD COLUMN     "serviceRouteId" TEXT;

-- CreateTable
CREATE TABLE "ServiceRoute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "deliveryBoyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRoute_name_key" ON "ServiceRoute"("name");

-- CreateIndex
CREATE INDEX "ServiceRoute_deliveryBoyId_idx" ON "ServiceRoute"("deliveryBoyId");

-- CreateIndex
CREATE INDEX "Address_pincode_idx" ON "Address"("pincode");

-- CreateIndex
CREATE INDEX "Address_area_idx" ON "Address"("area");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_deliveryDate_idx" ON "Order"("deliveryDate");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Product_active_inStock_idx" ON "Product"("active", "inStock");

-- CreateIndex
CREATE INDEX "ServiceArea_serviceRouteId_idx" ON "ServiceArea"("serviceRouteId");

-- AddForeignKey
ALTER TABLE "ServiceRoute" ADD CONSTRAINT "ServiceRoute_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "DeliveryBoy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_serviceRouteId_fkey" FOREIGN KEY ("serviceRouteId") REFERENCES "ServiceRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
