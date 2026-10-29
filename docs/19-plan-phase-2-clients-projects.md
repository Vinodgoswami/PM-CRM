# Phase 2 — Clients & Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sales can add clients and projects (with the "+ Add new client" dropdown, milestones at creation, upsell
amounts and upsell links, documents), browse and filter them, and the Admin can manage settings, users and read the
audit log — all enforced per role on the server.

**Architecture:** Builds on Phase 1. Pure rules (status transitions, duration, totals, upsell cycles) live in
`packages/core`; NestJS modules `clients`, `projects`, `upsells`, `documents`, `storage` call them inside Prisma
transactions with `AuditService.record`. The web app adds feature folders `clients`, `projects`, `settings` using
TanStack Query/Table and React Hook Form with the shared Zod schemas.

**Tech Stack:** as Phase 1, plus `@tanstack/react-table` ^8.21.3, `@aws-sdk/client-s3` ^3.840.0 and
`@aws-sdk/s3-request-presigner` ^3.840.0 (S3/R2 driver), `@radix-ui/react-tabs` ^1.1.12, `@radix-ui/react-popover`
^1.1.14, `@radix-ui/react-dialog` ^1.1.14, `cmdk` ^1.1.1 (combobox).

**Spec:** [05](05-data-model.md), [06](06-business-rules.md) (C-1..C-3, PS-1..PS-6, D-1, U-1..U-3), [07](07-roles-and-permissions.md),
[08](08-screens-and-flows.md) (S3–S5, S8, S9, F1, F4), [10](10-api-spec.md) (Clients, Projects, Documents),
[11 § Application security](11-security.md#application-security), [13 § Phase 2](13-roadmap.md#phase-2--clients--projects).

## Global Constraints

- Everything in [18 § Global Constraints](18-plan-phase-1-foundation.md#global-constraints) still applies.
- Every write endpoint test file has: happy path, validation failure (with rule id where one applies), CEO → 403,
  non-owner SALES → 403 for `own`-scoped writes, unauthenticated → 401.
- Money crosses the API as `…Minor` JSON integers with a `currency`; the web converts with `minorFromJson` /
  `toMinor` / `formatMoney` only.
- Lists return `{ items, page, pageSize, total }` (max pageSize 100). Computed columns (contract value, collected,
  outstanding, next due) are computed in `packages/core` and sorted in memory after the DB filter (v1 scale:
  hundreds of projects).
- Documents: mime allow-list `application/pdf`, `.docx`, `.xlsx`, `.pptx` Office types, `image/png`, `image/jpeg`,
  `application/zip`; ≤ 25 MB; private storage; signed PUT 5 min, signed GET 60 s; `Content-Disposition: attachment`.
- UI uses `packages/ui` tokens only; every data view has skeleton, empty and error states; works at 375 px.

## Review Focus

1. Two people adding the same new client name at once ("Acme" / "acme ") must end with one client, the second gets
   409 with the existing client's id → Task 2 test.
2. A SALES user editing another rep's project by guessing its id (PATCH, status, upsell, document upload) must get
   403, and reading a project they can't see must 404 → Tasks 3, 4, 5 tests.
3. Linking a project as an upsell of its own descendant (A→B→A) or of another client's project must be refused
   (U-2) → Task 4 test.
4. Uploading a 30 MB file, an `.exe` renamed `.pdf` (mime mismatch on confirm), or confirming an upload that never
   happened must be refused, leaving no document row → Task 5 test.
5. The project code sequence must not collide with seeded codes (`PRJ-0001…0040`) on the next create → Task 3 test.

---

### Task 1: Core rules for projects (P2-2 core)

**Files:** Create `packages/core/src/{project-status.ts,duration.ts,project-totals.ts,upsell.ts}`, tests in
`packages/core/test/` with the same names. Modify `packages/core/src/index.ts`.

**Interfaces (Produces):**

- `type ProjectStatus = 'LEAD' | 'PROPOSAL' | 'WON' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'LOST'`
- `ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]>` — exactly the arrows in 06 PS-1: LEAD→PROPOSAL|LOST,
  PROPOSAL→WON|LOST, WON→ACTIVE|LOST, ACTIVE→COMPLETED|ON_HOLD, ON_HOLD→ACTIVE.
- `checkTransition(from, to, ctx: { isAdmin: boolean; milestones: { dueDate: IsoDate | null }[]; hasPayments: boolean }): { ok: true } | { ok: false; rule: 'PS-1' | 'PS-4' | 'PS-6'; message: string }` — Admin bypasses PS-1 only.
- `statusDates(from, to, current: { wonAt: IsoDate | null; closedAt: IsoDate | null }, today: IsoDate): { wonAt; closedAt }` — PS-2: `wonAt` set once when entering WON or ACTIVE; `closedAt` = today on COMPLETED/LOST, cleared when leaving them.
- `endDateFor(start: IsoDate | null, value: number | null, unit: 'WEEKS' | 'MONTHS' | null): IsoDate | null` (D-1; month end clamps: 2026-01-31 + 1 month = 2026-02-28).
- `projectTotals(p: { expectedAmountMinor: bigint; upsellEntries: { amountMinor: bigint }[]; milestones: { amountMinor: bigint; dueDate: IsoDate | null; paidMinor: bigint }[] }, today: IsoDate): { contractValueMinor; scheduledMinor; unscheduledMinor; collectedMinor; outstandingMinor; nextDueDate: IsoDate | null }` — formulas from 05 § Derived values; `nextDueDate` = earliest due ≥ today with balance > 0.
- `wouldCreateCycle(childId: string, parentId: string, parentOf: (id: string) => string | null): boolean`.

- [ ] **Step 1: Failing tests** (names start with rule ids): `PS-1` every allowed pair ok and e.g. LEAD→ACTIVE → `{ ok:false, rule:'PS-1' }`, Admin LEAD→ACTIVE with dated milestone ok; `PS-4` WON→ACTIVE with zero milestones or one undated → `PS-4`; `PS-6` →LOST with payments → `PS-6`; `PS-2` WON sets wonAt=today, second WON keeps original, LEAD→…→ACTIVE skipping WON (Admin) sets wonAt; `D-1` start 2026-01-31 +1 MONTHS → 2026-02-28, +2 WEEKS → 2026-02-14, null start → null; totals fixture: expected 100000, upsell 20000, milestones [50000 due 2026-09-01 paid 50000, 40000 due 2026-10-01 paid 10000, 30000 due 2026-12-01 paid 0], today 2026-10-29 → contract 120000, scheduled 120000, unscheduled 0, collected 60000, outstanding 30000, nextDue 2026-12-01; cycle: A→B exists, linking B as parent of A → true; unrelated → false.
- [ ] **Step 2: Run** `pnpm --filter @salescrm/core test` — FAIL (missing modules).
- [ ] **Step 3: Implement.** Pure functions; bigint only.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(core): project status, duration, totals and upsell rules`.

---

### Task 2: Clients API (P2-1)

**Files:** Create `packages/schemas/src/clients.ts`; `apps/api/src/modules/clients/{clients.module,clients.controller,clients.service}.ts`; test `apps/api/test/clients.e2e.test.ts`. Migration `client_name_unique`: partial unique index `CREATE UNIQUE INDEX client_name_active_unique ON "Client" (lower(btrim(name))) WHERE "archivedAt" IS NULL;`. Modify docs/05 (index), docs/10 if shapes differ.

**Interfaces:**

- `createClientSchema = { name: string 1–120 (trimmed); company?; country? (ISO-2); currency? (3 letters, default base); notes?; contact?: { name?; email; phone? } }`; `updateClientSchema` = partial without `contact`; `contactSchema = { name?; email; phone?; isPrimary? }`.
- `clientListItemSchema = { id, name, company, primaryEmail: string | null, projects: number, archived: boolean }`; `clientDetailSchema` adds `contacts[]`, `projects: { id, code, name, status }[]`, `bookedMinor`, `collectedMinor`, `outstandingMinor`, `currency`.
- Endpoints per [10 § Clients](10-api-spec.md#clients). `GET /clients?q=&includeArchived=&page=&pageSize=` (q = case-insensitive contains on name/company, used by the combobox).
- `ClientsService.findOrConflict(tx, name)`: throws `conflict('CONFLICT', 'A client with this name already exists')` with `details: { clientId }` (C-2). Exported for Task 3 (C-1).
- Writes audited: `client.create`, `client.update`, `client.archive`, `client.contact.create`, `client.contact.update`. Setting `isPrimary` clears others in the same transaction.

- [ ] **Step 1: Failing tests:** create with contact → 201, primary contact stored, audit row; `C-2` duplicate "acme " vs "Acme" → 409 with `details.clientId`; concurrent duplicate creates (`Promise.all` of two POSTs) → exactly one 201 and one 409 (Review Focus 1, relies on the index); archived client's name can be reused; list `q=acm` finds it; `C-3` archive a client with projects → 200 and hidden from default list; CEO POST/PATCH → 403; SALES can create/edit (scope `all`); detail totals for a seeded-style fixture.
- [ ] **Step 2–4:** run `pnpm turbo run test --filter=@salescrm/api` — FAIL, implement, PASS. Map Prisma `P2002` on the index to the same 409.
- [ ] **Step 5: Commit** `feat(clients): clients and contacts API`.

---

### Task 3: Projects API (P2-2)

**Files:** Create `packages/schemas/src/projects.ts`; `apps/api/src/modules/projects/{projects.module,projects.controller,projects.service,projects.query}.ts`; migration `project_code_seq` (`CREATE SEQUENCE project_code_seq;` then `SELECT setval('project_code_seq', COALESCE((SELECT max(substring(code from 5)::int) FROM "Project"), 0) + 1, false);`); modify `apps/api/scripts/seed.ts` to `setval` the sequence after inserting; test `apps/api/test/projects.e2e.test.ts`.

**Interfaces:**

- `milestoneInputSchema = { title: 1–200; description?; amountMinor: positive safe int; dueDate?: IsoDate }`.
- `createProjectSchema = { name; description; clientId?: string; newClient?: { name; email? }; ownerId?; status: LEAD|PROPOSAL|WON|ACTIVE (default LEAD); startDate?; durationValue?; durationUnit?; expectedAmountMinor; currency?; parentProjectId?; tags?: string[]; milestones?: milestoneInput[] }` with refine "exactly one of clientId / newClient".
- `updateProjectSchema` = name, description, startDate, durationValue, durationUnit, expectedAmountMinor, currency (only if no milestones, M-3), tags; plus `updatedAt` for optimistic concurrency (409 on mismatch).
- `projectListQuerySchema = pagination + { q?; status?: ProjectStatus[] (comma list); clientId?; ownerId?; wonFrom?; wonTo?; hasOverdue?: boolean; sort?: 'code'|'name'|'wonAt'|'contractValue'|'outstanding'|'nextDue'; dir?: 'asc'|'desc' }`.
- `projectListItemSchema = { id, code, name, status, currency, client: { id, name }, owner: { id, name }, wonAt, contractValueMinor, collectedMinor, outstandingMinor, nextDueDate, hasOverdue }`; `projectDetailSchema` adds description, dates, duration, tags, parent `{ id, code, name } | null`, `upsellProjects[]`, `upsellEntries[]`, milestones (number, title, amountMinor, dueDate, paidMinor), totals from `projectTotals`, `updatedAt`, `canEdit: boolean`.
- Endpoints per [10 § Projects](10-api-spec.md#projects): list, create, get, patch, `POST /projects/:id/status`, `PATCH /projects/:id/owner`.
- Create = one transaction: newClient via `ClientsService.findOrConflict` + create (C-1); code `PRJ-` + `nextval` padded to 4; owner = self unless caller has `projects.reassign`; `endDate` via `endDateFor`; `wonAt` via `statusDates`; milestones numbered 1..n; `checkTransition('LEAD', status, …)` for the initial status (so ACTIVE needs dated milestones); audit `project.create`.
- Status endpoint uses `checkTransition` + `statusDates`; violation → `RuleViolation(rule, message)`; audit `project.status`.
- Visibility: list/get use `ownerWhere(user, 'projects.read')`; writes `assertCanAccess(user, 'projects.write', ownerId, 'write')`.

- [ ] **Step 1: Failing tests:** F1 create with `newClient` + 3 milestones → 201, client created, code `PRJ-0001`, milestones M1–M3, audit; newClient conflict → 409 and **no** project or client row created (C-1); after `runSeed`, next create gets `PRJ-0041` (Review Focus 5); SALES create with `ownerId` of another user → owner is still self; ADMIN may set owner; `PS-4` create as ACTIVE with an undated milestone → 400 rule PS-4; status LEAD→ACTIVE as SALES → 400 PS-1, as ADMIN with dated milestones → 200 and wonAt set; →LOST with payments → 400 PS-6; PATCH another rep's project as SALES → 403 (Review Focus 2); PATCH with stale `updatedAt` → 409; list filters `status=ACTIVE,ON_HOLD`, `hasOverdue=true`, `sort=outstanding&dir=desc` against a fixture; `D-1` endDate on create and on duration change; CEO writes → 403; `PATCH /owner` SALES → 403.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(projects): projects API with status rules and codes` (docs/10 if shapes changed, docs/17).

---

### Task 4: Upsells API (P2-3)

**Files:** `apps/api/src/modules/projects/upsells.controller.ts` + service methods; schemas `upsellEntrySchema = { amountMinor; date: IsoDate (≤ today); note? }`, `setParentSchema = { parentProjectId: string | null }`; test `apps/api/test/upsells.e2e.test.ts`.

**Interfaces:** `POST /projects/:id/upsells` → entry; `DELETE /projects/:id/upsells/:uid` → 204; `PUT /projects/:id/parent` → detail. U-1 entries only on projects with `wonAt`; U-2 parent same client, not self, `wouldCreateCycle` false. Audits `project.upsell.add|remove`, `project.parent.set`.

- [ ] **Step 1: Failing tests:** add entry → contract value grows by amount (detail totals); entry on LEAD project → 400 U-1; parent of another client → 400 U-2; A child of B then B child of A → 400 U-2 (Review Focus 3); self-parent → 400; clearing parent with `null` → 200; non-owner SALES → 403; CEO → 403.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(projects): upsell entries and upsell project links`.

---

### Task 5: Storage drivers and Documents API (P2-4)

**Files:** `apps/api/src/modules/storage/{storage.module,storage.driver,local.driver,s3.driver,local-storage.controller}.ts`; `apps/api/src/modules/documents/{documents.module,documents.controller,documents.service}.ts`; schemas `documents.ts`; extend `packages/config` with `STORAGE_DRIVER` (`local`|`s3`), `STORAGE_LOCAL_DIR`, `S3_*` (required when driver is s3; `S3_REGION` default `auto`); tests `apps/api/test/documents.e2e.test.ts`, `apps/api/test/s3-driver.test.ts`.

**Interfaces:**

- `interface StorageDriver { presignPut(key: string, mimeType: string, sizeBytes: number): Promise<{ url: string; headers: Record<string,string> }>; presignGet(key: string, fileName: string): Promise<string>; head(key: string): Promise<{ sizeBytes: number; mimeType: string } | null>; delete(key: string): Promise<void> }`.
- Local driver: URLs to `/api/v1/storage/local/:token` where token = base64url(JSON `{ key, op, exp, mime?, size? }`) + HMAC (session secret); `PUT` accepts `express.raw({ limit: '25mb' })`, enforces size and content-type from the token; `GET` streams with `Content-Disposition: attachment; filename="…"`. Route is `@Public()` — the HMAC token is the authorisation.
- `requestUploadSchema = { name: 1–200; type: DocumentType; mimeType: allow-listed; sizeBytes: 1..26_214_400 }` → `POST /projects/:id/documents/upload-url` → `{ documentId, url, headers }`; the document row is created in state `pending` (add `status: PENDING | READY` to `Document` via migration) with key `projects/<projectId>/<documentId>`.
- `POST /documents/:id/confirm` → `head()` must exist with matching size and mime, else delete row (and object) and 400; sets READY; audit `document.upload`.
- `GET /projects/:id/documents` (READY only), `GET /documents/:id/download` → `{ url }` (60 s), `DELETE /documents/:id` → 204, audit `document.delete`. Read/write scopes as projects.

- [ ] **Step 1: Failing tests:** full local round trip (request → PUT bytes → confirm → list → download bytes equal, header `attachment`); `sizeBytes` 30 MB → 400; mime `application/x-msdownload` → 400; confirm without upload → 400 and no row (Review Focus 4); PUT with a body larger than the token's size → 413/400; expired token → 403; tampered token → 403; non-owner SALES upload → 403; CEO download → 200. `s3-driver.test.ts`: presigned PUT/GET URLs contain bucket host, key and `X-Amz-Expires=300` / `60` (offline, fake credentials).
- [ ] **Step 2–4:** FAIL → implement → PASS. Pending rows older than 1 h are ignored in lists (no cleanup job in v1; noted in docs/17).
- [ ] **Step 5: Commit** `feat(documents): private document storage with signed URLs` (docs/05 status column, docs/11 if changed).

---

### Task 6: Web — projects list and detail (P2-5)

**Files:** `packages/ui/src/components/{tabs,badge,table,dialog,popover,command,empty-state}.tsx`; `apps/web/src/lib/money.ts` (`fromApiMoney`, `formatApiMoney(minor: number, currency)`); `apps/web/src/features/projects/{api.ts,ProjectsListPage.tsx,ProjectDetailPage.tsx,StatusBadge.tsx,tabs/{OverviewTab,UpsellsTab,DocumentsTab,ActivityTab}.tsx}`; router entries `/projects`, `/projects/:id`; tests `ProjectsListPage.test.tsx`, `ProjectDetailPage.test.tsx`.

**Interfaces:** hooks `useProjects(query)`, `useProject(id)`, `useChangeStatus(id)`, `useAddUpsell(id)`, `useSetParent(id)`, `useDocuments(id)`, `useUploadDocument(id)` (request → PUT → confirm), `useProjectActivity(id)` (GET /audit?entity=Project&entityId=). List state (filters, sort, page) lives in the URL query string. Columns per S3; saved views "Active", "Pipeline", "Has overdue" are links that set query params. Detail header shows contract value / collected / outstanding / unscheduled warning (MS-4); status menu offers only `ALLOWED_TRANSITIONS` (all statuses for Admin); write controls hidden when `canEdit` false.

- [ ] **Step 1: Failing tests:** list renders rows from a stubbed response with formatted ₹ amounts; changing the status filter updates the URL and refetches; empty result shows the empty state; detail shows unscheduled warning when totals differ; SALES viewing another rep's project sees no edit controls; upload flow calls the three endpoints in order and shows the file.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(web): projects list and detail`.

---

### Task 7: Web — project form with client combobox (P2-6)

**Files:** `apps/web/src/features/projects/{ProjectFormPage.tsx,ClientCombobox.tsx,MilestoneRowsEditor.tsx,MoneyInput.tsx}`; routes `/projects/new`, `/projects/:id/edit`; tests for each component.

**Interfaces:** `ClientCombobox({ value, onChange })` — `value: { clientId: string } | { newClient: { name: string; email?: string } } | null`; searches `GET /clients?q=` (debounced 200 ms); last option "+ Add new client" reveals name + email fields; on a 409 from create it switches to the existing client id from `details.clientId` and shows "Using existing client <name>". `MoneyInput` parses with `toMinor` and shows the `MoneyParseError` message. `MilestoneRowsEditor` (create only) shows running total vs expected amount and an "unscheduled ₹X" note.

- [ ] **Step 1: Failing tests:** combobox lists matches and selecting sets `{ clientId }`; "+ Add new client" path submits `newClient`; 409 swaps to the existing client; money input rejects `12.345` with the message; milestone total shows remaining; submit posts one request with milestones and navigates to the new project.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(web): project form with client combobox and milestones`.

---

### Task 8: Web — clients (P2-7)

**Files:** `apps/web/src/features/clients/{api.ts,ClientsListPage.tsx,ClientDetailPage.tsx,ClientFormDialog.tsx}`; routes `/clients`, `/clients/:id`; tests.

- [ ] **Step 1: Failing tests:** list columns per S8 with search; detail shows contacts, projects (with upsell children indented under parents) and totals; create/edit dialog validation; archive confirmation; CEO sees no write controls.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(web): clients list and detail`.

---

### Task 9: Web — settings, users and audit log (S9; added to Phase 2)

**Files:** `apps/web/src/features/settings/{SettingsPage.tsx,CompanySettingsForm.tsx,UsersPanel.tsx,InviteUserDialog.tsx}`; `apps/web/src/features/audit/AuditLogPage.tsx`; docs/13 (add this task as P2-8); tests.

**Interfaces:** uses `GET/PATCH /settings`, `GET /users`, `POST /users/invite`, `PATCH /users/:id`, `POST /users/:id/reset-link`, `GET /audit`. Invite and reset dialogs show the returned URL with a Copy button and its expiry (D-010). Changing role/active asks for confirmation and shows the server's `LAST_ADMIN` message.

- [ ] **Step 1: Failing tests:** settings form saves changed fields only; invite dialog shows the link + copy; demoting the last admin shows the 409 message; audit table paginates and filters by entity.
- [ ] **Step 2–4:** FAIL → implement → PASS. Manual: invite a user in the browser, open the link in a private window, accept, sign in.
- [ ] **Step 5: Commit** `feat(web): settings, users and audit log` (docs/13, docs/17 — mark Phase 2 done).

---

## Order and parallelism

`1 → 2 → 3 → (4 ∥ 5) → 6 → (7 ∥ 8 ∥ 9)`. Task 6 adds the shared UI components that 7–9 use.

## Definition of done for Phase 2

All tasks committed on `feat/phase-2-clients-projects`; `pnpm verify` green; flows F1 and F4 work in the browser for
ADMIN and SALES, and CEO sees everything read-only.
