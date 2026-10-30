-- FX (D-020): payments record both amounts; projects keep the rate saved when confirmed; daily rates are cached.
ALTER TABLE "Project" ADD COLUMN "fxRate" DECIMAL(20,10), ADD COLUMN "fxRateDate" DATE, ADD COLUMN "fxBaseCurrency" TEXT;
ALTER TABLE "Project" ADD CONSTRAINT "Project_fxRate_positive" CHECK ("fxRate" IS NULL OR "fxRate" > 0);

ALTER TABLE "Payment" ADD COLUMN "baseCurrency" TEXT, ADD COLUMN "fxRate" DECIMAL(20,10), ADD COLUMN "baseAmountMinor" BIGINT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_fxRate_positive" CHECK ("fxRate" IS NULL OR "fxRate" > 0);
-- The base amount has the same sign as the amount (reversals are negative in both currencies).
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_baseAmount_sign" CHECK ("baseAmountMinor" IS NULL OR sign("baseAmountMinor") = sign("amountMinor") OR "baseAmountMinor" = 0);

-- Same-currency history converts at 1; anything else stays NULL (no rate known) until someone records one.
UPDATE "Project" p SET "fxRate" = 1, "fxBaseCurrency" = s."baseCurrency", "fxRateDate" = COALESCE(p."wonAt", p."createdAt"::date)
FROM "Setting" s WHERE s.id = 1 AND p."currency" = s."baseCurrency";
UPDATE "Payment" pay SET "baseCurrency" = s."baseCurrency", "fxRate" = 1, "baseAmountMinor" = pay."amountMinor"
FROM "Setting" s, "Milestone" m, "Project" p
WHERE s.id = 1 AND m.id = pay."milestoneId" AND p.id = m."projectId" AND p."currency" = s."baseCurrency";

CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FxRate_date_from_to_key" ON "FxRate"("date", "from", "to");
