/*
  Warnings:

  - You are about to drop the column `assignedArea` on the `DeliveryBoy` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "DeliveryBoy_assignedArea_active_onLeave_idx";

-- AlterTable
ALTER TABLE "DeliveryBoy" DROP COLUMN "assignedArea";

-- AlterTable
ALTER TABLE "ServiceArea" ADD COLUMN     "deliveryBoyId" TEXT;

-- CreateIndex
CREATE INDEX "DeliveryBoy_active_onLeave_idx" ON "DeliveryBoy"("active", "onLeave");

-- CreateIndex
CREATE INDEX "ServiceArea_deliveryBoyId_idx" ON "ServiceArea"("deliveryBoyId");

-- AddForeignKey
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "DeliveryBoy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
