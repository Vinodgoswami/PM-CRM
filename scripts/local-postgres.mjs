#!/usr/bin/env node
/**
 * Local PostgreSQL without Docker (development / CI fallback).
 * Uses the `embedded-postgres` npm package (real PostgreSQL binaries, not an emulation).
 *
 *   pnpm db:local            # start on :5432, create salescrm + salescrm_test databases, stay in foreground
 *
 * Data lives in ./.local-postgres (git-ignored). Prefer `docker compose up postgres` when Docker exists.
 */
import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';
import fs from 'node:fs';

const port = Number(process.env.LOCAL_PG_PORT ?? 5432);
const databaseDir = path.resolve(process.cwd(), '.local-postgres');
const firstRun = !fs.existsSync(path.join(databaseDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'salescrm',
  password: 'salescrm',
  port,
  persistent: true,
  onLog: () => {},
});

if (firstRun) await pg.initialise();
await pg.start();
for (const db of ['salescrm', 'salescrm_test']) {
  try {
    await pg.createDatabase(db);
  } catch {
    /* already exists */
  }
}
console.log(`PostgreSQL ready on postgresql://salescrm:salescrm@localhost:${port}/salescrm (test db: salescrm_test). Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
