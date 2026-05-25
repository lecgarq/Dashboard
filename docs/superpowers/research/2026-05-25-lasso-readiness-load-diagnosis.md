# Diagnosis — Lasso / Readiness Timeout & Slow Graph Loading

- **Date:** 2026-05-25
- **Author:** Terminal T2 (read-only diagnosis)
- **Scope:** Why graph readiness + the lasso e2e are slow/flaky, and where first-load time goes.
- **Status:** Diagnosis only. No files changed. No product physics/camera/highlight code touched. No tests modified.

> Companion plan: `docs/superpowers/plans/2026-05-25-p0-lasso-readiness-load-stability.md`

---

## 0. TL;DR

The P7 run finished 21/22. The single failure was the pre-existing lasso test:

```
acc-dc-graph.spec.ts:503 — "lasso drag selects a proper subset…"
Test timeout of 120000ms exceeded.
Error: mouse.move: Test timeout of 120000ms exceeded.
```

The captured failure snapshot (`test-results/.../error-context.md`) shows **the graph had fully rendered** (toolbar + sliders present: Project 35 / Role 25 / Perm 15 …) at the moment of the timeout. The clock ran out at the **first `page.mouse.move`**, which is the first action *after* the lasso test's expensive pre-drag preamble. So the budget was consumed by everything *before* the drag, not by the drag itself.

The lasso test is the only one that pays **all** of these at once:

1. `waitForFreeze()` — a **full cold physics settle** of ~16,942 nodes (every test re-settles; the position cache never survives a fresh Playwright page — see §3).
2. `waitForFunction(projectedCloudSize > 150px)` — waits for the post-freeze normalize → deferred re-fit chain to land.
3. `findDensestScreenPoint(w,h)` — a synchronous grid scan doing **~250–370 `findPointsInPolygon` calls, each over all 16,942 nodes** (§4).

Under heavy machine load (the prompt notes ~29 node processes), the cold settle alone can stretch from ~1–2s (idle) to many seconds, and the dense probe from sub-second to multiple seconds. Stacked inside one 120s test budget that *also* shares the CPU with the always-on render rAF loop (§5), the lasso test tips over the edge. This matches the existing memory note "Lasso e2e load flake".

**This is test overhead, not a product regression.** The lasso *logic* is sound (projection + dense-probe + `findPointsInPolygon` all use the production path). One genuine *product* perf issue exists independently: the rAF loop never idles (§5).

---

## 1. What `gotoGraph` actually waits for

`tests/e2e/acc-dc-graph.spec.ts:117-138`. Run in `beforeEach` for **every** test:

1. `page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" })`.
2. `waitForFunction(() => !!window.__ACC_GRAPH_TEST__?.isReady(), { timeout: 120_000 })`.
3. `waitForFunction(() => { s = getPositionsStats(); return s.count>0 && !s.anyNaN && s.maxAbs>1 }, { timeout: 90_000 })`.

So `gotoGraph` blocks on **bridge install + valid, spread-out positions** — it does **not** wait for a physics freeze. The 120s/90s ceilings here are headroom for cold first-compile (dev mode) + the data pipeline, not the steady-state cost.

## 2. What `isReady()` requires

`graphTestBridge.ts:332-334`:

```ts
isReady() { return !!shell.physics && shell.features.length > 0; }
```

Pure existence check — physics layer constructed **and** the feature snapshot built. It does **not** require freeze, renderer fit, edge buffers, or cosmos readiness. `shell.*` is populated by `ShellBody`'s effect (`AccessAnalysisShell.tsx:115-126`), which only runs after the async load chain in the outer shell resolves (`AccessAnalysisShell.tsx:216-322`).

The second gate (`maxAbs > 1`) is satisfied very early: nodes seed in `[-1,1]³` (`physicsLayer.ts:291-296`) and `forceManyBody` repulsion pushes `maxAbs` past 1 within a handful of ticks. So `gotoGraph` returns long before the layout settles.

## 3. The freeze pipeline (the long pole for `waitForFreeze` tests)

