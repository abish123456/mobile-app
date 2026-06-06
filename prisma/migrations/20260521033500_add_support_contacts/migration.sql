-- CreateTable
CREATE TABLE "SupportContact" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportContact_active_idx" ON "SupportContact"("active");

-- CreateIndex (To resolve the unique index drift on Route table)
-- We use a DO block to safely create the index only if it does not already exist, avoiding migration errors.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'unique_daily_route'
        AND n.nspname = 'public'
    ) THEN
        CREATE UNIQUE INDEX "unique_daily_route" ON "Route"("serviceRouteId", "date");
    END IF;
END $$;
