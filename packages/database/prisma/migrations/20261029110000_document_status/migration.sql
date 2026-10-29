-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'READY');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING';