`waitForFreeze()` (`spec.ts:146-150`) polls `getFrozen()` → `physics.frozen` (`graphTestBridge.ts:335`, `physicsLayer.ts:314`).

`frozen` flips true in exactly two places (`physicsLayer.ts`):

- **Cache hit** (`:278-289`): positions loaded from the DuckDB `positions` table, nodes pinned, `sim.stop()`, `frozen = true` — instant.
- **Cache miss** (`:290-301`): random seed, `sim.alpha(0.3).restart()` → d3 runs on its internal timer until `alpha < alphaMin(0.001)`, firing `sim.on("end")` (`:254-271`) which sets `frozen`, normalizes to `LAYOUT_HALF_EXTENT=350`, packs + saves positions, `sim.stop()`.

**The cache never helps in e2e.** `getDuckDbClient()` (`duckdbClient.ts`) builds an in-Worker `AsyncDuckDB` with **no OPFS/IndexedDB persistence**; `cachedClient` is only a per-JS-context module singleton. Each Playwright test runs in a fresh browser context → fresh page → fresh Worker → empty `positions` table → `loadCachedPositions` returns `null` (`positionsCache.ts:129-140`). **Every `waitForFreeze` test pays a full cold settle.**

### Cold-settle cost (inferred)

- Nodes: 16,942. Forces per tick: `forceManyBody` (Barnes-Hut, ~O(n log n)) + up to 9×3 named `forceX/Y/Z` (organic preset → 6 dims active → ~18 active position forces), all in 3D (`physicsLayer.ts:193-217`).
- Tick count to settle: with the organic preset `maxSlider≈0.35`, `alphaDecay = lerp(0.1, 0.02, 0.35) ≈ 0.072`; from α 0.3 → 0.001 that is `ln(0.001/0.3)/ln(1-0.072) ≈ 76 ticks`.
- Per-tick cost: hundreds of thousands of float ops; on an idle machine roughly 10–30 ms/tick → **~1–2 s**. Under the noted ~29-process load, ticks can be several× slower → **several to >10 s**.
- This runs **concurrently with** the always-on render rAF loop (§5), which competes for the same main thread.

Tests that call `waitForFreeze`: hover, click-isolate, **lasso**, 2D edge-isolate (`spec.ts:365,404,504,661`). Each re-pays this.

### Post-freeze re-fit chain (extra latency before lasso can probe)

After `frozen`, `GraphCanvas2D.pushPositions` (`GraphCanvas2D.tsx:264-303`) detects the spread changed (normalize to ±350), pushes with `dontRescale=true`, then arms `fitPendingRef=4` and defers `fitView` 4 rAF frames. The lasso test then polls `projectedCloudSize > 150px` (`spec.ts:511-518`, bridge `:187-225`) which only passes once that deferred fit has framed the ±350 cloud. Adds several frames of latency on top of the settle.

## 4. Why the lasso test is the slowest (the dense probe)

`findDensestScreenPoint` (`graphTestBridge.ts:135-178`) is invoked once per lasso run (`spec.ts:545`). It does a coarse grid scan (`step=60`) over the overlay interior, then a fine refine (`step=12`) in a 120×120 window:

- Coarse cells ≈ `(W-56)/60 × (H-56)/60`. For the graph region (~800–1000 × ~850 px) that is **~150–250 cells**. Refine adds **~121 cells**. Total **~270–370 `boxCount` calls**.
- Each `boxCount` (`:147-156`) builds a 4-pt screen box, maps it via `handle.screenToSpace` (×4), then calls `handle.findPointsInPolygon(spaceBox)` — which scans **all 16,942 nodes** (`GraphCanvas2D.tsx:381-398` → cosmos `findPointsInPolygon`).
- Total work ≈ `~320 calls × 16,942 nodes ≈ 5–6M point-in-polygon tests`, all in **one synchronous `page.evaluate`** on the browser main thread.

