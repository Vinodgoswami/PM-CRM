# SalesCRM documentation

Everything about SalesCRM lives in this folder. Humans and AI agents read the same files.

**Status: Approved by the owner on 2026-10-29 (D-009).** Changes to decided behaviour go through
(see [15-decisions-and-open-questions.md](15-decisions-and-open-questions.md)).

## Start here

| If you are…                | Read                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- |
| New to the project         | 01 → 04, then the doc for your area                                                     |
| An AI agent given a task   | [14-agent-playbook.md](14-agent-playbook.md) first, then the docs your task brief lists |
| Building a backend feature | 05 data model, 06 business rules, 07 roles, 10 API, 12 coding standards                 |
| Building a screen          | 07 roles, 08 screens, 09 dashboard (if relevant), 16 theme, 12 coding standards         |
| Checking progress          | [17-implementation-status.md](17-implementation-status.md)                              |

## Index

| #   | File                                                                           | What it answers                                                  |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 01  | [01-product-overview.md](01-product-overview.md)                               | What we are building, for whom, requirements, glossary           |
| 02  | [02-market-research.md](02-market-research.md)                                 | Products checked and why we build custom                         |
| 03  | [03-tech-stack.md](03-tech-stack.md)                                           | Technologies and why                                             |
| 04  | [04-architecture.md](04-architecture.md)                                       | Repo layout, modules, request flow, deployment                   |
| 05  | [05-data-model.md](05-data-model.md)                                           | Entities, fields, relations, derived values                      |
| 06  | [06-business-rules.md](06-business-rules.md)                                   | Money, milestone status, payments, upsell, periods — exact rules |
| 07  | [07-roles-and-permissions.md](07-roles-and-permissions.md)                     | Admin / Sales / CEO, permission matrix, enforcement              |
| 08  | [08-screens-and-flows.md](08-screens-and-flows.md)                             | Every screen and the main user flows                             |
| 09  | [09-dashboard-spec.md](09-dashboard-spec.md)                                   | Every KPI, chart and table with its exact formula                |
| 10  | [10-api-spec.md](10-api-spec.md)                                               | REST endpoints, payloads, errors                                 |
| 11  | [11-security.md](11-security.md)                                               | Commit/push/CI gates, app security, incident steps               |
| 12  | [12-coding-standards.md](12-coding-standards.md)                               | Conventions, testing, commits, definition of done                |
| 13  | [13-roadmap.md](13-roadmap.md)                                                 | Phases → tasks with acceptance criteria                          |
| 14  | [14-agent-playbook.md](14-agent-playbook.md)                                   | How to brief, run and hand off work with AI agents               |
| 15  | [15-decisions-and-open-questions.md](15-decisions-and-open-questions.md)       | Decision log and questions still open                            |
| 16  | [16-theme-and-animation.md](16-theme-and-animation.md)                         | Design tokens and motion rules (filled when the theme arrives)   |
| 17  | [17-implementation-status.md](17-implementation-status.md)                     | What is done, in progress, next                                  |
| 18  | [18-plan-phase-1-foundation.md](18-plan-phase-1-foundation.md)                 | Step-by-step implementation plan for Phase 1                     |
| 19  | [19-plan-phase-2-clients-projects.md](19-plan-phase-2-clients-projects.md)     | Implementation plan for Phase 2                                  |
| 20  | [20-plan-phase-3-milestones-billing.md](20-plan-phase-3-milestones-billing.md) | Implementation plan for Phase 3                                  |

## Rules for these docs

- One topic per file. If two docs disagree, **06 business rules** and **05 data model** win; fix the other doc.
- A change to the schema, API, money logic or routes must update the matching doc in the same commit
  (enforced by `pnpm docs:check`).
- Decisions are recorded in 15 with a date; never silently change a decided behaviour.
