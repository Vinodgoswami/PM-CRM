# 08 · Screens & flows

Visual style and motion come from [16-theme-and-animation.md](16-theme-and-animation.md). Every list supports
search, sort, filter, column toggle and CSV export; every screen has loading (skeleton), empty and error states.

## Navigation by role

| Item                | ADMIN | SALES   | CEO    |
| ------------------- | ----- | ------- | ------ |
| Dashboard (landing) | ✓     | ✓ (own) | ✓      |
| Upcoming Invoices   | ✓     | ✓ (own) | ✓      |
| Projects            | ✓     | ✓       | ✓ view |
| Completed Billing   | ✓     | ✓ (own) | ✓      |
| Clients             | ✓     | ✓       | ✓ view |
| Settings / Users    | ✓     | —       | —      |
| Audit log           | ✓     | —       | ✓      |

Global: top bar with search (projects, clients, invoice IDs), "+ New project" (not for CEO), user menu.

## Screens

### S1 Dashboard — `/`

Full spec in [09-dashboard-spec.md](09-dashboard-spec.md).

### S2 Upcoming Invoices — `/invoices`

The CEO's second main screen.

- Sections, in order: **Overdue** (pinned, red), **This week**, **This month**, **Next month**, **Later**,
  **Unscheduled** (no due date).
- Columns: client, project (code + name), milestone (M#, title), amount, balance, due date, days left / overdue,
  status chip, owner.
- Group header shows count and total balance.
- Filters: period, client, owner, status, amount range. Row click → project page, Milestones tab.
- Row action (not CEO): **Mark as paid**.

### S3 Projects list — `/projects`

Columns: code, name, client, owner, status, contract value, collected, outstanding, next due date, progress bar
(collected ÷ contract value). Filters: status, client, owner, won-date range, has overdue. Saved views: "Active",
"Pipeline", "Has overdue".

### S4 Project detail — `/projects/:id`

Header: name, code, client, owner, status (changeable per PS-1), contract value / collected / outstanding /
unscheduled.

Tabs:

1. **Overview**: description, dates, duration, parent project (if upsell), child upsell projects.
2. **Milestones**: editable table (M#, task, amount, due date, paid, balance, status, actions); add row; drag to
   reorder; totals row with unscheduled warning (MS-4).
3. **Payments**: all payments of the project; edit meta; Admin: reverse.
4. **Upsells**: upsell entries (add amount + date + note) and linked upsell projects ("Link existing" / "Create
   upsell project" which pre-fills client and parent).
5. **Documents**: drag-and-drop upload, type select, list with download/delete.
6. **Activity**: audit entries for this project.

### S5 Project form — `/projects/new`, `/projects/:id/edit`

Fields: name, **client** (combobox: search existing, last option "+ Add new client" opens inline name + email
fields — C-1), owner (Admin only; default self), description, status, start date, duration (number + weeks/months)
→ shows computed end date, expected amount + currency, parent project (optional, filtered to the same client),
tags. Below: milestone rows editor (M#, task, amount, due date) with running total vs expected amount. Document
drop zone. Save creates everything in one request.

### S6 Mark as paid dialog

Opened from Milestones tab or Upcoming Invoices. Fields: milestone label (pre-filled `M2`), invoice ID, payment date
(today), amount (remaining balance), note. Shows "Amount cannot be changed after saving" under the amount. On save:
success toast, row animates to Paid / Partially paid, counts update.

### S7 Completed Billing — `/billing`

All payments: date, client, project, milestone label, invoice ID, amount, recorded by. Reversals shown in red,
linked to the original. Filters: period (month/quarter/FY/custom), client, owner. Footer totals. Export CSV/PDF.
Inline edit of invoice ID / date / label (not CEO).

### S8 Clients — `/clients`, `/clients/:id`

List: name, company, primary email, projects, lifetime booked, collected, outstanding. Detail: contacts, projects
(including upsell tree), totals, documents across projects. Detailed design deferred (owner request).

### S9 Settings — `/settings`

Company (name, base currency, FY start month, timezone, due-soon days); Users (invite, role, deactivate); Audit log.

### S10 Auth

Login; accept invite (set name + password); reset password from a link the Admin generates. No email in v1 (D-010):
the login page says "Forgot your password? Ask your admin for a reset link."

## Key flows

### F1 Add a project for a new client

1. "+ New project" → S5. 2. Client combobox → "+ Add new client" → type name + email.
2. Fill details and milestones M1..Mn. 4. Save → one transaction creates client, project, milestones (C-1).
3. Redirect to S4.

### F2 Mark a milestone as paid

S2 or S4 → Mark as paid → S6 → save → payment in S7, milestone status per MS-3, dashboard updates.

### F3 Correct a wrong amount (Admin)

S4 Payments tab → Reverse (reason required) → negative row created → Mark as paid again with the right amount.

### F4 Add an upsell

Either S4 Upsells → "Add amount" (amount, date, note), or "Create upsell project" → S5 pre-filled with client and
parent → new project with its own milestones.

### F5 CEO weekly check

Login → Dashboard (period = this quarter) → Team performance → Upcoming Invoices → Overdue → export PDF.
