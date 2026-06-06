/*
  Warnings:

  - A unique constraint covering the columns `[areaName]` on the table `ServiceArea` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ServiceArea_areaName_key" ON "ServiceArea"("areaName");
