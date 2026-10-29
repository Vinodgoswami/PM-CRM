# 13 · Roadmap

Phases → tasks. Each task is sized for **one agent session and one PR**. IDs are stable: refer to them in branches,
commits and [17-implementation-status.md](17-implementation-status.md).

**Gate:** passed — docs approved 2026-10-29 (D-009 in [15](15-decisions-and-open-questions.md)). Phase 1 may start.

`Deps` = tasks that must be merged first. Tasks with no shared deps can run in parallel (see
[14 § Parallel work](14-agent-playbook.md#parallel-work)).

## Phase 0 — Security & repo hygiene ✅

| ID   | Task                                       | Status |
| ---- | ------------------------------------------ | ------ |
| P0-1 | Port PayOS hooks, scanners, CI, CODEOWNERS | Done   |
| P0-2 | Documentation set (this folder)            | Done   |

## Phase 1 — Foundation

| ID   | Task                                     | Deps       | Acceptance criteria                                                                                                                                                                       |
| ---- | ---------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1 | Scaffold monorepo packages & apps        | —          | `apps/web` (Vite React TS), `apps/api` (Nest), `packages/{types,schemas,core,database,auth,ui,config}` build; `pnpm dev` starts both; `pnpm verify` green; ESLint flat config per package |
| P1-2 | Local Postgres + Prisma schema           | P1-1       | `pnpm db:local`, schema matches [05](05-data-model.md); first migration incl. triggers (payment immutability, audit append-only); `pnpm db:migrate` works                                 |
| P1-3 | Money & period helpers (`types`, `core`) | P1-1       | `toMinor/formatMoney/sumMinor`; FY/quarter/today-in-tz helpers; unit tests for M-1..M-2, PR-1..PR-2                                                                                       |
| P1-4 | Config & env validation                  | P1-1       | API refuses to boot with missing/weak secrets; `.env.example` complete                                                                                                                    |
| P1-5 | Auth: login, sessions, CSRF, invites     | P1-2, P1-4 | Endpoints in [10 § Auth](10-api-spec.md#auth); rate limit; tests incl. expired session, wrong password, CSRF missing                                                                      |
| P1-6 | Permissions & audit infrastructure       | P1-5       | `permissions.ts` matrix = [07](07-roles-and-permissions.md); `@Permission` guard; ownership helper; audit interceptor; tests per role                                                     |
| P1-7 | Web shell                                | P1-1, P1-5 | Login page, layout, role-based sidebar, route guards, session handling, error boundary, toasts; base shadcn components in `packages/ui`                                                   |
| P1-8 | Seed data                                | P1-2       | `pnpm db:seed` creates the dataset described in [09 § Acceptance](09-dashboard-spec.md#acceptance)                                                                                        |

## Phase 2 — Clients & projects

| ID   | Task                               | Deps             | Acceptance criteria                                                                          |
| ---- | ---------------------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| P2-1 | Clients API                        | P1-6             | Endpoints in 10 § Clients; C-2, C-3; role tests                                              |
| P2-2 | Projects API (CRUD, status, owner) | P1-6, P1-3       | PS-1..PS-6, D-1; `POST /projects` with `newClient` + `milestones[]` in one transaction (C-1) |
| P2-3 | Upsells API                        | P2-2             | Entries + parent link; U-1, U-2 (no cycles, same client)                                     |
| P2-4 | Documents API + storage driver     | P2-2             | Local + S3 drivers; signed URLs; mime/size checks; 11 § Files                                |
| P2-5 | Projects list & detail UI          | P1-7, P2-2       | S3, S4 (Overview, Upsells, Documents, Activity tabs)                                         |
| P2-6 | Project form with client combobox  | P1-7, P2-1, P2-2 | S5, flow F1 incl. "+ Add new client"; validation messages per rule id                        |
| P2-7 | Clients UI                         | P2-1, P1-7       | S8 list + basic detail                                                                       |

## Phase 3 — Milestones & billing

| ID   | Task                                 | Deps             | Acceptance criteria                                                                 |
| ---- | ------------------------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| P3-1 | Milestone status & totals in `core`  | P1-3             | MS-3, derived values table in 05; exhaustive unit tests with fixed `today`          |
| P3-2 | Milestones API                       | P2-2, P3-1       | MS-1, MS-2; reorder                                                                 |
| P3-3 | Payments API                         | P3-2             | P-1..P-7; idempotency key; reversal; DB trigger test proves amount can't be updated |
| P3-4 | Milestones tab + Mark-as-paid dialog | P2-5, P3-2, P3-3 | S4 Milestones/Payments tabs, S6, flows F2, F3                                       |
| P3-5 | Upcoming Invoices (API + UI)         | P3-1, P3-2       | S2 grouping, filters, totals, role scoping                                          |
| P3-6 | Completed Billing (API + UI)         | P3-3             | S7 incl. reversals, inline meta edit, CSV                                           |

## Phase 4 — Dashboard

| ID   | Task                              | Deps       | Acceptance criteria                                                      |
| ---- | --------------------------------- | ---------- | ------------------------------------------------------------------------ |
| P4-1 | Metric functions in `core`        | P3-1       | K1–K12, C1–C9 formulas exactly as [09](09-dashboard-spec.md); unit tests |
| P4-2 | Dashboard API                     | P4-1, P3-3 | `/dashboard`, `/team`, `/tables`, `/drilldown`; < 500 ms on seed ×10     |
| P4-3 | Dashboard UI: filters + KPI cards | P4-2, P1-7 | URL-synced filters; 12 cards with delta + sparkline; click-through       |
| P4-4 | Dashboard UI: charts              | P4-2       | C1–C9 in ECharts with drill-down drawer; table alternative per chart     |
| P4-5 | Team performance + tables         | P4-2       | Team table (CEO/Admin), T1–T3                                            |
| P4-6 | Exports                           | P4-3, P4-4 | PDF of current view; CSV datasets                                        |

## Phase 5 — Theme & animation

| ID   | Task                                                         | Deps        | Acceptance criteria                                                                          |
| ---- | ------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------- |
| P5-1 | Fill [16](16-theme-and-animation.md) from owner's references | owner input | Tokens, type scale, motion presets agreed                                                    |
| P5-2 | Apply tokens to `packages/ui`                                | P5-1        | Light + dark; every screen uses tokens only                                                  |
| P5-3 | Motion pass                                                  | P5-2        | Route transitions, count-ups, chart reveal, list/layout animations; reduced-motion respected |

P5-1/P5-2 can start as soon as the theme arrives, in parallel with Phases 2–4.

## Phase 6 — Launch

| ID   | Task                        | Deps | Acceptance criteria                                                                 |
| ---- | --------------------------- | ---- | ----------------------------------------------------------------------------------- |
| P6-1 | E2E suite F1–F5             | P4-* | Playwright green in CI                                                              |
| P6-2 | Staging + production deploy | P6-1 | Hosting per [04](04-architecture.md#environments); backups; manual deploy           |
| P6-3 | GitHub protection           | repo | Settings in [11](11-security.md#github-settings-to-enable-when-the-repo-is-created) |
| P6-4 | Data import (optional)      | P2-* | CSV import of existing clients/projects/milestones/payments                         |

## Later (not scheduled)

Sales targets vs actual (Q-08), multi-currency conversion (Q-03), due/overdue reminders by email/Slack (Q-06),
detailed client section, invoice generation.
