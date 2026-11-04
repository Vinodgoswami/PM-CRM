-- D-037: a phase is extra work (UPSELL, counts as upsell) or a part of the original scope (SCOPE).
CREATE TYPE "PhaseKind" AS ENUM ('UPSELL', 'SCOPE');
ALTER TABLE "Project" ADD COLUMN "phaseKind" "PhaseKind" NOT NULL DEFAULT 'UPSELL';
