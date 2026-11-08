-- D-063: monthly recurring milestone series; their milestones are created as each month comes due.
CREATE TABLE "RecurringSeries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "startDate" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringSeries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecurringSeries_amount_positive" CHECK ("amountMinor" > 0),
    CONSTRAINT "RecurringSeries_count_valid" CHECK ("count" >= 0 AND "createdCount" >= 0 AND "createdCount" <= "count")
);
CREATE INDEX "RecurringSeries_projectId_idx" ON "RecurringSeries"("projectId");
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Milestone" ADD COLUMN "recurringSeriesId" TEXT;
ALTER TABLE "Milestone" ADD COLUMN "recurringIndex" INTEGER;
CREATE UNIQUE INDEX "Milestone_recurringSeriesId_recurringIndex_key" ON "Milestone"("recurringSeriesId", "recurringIndex");
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_recurringSeriesId_fkey" FOREIGN KEY ("recurringSeriesId") REFERENCES "RecurringSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
