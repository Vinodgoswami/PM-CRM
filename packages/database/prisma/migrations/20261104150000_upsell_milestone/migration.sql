-- D-038: an upsell amount may be billed through its own milestone.
ALTER TABLE "UpsellEntry" ADD COLUMN "milestoneId" TEXT;
CREATE UNIQUE INDEX "UpsellEntry_milestoneId_key" ON "UpsellEntry"("milestoneId");
ALTER TABLE "UpsellEntry" ADD CONSTRAINT "UpsellEntry_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
