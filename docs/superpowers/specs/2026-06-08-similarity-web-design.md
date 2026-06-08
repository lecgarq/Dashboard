# Spec: Force-Atlas Similarity Web (curved similarity edges on the Spatial Graph)

**Date:** 2026-06-08
**Branch:** `feat/access-analysis-redesign`
**Surface:** `/users/spatial-graph` — the cosmos.gl projector map rendered by `AccessAnalysisShell` (the folder is `app/(dashboard)/users/access-analysis/`; the URL is `/users/spatial-graph`). **Not** the `/access-analysis` ECharts dashboard.

---

## 1. Goal

Wrap the existing organic, community-colored node map in a **dense web of very faint, thin, curved edges that connect instances by embedding similarity** — the Gephi / Force-Atlas "cotton" look (reference: `LOOK AND FEEL 1.jpg`). The web must be:

- **Curved**, never straight polylines (gentle per-edge bow).
- **Subtle** — density paints the texture; uniform low alpha keeps it elegant, not a hairball.
- **Meaningful by color** — edges are tinted by the endpoints' community color and brightened by similarity strength.
- **Lag-free** — never a dropped frame, even with thousands of edges, on the owner's PC.

### What this is NOT (explicitly dropped)

From an earlier mis-aimed pitch (chasing isometric-terrain references): **no** inferno/glow colormap, **no** luminous inter-cluster "bridges", **no** hub halos, **no** explicit force-directed edge bundling, **no** isometric/3D view change. The organic node layout already bundles edges visually; the map the owner loves is untouched.

---

## 2. Why this is mostly a rendering problem (not a data problem)

The similarity data already exists and is precomputed:

- `AccInstanceEmbedding` rows carry `{ nodeId, x, y, cluster, neighbors }`, where **`neighbors` is a stored `Array<{ nodeId, score }>`** — each instance's top-K cosine-similarity neighbors. (See `server/routers/acc-dc-graph.ts` `instanceNeighbors`, and the build pipeline in `lib/acc/embedding/`.)
- `lib/acc/embedding/cosineGraph.ts` already implements `knnEdges`, `tierEdges`, `edgeReason`. Types: `SimEdge {a,b,score}`, `TieredEdge {a,b,tier,reason}` (`lib/acc/embedding/types.ts`).

So the **global similarity edge set = the union of every node's stored `neighbors`, deduped (a<b)**. No new precompute job, no cosine pass at request time.

The hard part is that **cosmos.gl renders links as straight GL lines only** — it has no curved-link support. So curves require a thin overlay layer synced to node positions, exactly like the existing `MapClusterLabels` overlay.

---

## 3. Architecture — three thin layers

### Layer A — Delivery (server → client)

New tRPC query on `accDcGraphRouter` (`server/routers/acc-dc-graph.ts`):

```
similarityEdges: adminProcedure.query → Array<{ a: string; b: string; score: number }>
```

- Reads all `AccInstanceEmbedding { nodeId, neighbors }`.
- Dedups each node's `neighbors` into undirected pairs keyed `min::max` (so each edge ships once, not twice), keeping the max score.
- Returns **nodeId pairs** (the server does not know cosmos index order). Payload is a few hundred KB; cached via the existing route-hydration path so it loads with the page.

### Layer B — Edge model (client, pure)

New pure module `app/(dashboard)/users/access-analysis/similarityWeb.ts`:

