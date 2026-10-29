# 11 · Security

Two layers: **repository gates** (stop bad code reaching `main`) and **application security** (protect the data).

## Repository gates (in place)

Ported from PayOS after its supply-chain incident (2026-09-30: an obfuscated loader was injected into source files
and pushed to `main`). `pnpm verify` runs everything locally.

| When                                 | Runs                                                                                         | Blocks                                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` (pre/post)            | `scripts/scan-obfuscation.mjs --quiet`                                                       | Obfuscated / malicious code, dangerous `package.json` lifecycle scripts                                                                                 |
| `pnpm build` (pre/post)              | `pnpm scan:quality`, `pnpm check:obscure`                                                    | Same + security baseline                                                                                                                                |
| `git commit` (`.husky/pre-commit`)   | lint-staged, `check:obscure`, `guard:integrity`, `security:check`, `docs:check`              | Lint errors, obfuscation, injection signatures, secrets, float money, unsafe raw SQL, raw HTML, tokens in web storage, architecture change without docs |
| Commit message (`.husky/commit-msg`) | commitlint                                                                                   | Non-conventional messages                                                                                                                               |
| `git push` (`.husky/pre-push`)       | Blocks push to `main`; scans; migrations append-only vs `origin/main`; typecheck, lint, test | Anything red                                                                                                                                            |
| CI `ci.yml`                          | Scans, docs policy, format, typecheck, lint, test, build                                     | Same — hooks can be skipped with `--no-verify`, CI cannot                                                                                               |
| CI `security.yml`                    | Scanners loaded **from protected `main`**, append-only migrations                            | A commit that edits the scanners to hide itself                                                                                                         |
| CI `main-watch.yml`                  | Alarm on force-push to `main`; guard from previous main commit                               | Silent history rewrites                                                                                                                                 |

Scripts: `scripts/scan-obfuscation.mjs`, `scripts/guard-integrity.mjs`, `scripts/check-security-baseline.mjs`,
`scripts/check-documentation.mjs`, `scripts/selftest-scanners.mjs`.

Waivers (use rarely, always with a reason):

- `// security-baseline-allow: <reason>` — one line.
- `// obfuscation-scan-ignore-file: <reason>` — MEDIUM/HIGH only; CRITICAL can never be waived.
- `DOCS_CHECK_SKIP="reason" git commit …` — emergency only.
- `SKIP_PUSH_TESTS="reason" git push` — skips tests only. `ALLOW_MAIN_PUSH=1` — one push to main.

Supply chain: only packages listed in `pnpm-workspace.yaml → allowBuilds` may run install scripts; lockfile is
committed; CI uses `--frozen-lockfile`.

## Application security

| Area            | Rule                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication  | argon2id hashes; invite-only accounts; login rate limit; generic error messages                                                                      |
| Sessions        | Random 256-bit id, stored hashed; httpOnly + Secure + SameSite=Lax cookie; idle/absolute timeouts                                                    |
| CSRF            | Double-submit token header on all mutating requests                                                                                                  |
| Authorisation   | Server-side permission + ownership on every endpoint ([07](07-roles-and-permissions.md))                                                             |
| Input           | Zod validation on every body/query; Prisma parameterised queries only                                                                                |
| Output          | React escapes text; no `dangerouslySetInnerHTML` (gate-enforced); CSP `default-src 'self'`                                                           |
| Money integrity | Integers only; payment amount immutable via DB trigger; reversals instead of edits; audit in same transaction                                        |
| Files           | Private bucket; signed URLs (PUT 5 min, GET 60 s); mime allow-list: pdf, docx, xlsx, pptx, png, jpg, zip; ≤ 25 MB; `Content-Disposition: attachment` |
| Secrets         | Only in `.env` / host secret store; validated at boot by `packages/config`; never sent to the browser                                                |
| Logging         | pino with redaction of cookies, passwords, tokens, emails in bodies                                                                                  |
| Headers         | helmet: HSTS, CSP, X-Content-Type-Options, frame-ancestors 'none'                                                                                    |
| Backups         | Daily Postgres backup, 30-day retention; bucket versioning on                                                                                        |
| Dependencies    | Renovate/Dependabot weekly; `pnpm audit` in CI (warn)                                                                                                |

## GitHub settings to enable (when the repo is created)

- Branch protection on `main`: PR required, `CI` and `Security` checks required, Code Owners review, no force-push.
- `.github/CODEOWNERS` already assigns `scripts/`, `.husky/`, `.github/`, schema and migrations to the owner.
- Production auto-deploy off; deploy manually after checks pass.

## Incident: `main-watch` fails

1. Do not deploy.
2. `git diff <before> <after>`: look for packed/obfuscated code, code after long whitespace, changes to `scripts/`,
   `.husky/`, `.github/`.
3. Rotate every credential the pushing machine/token could reach (GitHub, database, storage).
4. Restore `main` from the last good commit; run `pnpm verify`.
