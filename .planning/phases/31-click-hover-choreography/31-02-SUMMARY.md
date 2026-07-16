# 31-02 SUMMARY — Unified matches-first profile rail

**Status:** COMPLETE · 2026-07-16

## What shipped

- `NeighborMatchesPanel` is now a rail section, not an absolute card. It keeps
  the Phase-30 twin affordance, distinct match scores, why chips, coverage
  suffixes, and re-isolation callbacks, while removing the duplicate selected
  identity and `Open profile` action.
- The match section has truthful parent-fed states: three static skeleton rows
  while loading, an inline unavailable message on query error, and an explicit
  no-distinct-matches line for a valid empty payload. No spinner or fake match.
- `UserProfilePanel` gained one rail-only `railPrelude` seam. The existing
  single identity header + Close remains authoritative; the match section and
  existing ACC body now share one scroll region in that order.
- `RightPanelStack` threads the prelude only into the user-detail layer and
  preserves user-detail > lasso > base precedence plus persisted width.
  The old sequential `AnimatePresence mode="wait"` swap was replaced by one
  overlapping 180ms ease-out transition inside an absolute fixed-width slot;
  reduced motion removes translation and uses duration 0.
- `AccessAnalysisShell` no longer mounts the floating match card over the graph.
  It supplies the existing query payload/coverage/index join to the rail section
  and keeps match/twin clicks on the existing `setIsolated` path.

## Gates

- Focused Vitest:
  `NeighborMatchesPanel.test.tsx`, `UserProfilePanel.test.tsx`,
  `RightPanelStack.groupBy.test.tsx`, `embeddingMapSeam.test.tsx`
  → **4 files / 30 tests passed**.
- `npx tsc --noEmit` → **clean** (exit 0).
- Impeccable deterministic design gate over the three rail surfaces → `[]`
  (**zero findings**).
- Scoped `git diff --check` → clean; only repository LF→CRLF warnings.

## Deviations

- `embeddingMapSeam.test.tsx` required no edit; its existing shell seam test stayed
  green against the new `neighborPanel` prop.
- The first focused run caught the pre-existing serialized rail transition:
  `mode="wait"` left the base panel mounted while user detail waited. The
  implementation was corrected to a single concurrent 180ms swap, then the
  complete focused gate was rerun green.