On an idle machine this is roughly sub-second to ~1 s; under load it can climb to multiple seconds. It is deterministic (fixed grid, no RNG) and correct — just expensive, and it exists **only** in the lasso test.

### Is the lasso selecting too many nodes / triggering expensive aggregation?

No. The actual selection draws a ±28px box (`spec.ts:553`) → strict subset by design, and the selection-pie aggregation runs over that small subset. The cost is the **pre-selection dense probe**, not the selection or its downstream aggregation.

### Is `waitForFreeze` unnecessary here?

No — it is *necessary* for this test as written. The lasso drives a **real screen-space mouse** and reads node screen pixels; those coordinates only stop moving once the layout is frozen and the camera has re-fit. Removing the freeze wait would make the drag race the moving layout. The cost problem is the *cold* settle (§3), not the wait itself.

## 5. Product perf: the rAF loop never idles (genuine bug)

`useGraphRafLoop` (`useGraphRafLoop.ts:61-81`), wired in `GraphCanvas.tsx:124-138`, every frame **forever**:

- `physics.getPositions()` → **allocates a fresh `Float32Array(n*3)`** (~16,942×3 = ~50.8k floats ≈ 203 KB) — `physicsLayer.ts:353-362`.
- `onTick2D` → `pushPositions` copies into the stride-2 buffer (16,942 iterations) and calls `g.render()` — a full WebGL redraw of all points + edges.

This runs at ~60 fps **even when the graph is frozen and nothing changed** — there is no "dirty" gate. Steady-state that is ≈ **12 MB/s of GC churn + a full redraw every frame**. This is a real product cost (CPU, battery, GC pauses) and it directly amplifies the e2e problem by competing with the settle and the dense probe for the main thread.

## 6. Where first-load time is spent

| Stage | Where | Cost | Product or test? |
|---|---|---|---|
| Next dev compile (first hit, `--webpack`, unoptimized) | `playwright.config.ts:37` | Large, **first test only**; covered by 300s `webServer` + 120s gate | Mostly test (dev mode) |
| `bulkUsers` tRPC fetch | `AccessAnalysisShell.tsx:202-205` → `acc-dc-graph.ts` → `acc-hot-cache.ts` | Cold: 8 parallel `findMany` over full DC tables + `groupBy` over ~623k `AccActivity` rows (~218 ms, per code comment) + assemble; then **10-min server cache** + client `staleTime:600_000`. Payload is one row per (user×project) ≈ 16,942 + permission summary + activity mix → multi-MB superjson | Both (cold first call is product; warm thereafter) |
| Version-key probes | `acc-hot-cache.ts:111-172` | ~13 `count`/`aggregate` queries on **every** call before the cache lookup | Product (small) |
| DuckDB-WASM init | `duckdbClient.ts` | Worker + wasm instantiate (self-hosted, no CDN). Once per page | Both |
| `buildGraphArrowTables` + `registerGraphArrowTables` + `ensurePositionsSchema` + `loadNodeIds` + `buildFeatureSnapshot` | `AccessAnalysisShell.tsx:228-246` | Arrow table build + DISTINCT query + snapshot enrichment over ~16,942 rows | Both |
| `createPhysicsLayer` cache check | `physicsLayer.ts:274-301` | **Always miss in e2e** → full settle (§3) | Mostly test (cold cache); product pays once per reload |
| Physics settle | §3 | ~1–2 s idle, several–10s+ under load | Product (one-time) + test (per `waitForFreeze`) |
| Renderer upload + `fitViewDelay:250` | `GraphCanvas2D.tsx:164-253` | cosmos init + 16,942-pt upload + 250 ms fit delay | Both |
| Bridge readiness | §1–2 | Trivial | Test |
| Lasso dense probe | §4 | ~0.5–multiple s | **Test only** |
| Dashboard chrome | `(dashboard)` layout | The failure snapshot shows a Google Chat panel (dozens of conversations) + Gmail panel (many emails) + sync-status header all mounted on the page; these fetch + render large lists and share the main thread | Product (ambient) |

## 7. Is the app actually slow for users, or only e2e?

