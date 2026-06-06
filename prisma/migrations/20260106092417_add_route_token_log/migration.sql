-- CreateTable
CREATE TABLE "RouteTokenLog" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteTokenLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteTokenLog_routeId_idx" ON "RouteTokenLog"("routeId");

-- AddForeignKey
ALTER TABLE "RouteTokenLog" ADD CONSTRAINT "RouteTokenLog_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
