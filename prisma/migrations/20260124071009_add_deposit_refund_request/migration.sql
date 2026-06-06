-- CreateEnum
CREATE TYPE "DepositRefundStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');

-- DropIndex
DROP INDEX "ReturnCanRequest_deliveryPartnerId_idx";

-- CreateTable
CREATE TABLE "DepositRefundRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "DepositRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "adminNote" TEXT,
    "upiId" TEXT,
    "accountNumber" TEXT,
    "ifscCode" TEXT,
    "bankName" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "DepositRefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepositRefundRequest_customerId_idx" ON "DepositRefundRequest"("customerId");

-- CreateIndex
CREATE INDEX "DepositRefundRequest_status_idx" ON "DepositRefundRequest"("status");

-- AddForeignKey
ALTER TABLE "DepositRefundRequest" ADD CONSTRAINT "DepositRefundRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
