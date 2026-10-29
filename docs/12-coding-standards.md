# 12 · Coding standards

## General

- TypeScript strict; no `any` (use `unknown` + narrowing). No default exports except React route components.
- Files: `kebab-case.ts`; React components `PascalCase.tsx`; one component per file.
- Keep files small and single-purpose (~300 lines is a signal to split).
- Comments explain **why** (rules, security, edge cases), not what. Reference rule ids: `// P-4: amount is immutable`.
- Formatting: Prettier (`.prettierrc`: single quotes, trailing commas, width 140). Never hand-format.

## Money & dates

- Use helpers from `packages/types/src/money.ts` (`toMinor`, `formatMoney`, `sumMinor`). Never `parseFloat`,
  `Number()` on user money input, or `toFixed` for maths.
- Use `packages/core/src/period.ts` for FY / quarter / "today in company timezone". Never `new Date()` inside
  business logic — pass `today` in, so tests can fix it.

## Backend (NestJS)

- One module per folder under `apps/api/src/modules/<name>/`: `*.module.ts`, `*.controller.ts`, `*.service.ts`,
  `*.repository.ts` (Prisma access only), `*.test.ts`.
- Controllers: parse with Zod pipe, check `@Permission`, call service. No business logic in controllers.
- Services: ownership checks, transactions, audit. Calculations go to `packages/core`.
- Every money-changing write runs in a Prisma transaction that also writes the `AuditLog` row.
- Do not use `import type` for injected classes (breaks Nest DI metadata).
- Errors: throw domain errors (`RuleViolation('P-2', …)`) mapped by the global filter to the shapes in [10](10-api-spec.md).

## Frontend (React)

- Feature folders: `apps/web/src/features/<feature>/` with `api.ts` (TanStack Query hooks), `components/`,
  `routes/`, `schemas` imported from `packages/schemas`.
- Server state only in TanStack Query; local UI state with `useState`/`useReducer`. No global store unless decided.
- Forms: React Hook Form + `zodResolver(sharedSchema)`.
- Use `packages/ui` components and theme tokens; no raw hex colours or ad-hoc durations in features
  (see [16](16-theme-and-animation.md)).
- Permissions: `can('payments.create', project)` from `packages/auth` to show/hide; never as the only check.
- Accessibility: every control labelled, keyboard reachable, focus visible; charts have a table alternative;
  respect `prefers-reduced-motion`.
- Every data view handles loading (skeleton), empty and error states.

## Database

- Change schema via `pnpm db:migrate:dev --name <change>`; commit the generated migration.
- Migrations are **append-only** once on `main` (gate-enforced). Fix forward.
- Triggers/constraints that protect money (payment immutability, audit append-only) live in hand-written SQL in a
  migration and must not be dropped (gate-enforced).

## Testing

| Layer           | Tool                               | Required for                                                        |
| --------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `packages/core` | Vitest                             | Every rule in 06 and formula in 09 (test name includes the rule id) |
| API             | Vitest + Supertest + real Postgres | Every endpoint: happy path, validation, CEO 403, non-owner SALES    |
| Web             | Vitest + Testing Library           | Forms and permission-driven UI                                      |
| E2E             | Playwright                         | Flows F1–F5 from [08](08-screens-and-flows.md)                      |

Bug fixes start with a failing test.

## Git

- Branch from `development` (or `main` until it exists): `feat/<area>-<short>`, `fix/…`.
- Conventional commits, enforced: `feat(payments): mark milestone as paid`. Types: feat, fix, perf, refactor,
  security, docs, test, build, ci, chore, style, revert.
- Small PRs: one task from [13](13-roadmap.md) per PR. PR description lists the task id and docs touched.
- Never `--no-verify` except with a reason in the PR description.

## Definition of done

A task is done when **all** are true:

1. Acceptance criteria in [13](13-roadmap.md) met.
2. `pnpm verify` passes locally; CI green.
3. Tests added at the required layers.
4. Docs updated (05/06/07/09/10 as relevant) and [17-implementation-status.md](17-implementation-status.md) updated.
5. UI tasks: checked in the browser at desktop and 375 px width (light theme only, D-014).
