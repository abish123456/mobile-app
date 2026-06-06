-- CreateTable
CREATE TABLE "OrderActivityLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderActivityLog_orderId_idx" ON "OrderActivityLog"("orderId");

-- CreateIndex
CREATE INDEX "OrderActivityLog_createdAt_idx" ON "OrderActivityLog"("createdAt");

-- AddForeignKey
ALTER TABLE "OrderActivityLog" ADD CONSTRAINT "OrderActivityLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

