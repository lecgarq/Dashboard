# Claude Development Workflows — Index

> **Status:** Durable process docs for working safely in this repo. Markdown only — there is no installed
> `.claude/skills/` mechanism here, and no root `CLAUDE.md`. These workflows are a thin, repo-specific
> harness around the canonical `superpowers:` skills.
>
> **Start here** at the beginning of any non-trivial task.

## How these fit together

```
request → repo-development-workflow (the spine)
            ├─ data-discovery-workflow        (data first, before building)
            ├─ superpowers:brainstorming + writing-plans  → templates/phase-plan
            ├─ subagent-development-workflow   (executing plan tasks)
            ├─ testing-verification-workflow   (the gates)
            ├─ surgical-staging-workflow       (commit safely)
            └─ multiterminal-coordination-workflow (when sharing the tree)
```

## The workflows

| Workflow | Use it when |
|----------|-------------|
| [repo-development-workflow](./repo-development-workflow.md) | Any feature/refactor/non-trivial fix — the ordered spine (discovery → plan → implement → verify → document). |
| [data-discovery-workflow](./data-discovery-workflow.md) | Before any dimension/edge/chart/flag or schema-shaped change — confirm a real, counted source field. |
| [testing-verification-workflow](./testing-verification-workflow.md) | Before claiming done or committing — `npm test`, `tsc --noEmit`, `npm run test:e2e` (:3100). |
| [surgical-staging-workflow](./surgical-staging-workflow.md) | Every stage/commit — explicit paths only, never `-A`/`.`; protects baseline WIP. |
| [subagent-development-workflow](./subagent-development-workflow.md) | Dispatching subagents to execute plan tasks; re-verify the tree on return. |
| [multiterminal-coordination-workflow](./multiterminal-coordination-workflow.md) | When another terminal is active on the same tree — ownership boundaries + scope control. |

## Domain-specific companion (not part of this package — do not overwrite)

- [access-analysis-graph-development](./access-analysis-graph-development.md) — the graph engine's own
  workflows (data discovery detail, dimension addition, edge layers, layout-math validation, renderer
  regression). The general docs above **link into** it; they don't replace it.

## Templates

Copy-paste starting points under [`templates/`](./templates/):

| Template | For |
|----------|-----|
| [phase-plan](./templates/phase-plan.md) | A dated plan under `docs/superpowers/plans/` (`superpowers:writing-plans`). |
| [subagent-task-brief](./templates/subagent-task-brief.md) | The brief handed to a dispatched subagent. |
| [final-task-report](./templates/final-task-report.md) | The completion report (evidence, not claims). |
| [review-checklist](./templates/review-checklist.md) | Self-review / code-review pass. |
| [e2e-gate-report](./templates/e2e-gate-report.md) | Recording the Playwright regression gate. |
| [baseline-wip-handling](./templates/baseline-wip-handling.md) | Session-start snapshot of pre-existing WIP. |
| [scope-creep-detection](./templates/scope-creep-detection.md) | Catching out-of-scope work before it lands. |
| [memory-update-note](./templates/memory-update-note.md) | Proposing a durable memory (ask before writing). |

## Repo facts these encode (so you don't re-derive them)

- **Gates:** `npm test` (Vitest, excludes e2e) · `npx tsc --noEmit -p tsconfig.json` · `npm run test:e2e`
  (Playwright on **:3100**, `NEXT_PUBLIC_ACC_GRAPH_TEST=1`). Baselines at authoring: ~952 unit, 19 e2e.
- **No docs/markdown lint script** in `package.json`; doc-only changes skip lint. (`lint` = eslint,
  `knip` = dead-exports.)
- **Branch reality:** work happens on `feat/access-analysis-redesign`, hundreds of commits ahead of
  `deploy`, carrying large baseline WIP. Stage surgically; never bulk-add; never revert baseline WIP.
- **Deploy is a rebuild, not a git merge:** `start-local.ps1` rebuilds the current checkout's `.next` on
  :3000 — a rebuild ships the whole working tree.
- **Data honesty first:** no feature on uncounted data. Known live baseline ~16,942 nodes, internal ≈ 1,265;
  watch the domain defect and empty-string sentinels.
- **Memory** lives at the auto-memory path (`…/memory/` + `MEMORY.md` index), **not** in repo files.

## Relationship to `superpowers:` skills

These docs **delegate** to the skills; they don't reimplement them. Key bindings:

| Need | Skill |
|------|-------|
| Decide an approach | `superpowers:brainstorming` |
| Write a plan | `superpowers:writing-plans` |
| Implement | `superpowers:test-driven-development` |
| Execute plan tasks | `superpowers:subagent-driven-development` / `executing-plans` |
| Parallel independent tasks | `superpowers:dispatching-parallel-agents` |
| Isolate risky work | `superpowers:using-git-worktrees` |
| Debug a failure | `superpowers:systematic-debugging` |
| Claim done | `superpowers:verification-before-completion` |
| Review | `superpowers:requesting-code-review` / `receiving-code-review` |
| Finish a branch | `superpowers:finishing-a-development-branch` |
