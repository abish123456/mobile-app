-- AlterTable
ALTER TABLE "DepositRefundRequest" ADD COLUMN     "collectedAt" TIMESTAMP(3),
ADD COLUMN     "isCollected" BOOLEAN NOT NULL DEFAULT false;
