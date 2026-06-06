/*
  Warnings:

  - You are about to drop the column `isCollected` on the `DepositRefundRequest` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DepositRefundRequest" DROP COLUMN "isCollected",
ADD COLUMN     "collected" BOOLEAN NOT NULL DEFAULT false;
