/*
  Warnings:

  - You are about to drop the column `collected` on the `DepositRefundRequest` table. All the data in the column will be lost.
  - You are about to drop the column `collectedAt` on the `DepositRefundRequest` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DepositRefundRequest" DROP COLUMN "collected",
DROP COLUMN "collectedAt",
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
