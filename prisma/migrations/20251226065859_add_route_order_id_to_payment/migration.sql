-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "routeOrderId" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_routeOrderId_fkey" FOREIGN KEY ("routeOrderId") REFERENCES "RouteOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
