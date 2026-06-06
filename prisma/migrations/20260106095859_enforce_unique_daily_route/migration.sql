/*
  Warnings:

  - A unique constraint covering the columns `[serviceRouteId,date]` on the table `Route` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Route_serviceRouteId_date_key" ON "Route"("serviceRouteId", "date");
