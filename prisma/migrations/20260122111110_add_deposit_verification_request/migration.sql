-- AlterTable
ALTER TABLE "DepositVerificationRequest" ALTER COLUMN "quantity" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "DepositVerificationRequest_productId_idx" ON "DepositVerificationRequest"("productId");
