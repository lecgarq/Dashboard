# Access Analysis Graph — Development Workflows (proposal)

> **Status:** Proposal. No workflows/skills implemented yet — these are repeatable procedures to make
> future graph work safe and data-honest. Adopt incrementally.
> **Companions:** [`data-discovery`](../research/2026-05-21-access-analysis-data-discovery.md) ·
> [`dimension-taxonomy`](../specs/2026-05-21-access-analysis-dimension-taxonomy.md) ·
> [`graph-engine-strategy`](../specs/2026-05-21-access-analysis-graph-engine-strategy.md).

Shared principles for all workflows:
- **Data first.** No dimension/edge/preset ships without a real, counted source field.
- **No manual console verification.** Every check is a test or an in-app diagnostic, never "open devtools".
- **No clique explosion.** Any group edge must be hub/top-k/threshold capped before render.
- **Determinism.** Same inputs ⇒ same targets, colors, edges, cache key.

---

## 1. Data Discovery Workflow

**When:** before any new dimension/edge work, and after each DC ingest that changes the node set.

1. Run `node scripts/scratch/access-analysis-data-discovery.cjs` (read-only).
2. Diff the regenerated `2026-05-21-access-analysis-data-inventory.json` against the prior run
   (watch node count, internal/external split, new roles/products/permTypes).
3. Update the data-discovery markdown tables + confidence levels for any family that moved.
4. Update the dimension taxonomy if a new source field appeared (or coverage crossed a threshold).
5. Validate data availability: confirm each A1/A2/A3 dimension still resolves; downgrade any that
   lost coverage.

**Gate:** inventory JSON regenerates without query errors; headline counts reconciled with
`scripts/scratch/check-db-counts.cjs`.

---

## 2. Dimension Addition Workflow

**When:** adding a slider/color/filter dimension (e.g. `module`, `company`, `membershipAge`).

1. **Source check** — confirm the field + coverage in the discovery inventory; assign type, node
   level, availability, confidence (taxonomy §0).
2. **Descriptor** — add to the dimension registry (`SliderContext` + taxonomy entry) with default weight.
3. **Snapshot field** — enrich `NodeFeatureSnapshot` (`featureSnapshot.ts` DuckDB query + type).
4. **Target strategy** — implement categorical/scalar/multi-hot anchor generation in
   `featureTargets.ts`; ensure `availability=0` for missing/unknown values.
5. **Color mode** (if applicable) — hashed hue for categorical, sequential ramp for ordered.
6. **Tests** — unit (snapshot value, target generation, availability gating); integration (counts
   match discovery inventory, e.g. internal==1,265).
7. **E2E smoke** — slider moves without crash; color mode changes the renderer buffer signature.

**Gate:** all-sliders-0 still organic; new dimension's unknown nodes receive 0 force; counts match data.

---

## 3. Edge Layer Addition Workflow

**When:** adding any edge type beyond same-user.

1. **Define** the edge: source field(s), meaning, directedness, target render layer.
2. **Estimate count** — query the inventory for group sizes; compute worst-case raw edge count.
3. **Prevent clique explosion** — pick a strategy *before* coding: direct (small groups only),
   hub node, aggregate edge, top-k KNN, or similarity threshold. Document the cap.
4. **Generate buffers** — produce the cosmos link buffer `[s,t,...]` + per-edge RGBA; reuse
   `linkEmphasis` for focus states; add a per-layer color/width/opacity.
5. **Render toggle** — add the layer to the layer toggles; **default off** unless it's same-user.
6. **Tests** — unit (no self-loops, no duplicates, cap respected, symmetric where expected);
   the **clique guard** test (a synthetic 2,000-member group must not exceed the cap).
7. **E2E** — layer toggles on/off; edges render in 2D and 3D; edge count within budget.

**Gate:** no layer can produce O(n²) edges; total rendered edges per layer ≤ `ACC_GRAPH_3D_MAX_EDGES`.

---

## 4. Layout Math Validation Workflow

**When:** changing `mathLayer.ts`, `featureTargets.ts`, or `physicsLayer.ts` constants.

Run the math/physics test suite plus these invariants:
- **0/100 slider behavior** — at 0: organic cloud (not sphere/disc/origin/blob); at 100: clustering
  ratio measurably higher than at 0 (use `layoutStats.computeClusteringRatio`).
- **Blend sanity** — multiple sliders blend proportionally; no single slider destroys the layout
  unless maxed.
- **No NaN** — all positions finite (2D and 3D).
- **zRange** — 3D z-extent non-degenerate (not flattened to a plane).
- **Availability gating** — sparse-dimension unknown nodes get 0 force.
- **Determinism** — identical inputs ⇒ identical positions ⇒ identical cache key.

**Gate:** `mathLayer.purity` + `physicsLayer.purity` + `physicsClustering` tests pass; clustering
ratio monotonic across slider sweep.

---

## 5. Renderer Regression Workflow

**When:** touching renderers, color buffers, edge buffers, or before merge.

Via `graphTestBridge` + Playwright (:3100, `NEXT_PUBLIC_ACC_GRAPH_TEST=1`):
- **2D colors** — `getColorStats()` signature/distinct-count changes when color mode changes.
- **3D colors** — instance colors applied; not all-white.
- **Edges render** — `getRendererState()` link count > 0 in 2D and 3D; per-layer toggles reflected.
- **Lasso** — selection smoke (`simulateClick`/lasso) dims non-selected via mask, not physics.
- **Mode parity** — 2D↔3D toggle preserves node/edge counts and color semantics.
- **Diagnostics overlay** — the in-app stats panel (node/edge/mode/preset/color/version/clustering)
  matches the bridge values (so humans never need devtools).

**Gate:** all e2e renderer assertions green; node-count assertion tolerant of DC ingest drift.

---

## Adoption note

These five workflows map 1:1 onto the implementation phases in the engine strategy (§7). The Data
Discovery Workflow is already executable today via the committed discovery script; the other four
become live as their corresponding engine phases land. Consider promoting any of these to a
`superpowers` skill once the engine build-out begins.
