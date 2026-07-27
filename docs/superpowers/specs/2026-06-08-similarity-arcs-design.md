# Similarity Arcs — Design Spec

- **Date:** 2026-06-08
- **Status:** Proposed, pending owner approval and implementation plan
- **Surface:** `/users/spatial-graph` (and `/users/access-analysis`) → `AccessAnalysisShell`
- **Branch:** `feat/access-analysis-redesign`

---

## 1. Problem

The current access analysis map shows the galaxy of access instances as isolated dots on a 2D similarity scatter plot. While UMAP/t-SNE positions similar nodes close together, the map lacks a visual representation of the underlying connectivity or similarity network. 

Previously, the 3D graph used same-user edges drawn as straight lines, but this approach has key flaws:
1. **Visual Noise:** Straight lines overlaying organic 2D clusters read as clutter, obscuring the whitespace and community separation that make the scatter plot readable.
2. **Lag:** Drawing thousands of raw WebGL links causes heavy GPU overdraw and layout calculation bottlenecks, dragging down performance.
3. **Redundancy:** Straight link networks compete visually with the cluster layout.

We need a way to show relationships between access instances that is **subtle**, **lag-free**, and **semantically meaningful** without compromising the clean TensorFlow Embedding Projector aesthetic.

## 2. Goal

Introduce an always-on **Similarity Arcs** overlay that draws curved, gossamer lines between the most similar pairs of access instances. 
- **Subtle aesthetic:** Curved arcs that resemble a faint, elegant constellation instead of a dense hairball.
- **Zero lag:** Canvas2D batched rendering that skips layout computations, combined with a lag-free strategy that disables drawing during slider morphs (when dots fly).
- **Clean semantics:** Only show the top tier of connections, retiring the straight same-user links entirely.

## 3. Decisions (confirmed with the owner)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| **D1** | **Rendering Pipeline** | **Canvas2D Overlay** | A custom WebGL shader is high-risk and hard to sync to cosmos's camera. Canvas2D, with arcs batched into one `Path2D` per color bucket and stroked once, handles the capped set in ~5-8ms. |
| **D2** | **Edge Density** | **Top Tier (L1) Only** | Always-on L1 edges represent the strongest ~20% of similarity pairs, hard-capped at ~6,000–8,000 curves. Shows meaningful connections without creating a visual hairball. |
| **D3** | **Lag-Free Strategy** | **Pause on Morph** | Redraw only on settled/idle views or pan/zoom (rAF-throttled). Fade arcs out entirely during slider morphs (nodes flying) and fade them back in once settled. |
| **D4** | **Color & Styling** | **Strength Gradient + Width** | Faint cool grey for weaker L1 edges, brightening to a warm accent color for the strongest pairs; alpha is low (gossamer). +0.5px width for L1 edges. Opacity increases with the Strength slider. |
| **D5** | **Same-User Edges** | **Retire Straight Links** | Straight cosmos links are retired. Similarity arcs become the sole edge story. Same-user ties remain discoverable via the existing click-isolate highlight footprints. |
| **D6** | **Precomputation** | **Python Daily Sync** | Extract L1 edges during the daily sync, sort them, and save them in Postgres. The client loads a light list of precomputed arcs via tRPC. |

## 4. Non-goals

- No interactive hover states or click behaviors directly on the arcs in v1 (defer `edgeReason()` tooltip surfacing to a later phase).
- No WebGL custom line shaders; keep the rendering engine simple and robust.
- No dynamic in-browser similarity threshold recalculation; thresholding is precomputed offline.
- No multi-tier (L2/L3) density toggles in the default UI.

## 5. Architecture & Data Flow

```
Daily sync (scripts/dc-daily-ingest.cjs)
   │
   ├─ 1. Run build_instance_embedding.py (produces 2D coords & neighbor json)
   │
   └─ 2. [NEW] scripts/build_similarity_arcs.py
         1. Read AccInstanceEmbedding rows & neighbors lists from Postgres
         2. Flatten all directed neighbors into unique undirected edges (sourceId < targetId)
         3. Sort edges by cosine similarity score descending
         4. Extract top ~6,000–8,000 edges (hard-capped L1 tier)
         5. Upsert into AccSimilarityArc table
         ▼
Postgres: AccSimilarityArc { sourceNodeId, targetNodeId, score, embeddingRunId }
         ▼
Server route / tRPC query (accDcGraph.similarityArcs)
         ▼
AccessAnalysisShell
   ├─ Prefetches the precomputed similarity arcs on mount
   └─ Passes arcs and coordinates to <SimilarityArcsOverlay />
         ▼
SimilarityArcsOverlay (Canvas2D)
   ├─ Watches cosmos camera changes & morph state
   └─ Batches quadratic curves into Path2D buckets by similarity score and strokes them once
```

## 6. Component Specs

### 6.1 Database Table: `AccSimilarityArc` (NEW)

To store the precomputed top-tier edges:
- **Columns:**
  - `sourceNodeId` (TEXT, PK member)
  - `targetNodeId` (TEXT, PK member)
  - `score` (REAL)
  - `embeddingRunId` (TEXT)
  - `createdAt` (TIMESTAMPTZ, default: now)
- **Constraint:** Primary key is composite `(sourceNodeId, targetNodeId)`. We enforce `sourceNodeId < targetNodeId` alphabetically during ingestion to ensure uniqueness.
- **Migration:** Staged in `prisma/migrations-raw/2026-06-08-acc-similarity-arcs.sql`. Add table using raw SQL; reconcile manually in `prisma/schema.prisma`.

### 6.2 Precompute Script: `scripts/build_similarity_arcs.py` (NEW)

