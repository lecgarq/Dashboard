# Plan — P0 Lasso / Readiness / Load Stability

- **Date:** 2026-05-25
- **Author:** Terminal T2 (plan only — NOT executed)
- **Companion diagnosis:** `docs/superpowers/research/2026-05-25-lasso-readiness-load-diagnosis.md`
- **Status:** PLAN ONLY. Nothing in this document has been implemented. No tests changed. No product physics/camera/highlight code touched.

> Goal: make graph readiness + the lasso e2e stable under machine load **without** hiding real product failures — by reducing and de-randomizing the *cold cost*, not by widening timeouts or weakening discriminating assertions.

---

## 1. Root-cause candidates (ranked by leverage)

| # | Root cause | Evidence | Type | Leverage |
|---|---|---|---|---|
| RC1 | **Per-test cold physics settle** — DuckDB-WASM Worker has no persistence; every Playwright page misses `loadCachedPositions` → full ~16,942-node d3 settle on every `waitForFreeze` test | `duckdbClient.ts` (in-Worker, no OPFS), `positionsCache.ts:129-140`, `physicsLayer.ts:274-301` | Test overhead (cache cold) | **High** |
| RC2 | **Dense-probe grid scan** — `findDensestScreenPoint` runs ~270–370 `findPointsInPolygon` calls × 16,942 nodes in one sync evaluate, lasso only | `graphTestBridge.ts:135-178`, `spec.ts:545` | Test overhead | **High (lasso)** |
| RC3 | **rAF loop never idles** — allocates `n*3` floats + full `g.render()` every frame even when frozen/unchanged | `useGraphRafLoop.ts:61-81`, `GraphCanvas.tsx:124-138`, `physicsLayer.ts:353-362` | **Product perf bug** + test amplifier | **High (product)** |
| RC4 | **120s budget marginal under load** — failure is at `mouse.move` after the preamble consumed the budget | `error-context.md` (graph rendered; timeout at first move) | Test config | Medium (safety net) |
| RC5 | **Post-freeze re-fit latency** — normalize → `dontRescale` push → defer 4 frames → `fitView`, then lasso polls `projectedCloudSize` | `GraphCanvas2D.tsx:264-303`, `spec.ts:511-518` | Product behavior (intentional) | Low |
| RC6 | **Cold bulkUsers + ambient dashboard chrome** — first call heavy; Gmail/Chat panels mount on the page | `acc-hot-cache.ts:160-302`, `error-context.md` snapshot | Product (one-time / ambient) | Low–Med |

The lasso flake = **RC1 + RC2 + RC4**, amplified by **RC3**. The real product slowness = **RC3** (+ RC6 ambient).

## 2. Measured / inferred timings

Read-only diagnosis — these are **inferred from code**, not freshly measured (measuring requires running the suite, which is out of scope). Treat the first task of execution as "measure to confirm".

- Node count: **16,942** (asserted in spec).
- Settle: ~76 ticks (organic preset, αDecay≈0.072); **~1–2 s idle**, **several–10 s+ under ~29-process load** (inferred).
- Dense probe: **~270–370** `findPointsInPolygon` calls × 16,942 ≈ **5–6M** point-in-poly ops/run; **~0.5 s idle → multiple s under load** (inferred).
- rAF steady-state: **~203 KB alloc/frame × ~60 fps ≈ 12 MB/s** GC churn + full redraw, forever (computed from `n*3` floats).
- bulkUsers cold: `groupBy` over ~623k `AccActivity` rows ≈ **218 ms** (per code comment) + 8 parallel `findMany` + assemble; then 10-min server cache + client `staleTime:600_000`.
- Budgets: per-test **120 s**, `expect` **20 s**, webServer **300 s** (`playwright.config.ts:23-24,40`).

## 3. Product load vs test overhead

