# 06 · Business rules

These rules are the contract. They are implemented once in `packages/core` and covered by unit tests named after
the rule id (e.g. `MS-3`). If another doc disagrees, this one wins.

## Money

- **M-1** Amounts are integers in minor units (paise/cents). No floats in server code (gate-enforced).
- **M-2** Formatting (₹1,25,000.00, $12,500) happens only in the UI, using the currency and locale.
- **M-3** A project has one currency, fixed once it has a milestone. Upsell entries, milestones and payments use the
  project currency.
- **M-4** Totals (dashboard, billing, invoices) are in the company's base currency (D-020). Work in another currency is
  converted: each **payment** records its amount in the project's currency _and_ in the base currency at that day's
  rate (auto-filled from the ECB-based rate service, editable to the bank's actual rate); each **project** saves its
  rate when created and again when confirmed, which converts its contract, milestones, extra work and balances so the
  numbers shown to the CEO don't move with the market. "Collected" uses what each payment actually brought in.
  Work with no rate yet is listed in its own currency and left out of totals with a visible note.

## Project status

```
LEAD → PROPOSAL → WON → ACTIVE → COMPLETED
  ↘        ↘        ↘      ↘
              LOST      ON_HOLD ⇄ ACTIVE
```

- **PS-1** Allowed transitions are exactly the arrows above; Admin may move any status (audited).
  A new project may start as LEAD, PROPOSAL, WON or ACTIVE; the arrows govern later changes, while PS-2 and PS-4
  apply from creation. Moving to the status it already has is refused.
- **PS-2** `wonAt` is set the first time status becomes WON (or ACTIVE if WON was skipped). It is the date the
  project counts as **booked**.
- **PS-3** LEAD and PROPOSAL projects form the **pipeline**; they are not booked sales.
- **PS-4** Every milestone of an ACTIVE project has a due date. D-045: an active project may have no milestones (it
  can be created without any, and its last milestone can be deleted).
  D-025: a project _created_ ACTIVE (hired work, the only kind the form enters) needs just the booking amount;
  milestones may follow, but each one it is created with needs a due date.
- **PS-5** Moving to COMPLETED is allowed with unpaid milestones (they stay in Upcoming/Overdue).
- **PS-6** LOST projects with payments are not allowed; reverse payments first.

## Duration

- **D-1** `endDate = startDate + durationValue × unit` (calendar months via date-fns `addMonths`).
- **D-2** Duration is informational; it does not change milestone due dates.

## Milestones

- **MS-1** Numbers are 1..n per project with no gaps; deleting or reordering renumbers. Milestones with payments
  cannot be deleted.
- **MS-2** `amount` may not be set below what is already paid on it. D-027: to change a paid milestone's amount, whoever
  may edit the project first **resets** it (every live payment reversed with a reason, kept in history), then edits it.
- **MS-3** <a id="milestone-status"></a>Derived status, evaluated in the company timezone, in this order:

| Status           | Condition                                              |
| ---------------- | ------------------------------------------------------ |
| `PAID`           | `paid ≥ amount`                                        |
| `OVERDUE`        | `dueDate < today` and `balance > 0`                    |
| `PARTIALLY_PAID` | `0 < paid < amount` (and not overdue)                  |
| `DUE_SOON`       | `today ≤ dueDate ≤ today + dueSoonDays` and `paid = 0` |
| `SCHEDULED`      | has a dueDate further out, `paid = 0`                  |
| `UNSCHEDULED`    | no dueDate                                             |

- **MS-4** If milestones don't add up to the contract value, the project shows an "unscheduled ₹X" warning; this is
  allowed (D-005).
- **MS-5** (D-044) Milestones may add up to less than the contract value (MS-4) but never more. The contract value is
  the booking plus upsells, per project; a phase is its own project with its own limit. Checked on project create,
  booking edit, milestone add/edit and upsell removal; an upsell with a milestone raises both together.

## Payments ("Mark as paid")

- **MS-6** (D-063) A recurring series makes one milestone a month on its start date's day, each created once due and
  never twice (a deleted one is not recreated); the series' months still to come count towards MS-5.
- **P-1** The dialog pre-fills: milestone label `M{n}`, today's date, amount = remaining balance.
- **P-2** `0 < amount ≤ balance`. Over-payment is rejected (record the extra as a separate milestone).
- **P-3** Partial payments are allowed; a milestone may have many payments until `PAID`.
- **P-4** After save, `amount` is **immutable**. `milestoneLabel`, `invoiceId`, `paymentDate`, `note` stay editable
  (R5), each edit audited.
- **P-5** To correct an amount: Admin creates a **reversal** (negative amount equal to the original, linked by
  `reversesPaymentId`, with a reason) and, if needed, a new correct payment. A payment can be reversed once.
- **P-6** `paymentDate` cannot be in the future.
- **P-7** Payments are never deleted.
- **P-8** Payments are recorded only on booked work (WON, ACTIVE, ON_HOLD, COMPLETED). Milestones of LEAD, PROPOSAL
  and LOST projects are not receivables and are left out of expected, outstanding, overdue, aging and forecasts.

## Upsell

- **U-1** Upsell entry: amount added to an existing project's contract value, booked on its own `date`.
- **U-2** Upsell project: a project with `parentProjectId`. Its booked value counts as **upsell** in reports. The
  parent must belong to the same client and must not be itself or one of its descendants (no cycles).
- **U-3** Upsell share = upsell booked ÷ total booked in the period.
- **U-4** D-028: the original project is **Phase 1**; its upsell projects are **Phase 2, 3, …** in code order.
  Total booking = initial booking (Phase 1 amounts) + upsell (later phases and extra-work entries).
- **U-5** D-037: each phase is **Upsell** (extra work the client added; counts as upsell) or **Scope part** (a part
  of the original project; counts towards the initial booking). New phases default to Upsell.

## Periods

- **PR-1** Financial year starts in `fyStartMonth` (default April). FY 2026-27 = 1 Apr 2026 – 31 Mar 2027.
- **PR-2** Quarters are FY quarters: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar. A calendar-year toggle is
  available on the dashboard.
- **PR-3** Which date counts for each measure:

| Measure           | Date used                                           |
| ----------------- | --------------------------------------------------- |
| Booked            | `Project.wonAt`; `UpsellEntry.date`                 |
| Collected         | `Payment.paymentDate` (reversals on their own date) |
| Due / expected    | `Milestone.dueDate`                                 |
| Won / lost counts | `wonAt` / `closedAt`                                |

## Clients

- **C-1** "Add new" in the project form creates the client with name (+ optional email) in the same transaction as
  the project; if the project save fails, no client is created.
- **C-2** Client names are unique case-insensitively; the dropdown offers the existing client instead of a duplicate.
- **C-3** A client with projects cannot be deleted, only archived.
