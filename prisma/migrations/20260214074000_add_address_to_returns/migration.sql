-- AlterTable
ALTER TABLE "DepositRefundRequest" ADD COLUMN     "addressId" TEXT;

-- AlterTable
ALTER TABLE "ReturnCanRequest" ADD COLUMN     "addressId" TEXT;

-- AddForeignKey
ALTER TABLE "ReturnCanRequest" ADD CONSTRAINT "ReturnCanRequest_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRefundRequest" ADD CONSTRAINT "DepositRefundRequest_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
