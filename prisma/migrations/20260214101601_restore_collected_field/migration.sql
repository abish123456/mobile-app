-- AlterTable
ALTER TABLE "DepositRefundRequest" ADD COLUMN     "collected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "collectedAt" TIMESTAMP(3);
