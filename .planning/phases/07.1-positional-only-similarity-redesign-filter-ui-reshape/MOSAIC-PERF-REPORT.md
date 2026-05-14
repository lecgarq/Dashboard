# MOSAIC-PERF-REPORT.md

**Implementation:** Cosmograph 2.0 / Mosaic redesign (10-task plan)
**Spec:** `docs/superpowers/specs/2026-05-13-access-analysis-cosmograph-mosaic-design.md` (commit `490b266`)
**Plan:** `docs/superpowers/plans/2026-05-13-access-analysis-cosmograph-mosaic.md` (commit `587373b`)
**Branch:** `feat/access-analysis-redesign`
**Range under test:** `587373b` → `36ffbad` (16 commits)
**Date:** 2026-05-13

---

## Automated acceptance signals (CAPTURED)

These are the signals captured non-interactively via the test suite and TypeScript compiler.

| Signal | Result | How |
|---|---|---|
| Vitest full suite | **326 / 326 passed across 38 files** | `npx vitest run` at HEAD `36ffbad` |
| TypeScript strict | **0 errors** | `npx tsc --noEmit` at HEAD `36ffbad` |
| New module unit coverage | 11 tests across 4 new modules | `MosaicCoordinatorContext.test.tsx` (2), `positionsCache.test.ts` (6), `CosmosCanvasClient.test.ts` (3), `clusterAnnotations.test.ts` (2). All pass. |
| Net lines | +1,196 / -178 across implementation files | `git diff --shortstat 587373b 36ffbad` |

Forbidden API check (the `setConfigPartial({ enableSimulation: false })` call that caused position resets in earlier commits): **NOT INTRODUCED** in the new freeze path. The wrapper-level `paused` flag + `graph.stop()` + per-frame `render(0)` substitution is the actual mechanism. The legacy `freezeSimulation()` method remains in `graphRenderers.ts:1338` as dead-but-typed code; no live path calls it.

---

## Hardware

**DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13.**

Reference values from earlier sessions (for cross-check only, not authoritative for this build):
- GPU: `Google Inc. (Intel) / ANGLE (Intel, Intel(R) Graphics (0x00007D67) Direct3D11 vs_5_0 ps_5_0, D3D11)`
- OS: Windows 11 Pro 10.0.26200
- Dataset: 1,209 users → 24,285 (user, project) instances

---

## Idle FPS

**Acceptance target:** median ≥30, no sample below 20, at the 24,285-instance default state.

| Sample | FPS reading | Sim α |
|---|---|---|
| t+2s   | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| t+4s   | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| t+6s   | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| t+8s   | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| t+10s  | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| **Median** | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 | — |

Baseline (pre-redesign, observed live 2026-05-13 in this conversation): **FPS = 1, Sim α = 0.965** at 24,285 nodes.

---

## Selection latency

**Acceptance target:** 5 / 5 selections complete in < 150 ms (target < 100 ms; budget allows 50 ms slack).

Methodology: Chrome DevTools Performance tab; record a 5-second trace while clicking five different histogram bars in sequence. Measure time from `pointerdown` event to the first `setPointColors` upload that contains the new alpha mask.

| Selection | Latency (ms) |
|---|---|
| 1 — Click "Architect" bar in Role Distribution | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| 2 — Click top project bar in Project Membership | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| 3 — Click "0-30d" bar in Activity Recency | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| 4 — Click "View Only" bar in Permission Tier | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| 5 — Drag a lasso polygon around one cluster | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| **Median** | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |

---

## Cold load (no positions cache)

**Acceptance target:** load ≤ 4 s; time-to-first-cosmos-frame ≤ 4 s.

Methodology: in Chrome DevTools Network panel, "Disable cache" ON. Hard-reload (Ctrl+Shift+R). Measure:
- `performance.timing.loadEventEnd - navigationStart`
- Time from first cosmos canvas paint to first frame with frozen positions (`pauseSim()` fired).

| Metric | Result |
|---|---|
| `loadEventEnd - navigationStart` | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Time to first cosmos paint | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Time to first frozen frame (post-warmup) | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |

---

## Warm load (positions cached in DuckDB)

**Acceptance target:** load ≤ 2 s; time-to-first-cosmos-frame ≤ 1.5 s.