- **Pure test overhead (safe to optimize aggressively):** RC1 cold-cache settle repetition, RC2 dense probe, RC4 budget. None of these ship to users.
- **Product (must fix carefully, behind the normal review bar):** RC3 idle rAF (real CPU/battery/GC cost). RC6 cold bulkUsers + ambient chrome (lower priority; already cached server-side).
- **Intentional product behavior (leave alone):** RC5 post-freeze re-fit, the settle animation itself (users are meant to see motion).

## 4. Minimal fixes (proposed; each independently shippable, low→high blast radius)

> Ordered so the cheapest, lowest-risk, test-only fixes land first. **Do not bundle.** Each is one atomic commit with its own gate.

### F1 (test-only) — Make the dense probe cheap and deterministic
Reduce RC2 without changing what the lasso *asserts*. Options, in order of preference:
- **F1a:** In `findDensestScreenPoint`, sample a strided subset of nodes for the *coarse* sweep (e.g. every Nth node) to locate the dense region, then do an exact `findPointsInPolygon` only for the final chosen box. Cuts coarse cost ~N×. Keeps the real path for the value the test uses.
- **F1b:** Coarsen the grid (larger `step`, smaller refine window) — fewer cells, same method.
- **Risk:** very low; bridge is test-only (`NEXT_PUBLIC_ACC_GRAPH_TEST` gated), never in prod builds. Must keep the returned point landing on a real dense core so the strict-subset assertion still holds.

### F2 (test-only) — Persist/seed settled positions across Playwright pages
Kill RC1 so only the *first* freeze test settles cold; the rest hit the cache.
- **F2a (preferred):** A Playwright-level warm-up that performs one settle, exports the frozen positions (via a new **test-only** bridge getter or by reading the `positions` table), and replays them into each test's DuckDB before the graph builds — e.g. through `page.addInitScript` + a bridge "seed positions" hook gated by the test flag. Cache hit → instant `frozen` on every subsequent test.
- **F2b (simpler, smaller win):** Reuse a single browser context/page across the read-only `waitForFreeze` tests so the in-Worker cache survives. Conflicts with per-test isolation; weigh carefully.
- **Risk:** medium. Must NOT change production cache semantics or the `LAYOUT_VERSION` hash. Strictly test-harness wiring.

### F3 (product) — Idle the rAF loop when nothing changed
Fix RC3: in `useGraphRafLoop`, skip `getPositions()/onTick*/render` when the layout is **frozen** and there has been **no mask change and no slider reheat** since the last frame; resume on any of: `physics.frozen` flips false (reheat), `maskVersion` increments, mode change, color/size/link update, or container resize.
- This also *removes the e2e amplifier* (frees the main thread during settle/probe).
- **Risk:** medium-high (touches the render pump). Strong unit/e2e coverage required: must prove (a) settle still animates to completion, (b) slider reheat resumes ticking, (c) mask/filter/search/lasso/color still repaint, (d) mode toggle still works. **Out of the lasso-stability critical path** — can be sequenced after F1/F2 if risk-averse.

### F4 (test config) — Targeted budget safety net
Only after F1–F3: if the lasso test is still occasionally tight under load, give *just that test* a higher `test.setTimeout`, or raise the global `timeout` modestly. **Last resort, not first** — a raised ceiling hides regressions if used before the work is cut.

### Explicitly rejected (would hide real failures)
- Removing `waitForFreeze` from the lasso test (would race the layout → flaky *and* false-green).
- Weakening `selected < total` / `projectedCloudSize > 150` / `EXPECTED_NODE_COUNT` assertions.
- Skipping/`.skip`-ing the lasso test.

## 5. What NOT to touch

- **P0 product physics** (`physicsLayer.ts` force model, αDecay/reheat math, normalization to 350) — except F3 is in the *render pump*, not the sim.
- **Camera / fit / highlight** (`GraphCanvas2D.tsx` fit logic, `applyAlphaMask`, `GraphCanvas3D.tsx`).
- **R1 / nav / routes**, **DC ingest / backfill**, **server `bulkUsers` cache semantics** (RC6 is noted, not in scope here).
- The discriminating assertions listed in diagnosis §9.

