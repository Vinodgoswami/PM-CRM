#!/usr/bin/env node
// Run a command with the monorepo root .env loaded (existing env vars win).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* no .env: rely on the real environment */
}
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: with-env <command> [...args]');
  process.exit(2);
}
const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
