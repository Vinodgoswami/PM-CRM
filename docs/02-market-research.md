# 02 · Market research

Checked 2026-10-29 to decide build vs buy.

| Product                      | What it is                                                   | Fit                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Productive.io, Scoro, Accelo | Agency PSA: CRM + projects + budgets + billing + forecasting | Closest match: milestone billing and revenue forecasts exist. But per-seat SaaS (~$10–50/user/month), heavy on time tracking/resourcing we don't need, and the look & animations are not ours. |
| HubSpot, Pipedrive, Zoho CRM | Deal-pipeline CRMs                                           | Strong on leads; weak on project → milestones → collected. Billing would live in custom objects and spreadsheets.                                                                              |
| Twenty (open source)         | Modern self-hosted CRM (TypeScript, NestJS, React, Postgres) | Good UI, same stack as ours, but a generic contacts/deals model; we would fight it for milestones, upsell links and the finance dashboard.                                                     |
| Odoo (open source)           | ERP with CRM, Projects, Invoicing, Accounting                | Can do everything, but it is a full ERP in Python with its own UI framework; overkill and hard to restyle.                                                                                     |

## Decision

**Build custom** (D-001 in [15](15-decisions-and-open-questions.md)). The data model is small and specific, and the
value is the dashboard plus our own theme and animations. Ideas borrowed from the PSA tools:

- Forecast cash-in from milestone due dates.
- Receivables aging buckets (0–30 / 31–60 / 61–90 / 90+).
- Per-person performance table.

## Sources

- [Scoro vs Accelo vs Productive (2026)](https://productive.io/blog/scoro-vs-accelo/)
- [Productive.io alternatives for agencies (2026)](https://www.teamwork.com/blog/productive-alternatives/)
- [Scoro: project management software with CRM](https://www.scoro.com/blog/project-management-software-crm/)
- [Best Open Source CRM for 2026 (Marmelab)](https://marmelab.com/blog/2026/01/09/open-source-crm-benchmark-2026)
- [Odoo vs Twenty](https://openalternative.co/compare/odoo/vs/twenty)
