# 09 · Dashboard spec

The landing page. Every number here has one formula, implemented in `packages/core/src/metrics/*` and reused by the
API, exports and tests. Date rules come from [06 PR-3](06-business-rules.md#periods).

## Filters (top bar, kept in the URL query string)

| Filter     | Values                                                                                        | Default         |
| ---------- | --------------------------------------------------------------------------------------------- | --------------- |
| Period     | Month, Quarter, YTD (FY to date), Year (this FY), Last year, 2 years (last + this FY) — D-019 | Quarter         |
| Compare to | Previous period, Same period last year, None                                                  | Previous period |
| Year basis | Financial year, Calendar year                                                                 | Financial year  |
| Owner      | All / one user (SALES users are fixed to themselves)                                          | All             |
| Client     | All / one                                                                                     | All             |

Scope: CEO and ADMIN see company data; SALES see only their own projects (`dashboard.own`).

## KPI cards

Each card: value, delta vs comparison (▲/▼ with %), 12-point sparkline, click → filtered list.

| #   | KPI                 | Formula (period = P, today = T)                                                                                                             | Click opens           |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| K1  | Sales booked        | Σ expectedAmount of projects with `wonAt ∈ P` (upsell projects included) + Σ upsell entries with `date ∈ P` on projects that have a `wonAt` | Projects (won in P)   |
| K2  | Collected           | Σ payments.amount with `paymentDate ∈ P` (reversals included)                                                                               | Completed Billing     |
| K3  | Expected (due) in P | Σ milestone.amount with `dueDate ∈ P`                                                                                                       | Upcoming Invoices     |
| K4  | Outstanding         | D-061: contract value − collected on confirmed work, due or not (point-in-time, ignores P)                                                  | Invoices → Overdue    |
| K5  | Overdue             | Σ balance where `dueDate < T`, plus count of milestones and clients                                                                         | Invoices → Overdue    |
| K6  | Due next 30 days    | Σ balance where `T ≤ dueDate ≤ T+30`                                                                                                        | Invoices → This month |
| K7  | Pipeline            | Σ expectedAmount of LEAD + PROPOSAL projects (point-in-time)                                                                                | Projects (pipeline)   |
| K8  | Upsell revenue      | Upsell part of K1 (upsell entries ∈ P + expectedAmount of projects with a parent won ∈ P), and % of K1                                      | Projects (upsells)    |
| K9  | Collection rate     | Σ paid on milestones due ∈ P ÷ K3                                                                                                           | Invoices (P)          |
| K10 | Avg days to pay     | mean(`paymentDate − dueDate`) over payments ∈ P (reversals excluded) whose milestone has a due date                                         | Completed Billing     |
| K11 | Win rate            | count(wonAt ∈ P, not LOST) ÷ (that + count(LOST with closedAt ∈ P)); won-then-lost is a loss; null if both 0                                | Projects              |
| K12 | Average deal size   | Σ expectedAmount of projects won ∈ P ÷ count(projects won ∈ P)                                                                              | Projects              |

## Charts

| #   | Chart               | Type                           | Data                                                                                                                     |
| --- | ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| C1  | Monthly performance | Grouped bars + line            | Last 12 months: booked (K1), collected (K2), expected (K3); line = cumulative collected. Click a bar → drill-down drawer |
| C2  | Quarter comparison  | Grouped bars                   | Q1–Q4 of selected FY vs previous FY, booked and collected                                                                |
| C3  | Year over year      | Line                           | Cumulative collected by month, this FY vs last FY                                                                        |
| C4  | Cash-in forecast    | Stacked bars                   | Next 6 months by due month: scheduled balance vs overdue carried forward                                                 |
| C5  | Receivables aging   | Horizontal stacked bar / donut | Overdue balance in 1–30, 31–60, 61–90, 90+ days past due                                                                 |
| C6  | Revenue by client   | Bar (top 10 + "Others")        | Booked and collected in P per client                                                                                     |
| C7  | New vs upsell       | Donut                          | K1 split into new and upsell                                                                                             |
| C8  | Pipeline funnel     | Funnel                         | Count and value by current status: Lead → Proposal → Won → Active (incl. On hold) → Completed, Lost last                 |
| C9  | Due-date calendar   | Calendar heatmap (month view)  | Balance due per day; click a day → milestones                                                                            |

## Team performance (`dashboard.company`)

Table, one row per salesperson (SALES see only their own row on their dashboard):

| Column          | Formula (scoped to that owner, period P) |
| --------------- | ---------------------------------------- |
| Booked          | K1                                       |
| Collected       | K2                                       |
| Outstanding     | K4                                       |
| Overdue         | K5                                       |
| Upsell          | K8                                       |
| Win rate        | K11                                      |
| Avg deal        | K12                                      |
| Projects active | count status ACTIVE                      |

Sorted by Booked; row expands to a 12-month booked/collected mini chart. Target vs actual is a later addition (Q-08).

## Tables

- **T1 Upcoming (next 30 days)** — client, project, milestone, amount, due date, owner; top 10 + "View all".
- **T2 Overdue** — same columns + days overdue, sorted by days overdue desc.
- **T3 Recently paid** — last 10 payments.
- **T4 Upcoming bookings** (D-019) — projects not yet confirmed (Enquiry, Quoted), biggest expected amount first (top 10),
  with stage, project manager, expected start and amount; the panel subtitle gives the count and total.

## Compare project managers (`dashboard.company`, D-019)

`/compare?a=&b=&period=` — two project managers side by side for one period: Contracted, Collected, Expected,
Projects confirmed, Confirmation rate, Collection rate, Avg deal, Avg days to pay (lower is better), Extra work,
Outstanding and Overdue (lower is better), Not yet confirmed; the better figure is marked. Below, their monthly
collected amounts as paired bars. Unknown ids in the address fall back to the first two project managers. One person's
own numbers: the dashboard's project-manager filter with any period.

## Export

- **PDF**: "Export PDF" prints the current dashboard (filters included) through the browser's print dialog ("Save as
  PDF"), A4 landscape, with a generated-at timestamp and filter summary in a print-only header; navigation and controls
  are hidden in print (D-015). Server-side rendering stays an option if scheduled/emailed PDFs are ever needed.
- **CSV**: one file per table/KPI set, amounts in major units with currency column.

## Performance

- One API call `GET /dashboard?…` returns KPIs + chart series; tables load separately. Target < 500 ms for 5 years of
  data (~10k milestones). Postgres does the period bucketing (`date_trunc` on DATE columns).
- No caching layer in v1; add materialised views only if the target is missed.

## Acceptance

- Unit tests in `packages/core` for every K and C formula with fixed fixtures and a fixed "today".
- A seeded dataset (`pnpm db:seed`) with 4 users (1 Admin, 2 Sales, 1 CEO), 15 clients, 40 projects, 2 FYs of milestones/payments, upsells,
  overdue items — the dashboard must look meaningful on it.
