-- Add NOT_DELIVERED to OrderStatus enum if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'OrderStatus'
      AND e.enumlabel = 'NOT_DELIVERED'
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'NOT_DELIVERED';
  END IF;
END
$$;

