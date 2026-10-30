# 10 · API spec

REST + JSON under `/api/v1`. Request/response shapes are Zod schemas in `packages/schemas`; this file lists the
surface. An OpenAPI file is generated from the schemas in Phase 1 (`pnpm openapi`).

## Conventions

- Auth: session cookie. Mutating requests require header `X-CSRF-Token` (value from `GET /auth/session`).
- Money: `{ "amountMinor": 12500000, "currency": "INR" }` — integers only.
- Dates: `YYYY-MM-DD` for calendar dates; ISO 8601 UTC for timestamps.
- Lists: `?page=1&pageSize=25&sort=dueDate:asc&q=…` → `{ items, page, pageSize, total }`. Max pageSize 100.
- Errors: `{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [...] } }`

| HTTP | code                | When                                                      |
| ---- | ------------------- | --------------------------------------------------------- |
| 400  | `VALIDATION_FAILED` | Zod validation / business rule (with rule id, e.g. `P-2`) |
| 401  | `UNAUTHENTICATED`   | No/expired session                                        |
| 403  | `FORBIDDEN`         | Role lacks permission                                     |
| 404  | `NOT_FOUND`         | Missing or not visible to this user                       |
| 409  | `CONFLICT`          | Duplicate client name, stale update                       |
| 409  | `LAST_ADMIN`        | Would leave no active Admin                               |
| 429  | `RATE_LIMITED`      | Login throttling                                          |

- Optimistic concurrency: updates send `updatedAt`; mismatch → 409.

## Endpoints

Invite and reset-link endpoints return `{ "url", "expiresAt" }`; the Admin shares the URL (D-010).

Permission keys from [07](07-roles-and-permissions.md).

### Auth

| Method | Path                 | Permission | Notes                         |
| ------ | -------------------- | ---------- | ----------------------------- |
| POST   | /auth/login          | public     | email, password               |
| POST   | /auth/logout         | session    |                               |
| GET    | /auth/session        | session    | user, role, permissions, csrf |
| POST   | /auth/invite/accept  | public     | token, name, password         |
| POST   | /auth/password/reset | public     | token, password               |

### Users & settings

| Method | Path                  | Permission        |
| ------ | --------------------- | ----------------- |
| GET    | /users                | users.manage      |
| GET    | /owners               | dashboard.company | active Admin / Sales users `{ id, name }` for salesperson filters |
| POST   | /users/invite         | users.manage      |
| POST   | /users/:id/reset-link | users.manage      |
| PATCH  | /users/:id            | users.manage      |
| GET    | /settings             | session           |
| PATCH  | /settings             | settings.manage   |
| GET    | /audit                | audit.read        |

### Clients

| Method | Path                       | Permission    | Notes                                   |
| ------ | -------------------------- | ------------- | --------------------------------------- |
| GET    | /clients                   | clients.read  | `?q=` used by the project-form dropdown |
| POST   | /clients                   | clients.write |                                         |
| GET    | /clients/:id               | clients.read  | with totals                             |
| PATCH  | /clients/:id               | clients.write |                                         |
| POST   | /clients/:id/archive       | clients.write | C-3                                     |
| POST   | /clients/:id/contacts      | clients.write |                                         |
| PATCH  | /clients/:id/contacts/:cid | clients.write |                                         |

### Projects

| Method | Path                       | Permission        | Notes                                                          |
| ------ | -------------------------- | ----------------- | -------------------------------------------------------------- |
| GET    | /projects                  | projects.read     | filters: status, clientId, ownerId, wonFrom, wonTo, hasOverdue |
| POST   | /projects                  | projects.write    | body may include `newClient` and `milestones[]` (F1, C-1)      |
| GET    | /projects/:id              | projects.read     | with derived totals                                            |
| PATCH  | /projects/:id              | projects.write    |                                                                |
| POST   | /projects/:id/status       | projects.write    | `{ status }`, enforces PS-1..PS-6                              |
| PATCH  | /projects/:id/owner        | projects.reassign |                                                                |
| POST   | /projects/:id/upsells      | projects.write    | upsell entry                                                   |
| DELETE | /projects/:id/upsells/:uid | projects.write    |                                                                |
| PUT    | /projects/:id/parent       | projects.write    | `{ parentProjectId \| null }`, U-2                             |
| GET    | /projects/:id/activity     | projects.read     | the project's audit trail (latest 100)                         |

### Milestones

| Method | Path                           | Permission     | Notes                 |
| ------ | ------------------------------ | -------------- | --------------------- |
| GET    | /projects/:id/milestones       | projects.read  | with status & balance |
| POST   | /projects/:id/milestones       | projects.write |                       |
| PATCH  | /milestones/:id                | projects.write | MS-2                  |
| DELETE | /milestones/:id                | projects.write | MS-1                  |
| PUT    | /projects/:id/milestones/order | projects.write | `{ ids: [] }`         |

### Payments

| Method | Path                     | Permission        | Notes                                                   |
| ------ | ------------------------ | ----------------- | ------------------------------------------------------- |
| POST   | /milestones/:id/payments | payments.create   | P-1..P-6; `Idempotency-Key` header required             |
| PATCH  | /payments/:id            | payments.editMeta | only label, invoiceId, paymentDate, note                |
| POST   | /payments/:id/reverse    | payments.reverse  | `{ reason }`, P-5                                       |
| GET    | /payments                | billing.read      | Completed Billing; filters: from, to, clientId, ownerId |

### Invoices (read model)

| Method | Path      | Permission    | Notes                                                                                                 |
| ------ | --------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | /invoices | invoices.read | `?group=true` returns Overdue / This week / This month / Next month / Later / Unscheduled with totals |

### Documents

| Method | Path                               | Permission     | Notes                               |
| ------ | ---------------------------------- | -------------- | ----------------------------------- |
| POST   | /projects/:id/documents/upload-url | projects.write | returns signed PUT url + documentId |
| POST   | /documents/:id/confirm             | projects.write | verifies object exists, size, mime  |
| GET    | /projects/:id/documents            | projects.read  |                                     |
| GET    | /documents/:id/download            | projects.read  | returns signed GET url (60 s)       |
| DELETE | /documents/:id                     | projects.write |                                     |

### Dashboard & export

| Method | Path                  | Permission                        | Notes                                                                                                                      |
| ------ | --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET    | /dashboard            | dashboard.own / dashboard.company | KPIs K1–K12 + series C1–C9 for filters                                                                                     |
| POST   | /imports/preview      | settings.manage                   | `{ csv }` → counts, problems by line, first 100 projects (P6-4); writes nothing                                            |
| POST   | /imports              | settings.manage                   | `{ csv }` → creates clients, projects, milestones, payments in one transaction; 400 with `details.errors` if any row fails |
| GET    | /dashboard/team       | dashboard.company                 | team performance rows                                                                                                      |
| GET    | /dashboard/tables     | dashboard.own                     | T1–T3                                                                                                                      |
| GET    | /dashboard/drilldown  | dashboard.own                     | `?metric=K1&bucket=2026-07`                                                                                                |
| POST   | /exports/pdf          | export                            | `{ path, query }` → file                                                                                                   |
| GET    | /exports/csv/:dataset | export                            | invoices, billing, projects, team                                                                                          |
