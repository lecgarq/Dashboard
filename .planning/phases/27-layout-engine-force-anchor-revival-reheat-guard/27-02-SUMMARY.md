---
phase: 27-layout-engine-force-anchor-revival-reheat-guard
plan: 02
status: complete
completed: "2026-07-15T13:15:37.1324950-06:00"
commit: 67d57fc5
requirements: [LAY-01, LAY-02, LAY-03, LAY-04]
---

# 27-02 Summary — Live Strongest-Wins Anchor Layout

## Shipped

- Replaced the flag-off embedding-blob/grid seam with an allocation-stable catalog-anchor
  target that preserves the exact similarity embedding at zero strength.
- Made the strongest active dimension authoritative, with deterministic catalog-order tie
  breaking, confidence/coverage weights, and an organic similarity residual within anchors.
- Retained catalog targets and weights in the frozen static layer and added an optional seam
  for lazily registering generated dimensions without starting a simulation.
- Set the workshop transition to 600 ms and made reduced-motion users receive the settled
  target on the first frame.

## Files

- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`
- `app/(dashboard)/users/access-analysis/GraphCanvas.tsx`
- `app/(dashboard)/users/access-analysis/GraphCanvas.test.ts`
- `app/(dashboard)/users/access-analysis/__tests__/embeddingMapSeam.test.tsx`
- `app/(dashboard)/users/access-analysis/clusterTransitionLayer.ts`
- `app/(dashboard)/users/access-analysis/clusterTransitionLayer.test.ts`
- `app/(dashboard)/users/access-analysis/physicsLayer.ts`
- `app/(dashboard)/users/access-analysis/staticLayer.ts`
- `app/(dashboard)/users/access-analysis/staticLayer.test.ts`

## Verification

- TDD red: the embedding seam initially kept the role target when project had the stronger
  slider; the 600 ms timing assertion initially settled on the legacy quick curve.
- Focused Vitest — 4 files, 42 tests passed.
- Follow-up static/transition Vitest — 2 files, 13 tests passed.
- `npx tsc --noEmit` — exit 0.
- `node scripts/repo-map/check.cjs` — passed; baseline warnings only.
- Explicit staged-path inspection and `git diff --cached --check` — passed.

## Deviations / Preserved WIP

- Reused the existing deterministic spherical-Fibonacci/ordinal catalog targets; no grid,
  force worker, data loader, dependency, or embedding recomputation was introduced.
- The large pre-existing dirty worktree, including graph-node `project_status` edits, remains
  unstaged and untouched.

## Durable Follow-up

- Plan 27-03 supplies the General default, curated primary menu, and lazy actionable
  Dimensions surface through the registration seam delivered here.