## 6. Test strategy

- **Before any change:** add temporary instrumentation (console timings already exist via `console.log` in the spec) to *measure* settle time, dense-probe time, and rAF idle behavior on this machine — confirm the inferred timings in §2. Remove instrumentation before final commit.
- **Unit (vitest):** F1 → assert `findDensestScreenPoint` returns a point inside the true densest region on a synthetic fixed layout (determinism preserved). F3 → assert the rAF gate's pure decision function (tick vs skip) given (frozen, maskVersion, reheat) inputs.
- **Keep green:** full unit suite (currently ~1097) + `tsc` 0.

## 7. E2E strategy

- Re-run `npm run test:e2e` **on an idle machine** first to re-establish the 22/22 baseline (per the existing "Lasso e2e load flake" memory — the logic is not broken).
- After each fix, re-run targeting the heavy tests (`-g "lasso"`, plus hover/click/edge-isolate) and confirm wall-clock per test drops.
- Validate F2 by asserting (via the existing `getFrozen()` bridge) that the 2nd+ `waitForFreeze` test reaches `frozen` near-instantly.
- Do **not** judge success by "it passed once" — run the heavy subset ≥3× under deliberate load to confirm the flake is gone.

## 8. Rollback strategy

- One atomic commit per fix (F1, F2, F3, F4) with a descriptive scope — each revertable in isolation.
- F1/F2 are test-only: reverting restores prior behavior with zero product impact.
- F3 (product): if any regression in settle/reheat/repaint appears, `git revert` the single commit; the always-on loop is the known-good fallback.
- No schema/cache-key changes, so no data migration to unwind.

## 9. Atomic tasks (suggested execution order)

1. **T0 — Measure (read-only run):** instrument + run the heavy tests once idle and once under load; record settle/probe/rAF timings. Confirm §2. *(Gate: numbers captured in the diagnosis doc.)*
2. **T1 — F1 dense-probe cost (test-only):** implement F1a/F1b; unit test determinism; re-run lasso. *(Gate: lasso wall-clock down; strict-subset still passes; unit+tsc green.)*
3. **T2 — F2 position reuse (test-only):** implement F2a; verify 2nd+ freeze test is instant via `getFrozen()`. *(Gate: heavy-test suite time down; 22/22 idle.)*
4. **T3 — F3 idle rAF (product):** gate the pump; unit test the decision fn; e2e prove settle/reheat/mask/mode all still work. *(Gate: full unit+tsc+e2e green; manual confirm idle CPU drops.)*
5. **T4 — F4 budget safety net (only if still needed):** targeted timeout. *(Gate: 3× heavy-subset runs under load all green.)*

## 10. Stop conditions

- **Stop and re-plan** if: F2 requires changing production cache-key/`LAYOUT_VERSION` semantics; or F3 cannot be made to reliably resume on reheat/mask without touching the physics or camera code.
- **Stop (success)** when: the heavy `waitForFreeze` subset (esp. lasso) passes **3× consecutively under deliberate machine load** with margin to the 120s budget, full unit (~1097) + `tsc` 0 + e2e 22/22 green, and no discriminating assertion was weakened.
- **Hard stop** on any temptation to `.skip`/`xfail` the lasso test or relax `selected < total` / `projectedCloudSize` / `EXPECTED_NODE_COUNT` — that hides the exact regressions these tests exist to catch.

---

## Appendix — Do-not-touch list (carried from constraints)

Read-only diagnosis produced this plan; **execution is a separate, explicitly-authorized step.** When/if executed: no P0 physics/camera/highlight implementation, no R1/nav/routes, no DC ingest/backfill, no server bulkUsers cache changes. F3 is the only product change and is confined to the render-pump gate in `useGraphRafLoop.ts`.
</content>
