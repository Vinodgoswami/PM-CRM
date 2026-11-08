# 05 · Data model

Source of truth once built: `packages/database/prisma/schema.prisma`. Keep this doc in sync (gate-enforced).

## Entity map

```mermaid
erDiagram
  User ||--o{ Project : owns
  Client ||--o{ ClientContact : has
  Client ||--o{ Project : buys
  Project ||--o{ Project : "upsell of (parentProjectId)"
  Project ||--o{ UpsellEntry : has
  Project ||--o{ Milestone : "split into"
  Milestone ||--o{ Payment : "paid by"
  Project ||--o{ Document : has
  User ||--o{ AuditLog : "acted"
```

## Conventions

- IDs: `cuid2` strings. Every table has `createdAt`, `updatedAt` (UTC), and `createdById` where a user creates it.
- **Money**: `BigInt` column holding **minor units** (paise/cents), named `…Minor` (e.g. `amountMinor`), plus a
  `currency` (ISO 4217). Never `Float`/`Decimal` in code paths. API sends money as a JSON integer (always within
  `Number.MAX_SAFE_INTEGER`) plus currency.
- Calendar dates (due date, payment date, start date) are `DATE`; instants are `TIMESTAMPTZ`.
- Soft delete (`archivedAt`) for clients and projects; **no delete** for payments.

## Entities

### User

| Field        | Type                         | Notes                                 |
| ------------ | ---------------------------- | ------------------------------------- |
| id           | string                       |                                       |
| name         | string                       |                                       |
| email        | string, unique, lowercased   | Login                                 |
| passwordHash | string?                      | argon2id; null until invite accepted  |
| role         | enum `ADMIN \| SALES \| CEO` | See [07](07-roles-and-permissions.md) |
| active       | boolean                      | Deactivated users cannot log in       |
| lastLoginAt  | timestamptz?                 |                                       |

### Session

| Field         | Type           | Notes                                                          |
| ------------- | -------------- | -------------------------------------------------------------- |
| tokenHash     | string, unique | HMAC-SHA256 of the cookie token; the raw token is never stored |
| userId        | FK User        | Cascade on user delete                                         |
| lastSeenAt    | timestamptz    | Idle timeout 12 h (updated at most every 5 min)                |
| expiresAt     | timestamptz    | Absolute timeout: created + 7 days                             |
| ip, userAgent | string?        |                                                                |

### AuthToken (invites and password resets)

| Field       | Type                   | Notes                                        |
| ----------- | ---------------------- | -------------------------------------------- |
| kind        | enum `INVITE \| RESET` |                                              |
| tokenHash   | string, unique         | Single-use; raw token only in the link       |
| email, name | string                 | Invitee details (INVITE)                     |
| role        | Role?                  | Role granted on accept (INVITE)              |
| userId      | FK User?               | Account being reset (RESET)                  |
| expiresAt   | timestamptz            | INVITE 72 h, RESET 24 h                      |
| usedAt      | timestamptz?           | Set in the same transaction that consumes it |
| createdById | FK User                | Admin who issued it                          |

### LoginAttempt

`email`, `ip`, `success`, `at` — indexed `(email, ip, at)`; drives the 5-failures-per-15-min login limit.

### Client

| Field      | Type            | Notes                                                                                         |
| ---------- | --------------- | --------------------------------------------------------------------------------------------- |
| id         | string          |                                                                                               |
| name       | string          | Required. Unique (case-insensitive) among non-archived clients                                |
| nameKey    | string?, unique | `lower(trim(name))` while active, NULL when archived — enforces C-2 with a plain unique index |
| company    | string?         |                                                                                               |
| country    | string?         | ISO country code                                                                              |
| currency   | string          | Default currency for new projects; defaults to base currency                                  |
| notes      | text?           |                                                                                               |
| archivedAt | timestamptz?    |                                                                                               |

### ClientContact

| Field     | Type    | Notes                          |
| --------- | ------- | ------------------------------ |
| clientId  | FK      |                                |
| name      | string? |                                |
| email     | string  | Validated email                |
| phone     | string? |                                |
| isPrimary | boolean | Exactly one primary per client |

### Project

| Field               | Type                    | Notes                                                   |
| ------------------- | ----------------------- | ------------------------------------------------------- |
| id                  | string                  |                                                         |
| code                | string, unique          | Human id, e.g. `PRJ-0042` (sequence)                    |
| name                | string                  |                                                         |
| description         | text                    |                                                         |
| clientId            | FK Client               |                                                         |
| ownerId             | FK User                 | The salesperson; defaults to creator                    |
| status              | enum (see 06)           | `LEAD, PROPOSAL, WON, ACTIVE, ON_HOLD, COMPLETED, LOST` |
| startDate           | date?                   |                                                         |
| durationValue       | int?                    | e.g. 3                                                  |
| durationUnit        | enum `WEEKS \| MONTHS`  |                                                         |
| endDate             | date? (derived, stored) | startDate + duration; recomputed on change              |
| expectedAmountMinor | bigint                  | Base deal value                                         |
| currency            | string                  | Fixed once any milestone exists                         |
| parentProjectId     | FK Project?             | Set when this project is an upsell of another           |
| wonAt               | date?                   | Set when status first becomes WON (editable by Admin)   |
| closedAt            | date?                   | Set when status becomes COMPLETED or LOST               |
| tags                | string[]                |                                                         |
| archivedAt          | timestamptz?            |                                                         |

