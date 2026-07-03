-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "generalWalletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "isQuantityEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quantityEditNote" TEXT;

-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN     "walletCategory" TEXT NOT NULL DEFAULT 'DEPOSIT';