Methodology: with the `positions` table populated by a prior cold load, soft-reload (Ctrl+R, cache ENABLED). Measure same two metrics.

| Metric | Result |
|---|---|
| `loadEventEnd - navigationStart` | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Time to first cosmos paint | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Time to first frozen frame (cache hit, no warmup) | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |

---

## Visual contract (smoke tests)

These items are not measurable from the test suite — confirm by eye.

| Item | Verdict |
|---|---|
| 24,285 instance nodes render at idle | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Project name annotations appear at cluster centroids, font size scales with member count | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Annotations reposition when panning / zooming the canvas | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Clicking a histogram bar dims unselected nodes (alpha 0.15), lights selected (alpha 1.0) — positions unchanged | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Multi-histogram crossfilter (intersect): clicking two bars from different panels narrows further, not unions | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Lasso polygon selection: draws polygon → on release, contained nodes light up; others dim | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Clearing the lasso restores full opacity | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |
| Hard-reload after a cold load skips the 2s warmup (cache hit) | DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-13 |

---

## Commits in this implementation

```
36ffbad chore(graph): retire legacy JS topology + analyticsSelection prop + chart fallbacks
8065381 feat(access-analysis): migrate all five sidebar charts to Mosaic histograms
bd1215a fix(access-analysis): correct lasso SQL match to runtime node id format
385a93e feat(access-analysis): polygonal lasso publishes a SelectionClause
810e498 feat(access-analysis): project name annotations at cluster centroids
78f6dff fix(access-analysis): register Coordinator as module-level singleton
b1be849 feat(access-analysis): first Mosaic histogram (Project Membership) wired
42ce938 fix(graph): align alpha-mask color buffer to handle nodeIds
d401d38 feat(access-analysis): CosmosCanvasClient (MosaicClient → alpha mask)
de5cb7b refactor(graph): split fitFrozenView from pauseSim
8b0b888 feat(graph): warmup-then-freeze cosmos sim, cache positions in DuckDB
f6eb07c feat(access-analysis): positions cache
ea255a3 fix(access-analysis): type Connector adapter with overloads
f7c1cb9 test(access-analysis): cover useMosaicSelection out-of-provider throw
f9a0a06 feat(access-analysis): Mosaic Coordinator + crossfilter Selection context
```

---

## Open concerns (recorded by reviewers during implementation)

1. **First-frame jolt after `pauseSim()`** (Task 3 implementer concern #2). Cosmos's internal rAF may execute one queued frame after `graph.stop()` before the `render(0)` substitution takes effect. Visible as a tiny position drift at freeze time. **Verify in UAT.**
2. **Position cache scale invariance** (Task 3 implementer concern #3). `setPointPositions(xy, dontRescale=true)` should be a pure round-trip, but some beta.9 cosmos.gl builds have rescale bugs. **Verify in UAT by comparing fresh warmup vs cache-hit reload visually.**
3. **`analyticsSelection` parallel scaffolding retained** (Task 9 reviewer note). The visibility-based filter path from Task 3 still lives alongside the canonical alpha-mask path. Removing it requires also cleaning up `HybridAnalyticsSurface`'s `selectRow` / `activeSelection` plumbing. **Deferred to a follow-up PR.**
4. **Phase 7 React filter panel JSX retained** (Task 9 reviewer note). Backed by tests; reachable when `graphMode === "folder-permissions"`. **Deferred to a follow-up PR.**
5. **Allocation cost in alpha-mask effect** (Task 4 reviewer concern). Every selection rebuilds the full `Float32Array` colors buffer (~388 KB at 24k nodes) instead of caching the base. TODO comment placed inline at the effect. **Acceptable for v1; revisit if brush-drag interaction feels janky.**

---

## DECISION

**MOSAIC-MIGRATION-ACCEPT = PENDING-MANUAL-UAT**

Flip to `APPROVED` once the FPS / latency / load / visual cells are populated with real numbers from a manual UAT pass, and the median FPS sample ≥ 30. Flip to `GAPS` and list the failing rows if any acceptance target is missed.

Manual UAT prerequisites:
- Dev server up at `http://localhost:3000`.
- `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1` is the live route (the new `HybridAnalyticsSurface` path with Mosaic histograms).
- The `users` tRPC data is hydrated (synced ACC users present).
- Chrome DevTools open, Performance + Network panels available.
