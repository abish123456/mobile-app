/*
  Warnings:

  - You are about to drop the column `defaultDeliveryBoyId` on the `ServiceRoute` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ServiceRoute" DROP CONSTRAINT "ServiceRoute_defaultDeliveryBoyId_fkey";

-- AlterTable
ALTER TABLE "ServiceRoute" DROP COLUMN "defaultDeliveryBoyId",
ADD COLUMN     "currentDeliveryBoyId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceRoute_currentDeliveryBoyId_idx" ON "ServiceRoute"("currentDeliveryBoyId");

-- AddForeignKey
ALTER TABLE "ServiceRoute" ADD CONSTRAINT "ServiceRoute_currentDeliveryBoyId_fkey" FOREIGN KEY ("currentDeliveryBoyId") REFERENCES "DeliveryBoy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
