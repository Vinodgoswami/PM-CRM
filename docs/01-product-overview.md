# 01 · Product overview

## Purpose

**Project Management CRM** (code name `salescrm`) is for **project managers** who track their projects and invoices.
The unit of work is a _project for a client_. It records what was contracted, how it is split into billable
milestones, what has been collected, and what is coming due.

Each project manager uses it to see what they achieved **quarter by quarter** and to show that to the CEO. The CEO
sees the whole team — monthly, quarterly and yearly contracted and collected amounts, upcoming invoices and overdue
amounts — without asking anyone or opening a spreadsheet. The product uses no sales vocabulary on screen (D-017).

## Success criteria

1. Every amount promised, scheduled and received is in one place, entered once.
2. The CEO can answer, from the dashboard alone: how much did we sell / collect this month, quarter, year; what is
   due next month; what is overdue and with whom; how much came from upsells; how each salesperson is doing.
3. Marking a milestone as paid takes under 30 seconds and immediately updates Completed Billing and the dashboard.
4. Money can never be silently changed: paid amounts are immutable and every change is audited.

## Users

| User                           | Goal                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| Admin (owner)                  | Sets up users, enters and corrects everything, owns the data         |
| Project Manager (code `SALES`) | Adds clients/projects/milestones, marks payments, tracks own numbers |
| CEO                            | Reads performance and upcoming invoices; never edits                 |

Details: [07-roles-and-permissions.md](07-roles-and-permissions.md).

## Requirements (from the owner)

- **R1 Clients**: name, email(s), linked projects. On the project form the client is a **dropdown with "Add new"**;
  adding creates the client record automatically. Full client section to be designed later.
- **R2 Projects**: description, client, duration, expected amount, project documents (upload).
- **R3 Upsell**: either add an **upsell amount** to a project, or **link another project** as an upsell of an
  earlier project.
- **R4 Milestones**: milestone number (M1, M2…), task, amount, paid / not paid.
- **R5 Mark as paid**: opens a form with milestone number, invoice ID, date, amount. Once saved the **amount is
  fixed**; the other fields can be edited later. The payment then appears in **Completed Billing**.
- **R6 Dashboard first**: the landing page, as detailed as possible — monthly/quarterly/yearly sales, upcoming
  amounts, due dates.
- **R7 Roles**: role-based access; the CEO sees the performance dashboard and all upcoming invoices.
- **R8 Theme & animation**: the owner will supply a theme and animation references.
- **R9 Security**: same commit protection as PayOS / Padeliv (done).

## Out of scope (v1)

- Generating or emailing invoices (we record invoice IDs from your invoicing tool).
- Client-facing portal, lead capture forms, email sync, time tracking, resource planning.
- Accounting (tax, ledgers); export CSV for the accountant instead.

## Glossary

**On-screen words vs stored codes (D-017).** Screens, messages and exports use the left column; code, database and API
keep the right column so nothing is migrated.

| On screen                                                        | Stored / in code                                 |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| Project Manager (role), Project manager (owner filters, columns) | `SALES`, owner / "salesperson"                   |
| Enquiry · Quoted · Confirmed · Cancelled                         | `LEAD` · `PROPOSAL` · `WON` · `LOST`             |
| Contracted                                                       | booked (`bookedMinor`)                           |
| Not yet confirmed                                                | pipeline (`pipelineMinor`)                       |
| Confirmation rate, Projects confirmed                            | win rate (K11), `wonCount`                       |
| Extra work, extra-work project                                   | upsell entry, upsell project (`parentProjectId`) |
| confirmed_date (import column; `won_date` still accepted)        | `wonAt`                                          |

| Term              | Meaning                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| Client            | Company or person who buys projects                                                |
| Project           | A piece of work sold to a client, with an expected amount                          |
| Owner             | The salesperson responsible for a project; drives performance numbers              |
| Upsell entry      | Extra amount added to an existing project                                          |
| Upsell project    | A separate project linked to an earlier ("parent") project                         |
| Contract value    | Expected amount + upsell entries of a project                                      |
| Milestone         | A billable part of a project with an amount and a due date                         |
| Payment           | Money received against one milestone (a milestone may have several)                |
| Completed Billing | The list of all payments                                                           |
| Upcoming invoice  | An unpaid (or partly paid) milestone, due today or later                           |
| Overdue           | An unpaid (or partly paid) milestone whose due date has passed                     |
| Reversal          | A negative payment that cancels a wrong payment; the only way to correct an amount |
| FY                | Financial year; default April–March                                                |
