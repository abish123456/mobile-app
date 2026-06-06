-- CreateIndex
CREATE INDEX "Route_date_idx" ON "Route"("date");

-- CreateIndex
CREATE INDEX "Route_deliveryBoyId_idx" ON "Route"("deliveryBoyId");

-- CreateIndex
CREATE INDEX "Route_serviceRouteId_idx" ON "Route"("serviceRouteId");

-- CreateIndex
CREATE INDEX "Route_serviceRouteId_date_idx" ON "Route"("serviceRouteId", "date");

-- CreateIndex
CREATE INDEX "RouteOrder_routeId_idx" ON "RouteOrder"("routeId");

-- CreateIndex
CREATE INDEX "RouteOrder_orderId_idx" ON "RouteOrder"("orderId");

-- CreateIndex
CREATE INDEX "RouteOrder_deliveryStatus_idx" ON "RouteOrder"("deliveryStatus");

-- CreateIndex
CREATE INDEX "RouteOrder_orderId_deliveryStatus_idx" ON "RouteOrder"("orderId", "deliveryStatus");
