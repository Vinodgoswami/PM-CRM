-- Human project codes PRJ-0001, PRJ-0002 … (docs/05). Starts after any existing codes.
CREATE SEQUENCE IF NOT EXISTS project_code_seq;
SELECT setval(
  'project_code_seq',
  COALESCE((SELECT max(substring("code" from 5)::int) FROM "Project" WHERE "code" ~ '^PRJ-[0-9]+$'), 0) + 1,
  false
);
