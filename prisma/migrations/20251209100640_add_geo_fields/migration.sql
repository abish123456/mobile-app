-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "DeliveryBoy" ADD COLUMN     "assignedArea" TEXT,
ADD COLUMN     "currentLat" DOUBLE PRECISION,
ADD COLUMN     "currentLng" DOUBLE PRECISION,
ADD COLUMN     "locationUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "onLeave" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceRadiusKm" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "DeliveryBoy_assignedArea_active_onLeave_idx" ON "DeliveryBoy"("assignedArea", "active", "onLeave");
