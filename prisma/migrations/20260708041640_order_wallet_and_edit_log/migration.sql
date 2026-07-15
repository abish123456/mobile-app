-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "orderWalletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "codAdjustmentAmount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN     "walletType" TEXT NOT NULL DEFAULT 'DEPOSIT';

-- CreateTable
CREATE TABLE "OrderEditLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "adminId" TEXT,
    "editType" TEXT NOT NULL,
    "oldSnapshot" JSONB NOT NULL,
    "newSnapshot" JSONB NOT NULL,
    "oldAmount" INTEGER NOT NULL,
    "newAmount" INTEGER NOT NULL,
    "amountDiff" INTEGER NOT NULL,
    "depositDiff" INTEGER NOT NULL DEFAULT 0,
    "codAmountAdded" INTEGER NOT NULL DEFAULT 0,
    "orderWalletCredit" INTEGER NOT NULL DEFAULT 0,
    "depositWalletCredit" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderEditLog_orderId_idx" ON "OrderEditLog"("orderId");

-- CreateIndex
CREATE INDEX "OrderEditLog_adminId_idx" ON "OrderEditLog"("adminId");

-- CreateIndex
CREATE INDEX "OrderEditLog_createdAt_idx" ON "OrderEditLog"("createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletType_idx" ON "WalletTransaction"("walletType");

-- AddForeignKey
ALTER TABLE "OrderEditLog" ADD CONSTRAINT "OrderEditLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
