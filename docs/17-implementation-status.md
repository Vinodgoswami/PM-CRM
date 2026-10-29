# 17 · Implementation status

Updated in every PR. Task ids from [13-roadmap.md](13-roadmap.md).

**Last updated:** 2026-10-29

## Summary

| Phase                  | Status                            |
| ---------------------- | --------------------------------- |
| 0 Security & docs      | ✅ Done                           |
| 1 Foundation           | ✅ Done (reviewed, fixes applied) |
| 2 Clients & projects   | ✅ Done (pending review)          |
| 3 Milestones & billing | Not started                       |
| 4 Dashboard            | Not started                       |
| 5 Theme & animation    | Waiting for references (Q-09)     |
| 6 Launch               | Not started                       |

## Tasks

| ID    | Status | Branch / PR                   | Notes                                                                                                                     |
| ----- | ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| P0-1  | Done   | —                             | Hooks, scanners, CI, CODEOWNERS ported from PayOS; gates verified                                                         |
| P0-2  | Done   | —                             | Docs 01–17                                                                                                                |
| P1-1  | Done   | feat/phase-1-foundation       | Monorepo apps/packages scaffolded; health endpoint; dev proxy                                                             |
| P1-3  | Done   | feat/phase-1-foundation       | Money (toMinor/formatMoney/sumMinor/JSON guards) and FY/quarter/today helpers                                             |
| P1-4  | Done   | feat/phase-1-foundation       | loadConfig (refuses missing/weak secrets), error contract, bigint JSON, pino redaction                                    |
| P1-2  | Done   | feat/phase-1-foundation       | Prisma schema (docs/05), init migration with payment/audit guard triggers, local + test Postgres                          |
| P1-5  | Done   | feat/phase-1-foundation       | Login/logout/session, argon2id, hashed session tokens, CSRF + origin check, 5-per-15-min limit                            |
| P1-6  | Done   | feat/phase-1-foundation       | Permission matrix (shared web/API), default-deny guard, ownership helpers, audit log + GET /audit, settings               |
| P1-5b | Done   | feat/phase-1-foundation       | Users: invite links, accept, role/active changes (sessions ended), last-admin guard, reset links                          |
| P1-8  | Done   | feat/phase-1-foundation       | `pnpm db:seed`: 4 users, 15 clients, 40 projects, overdue/partial/reversal cases, deterministic                           |
| P1-7  | Done   | feat/phase-1-foundation       | Web shell: login / invite / reset pages, role-based sidebar, route guards, theme tokens, motion                           |
| P2-0  | Done   | feat/phase-2-clients-projects | Core rules: PS-1/2/4/6 transitions, D-1 end dates, project totals, U-2 cycle check                                        |
| P2-1  | Done   | feat/phase-2-clients-projects | Clients API: CRUD, search, archive (frees name), contacts, totals; C-2 race-safe via nameKey                              |
| P2-2  | Done   | feat/phase-2-clients-projects | Projects API: create with new client + milestones (C-1), PRJ codes, status rules, owner, filters/sort, optimistic locking |
| P2-3  | Done   | feat/phase-2-clients-projects | Upsell entries (U-1) and upsell project links (U-2: same client, no cycles), also on create                               |
| P2-4  | Done   | feat/phase-2-clients-projects | Documents: local + S3/R2 drivers, signed PUT/GET, confirm checks size/type, allow-list, 25 MB                             |
| P2-5  | Done   | feat/phase-2-clients-projects | Web: projects list (views, search, sort, paging) and detail (totals, status menu, upsells, documents, activity)           |
| P2-6  | Done   | feat/phase-2-clients-projects | Web: project form (client combobox + "Add new client", milestone rows, duplicate-client recovery), edit form              |
| P2-7  | Done   | feat/phase-2-clients-projects | Web: clients list (search, archived), detail (contacts, primary, totals, upsell tree), create/edit/archive                |
| P2-8  | Done   | feat/phase-2-clients-projects | Web: settings (company, users, invite/reset links), audit log page                                                        |

## Blockers

- None. Open questions have provisional defaults ([15](15-decisions-and-open-questions.md)).

## Known gaps

- Abandoned uploads leave PENDING document rows (hidden from lists); no cleanup job yet.

- GitHub repository not created yet; branch protection pending (P6-3).
- No remote yet; local `main` holds the initial commit, work continues on `development`.