- `buildSimilarityWeb(edges, indexByNodeId, nodeColors, opts)` →
  - maps `{a,b}` nodeId pairs to cosmos **index** pairs via `indexByNodeId` (drops edges whose endpoints aren't in the current node set);
  - normalizes `score` into `[0,1]` strength (min–max or percentile);
  - computes a **per-edge RGBA**: tint = blend of the two endpoints' community colors (read from the already-computed `bucketed` node colors), alpha/brightness = a function of strength × a theme base alpha;
  - **quantizes** each edge color into one of ~24 buckets so the overlay can batch-stroke one `Path2D` per bucket;
  - applies the density cap (see §6) by keeping the highest-strength edges up to `maxEdges`.
- Returns flat typed arrays: `srcIdx: Int32Array`, `dstIdx: Int32Array`, `bucket: Uint8Array`, plus the bucket → RGBA palette. Pure, fully unit-testable, no React.

### Layer C — Render (client overlay)

New component `app/(dashboard)/users/access-analysis/SimilarityWebOverlay.tsx` — an absolutely-positioned `<canvas>` over the 2D cosmos slot, mounted in `AccessAnalysisShell` right next to `<MapClusterLabels>`. It mirrors the proven `MapClusterLabels` camera-sync pattern (rAF ~30–60Hz, reads `graphRef.current.handle.spaceToScreen`). Purity contract (REND-04): imports only React, the `GraphCanvasHandle` type, and the precomputed buffers — no math/data imports.

Per redraw:
1. Resolve live node **screen** positions. To avoid 17k `spaceToScreen` calls per frame, derive the cosmos space→screen **affine** once (project two reference points via `spaceToScreen`, solve scale+translate), then map every endpoint with a cheap multiply-add. Space positions are read from the handle's `getPointPositions()` (cosmos space) and are static while settled, so on pan/zoom only the affine changes.
2. For each color bucket, build one `Path2D`: for each edge in the bucket, `moveTo(A)` then `quadraticCurveTo(ctrl, B)` where `ctrl = midpoint + perpendicular * k`, `k ≈ 0.14 * |AB|` with a consistent sign (uniform bow → the Gephi wisp).
3. `stroke()` each bucket once at its bucket RGBA, ~0.5px, `source-over` (normal alpha; no additive — additive washes out on white).
4. Multiply the whole layer's alpha by the **strength fade** and the **motion fade** (§5).

---

## 4. Color encoding (reconciles the two earlier answers)

- **Hue = community.** Each edge is tinted by the blend of its endpoints' community colors (the same `bucketed` colors as the dots). Within-cluster edges take the cluster's hue → the purple clump gets purple cotton, green gets green — matching the reference.
- **Brightness/opacity = similarity strength.** Stronger pairs are more visible; weak pairs nearly vanish. This honors the "color = strength" answer while looking like the reference's community-tinted threads.
- **Theme-aware base alpha.** Light (white) → faint, slightly darkened tints; Dark (zinc `#09090B`) → faint, slightly lightened tints. Resolved via `useTheme`, like `MapClusterLabels`.

---

## 5. Lag-free strategy + motion choreography

This is what makes density safe — it is a hard requirement, not a nice-to-have.

- **Idle (settled):** zero redraw. A dirty-check (sample one reference point's screen position; if unchanged and not morphing, skip) parks the rAF loop, mirroring the no-op skip already used in `GraphCanvas2D.pushPositions`.
- **Pan/zoom:** redraw on affine change, rAF-throttled. Only the affine recomputes; space positions are static.
- **Slider morph (nodes moving):** the web **fades out** while `sliders.isPreviewActive()` is true (the map already swaps to LOD aggregate dots during drag), and **fades back in** when settled. So there is **never** a frame stroking thousands of curves over thousands of *moving* nodes — the heaviest case is designed out.
- **Strength fade:** overall web opacity scales with the grouping `strength` (faint when scattered, clearer when clumped), reusing the shell's existing `strength` value (the same lever that fades in `MapClusterLabels`). When scattered, similarity edges would be long/crossing; fading them out then keeps it clean and only asserts the web once proximity ≈ similarity.

---

## 6. Edge density & the one real perf risk

A *truly* dense web at 16,942 nodes is the single perf unknown. Plan:

- `maxEdges` cap (default chosen during build by measurement; start generous, e.g. ~15–20k, keep highest-strength edges). `similarityWeb.ts` enforces it deterministically and is unit-tested. If edges are dropped, the cap is logged (no silent truncation).
- Build on **Canvas2D** (batched `Path2D` per bucket). Measure real frame time on the owner's PC during settle and during a pan-drag.
- **Escalation path, only if needed:** if the density the owner wants can't stay lag-free on Canvas2D, escalate *only this overlay* to a GPU instanced-bézier layer (custom WebGL sharing the cosmos affine). Out of scope for v1; noted so the boundary is clean. v1 ships the look at a bounded density.

---

## 7. Retire the straight same-user lines

The current always-on edges are straight cosmos.gl same-user chains (`sameUserEdges.ts` → `toCosmosLinks` → `links`/`linkColors` props on `GraphCanvas`, colored by `linkEmphasis.ts`). Two overlapping edge systems read as noise, so the curved similarity web **replaces** them: the shell stops passing `links`/`linkColors` (passes empty), and cosmos renders no straight lines. Same-user relationships stay fully discoverable via click-isolate (the footprint still lights up on click — separate from always-on edges). `sameUserEdges.ts` / `linkEmphasis.ts` stay in the tree (still used by tests / the flag-ON path) but are no longer wired into the default map.

---

## 8. Files

**New**
- `server/routers/acc-dc-graph.ts` — add `similarityEdges` query (edit).
- `app/(dashboard)/users/access-analysis/similarityWeb.ts` — pure edge-model builder.
- `app/(dashboard)/users/access-analysis/similarityWeb.test.ts` — unit tests.
- `app/(dashboard)/users/access-analysis/SimilarityWebOverlay.tsx` — Canvas2D overlay.
- `app/(dashboard)/users/access-analysis/__tests__/SimilarityWebOverlay.test.tsx` — seam test (via the graph test bridge).

**Edited**
- `AccessAnalysisShell.tsx` — fetch `similarityEdges`, build the web buffers (memoized on `edges` + `indexByNodeId` + `bucketed` + theme), mount `<SimilarityWebOverlay>`, stop passing same-user `links`/`linkColors`.
- (Possibly) `lib/server/acc-route-hydration.ts` — prefetch `similarityEdges` so it hydrates with the page.

---

## 9. Flag & rollback

`NEXT_PUBLIC_ACC_SIM_WEB` (default ON), matching repo convention (`NEXT_PUBLIC_ACC_GPU_2D`, etc.). Single-flip rollback: OFF → overlay not mounted, same-user straight lines restored. Forced OFF under `NEXT_PUBLIC_ACC_GRAPH_TEST` if it interferes with the lasso/selection e2e suite.

---

## 10. Testing

- **Pure (`similarityWeb.test.ts`):** dedup correctness (a<b, max score), index mapping drops unknown nodeIds, strength normalization, color = community blend × strength, bucket quantization stable, `maxEdges` cap keeps the strongest and reports the drop count.
- **Overlay seam:** with the graph test bridge, assert the overlay mounts, sets a non-zero edge count when settled, and goes to 0 opacity while morphing.
- **No regression:** full unit suite + `tsc` green; existing graph e2e unaffected (web flag OFF under test bridge if needed).

---

## 11. Out of scope (v1)

- GPU bézier escalation (only if Canvas2D can't hit target density).
- Arc-hover "why connected" tooltip (the `edgeReason()` data exists — a later enhancement).
- Any change to the isometric/3D view, the physics, the morph, the color pipeline, or the `/access-analysis` ECharts dashboard.

---

## 12. Open questions / risks

1. **Density vs lag** (§6) — resolved by measurement + the Canvas2D→GPU escalation boundary.
2. **`spaceToScreen` cost** — mitigated by the affine-once approach; validate the handle exposes `getPointPositions()` + stable `spaceToScreen` (it does, per `GraphCanvas2D`).
3. **Score distribution** — confirm stored `neighbors` scores are comparable across nodes for a global strength normalization; percentile-normalize if min–max is skewed.
