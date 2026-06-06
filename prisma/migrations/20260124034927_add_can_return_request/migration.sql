-- CreateEnum
CREATE TYPE "ReturnRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ASSIGNED', 'COLLECTED', 'REFUNDED', 'REJECTED');

-- CreateTable
CREATE TABLE "ReturnCanRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "refundAmount" DOUBLE PRECISION NOT NULL,
    "refundMethod" TEXT NOT NULL DEFAULT 'ONLINE',
    "upiId" TEXT,
    "accountNumber" TEXT,
    "ifscCode" TEXT,
    "bankName" TEXT,
    "adminId" TEXT,
    "deliveryPartnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),

    CONSTRAINT "ReturnCanRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnCanRequest_customerId_idx" ON "ReturnCanRequest"("customerId");

-- CreateIndex
CREATE INDEX "ReturnCanRequest_status_idx" ON "ReturnCanRequest"("status");

-- CreateIndex
CREATE INDEX "ReturnCanRequest_deliveryPartnerId_idx" ON "ReturnCanRequest"("deliveryPartnerId");

-- AddForeignKey
ALTER TABLE "ReturnCanRequest" ADD CONSTRAINT "ReturnCanRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCanRequest" ADD CONSTRAINT "ReturnCanRequest_deliveryPartnerId_fkey" FOREIGN KEY ("deliveryPartnerId") REFERENCES "DeliveryBoy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
