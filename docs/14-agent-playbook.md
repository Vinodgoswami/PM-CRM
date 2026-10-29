# 14 · Agent playbook

How the owner and AI agents (Claude Code or others) work on SalesCRM together. Agents: read this file fully before
starting any task.

## Roles

| Who        | Does                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Owner      | Approves docs and decisions, assigns tasks, reviews PRs, supplies theme, answers open questions |
| Lead agent | Breaks work into tasks from [13](13-roadmap.md), writes briefs, reviews other agents' output    |
| Task agent | Implements exactly one task per brief, reports back                                             |

## Rules for every agent

1. **Read first**: `AGENTS.md`, this file, then only the docs your brief lists.
2. **Stay in scope**: one task id, the files it needs. Found something else? Note it in your report under
   "Follow-ups"; don't fix it.
3. **Docs win**: build what [06](06-business-rules.md), [05](05-data-model.md), [07](07-roles-and-permissions.md),
   [09](09-dashboard-spec.md), [10](10-api-spec.md) say. If they are wrong or unclear, stop and ask; do not invent
   behaviour. Never change a rule without a decision in [15](15-decisions-and-open-questions.md).
4. **Gates are not optional**: never `--no-verify`, never weaken `scripts/`, `.husky/`, `.github/`, never edit an
   applied migration.
5. **Test first** for business logic; name tests after rule ids.
6. **Update docs + status** in the same PR (gate-enforced for schema/API/core/routes).
7. **Report honestly**: what passed, what didn't, what wasn't verified.

## Task brief template

Copy, fill, give to the agent.

```md
# Task <ID>: <title>

## Goal

<one or two sentences: what will be true when done>

## Read

- docs/14-agent-playbook.md
- docs/<nn>-….md §<section>
- <existing files to follow as patterns>

## Scope

- In: <files/folders/endpoints/screens>
- Out: <what not to touch>

## Acceptance criteria

- <copied from docs/13-roadmap.md, plus anything specific>

## Rules that apply

- <rule ids, e.g. P-2, P-4, MS-3>

## Branch

feat/<area>-<short> (base: development)
```

## Report template

The agent ends every task with this, in the PR description and in chat.

```md
# Report <ID>: <title>

## Done

- <what changed, files>

## Verification

- pnpm verify: pass/fail (paste failing output)
- Tests added: <list>
- Manually checked: <browser checks, or "not checked">

## Docs updated

- <files>

## Decisions needed / questions

- <anything blocked or assumed>

## Follow-ups (not done)

- <out-of-scope findings>
```

## Parallel work

Run tasks in parallel only when they don't touch the same files and none needs another's output. Safe groups once
their deps are merged:

| After         | Can run in parallel                                  |
| ------------- | ---------------------------------------------------- |
| P1-1          | P1-2, P1-3, P1-4                                     |
| P1-6 + P1-7   | P2-1, P2-2 (then P2-3, P2-4, P2-5, P2-7 in parallel) |
| P3-1          | P3-2, P4-1                                           |
| P4-2          | P4-3, P4-4, P4-5                                     |
| Theme arrives | P5-1, P5-2 alongside any Phase 2–4 task              |

Each parallel agent works in its **own git worktree / branch**. Shared files that cause conflicts —
`schema.prisma`, `permissions.ts`, router file, `packages/ui` index — are changed by one task at a time.

## Review checklist (lead agent / owner)

- [ ] Matches acceptance criteria and the rule ids in the brief
- [ ] Money: integers only, transaction + audit on writes
- [ ] Permission + ownership checked server-side; CEO 403 test exists
- [ ] No new dependency outside [03](03-tech-stack.md) without a decision
- [ ] Docs + [17](17-implementation-status.md) updated
- [ ] UI: loading/empty/error states, tokens only, reduced motion, 375 px
- [ ] `pnpm verify` and CI green

## Asking the owner

Questions go to [15](15-decisions-and-open-questions.md) as `Q-nn` with options and a recommendation. Once answered,
it becomes a `D-nn` decision with the date. Agents never treat an unanswered question as decided — use the
documented provisional default and say so in the report.
