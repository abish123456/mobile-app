-- CreateTable
CREATE TABLE "NotDeliveredReason" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotDeliveredReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotDeliveredReason_reason_key" ON "NotDeliveredReason"("reason");

-- CreateIndex
CREATE INDEX "NotDeliveredReason_isActive_idx" ON "NotDeliveredReason"("isActive");
