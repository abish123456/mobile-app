-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "areaName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceArea_pincode_key" ON "ServiceArea"("pincode");

-- CreateIndex
CREATE INDEX "ServiceArea_pincode_idx" ON "ServiceArea"("pincode");
