#!/usr/bin/env node
/**
 * Supply-chain integrity guard (ported from PayOS, incident 2026-09-30). Dependency-free on purpose: it must keep
 * working even if scan-obfuscation.mjs itself has been tampered with.
 *
 *   node scripts/guard-integrity.mjs                 # scan the working tree
 *   MIGRATION_BASE=origin/main node scripts/...      # also enforce append-only migrations vs a ref
 *
 * Fails (exit 1) on:
 *  1. Known injection signatures: the `global.o='…'; var _$_xxxx=(function(…` packer family, and
 *     code hidden after a long run of whitespace (pushed off-screen in editors).
 *  2. Edited or deleted migrations: every migration that exists in MIGRATION_BASE must be
 *     byte-identical here. Migrations are append-only; fix forward with a new migration.
 *  3. Dangerous SQL in migrations: roles/grants, server-side file or program access, extensions
 *     outside the allow-list, disabling triggers, or dropping the audit / paid-payment guards.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set([
  'node_modules',
  'dist',
  '.git',
  '.turbo',
  'build-folder',
  'release',
  '.claude',
  'coverage',
  'playwright-report',
  'test-results',
  '.storage',
  '.local-postgres',
  'uploads',
]);
const CODE = /\.(m?js|cjs|jsx?|tsx?)$/;
const MIGRATIONS = 'packages/database/prisma/migrations';

const SIGNATURES = [
  { name: "packer bootstrap global.o='…'", re: /global\.o\s*=\s*['"][\w-]+['"]/ },
  { name: 'mangled packer identifier _$_xxxx=(function(', re: /_\$_[0-9a-f]{4}\s*=\s*\(function\s*\(/ },
  { name: 'packer sink global[_$_…]', re: /global\[_\$_[0-9a-f]{4}\[/ },
  // Real code never needs 150+ spaces before more code on the same line.
  { name: 'code hidden after long whitespace', re: /\S[ \t]{150,}\S/ },
];

const SQL_RULES = [
  { name: 'role management', re: /\b(CREATE|ALTER|DROP)\s+(ROLE|USER)\b/i },
  { name: 'privilege change', re: /\b(GRANT|REVOKE)\b/i },
  {
    name: 'server file / program access',
    re: /\b(COPY\b[^;]*\bPROGRAM\b|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export)\b/i,
  },
  { name: 'cross-database / network access', re: /\b(dblink|postgres_fdw|CREATE\s+SERVER)\b/i },
  { name: 'extension (not allow-listed)', re: /\bCREATE\s+EXTENSION\b(?![^;]*\b(pgcrypto|citext)\b)/i },
  { name: 'disables triggers', re: /\bDISABLE\s+TRIGGER\b|\bsession_replication_role\b/i },
  {
    name: 'drops an audit / payment guard',
    re: /\bDROP\s+(TRIGGER|FUNCTION)\b[^;]*\b(crm_forbid_mutation|payment_|audit_)/i,
  },
  { name: 'security definer function', re: /\bSECURITY\s+DEFINER\b/i },
];

const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (CODE.test(entry.name) && statSync(p).size < 5_000_000) {
      const text = readFileSync(p, 'utf8');
      for (const s of SIGNATURES) if (s.re.test(text)) problems.push(`${path.relative(root, p)}: ${s.name}`);
    }
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function checkMigrations(base) {
  let baseFiles;
  try {
    baseFiles = git(['ls-tree', '-r', '--name-only', base, '--', MIGRATIONS]).split('\n').filter(Boolean);
  } catch {
    console.warn(`• migration immutability skipped: ref ${base} not available`);
    return;
  }
  for (const f of baseFiles) {
    let current;
    try {
      current = readFileSync(path.join(root, f), 'utf8');
    } catch {
      problems.push(`${f}: applied migration was deleted (migrations are append-only)`);
      continue;
    }
    if (git(['show', `${base}:${f}`]) !== current) problems.push(`${f}: applied migration was modified (fix forward with a new migration)`);
  }
}

function checkSql() {
  const dir = path.join(root, MIGRATIONS);
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return; // no migrations yet
  }
  for (const name of names) {
    const file = path.join(dir, name, 'migration.sql');
    let sql;
    try {
      sql = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const code = sql.replace(/--[^\n]*/g, '');
    for (const r of SQL_RULES) if (r.re.test(code)) problems.push(`${MIGRATIONS}/${name}/migration.sql: ${r.name}`);
  }
}

walk(root);
checkSql();
if (process.env.MIGRATION_BASE) checkMigrations(process.env.MIGRATION_BASE);

if (problems.length) {
  console.error(`✖ integrity guard: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ integrity guard${process.env.MIGRATION_BASE ? ` (migrations append-only vs ${process.env.MIGRATION_BASE})` : ''}`);
