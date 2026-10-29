#!/usr/bin/env node
/**
 * SalesCRM security baseline. Fails the commit/build when:
 *  - a credential that looks real is committed (private keys, live API keys, provider keys)
 *  - server-side money code converts amounts through floating point (parseFloat / Decimal.toNumber)
 *  - unsafe raw SQL ($queryRawUnsafe / $executeRawUnsafe) is used outside test helpers
 *  - React renders raw HTML (dangerouslySetInnerHTML)
 *  - auth tokens / secrets are written to web storage
 *  - runtime .env files are not gitignored
 *
 * A single line may be waived with a trailing `// security-baseline-allow: <reason>` comment.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { report, stripComments, walkFiles } from './lib/walk.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WAIVER = /security-baseline-allow:\s*\S/;
const isTest = (rel) => /(^|\/)(test|tests|e2e)\//.test(rel) || /\.(test|spec)\.tsx?$/.test(rel);

// Server-side code where amounts (project value, milestones, payments) stay integer minor units end to end.
const MONEY_CODE = ['apps/api/src/', 'packages/core/src/', 'packages/types/src/', 'packages/database/src/'];
const WEB_CODE = /^(apps\/web\/src|packages\/ui\/src)\//;

const SECRET_RULES = [
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, message: 'private key material committed' },
  { re: /\bsk_live_[A-Za-z0-9]{16,}/, message: 'live secret API key committed' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, message: 'AWS access key id committed' },
  { re: /\bxkeysib-[a-f0-9]{32,}/, message: 'Brevo API key committed' },
  { re: /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}/, message: 'Resend API key committed' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}/, message: 'GitHub token committed' },
  { re: /\bnfp_[A-Za-z0-9]{30,}/, message: 'Netlify token committed' },
  { re: /\brnd_[A-Za-z0-9]{24,}/, message: 'Render API key committed' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, message: 'Google API key committed' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, message: 'Slack token committed' },
  { re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, message: 'SendGrid API key committed' },
];

const findings = [];
const dirs = ['apps', 'packages', 'scripts', 'tests'].map((d) => resolve(root, d));

for (const dir of dirs) {
  for (const file of walkFiles(dir, root, ['.ts', '.tsx', '.mjs', '.cjs', '.js', '.json', '.yaml', '.yml'])) {
    if (file.rel === 'scripts/check-security-baseline.mjs') continue;
    const raw = file.text.split('\n');
    const code = /\.(tsx?|mjs|cjs|js)$/.test(file.rel) ? stripComments(file.text).split('\n') : raw;
    const test = isTest(file.rel);

    code.forEach((line, idx) => {
      if (WAIVER.test(raw[idx] ?? '')) return;
      const at = (message) => findings.push({ rel: file.rel, line: idx + 1, message });

      for (const rule of SECRET_RULES) if (rule.re.test(line)) at(rule.message);

      if (MONEY_CODE.some((p) => file.rel.startsWith(p)) && !test) {
        if (/\bparseFloat\s*\(|Number\.parseFloat\s*\(/.test(line))
          at('parseFloat in money code — use integer minor units (packages/types money helpers)');
        if (/\.toNumber\s*\(\s*\)/.test(line)) at('Decimal.toNumber() in money code — use toBigInt()');
      }
      if (/\$(?:query|execute)RawUnsafe\s*\(/.test(line) && !test)
        at('unsafe raw SQL — use tagged $queryRaw / $executeRaw (parameterised)');
      if (WEB_CODE.test(file.rel) && /dangerouslySetInnerHTML/.test(line))
        at('dangerouslySetInnerHTML — render text, never client/project HTML');
      if (WEB_CODE.test(file.rel) && /(?:local|session)Storage\.setItem\([^)]*(?:token|secret|password|apiKey)/i.test(line)) {
        at('auth token / secret written to web storage — sessions use httpOnly cookies');
      }
    });
  }
}

// Runtime env files must be gitignored.
const gitignorePath = resolve(root, '.gitignore');
const gitignore = existsSync(gitignorePath)
  ? readFileSync(gitignorePath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
  : [];
for (const pattern of ['.env', '.env.*', '!.env.example']) {
  if (!gitignore.includes(pattern)) findings.push({ rel: '.gitignore', line: 0, message: `missing ignore rule: ${pattern}` });
}

process.exit(report('security baseline', findings) ? 1 : 0);
