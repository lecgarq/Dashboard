# Active WIP & Boundaries

> Who owns what right now, what must not be touched, and how to avoid corrupting the shared tree.
> Pairs with [`../workflows/multiterminal-coordination-workflow.md`](../workflows/multiterminal-coordination-workflow.md)
> and [`../workflows/surgical-staging-workflow.md`](../workflows/surgical-staging-workflow.md).

## Active terminals

| Terminal | Owns (writes) | Role |
|----------|---------------|------|
| **T1** | The **P5-C AccActivity** slice (see file list below). Active implementation. | Runtime/implementation |
| **T2** | `docs/superpowers/**` only (workflows + this codebase-map). | **Docs-only** |

T2 may **read** anything; T2 **writes** only docs.

## T1-owned files (do NOT edit as T2)

The P5-C activity-mix path — landed in the tree and still T1's:

- `lib/acc/activityAggregate.ts` (+ `activityAggregate.test.ts`)
- `lib/acc/activityCategories.ts` (the activity-mix consumer)
- `lib/server/acc-hot-cache.ts` — the `includeActivityMix` query path
- `lib/acc/dcUserAssembly.ts` — activity plumbing (`activityByInstance`)
- `server/routers/acc-dc-graph.ts` — the `includeActivityMix` flag
- `app/(dashboard)/users/access-analysis/graphTables.ts` — activity columns
- `app/(dashboard)/users/access-analysis/featureSnapshot.ts` — activity fields + risk finalize
- `app/(dashboard)/users/access-analysis/interactionTypes.ts` — activity fields
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` — `includeActivityMix: true`
- the P5-C tests (`acc-dc-graph.test.ts`, `acc-hot-cache.test.ts`, `featureSnapshot.test.ts`,
  `dcUserAssembly.test.ts`, `graphTables.test.ts`)

## Forbidden areas for documentation-only work (T2)

All of these are **read-to-document, never edit**:

- **All runtime app code** (`app/**`, `server/**`, `lib/**`, `components/**`, `hooks/**`).
- **T1's P5-C files** (above).
- **Graph internals:** lasso (`LassoOverlay.tsx`), camera, nav/routes (`page.tsx`, route files),
  `UserDetailPanel.tsx`, renderers (`GraphCanvas2D/3D.tsx`, `CosmosCanvasClient.ts`), graph physics
  (`physicsLayer.ts`, `mathLayer.ts`), edge layers (`sameUserEdges.ts`, `linkEmphasis.ts`), router
  (`server/routers/*`).
- **AccActivity aggregation implementation** (`activityAggregate.ts` and its callers).
- **Tests** — except *documenting* the test map (no edits).
- **`prisma/schema.prisma`**, generated areas, root `CLAUDE.md`, `.claude/skills/`.

## Charts WIP

The `/access-analysis` charts redesign (ChartPanel, chartColors, HeadlineInsights, ActiveFiltersBar,
HistogramPanel/DonutPanel/HeatmapPanel/DistributionPanel) landed across many commits on
`feat/access-analysis-redesign` and is **not merged to `deploy`**. Treat these as part of the active branch
WIP — read freely, but they are runtime code (forbidden for T2 edits) and may still be in flux.

## How to detect pre-existing WIP

Run at session start (read-only):

```bash
git status --short              # modified/deleted tracked files you did NOT create
git diff --cached --name-only   # the staging-index hazard: what is ALREADY staged
git branch --show-current       # feat/access-analysis-redesign
git rev-list --count deploy..HEAD
```

This branch carries **large baseline WIP** (hundreds of commits ahead of `deploy`, plus uncommitted
modifications and deletions such as the `.gsd/` tree, which was archived to `docs/archive/planning/`). Those
changes are **not yours**.

## Baseline-WIP rule

1. **Observe it, never absorb it, never revert it.**
2. **Never** `git add -A` / `git add .` / `git add -u` / `git commit -a`.
3. **Never** `git restore` (without `--staged`), `git checkout -- <path>`, `git reset --hard`, or
   `git clean` on baseline WIP — these destroy uncommitted work.
4. Stage by **explicit path only**; verify `git diff --cached --name-only` shows **only** your files before
   committing.
5. Unstage stray index entries with `git restore --staged <path>` (index-only, safe).

Full procedure + checklist:
[`../workflows/templates/baseline-wip-handling.md`](../workflows/templates/baseline-wip-handling.md).

## If a task needs a forbidden file

Stop and surface it. Do not work around a boundary by editing an owned/forbidden file "just a little".
Request a boundary change from the user (or coordinate with T1).
