# 03 · Tech stack

Same family as PayOS so the security kit, tooling and habits carry over. Versions are pinned in `package.json`
files when Phase 1 scaffolds the apps; do not add a library outside this list without a decision in
[15](15-decisions-and-open-questions.md).

| Layer         | Choice                                                                     | Why                                                                  |
| ------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Runtime       | Node 24 (`.nvmrc`), pnpm 11, Turborepo                                     | Matches PayOS; one install, cached tasks                             |
| Language      | TypeScript (strict) everywhere                                             | Shared types between web and API                                     |
| Frontend      | React 19 + Vite                                                            | Internal tool, no SSR needed; fast dev server                        |
| Routing       | React Router (data routers)                                                | Route-level loaders and role guards                                  |
| UI components | Tailwind CSS v4 + shadcn/ui (Radix primitives)                             | Accessible components we own as source; fully themeable              |
| Animation     | Motion (Framer Motion); GSAP or Lottie only if the theme requires it       | Page transitions, count-ups, chart reveals, layout animation         |
| Charts        | Apache ECharts (`echarts-for-react`)                                       | Animated, drill-down, heatmaps/calendars, large series               |
| Server state  | TanStack Query                                                             | Caching, refetch, optimistic updates                                 |
| Tables        | TanStack Table                                                             | Sorting, filtering, column visibility, virtualisation                |
| Forms         | React Hook Form + Zod                                                      | Same Zod schema validates in browser and API                         |
| Dates         | date-fns (+ date-fns-tz)                                                   | FY/quarter maths, timezone-safe                                      |
| Backend       | NestJS                                                                     | Modules, guards for roles, interceptors for audit                    |
| ORM / DB      | Prisma + PostgreSQL 17                                                     | Migrations, type-safe queries; Postgres `date_trunc` for period sums |
| Validation    | Zod (shared `packages/schemas`), via a Nest pipe                           | Single source of truth for payloads                                  |
| Auth          | Email + password (argon2), server sessions in httpOnly cookies, CSRF token | No tokens in browser storage (gate-enforced)                         |
| Files         | S3-compatible (Cloudflare R2 / AWS S3); local disk in dev                  | Private bucket, short-lived signed URLs                              |
| PDF export    | Server-side render of the dashboard view (Playwright `page.pdf`)           | Pixel-matches the screen the CEO sees                                |
| Logging       | pino with redaction                                                        | No secrets or personal data in logs                                  |
| Tests         | Vitest (unit), Supertest + real Postgres (API), Playwright (E2E)           | Money logic is tested against a real database                        |
| Lint / format | ESLint (flat config per package), Prettier                                 | Run on staged files by the pre-commit hook                           |
| Hosting       | Web: Netlify/Vercel. API + Postgres: Render/Railway. Files: R2             | Same as PayOS                                                        |

## Alternative considered

**Next.js full-stack** (one app, server actions): fewer moving parts, but departs from the PayOS layout the
security scripts target, and NestJS fits roles + audit interceptors better. Rejected (D-002).
