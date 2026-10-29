-- AlterTable
ALTER TABLE "Client" ADD COLUMN "nameKey" TEXT;

-- Backfill: active clients get their normalised name (C-2); archived ones stay NULL.
UPDATE "Client" SET "nameKey" = lower(btrim("name")) WHERE "archivedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Client_nameKey_key" ON "Client"("nameKey");
