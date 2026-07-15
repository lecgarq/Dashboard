---
phase: 26-catalog-slider-wall
plan: 01
subsystem: spatial-graph-catalog
tags: [catalog, right-rail, tabs, CAT-01]
requires: []
provides:
  - "Grouping-default / Catalog-preview base-view seam in the existing right rail"
  - "Catalog visibility independent of NEXT_PUBLIC_ACC_3D_GRAPH"
affects: ["26-02"]
requirements-completed: [CAT-01]
completed: 2026-07-15
status: complete
---

# Phase 26 Plan 01: Production Rail Seam Summary

`/users/spatial-graph` now keeps Grouping as its default right-rail view and exposes
Catalog preview as an explicit second tab in the same resizable rail. The shell no longer
passes a 3D-flag-derived sidebar selector, so the graph flag cannot hide the catalog entry.

## Changed Files

- `RightPanelStack.tsx`: reused the shipped Radix-backed `Tabs` primitive; preserved the
  user-detail/lasso overlay priority, rail width persistence, and existing motion budget.
- `AccessAnalysisShell.tsx`: removed `useGroupByControls={!ACC_3D_GRAPH_ENABLED}`.
- `RightPanelStack.groupBy.test.tsx`: locks Grouping-default state and explicit Catalog activation.

## Commit

- `d54ace25` — `feat(spatial-graph): expose catalog rail view (26-01)`

## Verification

- `npx vitest run RightPanelStack.groupBy` → 1 file, 2/2 tests passed.
- `npx tsc --noEmit` → exit 0, no diagnostics.
- `node scripts/repo-map/check.cjs` → passed; existing baseline remains 2 dependency warnings and 236 AST findings.
- `node .agents/skills/impeccable/scripts/detect.mjs --json "app/(dashboard)/users/access-analysis/RightPanelStack.tsx"` → `[]`.
- Scoped diff: three planned product/test files only; no charts-page, graph-layout, Prisma, package, or user-owned catalog-target changes.

## Deviations

None. The existing shared `components/ui/tabs.tsx` primitive supplied keyboard behavior and
focus states, avoiding a custom tab implementation.

## Next

Execute 26-02: put the full catalog behind this tab, convert it to browse-only rows, reuse
the existing search tree, and surface inline unavailable reasons.

---
*Phase: 26-catalog-slider-wall*
*Completed: 2026-07-15*
