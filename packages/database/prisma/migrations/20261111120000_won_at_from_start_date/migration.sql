-- D-070: before D-069 a project entered as confirmed was dated the day it was entered. Where its work began earlier,
-- it now counts as confirmed from its start date. Projects without a start date, or starting later, are unchanged.
UPDATE "Project"
SET "wonAt" = "startDate"
WHERE "wonAt" IS NOT NULL
  AND "startDate" IS NOT NULL
  AND "startDate" < "wonAt";
