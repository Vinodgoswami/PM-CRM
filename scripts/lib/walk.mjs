import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const IGNORE = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  'build',
  '.turbo',
  '.local-postgres',
  '.storage',
  '.netlify',
  'playwright-report',
  'test-results',
]);

/** Yield `{ path, rel, text }` for every file under `dir` whose name ends with one of `extensions`. */
export function* walkFiles(dir, root, extensions) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE.has(entry.name)) continue;
      yield* walkFiles(full, root, extensions);
      continue;
    }
    if (extensions.some((ext) => entry.name.endsWith(ext))) {
      yield { path: full, rel: relative(root, full).split('\\').join('/'), text: readFileSync(full, 'utf8') };
    }
  }
}

/** Strip `//` and block comments so scans don't match documentation. */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

export function report(title, findings) {
  if (findings.length === 0) {
    console.log(`✓ ${title}`);
    return false;
  }
  console.error(`\n✖ ${title} — ${findings.length} issue(s):`);
  for (const f of findings) console.error(`  ${f.rel}:${f.line}  ${f.message}`);
  return true;
}
