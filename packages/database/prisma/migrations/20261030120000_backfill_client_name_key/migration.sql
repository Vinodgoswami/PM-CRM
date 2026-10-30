-- Backfill (C-2): clients created by the demo seed before it wrote nameKey were invisible to duplicate checks and
-- imports. Give each active client without a key its normalised name, unless another client already holds that key;
-- of several keyless clients with the same name, only the oldest id gets it (the unique index stays satisfied).
UPDATE "Client" AS c
SET "nameKey" = lower(btrim(c."name"))
WHERE c."archivedAt" IS NULL
  AND c."nameKey" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Client" AS o WHERE o."nameKey" = lower(btrim(c."name")))
  AND c."id" = (
    SELECT min(x."id") FROM "Client" AS x
    WHERE x."archivedAt" IS NULL AND x."nameKey" IS NULL AND lower(btrim(x."name")) = lower(btrim(c."name"))
  );
