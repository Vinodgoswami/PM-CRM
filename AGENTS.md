# AGENTS.md

SalesCRM is a project-oriented sales CRM: clients, projects (with upsell links), milestones, payments/billing,
project documents, role-based access, and a CEO performance dashboard with upcoming invoices.

**All documentation is in [`docs/`](docs/README.md).** Before any task, read:

1. [docs/14-agent-playbook.md](docs/14-agent-playbook.md) — how tasks are briefed, scoped, verified and reported.
2. The docs your task brief lists. Business rules: [docs/06-business-rules.md](docs/06-business-rules.md).

Status: docs **approved 2026-10-29** (D-009 in [docs/15](docs/15-decisions-and-open-questions.md)). Work follows
[docs/13-roadmap.md](docs/13-roadmap.md) task by task.

## Non-negotiables

1. **Money is integer minor units** (paise / cents) in the database and server code — never floats.
2. **Payment amounts are immutable.** Correct with a reversal entry; never UPDATE/DELETE a payment.
3. **Every money-changing write is audited** in the same transaction.
4. **Permissions are enforced on the server** for every request (role + ownership), see [docs/07](docs/07-roles-and-permissions.md).
5. **Secrets never reach browsers or logs.** Sessions are httpOnly cookies; no tokens in web storage.
6. **Uploaded documents are private**, served only via short-lived signed URLs.
7. **Never bypass or weaken the gates** (`--no-verify`, editing `scripts/`, `.husky/`, `.github/`, applied migrations).

## Commands

- `pnpm verify` — format check, scanners, integrity guard, typecheck, lint, tests.
- `pnpm check:obscure` / `pnpm security:check` / `pnpm guard:integrity` / `pnpm docs:check` — individual gates.

Gate details and waivers: [docs/11-security.md](docs/11-security.md). Conventions: [docs/12-coding-standards.md](docs/12-coding-standards.md).
