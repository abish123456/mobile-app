/*
  Warnings:

  - You are about to drop the column `area` on the `Route` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryBoyId` on the `ServiceRoute` table. All the data in the column will be lost.
  - Added the required column `serviceRouteId` to the `Route` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ServiceRoute" DROP CONSTRAINT "ServiceRoute_deliveryBoyId_fkey";

-- DropIndex
DROP INDEX "ServiceRoute_deliveryBoyId_idx";

-- AlterTable
ALTER TABLE "Route" DROP COLUMN "area",
ADD COLUMN     "serviceRouteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ServiceRoute" DROP COLUMN "deliveryBoyId";

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_serviceRouteId_fkey" FOREIGN KEY ("serviceRouteId") REFERENCES "ServiceRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
