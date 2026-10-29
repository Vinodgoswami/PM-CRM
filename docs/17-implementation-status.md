# 17 · Implementation status

Updated in every PR. Task ids from [13-roadmap.md](13-roadmap.md).

**Last updated:** 2026-10-29

## Summary

| Phase                  | Status                                          |
| ---------------------- | ----------------------------------------------- |
| 0 Security & docs      | ✅ Done                                         |
| 1 Foundation           | Plan ready: [18](18-plan-phase-1-foundation.md) |
| 2 Clients & projects   | Not started                                     |
| 3 Milestones & billing | Not started                                     |
| 4 Dashboard            | Not started                                     |
| 5 Theme & animation    | Waiting for references (Q-09)                   |
| 6 Launch               | Not started                                     |

## Tasks

| ID   | Status | Branch / PR             | Notes                                                                                            |
| ---- | ------ | ----------------------- | ------------------------------------------------------------------------------------------------ |
| P0-1 | Done   | —                       | Hooks, scanners, CI, CODEOWNERS ported from PayOS; gates verified                                |
| P0-2 | Done   | —                       | Docs 01–17                                                                                       |
| P1-1 | Done   | feat/phase-1-foundation | Monorepo apps/packages scaffolded; health endpoint; dev proxy                                    |
| P1-3 | Done   | feat/phase-1-foundation | Money (toMinor/formatMoney/sumMinor/JSON guards) and FY/quarter/today helpers                    |
| P1-4 | Done   | feat/phase-1-foundation | loadConfig (refuses missing/weak secrets), error contract, bigint JSON, pino redaction           |
| P1-2 | Done   | feat/phase-1-foundation | Prisma schema (docs/05), init migration with payment/audit guard triggers, local + test Postgres |
| P1-5 | Done   | feat/phase-1-foundation | Login/logout/session, argon2id, hashed session tokens, CSRF + origin check, 5-per-15-min limit   |

## Blockers

- None. Open questions have provisional defaults ([15](15-decisions-and-open-questions.md)).

## Known gaps

- GitHub repository not created yet; branch protection pending (P6-3).
- No remote yet; local `main` holds the initial commit, work continues on `development`.
