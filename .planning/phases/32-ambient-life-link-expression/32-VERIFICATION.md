# Phase 32 Verification — Ambient Life & Link Expression

**Status:** VERIFIED + DEPLOYED
**Completed:** 2026-07-16
**Production BUILD_ID:** `wiAv-e6WVMCVkPo2ie-5N`

## Requirement coverage

### LIFE-03 — Ambient graph life with measured degradation

**PASS.** Every loaded membership node receives a deterministic, node-id-seeded,
anchor-relative x/y micro-orbit. The six existing activity-recency buckets control
amplitude and speed monotonically; radius and z remain unchanged. Hover freezes the
hovered node, click focus freezes the selected node plus ten distinct matches, and
the remaining graph continues at restrained amplitude. Catalog morphs pause offsets
and resume over 180 ms. Reduced motion and hidden tabs use exact anchors and reset
sampling.

The motion composes after the existing catalog transition and travels through the
unchanged frozen `getPositionsOverride` -> rAF -> `pushPositions` path. No GPU
simulation start, resume, reheat, anchor mutation, or second renderer was added.

The locked safety controller evaluates 3-second windows, downgrades after two
consecutive windows below 50 fps, caps Tier 1 to <=60-day nodes at 30 Hz, makes
Tier 2 static, and recovers one tier only after ten seconds at >=55 fps.

Final production-browser evidence on the shipped banded-link path:

- **22,279 nodes** and **14,200 client-mapped similarity links**.
- **20.68 fps** over **10.009 seconds**.
- Tier **0 -> 1 -> 2**, ending with **0 animated nodes**.
- Controller threshold sequence **`[0,1,2,1]`**.

The hard Tier-0 gate therefore failed after the moving 14,200-edge Canvas web was
enabled. LIFE-03 still passes by its explicit fallback clause: degradation was
observed, recorded, and leaves the workshop surface static instead of sustaining
jank. The earlier plan-01 pre-link sample held Tier 0 at 60.04 fps; it is retained
as diagnostic evidence, not presented as the final shipped-path result.

### LIFE-05 — Intentional similarity-link expression

**PASS.** Existing real-distribution normalized scores map at the exact locked
boundaries into weak `[0,1/3)`, medium `[1/3,2/3)`, and strong `[2/3,1]` bands.
Width and alpha rise monotonically while endpoint-hue palette batching remains.
Ambient edges draw first, selected edges next, and hovered incident edges last;
focused edges retain their real/fallback band plus a small priority lift.

During a real Group-by slider drag the web remains mounted, follows current node
positions at the existing ~30 Hz ceiling, and eases only to a 25% opacity floor.
It returns over about 180 ms and snaps to the same targets under reduced motion.

### PERF-02 invariant

**PASS.** `GraphCanvas.test.ts` remains green. All motion stays on the frozen CPU/rAF
position path; no Phase-32 addition starts or reheats Cosmos simulation.

## Gate record

- Plan 32-01 focused Vitest: **2 files / 33 tests passed**.
- Final Phase-focused Vitest: **4 files / 46 tests passed**.
- TEST-01/02/03 server regression gate: **3 files / 21 tests passed**.
- `npx tsc --noEmit`: **clean** before isolated build and immediately before live
  deployment.
- Impeccable deterministic design gate over changed TSX surfaces: `[]`
  (**zero findings**).
- Isolated webpack production build: **passed**, BUILD_ID
  `s1MTfm9k3H-BsEOSNDe8T`.
- `tests/e2e/phase32-ambient.spec.ts` on isolated production `:3100`:
  **4 passed** (both route entries, hard sample/controller, reduced motion,
  real Group-by morph).
- `node scripts/repo-map/check.cjs`: the only above-baseline warning is the
  pre-existing uncommitted `scripts/build-instance-features.ts` ->
  `instanceFeatureNumerics.ts` boundary; no Phase-32 path participates.
- Legacy `run-engineering-gates.cjs --static-only`: typecheck and boundary
  checks passed; repo-map reflected the unrelated warning, and its Unix `grep`
  command is unavailable under Windows PowerShell. It is not claimed as a
  positive Phase-32 gate.
- Scoped diff checks: clean apart from repository LF-to-CRLF notices.

## Deployment

`autoDeploy:true` invoked the full guarded local sequence. The Dashboard task was
stopped, port 3000 freed, typecheck and production build passed, then the task was
restarted. Startup required about 46 seconds before the listener appeared.

Production evidence captured 2026-07-16:

- Dashboard scheduled task: **Running**.
- Port **3000 listening**.
- `/api/health`: **200**, database **connected**.
- Production BUILD_ID: `wiAv-e6WVMCVkPo2ie-5N`.
- Authenticated Chromium live-route smoke: **1 passed**; both
  `/users/spatial-graph` and `/users/access-analysis` rendered the graph shell.

The local rebuild deploys the complete current working tree by repository policy;
Phase-32 commits themselves were staged and committed only by explicit path.

## Deviations and durable concern

- The configured 18k server edge budget maps to 14,200 current client edges after
  unknown endpoints and self-pairs are dropped.
- The full moving web does not sustain Tier 0 on the final full-data gate. The
  controller satisfies the required safety behavior, and the Canvas2D ceiling is
  rolled to `CONCERNS.md` for Phase-33 profiling. No unproved `VERIFY:` item is
  introduced.

## Phase commits

- `376da346` — capture Phase 32 context
- `21960405` — plan ambient life and link expression
- `6cd7b68c` — add ambient graph life
- `3a48274a` — express graph link strength
