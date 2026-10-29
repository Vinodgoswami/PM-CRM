# Phase 3 — Milestones & Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Milestones can be added, edited, reordered and deleted on a project; any milestone can be marked as paid
(fully or partly) with milestone label, invoice ID and date; wrong amounts are corrected by reversal; the CEO and the
team see every unpaid milestone in Upcoming Invoices and every payment in Completed Billing.

**Architecture:** Pure rules (milestone status MS-3, payment checks P-2..P-6, invoice grouping) in `packages/core`;
NestJS modules `milestones`, `payments`, `invoices` reuse `ProjectsService.load/loadForWrite` for visibility and
ownership; every write is audited in-transaction. Web adds a Milestones tab with the Mark-as-paid dialog, plus the
Upcoming Invoices (`/invoices`) and Completed Billing (`/billing`) pages.

**Tech Stack:** as Phases 1–2; no new dependencies.

**Spec:** [06](06-business-rules.md) (MS-1..MS-4, P-1..P-7, PR-3), [07](07-roles-and-permissions.md) (`payments.*`,
`invoices.read`, `billing.read`), [08](08-screens-and-flows.md) (S2, S4 Milestones/Payments tabs, S6, S7, F2, F3),
[10](10-api-spec.md) (Milestones, Payments, Invoices), [13 § Phase 3](13-roadmap.md#phase-3--milestones--billing).

## Global Constraints

- Everything in [18](18-plan-phase-1-foundation.md#global-constraints) and [19](19-plan-phase-2-clients-projects.md#global-constraints) applies.
- "Today" is always `SettingsService.today()` (company timezone); `dueSoonDays` comes from settings.
- Payment amounts never change after insert (DB trigger, Phase 1); corrections are reversals (P-5).
- `invoices.read` / `billing.read` are `own` for SALES: list queries filter by project owner in the database query.
- Every money write: one transaction with `AuditService.record`.

## Review Focus

1. Two clicks on "Mark as paid" (double submit / retry) must create one payment → `Idempotency-Key` test in Task 3.
2. Paying more than the remaining balance, a zero or negative amount, or a future date must be refused with the rule
   id (P-2, P-6) → Task 3 tests.
3. Reversing a reversal, reversing twice, or a SALES user reversing must be refused → Task 3 tests.
4. Lowering a milestone below what is already paid, or deleting a milestone with payments, must be refused
   (MS-2, MS-1) → Task 2 tests.
5. A SALES user must not see another rep's milestones in Upcoming Invoices or payments in Completed Billing, even by
   filtering on that rep's client or owner id → Tasks 5–6 tests.

---

### Task 1: Core rules — milestone status, payment checks, invoice groups (P3-1)

**Files:** `packages/core/src/{milestone-status.ts,payments.ts,invoice-groups.ts}` + tests; export from index.

**Interfaces (Produces):**

- `type MilestoneStatus = 'PAID' | 'OVERDUE' | 'PARTIALLY_PAID' | 'DUE_SOON' | 'SCHEDULED' | 'UNSCHEDULED'`
- `milestoneStatus(m: { amountMinor: bigint; paidMinor: bigint; dueDate: IsoDate | null }, today: IsoDate, dueSoonDays: number): MilestoneStatus` — MS-3 table, evaluated in that order.
- `checkPayment(input: { amountMinor: bigint; paymentDate: IsoDate }, m: { amountMinor: bigint; paidMinor: bigint }, today: IsoDate): { ok: true } | { ok: false; rule: 'P-2' | 'P-6'; message: string }` — `0 < amount ≤ balance`, `paymentDate ≤ today`.
- `type InvoiceGroup = 'OVERDUE' | 'THIS_WEEK' | 'THIS_MONTH' | 'NEXT_MONTH' | 'LATER' | 'UNSCHEDULED'`
- `invoiceGroup(dueDate: IsoDate | null, today: IsoDate): InvoiceGroup` — OVERDUE `due < today`; THIS_WEEK `today ≤ due ≤ today+6`; THIS_MONTH rest of today's calendar month; NEXT_MONTH next calendar month; LATER after; UNSCHEDULED no date. A week that crosses month end stays THIS_WEEK.

- [ ] **Step 1: Failing tests** named `MS-3 …`, `P-2 …`, `P-6 …`, `invoiceGroup …`: every MS-3 row incl. precedence (overdue partial → OVERDUE; paid + past due → PAID; due exactly today+dueSoonDays → DUE_SOON, +1 → SCHEDULED); `checkPayment` amount = balance ok, balance+1 → P-2, 0 → P-2, future date → P-6; groups for today 2026-10-29: 2026-10-28 → OVERDUE; 2026-10-29, 2026-10-31 and 2026-11-04 → THIS_WEEK; 2026-11-05 and 2026-11-30 → NEXT_MONTH; 2026-12-01 → LATER; null → UNSCHEDULED; for today 2026-10-10: 2026-10-20 → THIS_MONTH, 2026-11-01 → NEXT_MONTH.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm --filter @salescrm/core test`).
- [ ] **Step 5: Commit** `feat(core): milestone status, payment checks and invoice groups`.

---

### Task 2: Milestones API (P3-2)

**Files:** `packages/schemas/src/milestones.ts`; `apps/api/src/modules/milestones/*`; test `apps/api/test/milestones.e2e.test.ts`.

**Interfaces:** `milestoneInputSchema` (from Phase 2) for create; `updateMilestoneSchema = { title?; description?; amountMinor?; dueDate?: IsoDate | null }`; `reorderSchema = { ids: string[] }` (must be exactly the project's milestone ids). Endpoints per [10 § Milestones](10-api-spec.md#milestones); each returns the full `ProjectDetail` (so the web refreshes in one round trip), extended with per-milestone `status` (MS-3) and `balanceMinor`. Writes need `projects.write` + ownership; audits `milestone.create|update|delete|reorder` with entity `Project`.

- [ ] **Step 1: Failing tests:** create appends `M{n+1}`; update title/amount/due audited; `MS-2` amount below paid → 400 rule MS-2; `MS-1` delete with payments → 400 MS-1; delete without payments renumbers remaining 1..n; reorder with a foreign or missing id → 400; reorder renumbers; PS-4 guard: clearing the due date of a milestone on an ACTIVE project → 400 PS-4; non-owner SALES → 403; CEO → 403; detail now carries `status` per milestone matching MS-3.
- [ ] **Step 2–4:** FAIL → implement (renumbering in one transaction: shift numbers by +1000 then set final, to dodge the `(projectId, number)` unique constraint) → PASS.
- [ ] **Step 5: Commit** `feat(milestones): milestones API with renumbering and status`.

---

### Task 3: Payments API (P3-3)

**Files:** `packages/schemas/src/payments.ts`; `apps/api/src/modules/payments/*`; migration `payment_idempotency_and_checks` (column `idempotencyKey String? @unique`; `CHECK ("amountMinor" <> 0)`; `CHECK (("reversesPaymentId" IS NULL) = ("amountMinor" > 0))`); test `apps/api/test/payments.e2e.test.ts`.

**Interfaces:**

- `createPaymentSchema = { milestoneLabel?: string (default "M{n}"); invoiceId?: string ≤ 80; paymentDate: IsoDate; amountMinor: positive; note?: string ≤ 500 }`; header `Idempotency-Key` (required, 8–100 chars) → `POST /milestones/:id/payments` → 201 `PaymentDto`; same key again → 200 with the same payment (no new row).
- `updatePaymentMetaSchema = { milestoneLabel?; invoiceId?: string | null; paymentDate?; note?: string | null }` → `PATCH /payments/:id` (P-4: amount never accepted; P-6 still applies to the date).
- `reverseSchema = { reason: 1–500 }` → `POST /payments/:id/reverse` (`payments.reverse`, Admin): inserts `-amount`, `reversesPaymentId`, note = reason; refuses reversing a reversal or an already-reversed payment (409).
- `PaymentDto = { id, milestoneId, milestoneLabel, invoiceId, paymentDate, amountMinor, reversesPaymentId, reversedById: string | null, note, createdBy: { id, name }, createdAt, project: { id, code, name, currency }, client: { id, name } }`.
- Audits: `payment.create`, `payment.update` (changed meta only), `payment.reverse` — entity `Project`, entityId = project id.

- [ ] **Step 1: Failing tests:** mark paid in full → 201, milestone status PAID, audit; partial → PARTIALLY_PAID and a second payment for the remainder → PAID (P-3); `P-2` over balance → 400; 0 → 400; `P-6` future date → 400; same Idempotency-Key twice → one row (Review Focus 1); missing key → 400; edit invoice ID/date/label/note → 200 and audited, body containing `amountMinor` → 400; `P-5` Admin reverse → negative row, milestone back to unpaid; reverse again → 409; reverse the reversal → 409; SALES reverse → 403; non-owner SALES create → 403; CEO create → 403; DB check: raw insert of a negative non-reversal is rejected.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(payments): mark as paid, edit details and reversals` (docs/05 new column + checks).

---

### Task 4: Web — Milestones tab and Mark-as-paid dialog (P3-4)

**Files:** `apps/web/src/features/projects/tabs/{MilestonesTab,PaymentsTab}.tsx`, `apps/web/src/features/payments/{api.ts,MarkPaidDialog.tsx,ReverseDialog.tsx,PaymentMetaEditor.tsx}`, `MilestoneStatusBadge.tsx`; tests.

**Interfaces:** Milestones tab (S4 2): table M#, task, amount, due, paid, balance, status badge; inline add row; edit/delete per row; drag-free reorder with up/down buttons (keyboard accessible); totals row with unscheduled note. Mark-as-paid dialog (S6): label pre-filled `M{n}`, invoice ID, payment date (today, `max=today`), amount pre-filled with the balance (MoneyInput), note; helper text "The amount can't be changed after saving"; sends a fresh `Idempotency-Key` per dialog open (`crypto.randomUUID()`), so retries reuse it. Payments tab (S4 3): all payments, reversals in red linked to the original, inline edit of label / invoice ID / date / note, Admin "Reverse" with required reason. Overview tab keeps its read-only table.

- [ ] **Step 1: Failing tests:** dialog pre-fills label, today and balance; submitting posts once with an Idempotency-Key header and the row shows PAID; double click sends one request; over-balance shows the server's P-2 message; SALES sees no Reverse button; reverse requires a reason; canEdit=false hides all write controls.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(web): milestones tab and mark-as-paid`.

---

### Task 5: Upcoming Invoices — API and page (P3-5)

**Files:** `apps/api/src/modules/invoices/*`; `packages/schemas/src/invoices.ts`; `apps/web/src/features/invoices/InvoicesPage.tsx`; tests.

**Interfaces:** `GET /invoices?clientId=&ownerId=&from=&to=` (`invoices.read`; SALES limited to own projects in the query) → `{ groups: { key: InvoiceGroup; totalMinor: number; count: number; items: InvoiceItem[] }[]; currency }` with groups in the S2 order and only non-empty ones; `InvoiceItem = { milestoneId, number, title, amountMinor, balanceMinor, dueDate, daysFromToday, status, project: { id, code, name }, client: { id, name }, owner: { id, name } }`. Excludes PAID milestones, LEAD/PROPOSAL/LOST and archived projects. Page (S2): grouped sections with counts and totals, Overdue first in red, filters (client, owner — owner filter hidden for SALES), row action "Mark as paid" (reuses the dialog; hidden without `payments.create` scope), click-through to the project.

- [ ] **Step 1: Failing tests (API):** grouping for a fixed fixture and `today`; paid and pipeline projects excluded; SALES sees only own even with `ownerId=<other>` (Review Focus 5); CEO sees all; totals are balances, not amounts. **(Web):** sections render in order with totals; Overdue section styled; CEO sees no Mark-as-paid action.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(invoices): upcoming invoices API and page`.

---

### Task 6: Completed Billing — API, page and CSV (P3-6)

**Files:** `apps/api/src/modules/payments/billing.controller.ts`; `apps/web/src/features/billing/BillingPage.tsx`; tests.

**Interfaces:** `GET /payments?from=&to=&clientId=&ownerId=&page=&pageSize=` (`billing.read`, SALES own) → paginated `PaymentDto` sorted by paymentDate desc + `totalMinor` for the whole filter; `GET /exports/csv/billing?…same filters` (`export`) → `text/csv` with columns Date, Client, Project code, Project, Milestone, Invoice ID, Amount (major units, 2 decimals via string maths), Currency, Recorded by, Reversal of. Page (S7): period presets (This month, This quarter, This FY, Last FY, Custom) using `fyOf` / `quarterOf`, client and owner filters, footer total, reversals in red, inline meta edit for writers, "Export CSV" button.

- [ ] **Step 1: Failing tests:** API period filter and total (reversals subtract); SALES scope (Review Focus 5); CSV header + one row exact text, amounts with 2 decimals and no float artefacts (e.g. 1234567 → `12345.67`); web presets compute the right `from`/`to` for FY Apr–Mar.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(billing): completed billing page and CSV export` (docs/13, docs/17 — mark Phase 3 done).

---

## Order and parallelism

`1 → 2 → 3 → (4 ∥ 5 ∥ 6)` (4–6 share only the payments API hooks; 4 creates `features/payments/api.ts`, so run 4 first
if sequential).

## Definition of done for Phase 3

All tasks committed on `feat/phase-3-milestones-billing`; `pnpm verify` green; flows F2 (mark as paid) and F3
(reverse and re-enter) work in the browser; the CEO sees Upcoming Invoices and Completed Billing read-only.