- **For users:** first visit pays a *one-time* cold load (bulkUsers cold + DuckDB init + one settle), then it is interactive. Reload re-pays it (in-Worker cache doesn't persist). The **always-on rAF render** (§5) makes the page perpetually busy even when idle — the most defensible "feels slow / fan spins" complaint. The ambient dashboard chrome (Gmail/Chat) adds steady overhead unrelated to the graph.
- **For e2e:** disproportionately slower because (a) dev-mode unoptimized build, (b) **every** `waitForFreeze` test pays a *fresh* cold settle (no cache reuse across pages), (c) shared CPU with ~29 node processes, (d) the lasso test's unique dense probe. The 120s ceiling is adequate on an idle machine and marginal under load — exactly a load-sensitive flake, not a logic failure.

## 8. Answers to the 10 questions

1. **What does `gotoGraph` wait for?** Bridge `isReady()` + first valid spread-out positions (`count>0 && !anyNaN && maxAbs>1`). Not freeze. (§1)
2. **What does `isReady()` require?** `shell.physics` exists **and** `shell.features.length > 0`. Nothing more. (§2)
3. **Is readiness waiting for load, freeze, fit, edges, or data?** `gotoGraph`: data + physics construction only. `waitForFreeze` (opt-in, the heavy tests): full settle. The lasso *additionally* waits on the post-freeze re-fit (`projectedCloudSize`). (§1, §3)
4. **Why does lasso take longer?** It uniquely stacks cold settle + re-fit poll + the ~320-call dense-probe scan, then the drag — all inside one 120s budget. (§0, §4)
5. **Is lasso selecting too many nodes / expensive aggregation?** No. ±28px box = strict subset; aggregation is over the small subset. The cost is the pre-selection dense probe. (§4)
6. **Is the test waiting for freeze unnecessarily?** No — the real-mouse drag needs a stable frozen view. The problem is the *cold* settle, not the wait. (§4)
7. **Is the e2e timeout too low?** 120s/test is fine idle, marginal under heavy load. The fix is to cut the work (cache reuse, cheaper probe, idle rAF), not blindly raise the ceiling — though a modest bump or per-test override for lasso is a reasonable safety net. (§0)
8. **App slow for users, or only e2e under 29 processes?** Mostly e2e overhead + machine load. The one real user-facing perf issue is the never-idling rAF loop (§5). (§7)
9. **Where is first-load time spent?** See table §6 — dominated by cold bulkUsers, DuckDB init, the one-time settle, and (for the lasso test) the dense probe.
10. **Safest plan to stabilize without hiding real failures?** See companion plan. Principle: make the *cold cost* cheaper and *deterministic* (persist/seed positions across pages, idle the rAF, cheaper dense probe) instead of widening timeouts or weakening the strict-subset / node-count assertions that catch real regressions.

## 9. What must NOT change (correctness guards to preserve)

- `EXPECTED_NODE_COUNT === 16,942` exact assertions.
- Lasso **strict-subset** assertion (`selected < total`) and visible selection-count subset — these catch a select-all regression.
- `projectedCloudSize > 150px` floor — catches the "cloud collapses to a speck" camera-fit regression.
- Mask-only dimming invariants (alpha stays 1; node count unchanged under facets).
- The production interaction path (`simulateHover/Click` invoking real `handlersRef`).

## 10. Files inspected

`tests/e2e/acc-dc-graph.spec.ts`, `playwright.config.ts`, `playwright/global-setup.ts`,
`app/(dashboard)/users/access-analysis/{graphTestBridge,AccessAnalysisShell,GraphCanvas,GraphCanvas2D,GraphInteractions,LassoOverlay,useGraphRafLoop,physicsLayer,positionsCache,duckdbClient}.ts(x)`,
`server/routers/acc-dc-graph.ts`, `lib/server/acc-hot-cache.ts`,
`test-results/acc-dc-graph-…-pie-panel-chromium/{error-context.md,.last-run.json}`.
</content>
</invoke>
