# 07 · Roles & permissions

Three fixed roles. Permissions are checked on the **server** for every request; the UI hides what a role cannot use,
but that is never the only protection.

| Role  | Who              | In one line                                                                     |
| ----- | ---------------- | ------------------------------------------------------------------------------- |
| ADMIN | Owner            | Everything, including users, settings, reversals, audit log                     |
| SALES | Sales team       | Works on own projects; sees own performance                                     |
| CEO   | CEO / management | Reads everything — performance dashboard, all upcoming invoices — edits nothing |

## Permission matrix

| Permission key      | Capability                                           | ADMIN | SALES        | CEO |
| ------------------- | ---------------------------------------------------- | ----- | ------------ | --- |
| `dashboard.company` | Company-wide dashboard + team performance            | ✓     | —            | ✓   |
| `dashboard.own`     | Dashboard filtered to own projects                   | ✓     | ✓            | ✓   |
| `invoices.read`     | Upcoming invoices & overdue list                     | all   | own          | all |
| `billing.read`      | Completed Billing                                    | all   | own          | all |
| `export`            | PDF / CSV exports                                    | ✓     | own data     | ✓   |
| `projects.read`     | Projects, milestones, upsells, documents             | all   | all (view)\* | all |
| `clients.read`      | Clients                                              | all   | all          | all |
| `projects.write`    | Create/edit projects, milestones, upsells, documents | all   | own          | —   |
| `clients.write`     | Create/edit clients                                  | ✓     | ✓            | —   |
| `payments.create`   | Mark as paid                                         | all   | own          | —   |
| `payments.editMeta` | Edit invoice ID / date / label / note                | all   | own          | —   |
| `payments.reverse`  | Reverse a payment                                    | ✓     | —            | —   |
| `projects.reassign` | Change project owner                                 | ✓     | —            | —   |
| `users.manage`      | Invite users, change roles, deactivate               | ✓     | —            | —   |
| `settings.manage`   | Currency, FY start, timezone                         | ✓     | —            | —   |
| `audit.read`        | Audit log                                            | ✓     | —            | ✓   |

"Own" = `project.ownerId === currentUser.id`.

\* **Provisional (Q-01)**: Sales can _view_ all projects but edit only their own. If the owner chooses "own only",
change `projects.read` for SALES to `own` and filter lists, search and the client page accordingly.

## Enforcement

- The matrix lives in `packages/auth/src/permissions.ts` as data; the web app imports the same file to show/hide UI.
- API: `@Permission('payments.create')` on each handler; an ownership check in the service for "own" scopes
  (`assertCanWriteProject(user, project)`). List endpoints apply the ownership filter in the query, not after.
- A forbidden request returns `403` with code `FORBIDDEN`; a resource the user may not read returns `404`
  (do not reveal it exists).
- Every test suite for a write endpoint includes a CEO case (expect 403) and a non-owner SALES case.

## Accounts

- No public sign-up. Admin invites by email + role; the invite link (single use, 72 h) is shown to the Admin to share
  (no email in v1, D-010) and sets the password. Forgotten password: Admin generates a reset link (single use, 24 h);
  using it ends all of that user's sessions.
- A link only works while its issuer is still an active Admin; demoting or deactivating an admin revokes every
  unused link they issued.
- Concurrent role changes are serialised (admin rows are locked), so the last-admin rule holds even under races.
- At least one active ADMIN must always exist (cannot demote/deactivate the last one).
- Sessions: httpOnly, Secure, SameSite=Lax cookie; 12 h idle timeout, 7-day absolute. Changing role or deactivating
  a user ends their sessions.
- Login rate limit: 5 failed attempts / 15 min per email + IP.
