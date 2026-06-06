-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "amount" INTEGER;

-- Update existing orders with calculated amount (50 rupees per can, in paise)
-- This ensures historical orders have the correct amount
UPDATE "Order" 
SET "amount" = "quantity" * 50 * 100 
WHERE "amount" IS NULL;

-- Make amount NOT NULL after backfilling
ALTER TABLE "Order" ALTER COLUMN "amount" SET NOT NULL;

