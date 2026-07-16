# 32-02 SUMMARY — Strength-banded, morph-aware similarity links

**Status:** COMPLETE · 2026-07-16

## What shipped

- The existing normalized similarity score now maps at exact `1/3` and `2/3`
  boundaries into weak, medium, and strong bands. Both width and opacity rise
  monotonically, while the existing endpoint-color palette and capped real edge
  set remain authoritative.
- `SimilarityWebOverlay` batches the ambient web by palette plus band, draws
  selected edges after ambient edges and hovered incident edges last, and gives
  focused curves a restrained priority lift without discarding their strength.
- The web consumes the ambient compositor's position version and redraws at the
  existing ~30 Hz ceiling while nodes move. Static frames park again. During a
  real Catalog/Group-by morph it follows current positions at a 25% opacity floor
  and settles back over about 180 ms; reduced motion snaps to the same targets.
- The production browser gate now drives the real Group-by select and Radix
  grouping-strength slider. It proves the canvas remains mounted, ambient offsets
  pause while dragging, motion resumes after release, and no console error occurs.

## Gates

- Phase-focused Vitest (`ambientMotion`, `similarityWeb`, overlay, frozen handle)
  -> **4 files / 46 tests passed**.
- TEST-01/02/03 server regressions -> **3 files / 21 tests passed**.
- `npx tsc --noEmit` -> **clean** before the isolated build.
- Isolated webpack production build -> **passed**, BUILD_ID
  `s1MTfm9k3H-BsEOSNDe8T`.
- `tests/e2e/phase32-ambient.spec.ts` against production `:3100` -> **4 passed**:
  both route entries, full-data/controller evidence, reduced-motion focus, and the
  real grouping morph.
- Final shipped-path full-data sample: **22,279 nodes**, **14,200 mapped links**,
  **20.68 fps** over **10.009 s**. The new moving Canvas2D web did not hold the
  Tier-0 >=50 fps gate; the required controller visibly degraded **Tier 0 -> 1 ->
  2**, ending with **0 animated nodes** rather than shipping sustained jank.
  Injected threshold evidence remained `[0,1,2,1]`.
- Impeccable deterministic design scan over the changed visual surfaces -> `[]`
  (**zero findings**). Scoped `git diff --check` was clean apart from repository
  LF-to-CRLF notices.

## Pre-existing gate limitations

- `node scripts/repo-map/check.cjs` reports the known unrelated above-baseline
  `scripts/build-instance-features.ts` -> `instanceFeatureNumerics.ts`
  `no-scripts-to-app` warning; no Phase-32 file participates.
- The legacy `run-engineering-gates.cjs --static-only` wrapper therefore reports
  that same repo-map result. Its GraphCanvas grep subgate also invokes Unix
  `grep`, which is unavailable under Windows PowerShell. Typecheck and boundary
  subgates passed; the wrapper is not claimed as positive evidence.

## Durable follow-up

- The final banded web makes full 14,200-edge geometry follow 22,279 moving nodes,
  and that Canvas2D redraw cost forces the safety controller to static Tier 2 on
  this production-browser gate. Phase 32 is truthful and interaction-safe, but
  full ambient life is not sustained with live links; the limitation is rolled to
  `CONCERNS.md` for Phase 33 profiling rather than hidden behind the earlier
  pre-link 60.04 fps result.
