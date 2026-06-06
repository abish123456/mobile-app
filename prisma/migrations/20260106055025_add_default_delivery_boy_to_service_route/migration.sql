-- AlterTable
ALTER TABLE "ServiceRoute" ADD COLUMN     "defaultDeliveryBoyId" TEXT;

-- AddForeignKey
ALTER TABLE "ServiceRoute" ADD CONSTRAINT "ServiceRoute_defaultDeliveryBoyId_fkey" FOREIGN KEY ("defaultDeliveryBoyId") REFERENCES "DeliveryBoy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
