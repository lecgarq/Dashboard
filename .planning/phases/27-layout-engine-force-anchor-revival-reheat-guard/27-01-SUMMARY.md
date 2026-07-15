---
phase: 27-layout-engine-force-anchor-revival-reheat-guard
plan: 01
status: complete
completed: "2026-07-15T13:06:29.2400399-06:00"
commit: 4cb001be
requirements: [PERF-02]
---

# 27-01 Summary — Frozen Reheat Guard & Permission Tier

## Shipped

- Added one frozen-renderer invariant that invokes `applySliders`, `setClustering`,
  `setClusters`, and `setClusterPositions` and proves zero Cosmos start, reseed,
  cluster, anchor, strength, or config mutation calls.
- Derived `permTier` at the pure-JS membership-row boundary from the existing
  `permissionStrength` ladder: 1 view, 2 download, 3 upload, 4 edit, 5 control;
  0 remains unknown.
- Preserved the parked GPU-mode characterization tests unchanged.

## Files

- `app/(dashboard)/users/access-analysis/GraphCanvas.test.ts`
- `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts`
- `app/(dashboard)/users/access-analysis/graphNodesFromUsers.test.ts`

## Verification

- TDD red: `graphNodesFromUsers.test.ts` failed exactly five strength cases because
  `permTier` was `null`.
- `npx vitest run "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts" "app/(dashboard)/users/access-analysis/graphNodesFromUsers.test.ts"` — 2 files, 36 tests passed.
- `npx tsc --noEmit` — exit 0.
- `git diff --check` over the three plan files — exit 0.

## Deviations / Preserved WIP

- No `GraphCanvas2D.tsx` production edit was necessary: all four entry points already
  had the correct explicit frozen-mode guard. The missing deliverable was the invariant
  that makes regressions visible.
- Pre-existing `project_status` edits in both graph-node files were left in the working
  tree and excluded from commit `4cb001be` via partial staging.

## Durable Follow-up

- None from this plan. Historical embedding-row pruning and per-membership company
  authority remain the Phase 27 context's explicit deferred items.