### UpsellEntry

| Field       | Type   | Notes                         |
| ----------- | ------ | ----------------------------- |
| projectId   | FK     |                               |
| amountMinor | bigint | > 0                           |
| date        | date   | Counts as booked on this date |
| note        | text?  |                               |

### Milestone

| Field       | Type   | Notes                                                             |
| ----------- | ------ | ----------------------------------------------------------------- |
| projectId   | FK     |                                                                   |
| number      | int    | 1, 2, 3… shown as M1, M2; unique per project                      |
| title       | string | The "task"                                                        |
| description | text?  |                                                                   |
| amountMinor | bigint | > 0; cannot go below the amount already paid                      |
| dueDate     | date?  | Required before the project is ACTIVE; drives invoices & forecast |

Status is **derived**, never stored (rules in [06](06-business-rules.md#milestone-status)).

Projects also carry `fxRate`, `fxRateDate`, `fxBaseCurrency` (D-020): the rate saved when the project is created and
again when it is confirmed. Daily rates fetched from the rate service are cached in `FxRate (date, from, to, rate,
source)`.

### Payment (Completed Billing row)

| Field             | Type            | Editable after save | Notes                                                                           |
| ----------------- | --------------- | ------------------- | ------------------------------------------------------------------------------- |
| milestoneId       | FK              | no                  |                                                                                 |
| milestoneLabel    | string          | **yes**             | Snapshot, defaults to `M{number}` (R5)                                          |
| invoiceId         | string?         | **yes**             | From your invoicing tool                                                        |
| paymentDate       | date            | **yes**             | Defaults to today                                                               |
| amountMinor       | bigint          | **no**              | Positive; negative only for a reversal                                          |
| baseCurrency      | string?         | via rate            | Company base currency when recorded (D-020)                                     |
| fxRate            | decimal(20,10)? | **yes**             | Base units per 1 project-currency unit; editing it recomputes `baseAmountMinor` |
| baseAmountMinor   | bigint?         | via rate            | Same money in the base currency; a reversal mirrors it negated                  |
| reversesPaymentId | FK Payment?     | no                  | Set on reversal rows                                                            |
| idempotencyKey    | string?, unique | no                  | Key sent by the Mark-as-paid dialog; a retried request returns the same payment |
| note              | text?           | yes                 |                                                                                 |
| createdById       | FK User         | no                  |                                                                                 |

A database trigger rejects `UPDATE` of `amountMinor`, `milestoneId`, `reversesPaymentId` and any `DELETE`. Check
constraints: `amountMinor <> 0`, and a row is negative exactly when it is a reversal (`reversesPaymentId` set).

### Document

| Field        | Type    | Notes                                                                           |
| ------------ | ------- | ------------------------------------------------------------------------------- |
| projectId    | FK      |                                                                                 |
| paymentId    | FK?     | D-026: set for an invoice / payment slip stored with one payment of the project |
| name         | string  | Original file name                                                              |
| type         | enum    | `PROPOSAL, SOW, CONTRACT, INVOICE, OTHER`                                       |
| storageKey   | string  | Bucket key; never exposed                                                       |
| mimeType     | string  | Allow-list (see 11)                                                             |
| sizeBytes    | int     | ≤ 25 MB                                                                         |
| status       | enum    | `PENDING` until the upload is confirmed, then `READY` (lists show READY only)   |
| uploadedById | FK User |                                                                                 |

### AuditLog

| Field    | Type        | Notes                                   |
| -------- | ----------- | --------------------------------------- |
| actorId  | FK User     |                                         |
| action   | string      | e.g. `payment.create`, `project.update` |
| entity   | string      | Table name                              |
| entityId | string      |                                         |
| before   | jsonb?      | Changed fields only                     |
| after    | jsonb?      |                                         |
| at       | timestamptz |                                         |
| ip       | string?     |                                         |

Append-only (trigger rejects update/delete).

### Setting (single row)

`baseCurrency` (default `INR`), `fyStartMonth` (default 4 = April), `timezone` (default `Asia/Kolkata`),
`dueSoonDays` (default 7), `companyName`.

## Derived values (computed in `packages/core`, never stored)

| Value               | Formula                                                               |
| ------------------- | --------------------------------------------------------------------- |
| contractValue       | `expectedAmount + Σ upsellEntries.amount`                             |
| scheduled           | `Σ milestones.amount`                                                 |
| unscheduled         | `contractValue − scheduled` (warn when ≠ 0 on ACTIVE projects)        |
| paid (milestone)    | `Σ payments.amount` (reversals are negative)                          |
| balance (milestone) | `amount − paid`                                                       |
| collected (project) | `Σ paid` over its milestones                                          |
| outstanding         | `contractValue − collected` on confirmed work, never below 0 (D-061)  |
| upsellValue         | `Σ upsellEntries.amount + Σ contractValue of child (upsell) projects` |

## Indexes

`Milestone(dueDate)`, `Payment(paymentDate)`, `Project(status, ownerId)`, `Project(wonAt)`, `Project(clientId)`,
`AuditLog(entity, entityId)`.
