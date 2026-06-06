-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "cansInHand" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositWalletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "depositAmount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "returnQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
