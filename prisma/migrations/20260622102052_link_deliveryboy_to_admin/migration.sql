-- AlterTable
ALTER TABLE "DeliveryBoy" ADD COLUMN     "adminId" TEXT;

-- AddForeignKey
ALTER TABLE "DeliveryBoy" ADD CONSTRAINT "DeliveryBoy_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
