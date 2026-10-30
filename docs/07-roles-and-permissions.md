# 07 · Roles & permissions

Three fixed roles. Permissions are checked on the **server** for every request; the UI hides what a role cannot use,
but that is never the only protection.

| Role  | Who              | In one line                                                                                     |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------- |
| ADMIN | Owner / IT       | Accounts, plus the dashboard's figures with no client or project names (D-022)                  |
| SALES | Project Manager  | Works on own projects; sees own performance, quarter by quarter                                 |
| CEO   | CEO / management | Adds Project Managers; works on any client and project; reversals, settings, import, full audit |

**Flow (D-018, D-021):** Admin creates the CEO → the CEO creates Project Managers → the CEO and Project Managers create
clients, projects and everything inside them (milestones, payments, extra work, documents). When the CEO creates a
project they choose the Project Manager who owns it; only Project Managers own projects. The Admin never sees client or
project records — on the dashboard they get every figure and chart, the people counts and the upcoming-invoice totals,
but lists naming clients or projects are left out (D-022); the audit log shows them account events only. Someone with access to
the server or database can still see everything; this boundary is inside the app.

## Permission matrix

| Permission key      | Capability                                                                        | ADMIN        | SALES        | CEO     |
| ------------------- | --------------------------------------------------------------------------------- | ------------ | ------------ | ------- |
| `admin.overview`    | Counts only: users by role, clients, projects, payments                           | ✓            | —            | —       |
| `dashboard.company` | Company-wide dashboard + team performance, compare (Admin: names left out, D-022) | ✓            | —            | ✓       |
| `dashboard.own`     | Dashboard                                                                         | ✓ (no names) | ✓            | ✓       |
| `invoices.read`     | Upcoming invoices & overdue list                                                  | —            | own          | all     |
| `billing.read`      | Completed Billing                                                                 | —            | own          | all     |
| `export`            | PDF / CSV exports                                                                 | —            | own data     | ✓       |
| `projects.read`     | Projects, milestones, upsells, documents                                          | —            | all (view)\* | all     |
| `clients.read`      | Clients                                                                           | —            | all          | all     |
| `projects.write`    | Create/edit projects, milestones, upsells, documents                              | —            | own          | all     |
| `clients.write`     | Create/edit clients                                                               | —            | ✓            | ✓       |
| `payments.create`   | Mark as paid                                                                      | —            | own          | all     |
| `payments.editMeta` | Edit invoice ID / date / label / note / rate                                      | —            | own          | all     |
| `payments.reverse`  | Reverse a payment                                                                 | —            | —            | ✓       |
| `projects.reassign` | Change project owner; jump project stages                                         | —            | —            | ✓       |
| `users.manage`      | Invite users, change roles, deactivate                                            | ✓            | —            | PMs\*\* |
| `settings.company`  | Company name                                                                      | ✓            | —            | ✓       |
| `settings.manage`   | Currency, FY start, timezone, due-soon days; CSV import                           | —            | —            | ✓       |
| `audit.read`        | Audit log                                                                         | accounts     | —            | ✓       |
| `audit.business`    | Client, project and money events in the audit log                                 | —            | —            | ✓       |

"Own" = `project.ownerId === currentUser.id`.

\*\* The CEO may invite, deactivate and send reset links to Project Managers only (`manageableRoles`); Admin and CEO
accounts are the Admin's. The CEO cannot promote anyone.

\* **Provisional (Q-01)**: Sales can _view_ all projects but edit only their own. If the owner chooses "own only",
change `projects.read` for SALES to `own` and filter lists, search and the client page accordingly.

## Enforcement

- The matrix lives in `packages/auth/src/permissions.ts` as data; the web app imports the same file to show/hide UI.
- API: `@Permission('payments.create')` on each handler; an ownership check in the service for "own" scopes
  (`assertCanWriteProject(user, project)`). List endpoints apply the ownership filter in the query, not after.
- A forbidden request returns `403` with code `FORBIDDEN`; a resource the user may not read returns `404`
  (do not reveal it exists).
- Every test suite for a write endpoint includes a non-owner SALES case (expect 403); since D-018 the CEO may write.

## Accounts

- No public sign-up. Admin invites by email + role (the CEO may invite Project Managers); the invite link (single use, 72 h) is shown to the Admin to share
  (and emailed when email is set up, D-023) and sets the password. Forgotten password: Admin generates a reset link (single use, 24 h);
  using it ends all of that user's sessions.
- A link only works while its issuer may still manage that account: an active Admin for any link, an active CEO for
  Project Manager links. Demoting or deactivating an Admin or CEO revokes every unused link they issued.
- Concurrent role changes are serialised (admin rows are locked), so the last-admin rule holds even under races.
- At least one active ADMIN must always exist (cannot demote/deactivate the last one).
- Nobody changes their own role, deactivates themselves or sends themselves a reset link from the users list; your own
  account lives on **Profile** (user menu), where you change your password with your current one. That ends every
  other session of yours and keeps this one.
- Sessions: httpOnly, Secure, SameSite=Lax cookie; 12 h idle timeout, 7-day absolute. Changing role or deactivating
  a user ends their sessions.
- Login rate limit: 5 failed attempts / 15 min per email + IP.
