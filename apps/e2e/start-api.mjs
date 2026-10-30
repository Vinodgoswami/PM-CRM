#!/usr/bin/env node
// Playwright webServer for the API: a freshly seeded e2e database, then the built API. Never touches the dev database.
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit', env: process.env });

// Non-destructive migrate (creates salescrm_e2e on first run), then the demo seed, which refuses non-local hosts and
// clears only this e2e database before loading the dataset.
if (!/\/salescrm_e2e(\?|$)/.test(process.env.DATABASE_URL ?? '')) throw new Error('e2e must run against the salescrm_e2e database');
run('pnpm --filter @salescrm/database exec prisma migrate deploy');
run('pnpm --filter @salescrm/api exec tsx scripts/seed.ts');
const api = spawn('node', ['apps/api/dist/main.js'], { cwd: root, stdio: 'inherit', env: process.env });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => api.kill(sig));
api.on('exit', (code) => process.exit(code ?? 0));
