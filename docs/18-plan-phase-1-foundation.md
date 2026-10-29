# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running monorepo where users log in with roles, sessions and CSRF protection; permissions and audit are
enforced on the server; the full database schema (with money-protecting triggers) exists; and a seeded dataset plus a
role-aware web shell are ready for Phase 2.

**Architecture:** pnpm + Turborepo modular monolith. `apps/api` (NestJS) and `apps/web` (React + Vite) share Zod
schemas, money/period helpers and the permission matrix through `packages/*`. Postgres via Prisma; pure business
logic in `packages/core`. The web app always calls a relative `/api/v1` (Vite proxy in dev, host rewrite in
production) so session cookies are first-party.

**Tech Stack:** Node 24, pnpm 11.19.0, Turborepo, TypeScript ~5.9.3, NestJS 11, Prisma 6.19.3, PostgreSQL 17,
Zod 4, argon2, React 19, Vite 7, React Router 7, TanStack Query 5, Tailwind 4 + shadcn/ui, Vitest 3, Supertest.

**Spec:** docs 01–17 in this folder, especially [04](04-architecture.md), [05](05-data-model.md),
[06](06-business-rules.md), [07](07-roles-and-permissions.md), [10](10-api-spec.md), [11](11-security.md),
[12](12-coding-standards.md), [13 § Phase 1](13-roadmap.md#phase-1--foundation).

## Global Constraints

- Package scope `@salescrm/*`; every package has `build`, `typecheck`, `lint`, `test` scripts.
- Versions (same as PayOS): `@nestjs/*` ^11.2.6, `prisma`/`@prisma/client` 6.19.3, `zod` ^4.6.5, `argon2` ^0.45.1,
  `helmet` ^8.3.0, `nestjs-pino` ^4.6.1, `pino` ^10.3.1, `cookie-parser` ^1.4.7, `express` ^5.2.1, `react`/`react-dom`
  ^19.3.0, `react-router` ^7.18.4, `@tanstack/react-query` ^5.104.0, `react-hook-form` ^7.89.0, `@hookform/resolvers`
  ^5.9.1, `vite` ^7.3.6, `@vitejs/plugin-react` ^5.1.0, `tailwindcss`/`@tailwindcss/vite` ^4.3.3, `motion` ^12.43.0,
  `lucide-react` ^1.48.0, `vitest` ^3.2.7, `supertest` ^7.3.0, `eslint` ^9.39.5, `typescript-eslint` ^8.70.1,
  `tsup` ^8.5.1, `tsx` ^4.20.0, `unplugin-swc` ^2.0.0, `@swc/core` ^1.16.2, `embedded-postgres` 18.4.0-beta.17.
  No other runtime dependency without a decision in [15](15-decisions-and-open-questions.md).
- Ports: web 5173, API 4000. API prefix `/api/v1`.
- Money: `bigint` minor units in server/core; JSON integer at the boundary (M-1). No `parseFloat`/`toNumber` (gate).
- Error body: `{ "error": { "code", "message", "details?" } }`; codes from [10 § Conventions](10-api-spec.md#conventions).
- Cookies: `sc_session` (httpOnly, SameSite=Lax, Secure when `COOKIE_SECURE=true`, path `/`). CSRF token returned in
  JSON and sent back as header `X-CSRF-Token`; never stored in web storage.
- Sessions: 12 h idle, 7 day absolute. Login limit: 5 failures / 15 min per (email, IP).
- Settings defaults: base currency `INR`, FY start month `4`, timezone `Asia/Kolkata`, due-soon days `7`.
- Every money-changing or admin write: Prisma transaction that also inserts the `AuditLog` row.
- Branch: `feat/phase-1-foundation` from `development`; one conventional commit per task; each commit updates
  [17-implementation-status.md](17-implementation-status.md) (satisfies the docs gate).

## Decisions taken in this plan (owner to confirm on review)

- **D-010 No outbound email in v1.** Invite and password-reset links are returned to the Admin, who shares them.
  `POST /auth/password/forgot` is dropped; Admin uses `POST /users/:id/reset-link`. Docs 07, 08, 10 updated in Task 7.
- **D-011 Same-origin API.** Web calls relative `/api/v1`; production host rewrites `/api/*` to the API. No CORS.
  `VITE_API_URL` removed. Doc 04 updated in Task 9.
- **D-012 Audit via explicit `AuditService.record(tx, …)`** inside the business transaction (not an interceptor,
  which cannot share the transaction). Doc 04 updated in Task 6.

## Review Focus

1. Email typed with different case or spaces (`" Admin@Example.com "`) must log in the same user → Task 5 test.
2. A user who is deactivated or whose role changes while logged in must lose access on their next request → Task 7 test.
3. Money typed as `"1,25,000.50"`, `"12.345"`, `"-5"`, `""`, `"1e5"`: grouping commas accepted; too many decimals,
   negatives, empty and exponents rejected → Task 2 test.
4. The last active Admin demoting or deactivating themself must be refused (409 `LAST_ADMIN`) → Task 7 test.
5. A mutating request with a missing/wrong `X-CSRF-Token`, or a login POST from a foreign `Origin`, must get 403 →
   Task 5 test.

---

## File structure

```
package.json, pnpm-workspace.yaml, turbo.json, .env.example      (modify)
scripts/with-env.mjs, scripts/local-postgres.mjs                 (create)
packages/
  typescript-config/  base.json library.json nest.json react.json
  eslint-config/      base.js react.js
  types/src/          money.ts index.ts            test/money.test.ts
  core/src/           period.ts audit-diff.ts index.ts   test/period.test.ts test/audit-diff.test.ts
  config/src/         index.ts                     test/config.test.ts
  schemas/src/        common.ts auth.ts users.ts settings.ts index.ts
  auth/src/           password.ts tokens.ts permissions.ts index.ts   test/*.test.ts
  database/           prisma/schema.prisma prisma/migrations/* src/index.ts src/testing.ts  test/triggers.test.ts
  ui/src/             styles.css lib/cn.ts components/* index.ts
apps/api/
  src/main.ts src/app.module.ts src/bootstrap.ts
  src/common/  errors.ts all-exceptions.filter.ts zod.pipe.ts decorators.ts
               session.guard.ts csrf.guard.ts permission.guard.ts ownership.ts current-user.ts
  src/modules/ health/ prisma/ auth/ users/ audit/ settings/
  scripts/seed.ts  scripts/seed-data.ts
  test/ setup-env.ts global-setup.ts harness.ts  *.e2e.test.ts
apps/web/
  src/main.tsx src/app/router.tsx src/app/nav.ts src/app/AppLayout.tsx src/app/guards.tsx
  src/lib/api.ts src/features/auth/* src/pages/*
```

---

### Task 1: Workspace scaffold (P1-1)

**Files:**

- Create: `packages/typescript-config/{package.json,base.json,library.json,nest.json,react.json}` — copy from
  `/Volumes/Data/Projects/React/PayOS/payos/packages/typescript-config/`, rename package to
  `@salescrm/typescript-config`.
- Create: `packages/eslint-config/{package.json,base.js,react.js}` — copy from PayOS `packages/eslint-config/`,
  rename to `@salescrm/eslint-config`.
- Create: `packages/{types,core,config,schemas,auth,database,ui}/` each with `package.json` (PayOS
  `packages/types/package.json` shape: tsup dual ESM/CJS, `exports["."].source = ./src/index.ts`), `tsconfig.json`
  extending `library.json`, `eslint.config.mjs`, `tsup.config.ts`, `src/index.ts`.
- Create: `apps/api/` (Nest: `nest-cli.json`, `tsconfig.json` extending `nest.json`, `tsconfig.build.json`,
  `vitest.config.ts` copied from PayOS `apps/api/vitest.config.ts`, `eslint.config.mjs` copied from PayOS
  `apps/api/eslint.config.mjs`), `src/main.ts`, `src/app.module.ts`, `src/modules/health/health.controller.ts`.
- Create: `apps/web/` (Vite React TS: `index.html`, `vite.config.ts`, `src/main.tsx`, `tsconfig.json` extending
  `react.json`, `eslint.config.mjs` using `@salescrm/eslint-config/react`).
- Create: `scripts/with-env.mjs` — copy PayOS `scripts/with-env.mjs` verbatim.
- Modify: `package.json` (scripts below), `pnpm-workspace.yaml` (`allowBuilds`: add `@swc/core: true`,
  `'@embedded-postgres/darwin-arm64': true`, `'@embedded-postgres/darwin-x64': true`,
  `'@embedded-postgres/linux-x64': true`, `'@embedded-postgres/linux-arm64': true`), `docs/04-architecture.md`
  (add `typescript-config` and `eslint-config` to the layout).
- Test: `apps/api/test/health.e2e.test.ts`

**Interfaces:**

- Produces: `GET /api/v1/health` → `200 { "status": "ok" }`. Root scripts: `dev`, `dev:api`
  (`pnpm --filter @salescrm/api dev`), `dev:web` (`pnpm --filter @salescrm/web dev`). Workspace dependency
  `"@salescrm/<name>": "workspace:*"`.

- [ ] **Step 1: Write the failing test** `apps/api/test/health.e2e.test.ts`: create the Nest app from `AppModule`
      with global prefix `api/v1`, `GET /api/v1/health` → status 200, body `{ status: 'ok' }`.
- [ ] **Step 2: Run** `pnpm install && pnpm --filter @salescrm/api test` — Expected: FAIL (module/controller missing).
- [ ] **Step 3: Implement** `HealthController` (`@Get('health')` returns `{ status: 'ok' }`), `AppModule`,
      `main.ts` (`app.setGlobalPrefix('api/v1')`, `listen(4000)`). Web: `main.tsx` renders `<h1>SalesCRM</h1>`;
      `vite.config.ts` uses `@vitejs/plugin-react`, `@tailwindcss/vite`, port 5173, `server.proxy['/api'] =
'http://localhost:4000'`. Each library package exports `export {};` from `src/index.ts` and uses
      `"test": "vitest run --passWithNoTests"` until it has tests.
- [ ] **Step 4: Verify** `pnpm --filter @salescrm/api test` PASS; `pnpm verify` PASS; `pnpm dev` serves
      http://localhost:5173 and `curl localhost:5173/api/v1/health` returns `{"status":"ok"}` through the proxy.
- [ ] **Step 5: Commit** `build: scaffold monorepo apps and packages` (include docs/04 and docs/17).

---

### Task 2: Money and period helpers (P1-3)

**Files:**

- Create: `packages/types/src/money.ts`; Modify: `packages/types/src/index.ts`
- Create: `packages/core/src/period.ts`; Modify: `packages/core/src/index.ts`
- Test: `packages/types/test/money.test.ts`, `packages/core/test/period.test.ts`

**Interfaces:**

- Produces (`@salescrm/types`):
  - `class MoneyParseError extends Error`
  - `currencyDigits(currency: string): number` — from `Intl.NumberFormat('en', { style: 'currency', currency })
.resolvedOptions().maximumFractionDigits`
  - `toMinor(input: string, currency: string): bigint`
  - `formatMoney(minor: bigint, currency: string, locale?: string): string` — default locale `en-IN`
  - `sumMinor(values: readonly bigint[]): bigint`
  - `minorToJson(minor: bigint): number` — throws `RangeError` beyond `Number.MAX_SAFE_INTEGER`
  - `minorFromJson(value: number): bigint` — throws `RangeError` unless `Number.isSafeInteger(value)`
- Produces (`@salescrm/core`):
  - `type IsoDate = string` (`YYYY-MM-DD`)
  - `todayIn(timezone: string, now: Date): IsoDate`
  - `fyOf(date: IsoDate, fyStartMonth: number): { label: string; start: IsoDate; end: IsoDate }`
  - `quarterOf(date: IsoDate, fyStartMonth: number, basis: 'fy' | 'calendar'): { label: 'Q1' | 'Q2' | 'Q3' | 'Q4'; start: IsoDate; end: IsoDate }`

- [ ] **Step 1: Write failing tests** (test names start with the rule id):

```ts
// money.test.ts
test('M-1 toMinor parses exact decimals', () => {
  expect(toMinor('1250', 'INR')).toBe(125000n);
  expect(toMinor('1,25,000.50', 'INR')).toBe(12500050n);
  expect(toMinor('0.1', 'USD')).toBe(10n);
  expect(toMinor(' 99.99 ', 'USD')).toBe(9999n);
});
test.each(['12.345', '-5', '', '1e5', 'abc', '1.2.3', ',100'])('M-1 toMinor rejects %j', (s) =>
  expect(() => toMinor(s, 'INR')).toThrow(MoneyParseError),
);
test('M-2 formatMoney uses locale and currency', () => {
  expect(formatMoney(12500050n, 'INR')).toBe('₹1,25,000.50');
  expect(formatMoney(1250000n, 'USD', 'en-US')).toBe('$12,500.00');
});
test('minorToJson guards precision', () => {
  expect(minorToJson(123n)).toBe(123);
  expect(() => minorToJson(2n ** 60n)).toThrow(RangeError);
  expect(() => minorFromJson(1.5)).toThrow(RangeError);
});
// period.test.ts
test('PR-1 fyOf with April start', () => {
  expect(fyOf('2026-03-31', 4)).toEqual({ label: '2025-26', start: '2025-04-01', end: '2026-03-31' });
  expect(fyOf('2026-04-01', 4)).toEqual({ label: '2026-27', start: '2026-04-01', end: '2027-03-31' });
  expect(fyOf('2026-10-29', 1)).toEqual({ label: '2026', start: '2026-01-01', end: '2026-12-31' });
});
test('PR-2 quarterOf', () => {
  expect(quarterOf('2026-10-29', 4, 'fy')).toEqual({ label: 'Q3', start: '2026-10-01', end: '2026-12-31' });
  expect(quarterOf('2027-02-10', 4, 'fy')).toEqual({ label: 'Q4', start: '2027-01-01', end: '2027-03-31' });
  expect(quarterOf('2026-10-29', 4, 'calendar')).toEqual({ label: 'Q4', start: '2026-10-01', end: '2026-12-31' });
});
test('todayIn uses the company timezone', () => {
  expect(todayIn('Asia/Kolkata', new Date('2026-10-29T20:00:00Z'))).toBe('2026-10-30');
  expect(todayIn('UTC', new Date('2026-10-29T20:00:00Z'))).toBe('2026-10-29');
});
```

- [ ] **Step 2: Run** `pnpm --filter @salescrm/types --filter @salescrm/core test` — Expected: FAIL (not defined).
- [ ] **Step 3: Implement.** `toMinor`: trim; accept `^\d{1,3}(,\d{2,3})*(\.\d+)?$|^\d+(\.\d+)?$`; reject fraction
      longer than `currencyDigits`; build the bigint from the digit string (no floats). `formatMoney`: split into
      integer/fraction strings and pass the decimal **string** to `Intl.NumberFormat(locale, { style: 'currency',
currency }).format(...)`. Period functions do date maths on `{y, m, d}` integers, never on `Date` arithmetic;
      `todayIn` uses `Intl.DateTimeFormat('en-CA', { timeZone })`.
- [ ] **Step 4: Run** the same command — Expected: PASS. `pnpm security:check` PASS.
- [ ] **Step 5: Commit** `feat(core): money and financial period helpers`.

---

### Task 3: Config, API bootstrap and error handling (P1-4)

**Files:**

- Create: `packages/config/src/index.ts`; `packages/config/test/config.test.ts`
- Create: `apps/api/src/bootstrap.ts`, `apps/api/src/common/{errors.ts,all-exceptions.filter.ts,zod.pipe.ts}`
- Create: `packages/schemas/src/common.ts` (`apiErrorSchema`, `paginationQuerySchema`)
- Modify: `apps/api/src/main.ts`, `.env.example`, `.github/workflows/ci.yml`, `turbo.json`
- Test: `apps/api/test/errors.e2e.test.ts`

**Interfaces:**

- Consumes: `minorToJson` (Task 2).
- Produces:
  - `loadConfig(env: NodeJS.ProcessEnv): AppConfig` where `AppConfig = { nodeEnv: 'development' | 'test' |
'production'; port: number; databaseUrl: string; sessionSecret: string; webOrigin: string; cookieSecure: boolean;
logLevel: string }`; throws `ConfigError` listing every bad key.
  - `configureApp(app: INestApplication, config: AppConfig): void` — prefix `api/v1`, helmet, cookie-parser,
    `AllExceptionsFilter`, Express `json replacer` turning `bigint` into `minorToJson(v)`. Used by `main.ts` and tests.
  - `class AppError extends Error { status: number; code: string; details?: unknown }` with factories
    `unauthenticated()`, `forbidden()`, `notFound()`, `conflict(code: string, message: string)`, `rateLimited()`.
  - `class RuleViolation extends AppError` — `new RuleViolation(rule: string, message: string)` → 400
    `VALIDATION_FAILED`, `details: { rule }`.
  - `class ZodValidationPipe implements PipeTransform` — `new ZodValidationPipe(schema)`; failure → 400
    `VALIDATION_FAILED`, `details` = Zod issues `{ path, message }[]`.
  - `paginationQuerySchema` → `{ page: number (≥1, default 1); pageSize: number (1–100, default 25) }`.
- Env keys (replace `JWT_ACCESS_SECRET` and `ENCRYPTION_KEY` everywhere): `PORT` (default 4000), `DATABASE_URL`,
  `TEST_DATABASE_URL`, `SESSION_SECRET` (≥ 32 chars), `WEB_ORIGIN` (default `http://localhost:5173`),
  `COOKIE_SECURE` (default `false`), `LOG_LEVEL` (default `info`). Remove `VITE_API_URL`.

- [ ] **Step 1: Write failing tests.** `config.test.ts`: valid env → typed config with defaults; missing
      `DATABASE_URL` and 10-char `SESSION_SECRET` → one `ConfigError` whose message names both keys; `nodeEnv:
'production'` with `COOKIE_SECURE=false` or a `SESSION_SECRET` containing `ci-only` or `change-me` → throws.
      `errors.e2e.test.ts` (test-only controller registered in the test module): throwing
      `new RuleViolation('P-2', 'Amount exceeds balance')` → 400 `{ error: { code: 'VALIDATION_FAILED', message:
'Amount exceeds balance', details: { rule: 'P-2' } } }`; posting `{}` to a route with
      `ZodValidationPipe(z.object({ name: z.string() }))` → 400 with `details[0].path` `['name']`; unknown route → 404
      `NOT_FOUND`; handler returning `{ amountMinor: 125000n }` → JSON `{ "amountMinor": 125000 }`; an unexpected
      `Error('boom')` → 500 `INTERNAL` and the message `boom` is **not** in the body.
- [ ] **Step 2: Run** `pnpm --filter @salescrm/config --filter @salescrm/api test` — Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above. Logger: `nestjs-pino` with `redact: ['req.headers.cookie',
'req.headers["x-csrf-token"]', 'req.body.password', 'res.headers["set-cookie"]']`.
- [ ] **Step 4: Run** the same command — PASS. Boot with an empty env (`pnpm dev:api`) — process exits with the
      `ConfigError` listing missing keys.
- [ ] **Step 5: Commit** `feat(api): config validation and error contract` (CI/env/turbo changes included).

---

### Task 4: Database schema, triggers and test database (P1-2)

**Files:**

- Create: `scripts/local-postgres.mjs` — copy PayOS `scripts/local-postgres.mjs`; user/password `salescrm`,
  databases `salescrm`, `salescrm_test`.
- Create: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/<ts>_init/migration.sql`,
  `packages/database/src/index.ts`, `packages/database/src/testing.ts`
- Create: `apps/api/src/modules/prisma/prisma.module.ts` (global `PrismaService extends PrismaClient`)
- Create: `apps/api/test/{global-setup.ts,setup-env.ts}`; Modify `apps/api/vitest.config.ts` (`globalSetup`)
- Modify: root `package.json` scripts `db:local`, `db:generate`, `db:migrate`, `db:migrate:dev`, `db:reset`
  (same shapes as PayOS `package.json`, filter `@salescrm/database`); `devDependencies` add `embedded-postgres`.
- Modify: `docs/05-data-model.md` (add `Session`, `AuthToken`, `LoginAttempt` field tables)
- Test: `packages/database/test/triggers.test.ts`

**Interfaces:**

- Produces:
  - Prisma models exactly as [05](05-data-model.md) (User, Client, ClientContact, Project, UpsellEntry, Milestone,
    Payment, Document, AuditLog, Setting) plus:
    - `Session { id, tokenHash @unique, userId, createdAt, lastSeenAt, expiresAt, ip?, userAgent? }`
    - `AuthToken { id, kind: INVITE | RESET, tokenHash @unique, email, name?, role?, userId?, expiresAt, usedAt?, createdById }`
    - `LoginAttempt { id, email, ip, success, at }` with index `(email, ip, at)`
  - Enums: `Role { ADMIN SALES CEO }`, `ProjectStatus { LEAD PROPOSAL WON ACTIVE ON_HOLD COMPLETED LOST }`,
    `DurationUnit { WEEKS MONTHS }`, `DocumentType { PROPOSAL SOW CONTRACT INVOICE OTHER }`, `AuthTokenKind`.
  - Money columns `BigInt` named `…Minor`; calendar dates `@db.Date`; indexes per 05 § Indexes.
  - `@salescrm/database`: `createPrismaClient(url?: string): PrismaClient`, re-export `Prisma`, enums and model types.
  - `@salescrm/database/testing`: `resetDatabase(prisma: PrismaClient): Promise<void>` — `TRUNCATE … RESTART
IDENTITY CASCADE` on every table except `_prisma_migrations`.
  - Vitest global setup (API and `packages/database`): load the root `.env` with `process.loadEnvFile` when present
    (CI provides env directly), set `DATABASE_URL = TEST_DATABASE_URL`, run `prisma migrate deploy` once. From this
    task on, API tests need `pnpm db:local` running (or CI's Postgres service).

- [ ] **Step 1: Write failing test** `triggers.test.ts` (uses `TEST_DATABASE_URL`, `resetDatabase` before each):
  - `P-4 payment amount cannot be updated`: insert user/client/project/milestone/payment(amountMinor 5000n);
    `prisma.payment.update({ data: { amountMinor: 1n } })` rejects with message containing `payment_immutable`.
  - `P-4 invoiceId, paymentDate, milestoneLabel, note can be updated`: update succeeds.
  - `P-7 payment cannot be deleted`: `delete` rejects (`payment_immutable`).
  - `audit log is append-only`: update and delete of an `AuditLog` row reject (`append_only`).
  - `bigint round trip`: `amountMinor` `9007199254740991n` reads back identical.
- [ ] **Step 2: Run** `pnpm db:local` (separate terminal), then `pnpm --filter @salescrm/database test` — FAIL.
- [ ] **Step 3: Implement** the schema; `pnpm db:migrate:dev --name init --create-only`; append to the generated
      SQL by hand:

```sql
CREATE FUNCTION crm_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append_only: % on % is not allowed', TG_OP, TG_TABLE_NAME; END $$;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION crm_forbid_mutation();

CREATE FUNCTION payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'payment_immutable: payments cannot be deleted'; END IF;
  IF NEW."amountMinor" <> OLD."amountMinor" OR NEW."milestoneId" <> OLD."milestoneId"
     OR NEW."reversesPaymentId" IS DISTINCT FROM OLD."reversesPaymentId" THEN
    RAISE EXCEPTION 'payment_immutable: amount, milestone and reversal link cannot change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_guard BEFORE UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION payment_guard();
```

Then run `pnpm db:migrate:dev` to apply it. `resetDatabase` does not trip the triggers (TRUNCATE does not fire row
triggers).

- [ ] **Step 4: Run** `pnpm --filter @salescrm/database test` — PASS. `pnpm guard:integrity` — PASS (no forbidden
      SQL). `pnpm --filter @salescrm/api test` still PASS against the test DB.
- [ ] **Step 5: Commit** `feat(database): schema, money guards and test database` (with docs/05, docs/17).

---

### Task 5: Authentication — login, sessions, CSRF, rate limit (P1-5)

**Files:**

- Create: `packages/auth/src/{password.ts,tokens.ts,index.ts}`, `packages/auth/test/tokens.test.ts`
- Create: `packages/schemas/src/auth.ts` (`emailSchema`, `passwordSchema`, `loginSchema`, `sessionResponseSchema`)
- Create: `apps/api/src/modules/auth/{auth.module.ts,auth.controller.ts,auth.service.ts,session.service.ts}`
- Create: `apps/api/src/common/{session.guard.ts,csrf.guard.ts,current-user.ts,decorators.ts}`
- Create: `apps/api/test/harness.ts`; Test: `apps/api/test/auth.e2e.test.ts`

**Interfaces:**

- Consumes: `AppConfig.sessionSecret`, `webOrigin`, `cookieSecure` (Task 3); Prisma models (Task 4).
- Produces:
  - `@salescrm/auth`: `hashPassword(plain: string): Promise<string>` (argon2id), `verifyPassword(hash: string,
plain: string): Promise<boolean>`, `generateToken(): string` (32 random bytes, base64url), `hashToken(token:
string, secret: string): string` (HMAC-SHA256 hex), `csrfTokenFor(sessionToken: string, secret: string): string`
    (`hashToken('csrf:' + token, secret)`), `safeEqual(a: string, b: string): boolean`.
  - `@salescrm/schemas`: `emailSchema` (trim + lowercase + email), `passwordSchema` (10–128 chars), `loginSchema
= { email, password }`, `sessionResponseSchema = { user: { id, name, email, role }, csrfToken: string }`.
  - API: `POST /auth/login` → 200 `sessionResponse` + `Set-Cookie: sc_session`; `POST /auth/logout` → 204 and
    cookie cleared; `GET /auth/session` → 200 `sessionResponse` or 401.
  - `SessionService`: `create(userId, ip, ua): Promise<{ token: string }>`, `resolve(token): Promise<SessionUser |
null>`, `revokeAllForUser(userId): Promise<void>`. `SessionUser = { id; name; email; role: Role; sessionId }`.
  - Decorators: `@Public()`, `@CurrentUser()`. Global guards registered in order `SessionGuard`, `CsrfGuard`.
  - `harness.ts`: `createTestApp(): Promise<{ app; prisma }>`; `createUser(prisma, { role, email?, password?,
active? }): Promise<User>`; `loginAs(app, prisma, role): Promise<{ agent: SuperAgentTest; user; csrf: string }>`.

- [ ] **Step 1: Write failing tests** `auth.e2e.test.ts`:
  - `login sets an httpOnly session cookie`: correct credentials → 200, `set-cookie` contains `sc_session=`,
    `HttpOnly`, `SameSite=Lax`, `Path=/`; body matches `sessionResponseSchema`.
  - `login normalises email` (Review Focus 1): user `admin@example.com`, login with `" Admin@Example.com "` → 200.
  - `wrong password, unknown email and inactive user give the same 401`: each → 401 code `UNAUTHENTICATED`,
    identical message `Invalid email or password`.
  - `rate limit after 5 failures`: 5 wrong attempts → 401; 6th (even with the right password) → 429 `RATE_LIMITED`.
  - `CSRF required on mutations` (Review Focus 5): `POST /auth/logout` without `X-CSRF-Token` → 403; with wrong
    token → 403; with `csrf` from `loginAs` → 204.
  - `foreign origin login refused` (Review Focus 5): `Origin: https://evil.test` → 403.
  - `idle and absolute expiry`: set `lastSeenAt` 13 h ago → `GET /auth/session` 401; set `expiresAt` in the past → 401.
  - `logout revokes the session`: after logout the old cookie → 401.
  - `session token is stored hashed`: `Session.tokenHash` ≠ cookie value and equals `hashToken(cookieValue, secret)`.
- [ ] **Step 2: Run** `pnpm --filter @salescrm/auth --filter @salescrm/api test` — FAIL.
- [ ] **Step 3: Implement.** Failures (unknown email included) record a `LoginAttempt`; unknown email still runs
      `verifyPassword` against a fixed dummy hash (equal timing). Count failures in the last 15 min per (email, ip)
      before verifying. `resolve` rejects idle > 12 h or past `expiresAt` (created + 7 days), updates `lastSeenAt`
      at most every 5 min. `CsrfGuard`: for non-GET/HEAD/OPTIONS, require `Origin` (when present) === `webOrigin`; for
      authenticated requests also require `safeEqual(header, csrfTokenFor(token, secret))`.
- [ ] **Step 4: Run** the same command — PASS.
- [ ] **Step 5: Commit** `feat(auth): login, sessions, csrf and rate limiting` (docs/17).

---

### Task 6: Permissions, audit and settings (P1-6)

**Files:**

- Create: `packages/auth/src/permissions.ts`, `packages/auth/test/permissions.test.ts`
- Create: `packages/core/src/audit-diff.ts`, `packages/core/test/audit-diff.test.ts`
- Create: `apps/api/src/common/{permission.guard.ts,ownership.ts}`; Modify `decorators.ts`
- Create: `apps/api/src/modules/audit/{audit.module.ts,audit.service.ts,audit.controller.ts}`
- Create: `apps/api/src/modules/settings/{settings.module.ts,settings.controller.ts,settings.service.ts}`
- Create: `packages/schemas/src/settings.ts`
- Modify: `docs/04-architecture.md` (D-012 wording), `docs/15-decisions-and-open-questions.md` (D-010–D-012)
- Test: `apps/api/test/permissions.e2e.test.ts`, `apps/api/test/settings.e2e.test.ts`

**Interfaces:**

- Consumes: `SessionUser`, `@CurrentUser()` (Task 5).
- Produces:
  - `type Role = 'ADMIN' | 'SALES' | 'CEO'`; `type Scope = 'all' | 'own' | false`; `type Permission` = the 16 keys in
    [07](07-roles-and-permissions.md#permission-matrix); `PERMISSIONS: Record<Permission, Record<Role, Scope>>`
    (✓ → `'all'`, "own" → `'own'`, "own data" → `'own'`, — → `false`; `projects.read` SALES `'all'` per Q-01 default).
  - `scopeFor(role: Role, permission: Permission): Scope`; `can(user: { id: string; role: Role }, permission:
Permission, resource?: { ownerId: string }): boolean`.
  - Decorators `@RequirePermission(permission)`, `@Authenticated()` (any logged-in user). `PermissionGuard`
    (global, after `CsrfGuard`) is **default-deny**: a non-`@Public` handler with neither decorator → 403.
  - `assertCanAccess(user: SessionUser, permission: Permission, ownerId: string, mode: 'read' | 'write'): void` —
    throws `notFound()` when `mode` is `'read'`, `forbidden()` when `'write'`; `ownerWhere(user: SessionUser,
permission: Permission): { ownerId?: string }` (`{}` for scope `'all'`).
  - `changedFields(before: Record<string, unknown>, after: Record<string, unknown>): { before: Record<string,
unknown>; after: Record<string, unknown> } | null` — only differing keys, bigint → string.
  - `AuditService.record(tx: Prisma.TransactionClient, entry: { actorId: string; action: string; entity: string;
entityId: string; before?: object; after?: object; ip?: string }): Promise<void>`.
  - `GET /audit?entity=&entityId=&page=&pageSize=` (`audit.read`), `GET /settings` (`@Authenticated`),
    `PATCH /settings` (`settings.manage`, audited as `settings.update`).
  - `settingsSchema = { companyName: string; baseCurrency: string (3 letters); fyStartMonth: 1–12; timezone: IANA
string; dueSoonDays: 1–60 }`; `updateSettingsSchema = settingsSchema.partial()`. Setting row created with the
    defaults on first read.

- [ ] **Step 1: Write failing tests.**
  - `permissions.test.ts`: one `test.each` row per line of the doc-07 matrix asserting `scopeFor` for all three
    roles (16 rows); `can(sales, 'projects.write', { ownerId: sales.id })` true, other owner false;
    `can(ceo, 'payments.create')` false.
  - `audit-diff.test.ts`: `changedFields({ a: 1, b: 2n }, { a: 1, b: 3n })` → `{ before: { b: '2' }, after:
{ b: '3' } }`; identical objects → `null`.
  - `permissions.e2e.test.ts`: a test-only handler without decorators → 403 for ADMIN; `GET /audit` → 200 ADMIN,
    200 CEO, 403 SALES; unauthenticated → 401.
  - `settings.e2e.test.ts`: `GET /settings` returns defaults `{ baseCurrency: 'INR', fyStartMonth: 4, timezone:
'Asia/Kolkata', dueSoonDays: 7 }`; `PATCH` by ADMIN → 200 and one `AuditLog` row `settings.update` with
    before/after of changed keys only; `PATCH` by CEO and SALES → 403; `fyStartMonth: 13` → 400.
- [ ] **Step 2: Run** `pnpm --filter @salescrm/auth --filter @salescrm/core --filter @salescrm/api test` — FAIL.
- [ ] **Step 3: Implement** the interfaces. Settings update and audit insert share one `prisma.$transaction`.
- [ ] **Step 4: Run** the same command — PASS.
- [ ] **Step 5: Commit** `feat(auth): permission matrix, audit log and settings` (docs/04, 15, 17).

---

### Task 7: Users, invites and password reset links (P1-5 / P1-6)

**Files:**

- Create: `packages/schemas/src/users.ts`
- Create: `apps/api/src/modules/users/{users.module.ts,users.controller.ts,users.service.ts}`
- Modify: `apps/api/src/modules/auth/{auth.controller.ts,auth.service.ts}` (accept invite, reset password)
- Modify: `docs/07-roles-and-permissions.md`, `docs/08-screens-and-flows.md` (S10), `docs/10-api-spec.md` (D-010:
  remove `/auth/password/forgot`, add `POST /users/:id/reset-link`, add 409 code `LAST_ADMIN`)
- Test: `apps/api/test/users.e2e.test.ts`

**Interfaces:**

- Consumes: `generateToken`, `hashToken`, `hashPassword`, `SessionService.revokeAllForUser` (Task 5);
  `@RequirePermission`, `AuditService.record` (Task 6).
- Produces:
  - `inviteUserSchema = { email, name: string (1–100), role: Role }` → `POST /users/invite` (`users.manage`) → 201
    `{ inviteUrl: '<webOrigin>/invite/<token>', expiresAt }` (72 h). Existing active email → 409 `CONFLICT`.
  - `GET /users` (`users.manage`) → `{ items: { id, name, email, role, active, lastLoginAt }[] }`.
  - `updateUserSchema = { role?: Role; active?: boolean }` → `PATCH /users/:id` (`users.manage`), audited
    `user.update`; changing role or deactivating calls `revokeAllForUser`.
  - `POST /users/:id/reset-link` (`users.manage`) → 201 `{ resetUrl: '<webOrigin>/reset/<token>', expiresAt }` (24 h).
  - `acceptInviteSchema = { token, name, password }` → `POST /auth/invite/accept` (`@Public`) → 200
    `sessionResponse` (creates user, marks token used, logs in).
  - `resetPasswordSchema = { token, password }` → `POST /auth/password/reset` (`@Public`) → 204; revokes all sessions.
  - Tokens are single-use: stored as `hashToken`, `usedAt` set in the same transaction.

- [ ] **Step 1: Write failing tests** `users.e2e.test.ts`:
  - `admin invites, invitee accepts and is logged in as that role`.
  - `invite token is single use and expires`: second accept → 400 `VALIDATION_FAILED`; token older than 72 h → 400.
  - `SALES and CEO cannot manage users`: `POST /users/invite`, `GET /users`, `PATCH /users/:id` → 403.
  - `deactivated user loses access immediately` (Review Focus 2): user logged in; admin sets `active: false` →
    user's next `GET /auth/session` → 401.
  - `role change ends sessions` (Review Focus 2): SALES promoted to CEO → old session 401; new login has role CEO.
  - `last admin protected` (Review Focus 4): the only ADMIN demoting or deactivating themself → 409 `LAST_ADMIN`;
    with a second active ADMIN it succeeds.
  - `reset link sets a new password and revokes sessions`.
  - `user changes are audited`: `PATCH` writes `AuditLog` `user.update` with `before.role`/`after.role`.
- [ ] **Step 2: Run** `pnpm --filter @salescrm/api test -- users` — FAIL.
- [ ] **Step 3: Implement** the interfaces; last-admin check counts active ADMINs inside the update transaction.
- [ ] **Step 4: Run** `pnpm --filter @salescrm/api test` — PASS.
- [ ] **Step 5: Commit** `feat(users): invites, roles, deactivation and reset links` (docs/07, 08, 10, 17).

---

### Task 8: Seed data (P1-8)

**Files:**

- Create: `apps/api/scripts/seed.ts`, `apps/api/scripts/seed-data.ts`
- Modify: `apps/api/package.json` (`"seed": "node ../../scripts/with-env.mjs tsx scripts/seed.ts"`), root
  `package.json` (`"db:seed": "pnpm --filter @salescrm/api seed"`), `.env.example` (`SEED_PASSWORD=`),
  `docs/09-dashboard-spec.md` (§ Acceptance: 4 users — 1 Admin, 2 Sales, 1 CEO)
- Test: `apps/api/test/seed.e2e.test.ts`

**Interfaces:**

- Consumes: `hashPassword` (Task 5), `toMinor` (Task 2), `todayIn`, `fyOf` (Task 2), Prisma models (Task 4).
- Produces: `buildSeed(today: IsoDate, random: () => number): SeedData` (pure, in `seed-data.ts`) and
  `runSeed(prisma: PrismaClient, opts: { today: IsoDate; password: string }): Promise<SeedSummary>` (in `seed.ts`,
  which also has the CLI entry). `random` is a deterministic mulberry32 with seed `20261029`.
- Dataset: users `admin@salescrm.test` (ADMIN), `sales1@salescrm.test`, `sales2@salescrm.test` (SALES),
  `ceo@salescrm.test` (CEO), password from `SEED_PASSWORD` (default `salescrm-dev-only`); 15 clients each with a
  primary contact; 40 projects spread over the previous and current FY relative to `today` (statuses: 4 LEAD,
  4 PROPOSAL, 4 WON, 14 ACTIVE, 2 ON_HOLD, 9 COMPLETED, 3 LOST); 4 upsell projects (`parentProjectId`, same client)
  and 6 upsell entries; 2–5 milestones per WON/ACTIVE/ON_HOLD/COMPLETED project; payments so that there are fully
  paid, partially paid, overdue (some > 90 days) and future milestones; one payment with a reversal; one `Setting`
  row with defaults.
- CLI refuses to run when `NODE_ENV=production`; clears data with `resetDatabase` first; prints the summary and the
  four login emails (never the password).

- [ ] **Step 1: Write failing test** `seed.e2e.test.ts` (`runSeed` with `today: '2026-10-29'`):
  - counts: 4 users, 15 clients, 40 projects, project statuses exactly as listed, 4 projects with a parent, 6 upsell
    entries.
  - invariants: every milestone's `Σ payment.amountMinor ≤ amountMinor` (P-2); every ACTIVE project has ≥ 1
    milestone and all milestones have a `dueDate` (PS-4); every upsell project's client equals its parent's (U-2);
    no `paymentDate` after `today` (P-6); LOST projects have no payments (PS-6).
  - coverage: ≥ 1 overdue milestone with `dueDate` ≥ 90 days before today; ≥ 1 partially paid; ≥ 1 reversal row.
  - determinism: two runs produce identical project names and amounts.
- [ ] **Step 2: Run** `pnpm --filter @salescrm/api test -- seed` — FAIL.
- [ ] **Step 3: Implement** `buildSeed` / `runSeed`; inserts in one transaction; amounts via `toMinor` on round
      rupee strings (₹50,000–₹25,00,000).
- [ ] **Step 4: Run** the test — PASS; `pnpm db:seed` against the dev DB prints the summary.
- [ ] **Step 5: Commit** `feat(database): deterministic demo seed` (docs/09, docs/17).

---

### Task 9: Web shell — login, layout, role-based navigation (P1-7)

**Files:**

- Create: `packages/ui/src/{styles.css,lib/cn.ts,index.ts}` and components `button`, `input`, `label`, `card`,
  `skeleton`, `dropdown-menu`, `sonner` (toaster) — added with the shadcn CLI in monorepo mode, committed as source.
  `styles.css` defines the token names from [16](16-theme-and-animation.md) (colour, status, radius, motion) with
  neutral light and dark values.
- Create: `apps/web/src/lib/api.ts`, `apps/web/src/features/auth/{api.ts,LoginPage.tsx,AcceptInvitePage.tsx,
ResetPasswordPage.tsx}`, `apps/web/src/app/{router.tsx,nav.ts,AppLayout.tsx,guards.tsx}`,
  `apps/web/src/pages/{DashboardPage,InvoicesPage,ProjectsPage,BillingPage,ClientsPage,SettingsPage,AuditPage,
ForbiddenPage,NotFoundPage}.tsx` (placeholders: heading + "Coming in Phase N")
- Modify: `docs/04-architecture.md` (D-011 same-origin API, Netlify rewrite `/api/* → API`)
- Test: `apps/web/src/app/nav.test.ts`, `apps/web/src/app/guards.test.tsx`, `apps/web/src/features/auth/LoginPage.test.tsx`

**Interfaces:**

- Consumes: `can`, `Permission`, `Role` (Task 6); `loginSchema`, `sessionResponseSchema`, `acceptInviteSchema`,
  `resetPasswordSchema`, `apiErrorSchema` (Tasks 3, 5, 7).
- Produces:
  - `class ApiError extends Error { status: number; code: string; details?: unknown }`.
  - `apiFetch<T>(path: string, opts: { method?: string; body?: unknown; schema: ZodType<T> }): Promise<T>` — base
    `/api/v1`, `credentials: 'include'`, adds `X-CSRF-Token` from the session query cache on non-GET, parses errors
    into `ApiError`.
  - `useSession()` (query key `['session']`; 401 → `null`), `useLogin()`, `useLogout()`, `useAcceptInvite()`,
    `useResetPassword()`.
  - `NAV_ITEMS: { label: string; path: string; permission: Permission; icon: LucideIcon }[]` — Dashboard `/`
    `dashboard.own`; Upcoming Invoices `/invoices` `invoices.read`; Projects `/projects` `projects.read`; Completed
    Billing `/billing` `billing.read`; Clients `/clients` `clients.read`; Settings `/settings` `settings.manage`;
    Audit log `/audit` `audit.read`. `visibleNav(user): typeof NAV_ITEMS`.
  - `<RequireAuth>` (no session → redirect `/login?next=<path>`), `<RequirePermission permission>` (lacking →
    `ForbiddenPage`).
  - Routes: public `/login`, `/invite/:token`, `/reset/:token`; protected layout with the seven paths above; `*` →
    `NotFoundPage`.

- [ ] **Step 1: Write failing tests.**
  - `nav.test.ts`: `visibleNav` labels — ADMIN: all seven; SALES: Dashboard, Upcoming Invoices, Projects, Completed
    Billing, Clients; CEO: Dashboard, Upcoming Invoices, Projects, Completed Billing, Clients, Audit log
    (matches [08 § Navigation by role](08-screens-and-flows.md#navigation-by-role)).
  - `guards.test.tsx`: no session at `/projects` → redirected to `/login?next=%2Fprojects`; SALES at `/settings` →
    "You don't have access to this page".
  - `LoginPage.test.tsx`: submitting empty form shows field errors without calling the API; API 401 → shows
    "Invalid email or password"; API 429 → shows "Too many attempts. Try again in 15 minutes."; success navigates to
    `next` or `/`.
- [ ] **Step 2: Run** `pnpm --filter @salescrm/web test` — FAIL.
- [ ] **Step 3: Implement** the interfaces. `AppLayout`: sidebar from `visibleNav`, top bar with user name, role
      badge and logout; `<Toaster />`; respects `prefers-reduced-motion` (Motion `MotionConfig reducedMotion="user"`).
      No tokens in `localStorage`/`sessionStorage` (gate-enforced).
- [ ] **Step 4: Verify** `pnpm --filter @salescrm/web test` PASS; `pnpm verify` PASS. Manual: `pnpm db:local`,
      `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`; log in as each seeded user at desktop width and 375 px, light
      and dark; confirm the sidebar matches the nav test and logout returns to `/login`.
- [ ] **Step 5: Commit** `feat(web): app shell with login and role-based navigation` (docs/04, docs/17 — mark
      Phase 1 done).

---

## Order and parallelism

`1 → (2 ∥ 3) → 4 → 5 → 6 → 7 → 8 → 9`. Task 2 touches only `packages/types` and `packages/core`, so it can run
alongside Task 3. Task 9's layout and `packages/ui` work can start after Task 6 (it needs the permission matrix),
in parallel with Tasks 7–8, if run in a separate worktree.

## Definition of done for Phase 1

All nine commits on `feat/phase-1-foundation`; `pnpm verify` green; [17](17-implementation-status.md) shows P1-1 …
P1-8 done; a seeded login works for all four roles in the browser.
