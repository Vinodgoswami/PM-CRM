# 15 · Decisions & open questions

## Decisions

| ID    | Date       | Decision                                                                                                                                                         | Why / source                                                     |
| ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| D-001 | 2026-10-29 | Build custom, not buy (Productive/Scoro/Twenty/Odoo checked)                                                                                                     | [02](02-market-research.md)                                      |
| D-002 | 2026-10-29 | Stack: React 19 + Vite, NestJS + Prisma + Postgres, pnpm + Turborepo (PayOS family)                                                                              | [03](03-tech-stack.md)                                           |
| D-003 | 2026-10-29 | Repo gates ported from PayOS                                                                                                                                     | Owner request                                                    |
| D-004 | 2026-10-29 | Roles ADMIN / SALES / CEO; CEO sees performance dashboard + all upcoming invoices, read-only                                                                     | Owner request                                                    |
| D-005 | 2026-10-29 | Milestones may not sum to contract value; show "unscheduled" warning                                                                                             | Flexibility for unplanned work                                   |
| D-006 | 2026-10-29 | Payment amount immutable; corrections by reversal; other payment fields editable                                                                                 | Owner: "except amount everything is temporary" (confirm in Q-02) |
| D-007 | 2026-10-29 | Partial payments allowed per milestone                                                                                                                           | Common in practice                                               |
| D-008 | 2026-10-29 | All docs in `docs/`, numbered files                                                                                                                              | Owner request                                                    |
| D-009 | 2026-10-29 | Documentation set approved; Phase 1 may start                                                                                                                    | Owner approval (was Q-00)                                        |
| D-010 | 2026-10-29 | No outbound email in v1: invite and reset links are returned to the Admin to share                                                                               | Phase 1 plan; avoids an email provider until needed              |
| D-011 | 2026-10-29 | Same-origin API: web calls relative `/api/v1`; dev proxy / host rewrite to the API; no CORS                                                                      | First-party session cookies                                      |
| D-012 | 2026-10-29 | Audit rows written by explicit `AuditService.record(tx, …)` inside the business transaction                                                                      | An interceptor cannot share the transaction                      |
| D-013 | 2026-10-29 | Theme: white surfaces + green accent, Quixotic-style layout (top pill navigation, rounded cards, striped bar charts)                                             | Owner choice between two references                              |
| D-014 | 2026-10-29 | Light theme only (no dark mode); animated split-card login with a green welcome panel                                                                            | Owner request with login reference                               |
| D-015 | 2026-10-29 | Dashboard PDF export via browser print ("Save as PDF") with print styles, not a server-side headless browser                                                     | No Chromium on the server; same data and permissions as the page |
| D-016 | 2026-10-30 | Product name in the UI is “Project Management CRM” (code and package names stay `salescrm`)                                                                      | Owner request                                                    |
| D-017 | 2026-10-30 | Audience is project managers reporting quarterly to the CEO: no sales words on screen (see 01 glossary); dashboard opens on this quarter; stored codes unchanged | Owner request                                                    |

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
