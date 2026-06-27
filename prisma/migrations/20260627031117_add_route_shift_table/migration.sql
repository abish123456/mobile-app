-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('NOT_STARTED', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateTable
CREATE TABLE "RouteShift" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftLog" (
    "id" TEXT NOT NULL,
    "routeShiftId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteShift_routeId_key" ON "RouteShift"("routeId");

-- CreateIndex
CREATE INDEX "RouteShift_status_idx" ON "RouteShift"("status");

-- CreateIndex
CREATE INDEX "RouteShift_routeId_idx" ON "RouteShift"("routeId");

-- CreateIndex
CREATE INDEX "ShiftLog_routeShiftId_idx" ON "ShiftLog"("routeShiftId");

-- CreateIndex
CREATE INDEX "ShiftLog_createdAt_idx" ON "ShiftLog"("createdAt");

-- AddForeignKey
ALTER TABLE "RouteShift" ADD CONSTRAINT "RouteShift_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftLog" ADD CONSTRAINT "ShiftLog_routeShiftId_fkey" FOREIGN KEY ("routeShiftId") REFERENCES "RouteShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DATA MIGRATION: Seed default shift start time SystemConfig (08:00 IST)
-- ON CONFLICT DO NOTHING = safe on any environment, skips if keys already exist
INSERT INTO "SystemConfig" ("key", "value", "createdAt", "updatedAt")
VALUES
  ('SHIFT_START_HOUR',            '8',  NOW(), NOW()),
  ('SHIFT_START_MINUTE',          '0',  NOW(), NOW()),
  ('SHIFT_START_OVERRIDE_DATE',   '',   NOW(), NOW()),
  ('SHIFT_START_OVERRIDE_HOUR',   '',   NOW(), NOW()),
  ('SHIFT_START_OVERRIDE_MINUTE', '',   NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
