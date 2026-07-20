# Plan 33-01 Summary — PERF-05: shared hydration boundary fix

**Status:** COMPLETE 2026-07-16 · **Commit:** e7e14e64

## What shipped

- **`lib/server/hydrationState.ts` (new).** `deserializeHydrationState(state)`
  unwraps the superjson `{ json, meta }` wrapper that
  `createServerSideHelpers({ transformer: superjson }).dehydrate()` emits
  (Pages-Router idiom) back to the raw `DehydratedState` that the App Router
  `<HydrationBoundary>` requires; a raw state passes through unchanged (same
  reference). Root-cause comment (v2.4 trap #2, CONCERNS §Ph28.1(1)) moved
  here from the inline fix. Plain module — deliberately no `import
  "server-only"` (pure data function, unit-testable under Vitest).
- **`lib/server/hydrationState.test.ts` (new).** Pins both branches:
  superjson-wrapped → structurally-equal raw state with a superjson-sensitive
  `Date` surviving as a real `Date` (proves genuine deserialization);
  raw → same-reference passthrough.
- **Three call sites migrated:**
  - `app/(dashboard)/users/spatial-graph/page.tsx` — inline guard block
    (commit 9fb54cb8) deleted, replaced with the helper. Behavior identical
    by construction.
  - `app/(dashboard)/layout.tsx:45→46` — was raw `helpers.dehydrate()`;
    families/clash/sim/exam/kpi/trello prefetches now actually hydrate.
  - `app/(dashboard)/users/page.tsx:13→14` — was raw; directory prefetches
    now actually hydrate.

## Deviations

1. **Repo-map baseline ratchet (unplanned, in-scope housekeeping).**
   `node scripts/repo-map/check.cjs` FAILED before any 33-01 change landed:
   Phase 29 commit `31ecc672` added a third `scripts/build-instance-features.ts
   → app/(dashboard)/users/access-analysis/instanceFeatureNumerics.ts` edge
   (same documented-deferred BND-03 group-2 family as the two baselined edges)
   without ratcheting `.tools/repo-map/baselines/dependency-cruiser-baseline.json`.
   Regenerating the map (`npm run repo-map:check`) did not clear it — the
   baseline file is the tracked set. Updated the baseline to the live 3-edge
   set with a dated policy note, matching the established 2026-07-14 ratchet
   pattern. Pre-existing failure, reported separately from this plan's work.

## Gates (all run, exact outcomes)

| Gate | Result |
|---|---|
| `npx vitest run lib/server/hydrationState.test.ts` | 2/2 passed |
| `npx tsc --noEmit` | clean (no output) |
| `node scripts/repo-map/check.cjs` | **PASS** after baseline ratchet (3 dep-cruiser warnings all baselined; ast-grep 248 findings, no blocking rule above baseline) |

Browser-level no-refetch network evidence deliberately deferred to plan 33-02
(recorded on the same isolated `:3100` build as the pre-split baseline) — per
plan; NOT claimed here.

## Durable follow-up debt

- None new. The pre-existing BND-03 group-2 `scripts → app` edges (now 3)
  remain the documented deferred family; the CONCERNS §B "down from 6" note
  is now "3 edges" — corrected when CONCERNS rolls forward at phase close.
