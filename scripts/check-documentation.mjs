#!/usr/bin/env node
// obfuscation-scan-ignore-file: CI policy checker intentionally reads CI range variables and runs git.
/**
 * Documentation policy. Locally it examines staged files; in CI the push / pull-request range.
 *
 *  - BLOCKS when an architecture-relevant change (database schema or migrations, a new or changed
 *    API module, the core money engine, worker jobs, queues, app routes) is committed without
 *    updating docs/ (see docs/README.md).
 *  - WARNS for any other code change without a docs update.
 *
 * Emergency bypass (recorded in the commit output): DOCS_CHECK_SKIP="<reason>" git commit …
 */
import { execFileSync } from 'node:child_process';

function changedFiles() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  if (!process.env.CI) return git('diff', '--cached', '--name-only');
  if (process.env.DOCS_CHECK_RANGE) return git('diff', '--name-only', process.env.DOCS_CHECK_RANGE);
  if (process.env.GITHUB_BASE_REF) return git('diff', '--name-only', `origin/${process.env.GITHUB_BASE_REF}...HEAD`);
  const before = process.env.GITHUB_EVENT_BEFORE;
  if (before && !/^0+$/.test(before)) return git('diff', '--name-only', `${before}...HEAD`);
  return git('diff', '--name-only', 'HEAD^', 'HEAD');
}

let changed = [];
try {
  changed = changedFiles()
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
} catch {
  process.exit(0); // not a git checkout
}
if (changed.length === 0) process.exit(0);

const ARCHITECTURE = [
  /^packages\/database\/prisma\//,
  /^apps\/api\/src\/modules\/[^/]+\/[^/]+\.module\.ts$/,
  /^packages\/core\/src\/(billing|milestones|payments|revenue|forecast|upsell)\.ts$/,
  /^apps\/web\/src\/app\/router\.tsx$/,
  /^packages\/schemas\/src\//,
];
const CODE = /^(apps|packages|scripts)\//;
const isDocs = (f) => f.startsWith('docs/') || f === 'IMPLEMENTATION_STATUS.md' || f === 'AGENTS.md' || f === 'README.md';
const isTest = (f) => /(^|\/)(test|tests)\//.test(f) || /\.(test|spec)\.tsx?$/.test(f);

const architectural = changed.filter((f) => !isTest(f) && ARCHITECTURE.some((re) => re.test(f)));
const touchesDocs = changed.some(isDocs);

if (architectural.length > 0 && !touchesDocs) {
  if (process.env.DOCS_CHECK_SKIP) {
    console.warn(`\n• documentation policy bypassed: ${process.env.DOCS_CHECK_SKIP}\n`);
    process.exit(0);
  }
  console.error('\n✖ documentation policy: architecture-relevant files changed without a docs update:');
  for (const f of architectural.slice(0, 12)) console.error(`    ${f}`);
  console.error(
    '\n  Update the matching docs/*.md (05 data model, 06 rules, 07 roles, 09 dashboard, 10 API) ' +
      'and docs/17-implementation-status.md in the same commit.\n  Emergency bypass: DOCS_CHECK_SKIP="reason" git commit …\n',
  );
  process.exit(1);
}

if (!touchesDocs && changed.some((f) => CODE.test(f) && !isTest(f))) {
  console.warn(
    '\n• documentation policy: code changed with no docs/ update — update a doc if behaviour, security posture or commands changed.\n',
  );
  process.exit(0);
}
console.log('✓ documentation policy');
