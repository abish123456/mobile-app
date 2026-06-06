-- DropIndex
DROP INDEX "RouteOrder_orderId_key";

-- CreateIndex
CREATE UNIQUE INDEX "RouteOrder_orderId_routeId_key" ON "RouteOrder"("orderId", "routeId");
