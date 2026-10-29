// Staged-file checks for the pre-commit hook. Every package has its own flat ESLint config, so
// TypeScript files are grouped by package and linted from inside it.
import path from 'node:path';

const PACKAGE_DIR = /^((?:apps|packages)\/[^/]+)\//;

function eslintByPackage(files) {
  const groups = new Map();
  for (const abs of files) {
    const rel = path.relative(process.cwd(), abs).split(path.sep).join('/');
    const pkg = PACKAGE_DIR.exec(rel)?.[1];
    if (!pkg) continue;
    const list = groups.get(pkg) ?? [];
    list.push(path.relative(pkg, rel));
    groups.set(pkg, list);
  }
  return [...groups].map(
    ([pkg, rels]) =>
      `pnpm --dir ${pkg} exec eslint --fix --max-warnings=0 --no-warn-ignored ${rels.map((f) => JSON.stringify(f)).join(' ')}`,
  );
}

export default {
  '*.{ts,tsx}': (files) => [`prettier --write ${files.map((f) => JSON.stringify(f)).join(' ')}`, ...eslintByPackage(files)],
  '*.{js,mjs,cjs,json,md,css,html,yml,yaml}': 'prettier --write --ignore-unknown',
};
