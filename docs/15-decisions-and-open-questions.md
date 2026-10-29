# 15 · Decisions & open questions

## Decisions

| ID    | Date       | Decision                                                                                     | Why / source                                                     |
| ----- | ---------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| D-001 | 2026-10-29 | Build custom, not buy (Productive/Scoro/Twenty/Odoo checked)                                 | [02](02-market-research.md)                                      |
| D-002 | 2026-10-29 | Stack: React 19 + Vite, NestJS + Prisma + Postgres, pnpm + Turborepo (PayOS family)          | [03](03-tech-stack.md)                                           |
| D-003 | 2026-10-29 | Repo gates ported from PayOS                                                                 | Owner request                                                    |
| D-004 | 2026-10-29 | Roles ADMIN / SALES / CEO; CEO sees performance dashboard + all upcoming invoices, read-only | Owner request                                                    |
| D-005 | 2026-10-29 | Milestones may not sum to contract value; show "unscheduled" warning                         | Flexibility for unplanned work                                   |
| D-006 | 2026-10-29 | Payment amount immutable; corrections by reversal; other payment fields editable             | Owner: "except amount everything is temporary" (confirm in Q-02) |
| D-007 | 2026-10-29 | Partial payments allowed per milestone                                                       | Common in practice                                               |
| D-008 | 2026-10-29 | All docs in `docs/`, numbered files                                                          | Owner request                                                    |
| D-009 | 2026-10-29 | Documentation set approved; Phase 1 may start                                                | Owner approval (was Q-00)                                        |

## Open questions

Each has a **provisional default** that agents use until the owner answers.

| ID   | Question                                                                | Options                                      | Provisional default (recommended)                                 |
| ---- | ----------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Q-01 | Can Sales users **view** other people's projects?                       | View all, edit own / Own only                | View all, edit own                                                |
| Q-02 | Confirm Mark-as-paid meaning: amount fixed, other fields editable later | Yes / different meaning                      | Yes (D-006)                                                       |
| Q-03 | Currencies: one or several?                                             | INR only / multi with conversion             | INR base; per-project currency stored, excluded from totals (M-4) |
| Q-04 | Year basis for reports                                                  | FY Apr–Mar / calendar                        | FY Apr–Mar, toggle available                                      |
| Q-05 | Do invoices come from another tool (Tally, Zoho Books, QuickBooks)?     | Yes (record IDs only) / generate in SalesCRM | Record IDs only                                                   |
| Q-06 | Reminders for due / overdue milestones?                                 | None / email / Slack                         | None in v1                                                        |
| Q-07 | Document types and size limit                                           | —                                            | PDF, Office, images, zip; 25 MB                                   |
| Q-08 | Sales targets per person (target vs actual)?                            | Yes / later                                  | Later                                                             |
| Q-09 | Theme and animation references                                          | Owner to send                                | Neutral shadcn theme until received                               |
| Q-10 | Hosting preference                                                      | Render / Railway / own server                | Render (API + Postgres), Netlify (web), R2                        |
