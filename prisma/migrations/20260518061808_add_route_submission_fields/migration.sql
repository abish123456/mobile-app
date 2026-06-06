-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "isSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "submittedAt" TIMESTAMP(3);