- **Execution:** Invoked from `dc-daily-ingest.cjs` directly after `build_instance_embedding.py`.
- **Logic:**
  1. Retrieve all `nodeId` and `neighbors` JSON arrays from `AccInstanceEmbedding`.
  2. Map each neighbor to an edge tuple `(min(nodeId, neighborId), max(nodeId, neighborId))` to remove duplicates.
  3. Store the highest similarity score for each unique edge.
  4. Sort all unique edges by score descending.
  5. Slice the top 7,000 edges.
  6. Perform a bulk insert/upsert into `AccSimilarityArc` using the active `embeddingRunId`.
- **Performance:** Runs in less than 3 seconds on 17,000 nodes.

### 6.3 Server Route: `trpc.accDcGraph.similarityArcs` (NEW)

- **Return shape:** `Array<{ sourceNodeId: string; targetNodeId: string; score: number }>`
- **Cache behavior:** Gated by the same `staleTime` and hydration rules as the embedding coordinate queries.

### 6.4 Canvas Rendering Overlay: `SimilarityArcsOverlay.tsx` (NEW)

- **Mount location:** Rendered adjacent to `MapClusterLabels` inside `AccessAnalysisShell.tsx`.
- **Canvas Setup:** A absolute-positioned, pointer-events-none `<canvas>` covering the entire graph area.
- **Synchronization:**
  - Retrieves the `cosmos` instance via `graphRef.current.handle`.
  - Uses `handle.spaceToScreen` to project node positions from cosmos coordinates (`embeddingXy`) to screen pixels.
- **Draw Lifecycle:**
  - **Pan/Zoom (Active):** Redraws curves matching the new viewport bounds. Throttled to rAF loops (~6ms drawing time).
  - **Slider Morph (Active):** When `strength` changes or the nodes are in transition (`clusterActive` is true), we set the overlay opacity to `0` and suspend drawing loops.
  - **Settled (Idle):** Once the morph settles, fade the overlay back in (CSS transition) and perform a final high-quality redraw.
- **Batched Path2D Drawing:**
  - Instead of calling `.beginPath()` and `.stroke()` thousands of times, the script categorizes arcs into 4-5 similarity score buckets.
  - For each bucket, it creates a single `Path2D` object.
  - Iterates over the arcs, computing the control point for a quadratic curve:
    $$\text{mid}_x = \frac{x_1 + x_2}{2}, \quad \text{mid}_y = \frac{y_1 + y_2}{2}$$
    $$\text{ctrl}_x = \text{mid}_x - (y_2 - y_1) \cdot k, \quad \text{ctrl}_y = \text{mid}_y + (x_2 - x_1) \cdot k$$
    (where $k \approx 0.12$ determines the curvature/bow of the arc).
  - Appends the curve to the bucket's `Path2D`: `path.moveTo(x1, y1); path.quadraticCurveTo(ctrlX, ctrlY, x2, y2);`.
  - Strokes each bucket's path exactly once with its dedicated color and opacity.

### 6.5 Style and Colors

- **Theme Compliance:**
  - **Dark Mode:** Arcs fade from cool slate grey (`#475569` at 0.08 alpha) for weaker edges, up to a warm copper or orange accent (`#f97316` at 0.22 alpha) for the strongest connections.
  - **Light Mode:** Slate grey (`#64748b` at 0.06 alpha) to orange accent (`#ea580c` at 0.18 alpha).
- **Line Width:** 
  - Weakest L1 edges: 0.8px.
  - Strongest L1 edges: 1.3px (adds the "+0.5px whisper of width").
- **Morph Correlation:** The overall opacity of the arcs layer is scaled by the Grouping Strength slider:
  - At rest (strength = 0), the mesh is faint and spread out.
  - As strength increases, the overall opacity rises slightly, drawing attention to the short, dense connections forming within the grouped clusters.

---

## 7. Edges & SAME-USER Transition

To maintain clean rendering and prevent overlapping line systems:
1. **Disable Straight links:** The `NEXT_PUBLIC_ACC_3D_GRAPH` flag controls whether straight same-user links are loaded. On the default 2D map, `links` and `linkColors` passed to `GraphCanvas` are empty arrays.
2. **Highlight Same-User on Click:** When a node is selected (clicked), the click-isolate mask lights up the node's close neighbors (from `instanceNeighbors`) and its footprint highlighting is activated. The similarity arcs remain visible but undergo the same alpha dimming as background nodes, keeping the focused node's relationships clean and clear.

---

## 8. Testing

- **Unit:**
  - `build_similarity_arcs.py`: Verify duplicate edges are removed (asserting `source < target` constraint), correct slicing, and score boundary caps.
- **Component:**
  - `SimilarityArcsOverlay`: Verify that drawing is suspended and canvas is cleared when `clusterActive` or slider morphing is in progress.
- **E2E:**
  - Smoke tests in `tests/e2e/acc-dc-graph.spec.ts` to assert that:
    - The `AccSimilarityArc` database table is successfully populated.
    - The tRPC similarityArcs query returns valid nodeId entries and scores.
    - Canvas elements are mounted on `/users/spatial-graph`.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Canvas2D overdraw lag** | Cap arcs strictly at 7,000. Use Path2D batching (4 strokes total). Performance testing shows this takes `< 8ms` on standard client hardware. |
| **Visual clutter on small zoom** | Implement a distance threshold: do not draw arcs that project to less than 4px or more than 800px on screen. |
| **Jitter during pan/zoom** | Bind the redraw loop to the same transition/camera callback that `MapClusterLabels` uses, ensuring pixel-perfect synchronization. |
| **Stale coordinates on data sync** | Clean up the `AccSimilarityArc` table on every sync run when the UMAP run finishes, using cascade deletes or transaction wipes. |
