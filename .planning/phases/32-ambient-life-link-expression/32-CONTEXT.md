# Phase 32: Ambient Life & Link Expression - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

The production-default 2D similarity map becomes visibly alive at rest without
restarting physics or sacrificing workshop responsiveness:

1. **LIFE-03** — every node receives a tiny deterministic micro-orbit around its
   current layout anchor. Activity recency controls amplitude and speed; selected,
   matched, and hovered foreground nodes hold still while the surrounding graph
   continues softly. Ambient offsets pause during Catalog / Group-by morphs and
   resume over approximately 180ms after the morph settles.
2. **LIFE-03 performance safety** — a runtime FPS controller begins with all nodes
   animated, degrades to recent nodes at 30Hz when sustained FPS falls below 50,
   and finally disables ambient offsets if that still cannot hold the gate. Recovery
   uses a higher sustained threshold so tiers do not flap.
3. **LIFE-05** — the existing Canvas2D similarity web gains three deliberate
   strength bands for width and opacity. Ambient, selected, and hovered layers keep
   their established draw priority. During slider morphs the web stays faintly
   visible and follows the nodes instead of fading to nothing, then eases back to
   its resting expression.

**Acceptance surface:** `/users/spatial-graph` and its
`/users/access-analysis` alias, on the flag-OFF frozen 2D projector path with the
full live ~22k-node snapshot.

**Out of scope:** new graph data, embedding or neighbor recomputation, new link
classes, new controls or settings, node-size semantics, color redesign, profile
content, camera/tooltip/panel changes (Phase 31 is complete), the parked flag-ON 3D
renderer, and SSR/chunk/time-to-graph work (Phase 33).

**Name-collision trap (standing):** change
`app/(dashboard)/users/access-analysis/` (the spatial graph), not
`app/(dashboard)/access-analysis/` (the 23-panel charts page).
</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 32 + `.planning/REQUIREMENTS.md` LIFE-03/LIFE-05
  — full ambient recency-modulated life, hard sustained >=50fps gate, observed
  degradation, reduced-motion static behavior, strength-driven links, and a designed
  slider-morph transition.
- `.planning/phases/31-click-hover-choreography/31-CONTEXT.md` and
  `31-VERIFICATION.md` — focus membership is selected + ten distinct matches;
  hover temporarily sits above selection; Cosmos camera calls remain simulation-free.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` — the shell already
  owns the current per-frame `layoutTarget`, live morph state, selected match indices,
  hover index, node-size buffer, and `SimilarityWebOverlay` props. It is the narrow
  composition boundary; no new fetch or global store is required.
- `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` +
  `useGraphRafLoop.ts` — one existing rAF path obtains the current layout target and
  pushes positions into the active renderer. The flag-OFF path already runs with
  `gpuSimulation={false}` and a frozen `PhysicsLayer`; ambient must compose into this
  target path rather than start a simulation.
- `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx:421-490` — a changed
  position buffer calls Cosmos `setPointPositions(..., true)` + `render`; byte-equal
  static frames park via the existing dirty check. Full ambient therefore turns the
  position upload into a real per-frame cost and must be measured, not assumed.
- `app/(dashboard)/users/access-analysis/clusterTransitionLayer.ts` — existing pure,
  allocation-free, dt-driven layer pattern with background-tab clamping. Phase 32 can
  reuse this style without inventing a second animation framework.
- `app/(dashboard)/users/access-analysis/featureSnapshot.ts:45-53` +
  `interactionTypes.ts:96-97` — authoritative recency buckets already loaded per node:
  `0-7d`, `8-14d`, `15-30d`, `31-60d`, `60d+`, and `none`.
- `app/(dashboard)/users/access-analysis/nodeSizes.ts` — radius already communicates
  access breadth (permission strength + admin + project breadth). Ambient must not
  pulse radius and create a second, conflicting size meaning.
- `app/(dashboard)/users/access-analysis/SimilarityWebOverlay.tsx` — current overlay
  draws at ~30Hz, batches paths by palette, uses constant base width, draws ambient <
  selected < hovered, and currently sets the morph opacity target to zero.
- `app/(dashboard)/users/access-analysis/similarityWeb.ts` — edge strength is already
  min-max normalized over the real score distribution and currently affects alpha
  only. LIFE-05 should band this existing normalized value, not recompute similarity.
- `app/(dashboard)/users/access-analysis/graphTestBridge.ts` and
  `tests/e2e/phase31-focus.spec.ts` — existing flag-gated production-browser seam can
  observe the full graph and drive real focus interactions; extend it narrowly for
  ambient tier/animated-count evidence rather than create a second harness.
- Phase 30 live evidence: 22,279 embedded rows and an 18k distinct-match web. Those
  are the measurement inputs; do not substitute a small fixture for the hard FPS gate.
</evidence>

<defaults>
## Inferred Dashboard Defaults

- Build one pure ambient-position layer and compose it **after** the current catalog
  anchor/layout target. Each frame derives `visible = anchor + offset`; offsets never
  accumulate, so nodes cannot wander away from their truthful position.
- Use deterministic nodeId-derived phase/frequency and reusable typed arrays. No
  `Math.random()` in the frame loop, no per-frame arrays/maps, no React state per
  frame, and no new dependency.
- Motion is x/y-only with z fixed at 0. Maximum displacement stays around a node
  diameter and never changes cluster membership or the meaning of proximity. Exact
  amplitudes/frequencies may be tuned against the production build.
- Recency ordering is monotonic:
  `0-7d > 8-14d > 15-30d > 31-60d > 60d+ > none`. Dormant/unknown nodes retain a
  minimal non-zero orbit in full mode so "every node carries life" remains true.
- A hovered node freezes immediately for hit/tooltip stability. During click focus,
  the selected node and its ten distinct matches freeze; twins are not part of the
  focus set. Non-focus ambient amplitude softens while focus is active.
- `prefers-reduced-motion` bypasses ambient offsets entirely and snaps all link
  opacity changes. Page-hidden intervals pause animation and reset FPS sampling so a
  background tab cannot trigger a false downgrade.
- Degradation has no user-facing control or toast. It is a renderer safety behavior,
  observable through the test bridge and verification record only.
- Extend the existing similarity overlay and strength normalization. No second canvas,
  SVG layer, edge query, or edge-set recomputation.
- Preserve the Phase-31 focus priority: base web first, selected edges second, hovered
  edges last. Focus edges inherit their strength band and gain a small priority width/
  alpha lift rather than collapsing back to one fixed style.
- No GPU simulation start/reheat. PERF-02 frozen-handle invariant and TEST-01/02/03
  remain green.
</defaults>

<decisions>
## Implementation Decisions (owner, 2026-07-16)

### 1. Ambient character = deterministic micro-orbits
- Every node traces a tiny deterministic, anchor-relative micro-orbit; recency controls
  both its displacement and pace.
- Node radius remains unchanged because it already encodes access breadth. No breathing
  size pulse, glow pulse, color flicker, or free random walk.
- Use nodeId-derived phase offsets so neighboring nodes do not move in lockstep and
  reloads remain visually stable.

### 2. Interaction composition = foreground freeze, soft background
- Hover freezes the hovered node for stable targeting.
- Click focus freezes the selected node plus its ten distinct matches. The rest of the
  graph continues at a softer ambient amplitude so the evidence rail remains visually
  anchored without making the entire map dead.
- Slider/Catalog morphs pause ambient offsets while the authoritative anchors move.
  When the morph settles, ambient resumes from zero to its current tier over about
  **180ms**, avoiding a phase jump.

### 3. Degradation = three tiers with hysteresis
- **Tier 0 — full:** all nodes animate through the existing rAF position path.
- **Tier 1 — recent/30Hz:** only nodes in `0-7d`, `8-14d`, `15-30d`, or `31-60d`
  animate; dormant/unknown nodes stay at anchors; position uploads are capped at 30Hz.
- **Tier 2 — static:** ambient offsets are disabled; click/hover/morph choreography
  remains functional.
- Evaluate rolling **3-second** FPS windows. Downgrade after two consecutive windows
  below 50fps. Recover one tier only after **10 sustained seconds at >=55fps**.
  Reset the sampler on tab visibility changes and reduced-motion changes.
- The production verification must first prove Tier 0 sustains >=50fps for a continuous
  10-second sample on the workshop machine at the full node set. If it cannot, the
  shipped controller must visibly enter Tier 1/2 and that observed result is recorded.

### 4. Links = three strength bands with a visible morph floor
- Map normalized strength into three stable bands:
  - weak: `[0, 1/3)`;
  - medium: `[1/3, 2/3)`;
  - strong: `[2/3, 1]`.
- Width and opacity both rise by band. Exact pixel widths/theme alpha ceilings are
  tuning discretion, but adjacent bands must be visibly distinct on the projector and
  remain batched by band/palette rather than stroked through a costly per-edge style
  loop.
- During a slider morph, ease the ambient web down to roughly **25% of its normal
  opacity**, continue projecting it against the moving node positions, then ease it
  back over approximately **180ms**. It never disappears.
- Selected edges render above the morphing base web; hovered incident edges remain the
  final layer. Reduced motion snaps between the same states.

### Codex's Discretion
- Exact micro-orbit equation, amplitude/frequency constants within the displacement
  bound, soft-background multiplier, reusable buffer/component boundary, exact band
  widths and theme alpha values, FPS sampler implementation, and whether the observed
  degradation browser gate uses Chromium CPU throttling or a flag-gated injected frame
  sample. These choices may not change the locked tiers, thresholds, timings, strength
  bands, or visibility floor.
</decisions>

<specifics>
## Specific Ideas

- At rest the graph should feel biologically alive, not like particles escaping their
  data positions: recently active people visibly circulate; dormant people barely
  stir; clusters keep their truthful shape.
- During a workshop click, the selected neighborhood becomes the calm explanatory
  foreground while the surrounding organization keeps breathing.
- During a Catalog morph, the web should read as elastic connective tissue following
  the moving points, not blink out and reappear.
</specifics>

<workshop>
## Workshop Impact

- Surface: `/users/spatial-graph` and `/users/access-analysis` alias.
- Presenter gains an immediately visible activity story before touching a control:
  recent accounts feel active, dormant accounts feel quiet, and the similarity web
  communicates stronger relationships without becoming a hairball.
- Focus remains readable because the inspected node and its ten matches stop moving
  while the background supplies restrained life.
</workshop>

<data_truth>
## Data Truthfulness

- No new source or scrape. Motion intensity comes only from the already-loaded
  `activityRecencyBucket`; missing activity is rendered as minimal/unknown life, not
  falsely classified as recent.
- Micro-orbits are visual offsets around the current truthful PaCMAP/catalog anchor;
  they never write back to physics, embeddings, or stored coordinates.
- Link strength bands derive from the existing real-distribution min-max normalized
  similarity score. The phase changes expression, not relationship membership or score.
- FPS tier and animated-node count must be recorded alongside the measured frame rate;
  verification may not claim "full ambient" while silently running a degraded tier.
</data_truth>

<deferred>
## Deferred Ideas

- User-adjustable ambient intensity, pause button, or motion legend — skipped; add only
  if owner UAT shows the automatic behavior needs presenter control.
- Radius breathing, glow fields, color pulsing, particles traveling along links, and
  directional arrows — rejected for this phase because they conflict with existing
  encodings or add decoration without new data.
- Ambient motion for the parked 3D path — deferred until 3D becomes a shipped workshop
  mode.
</deferred>

<verification>
## Verification Expectations

- Pure unit checks:
  - deterministic micro-orbit output, monotonic recency intensity, anchor-relative/no
    cumulative drift, focus/hover freeze, morph pause/resume, and buffer reuse;
  - FPS controller downgrade/recovery thresholds, hysteresis, hidden-tab reset, and
    reduced-motion static behavior;
  - strength-band boundaries, band width/opacity ordering, morph opacity floor, and
    ambient < selected < hovered priority.
- Integration checks:
  - `GraphCanvas` consumes ambient positions through the existing frozen rAF/push path
    and never calls simulation start/resume for the flag-OFF projector;
  - selected + match positions hold while background positions change; slider morph
    moves anchors with ambient paused and resumes without a jump;
  - `SimilarityWebOverlay` remains visible during morph and follows current Cosmos
    positions.
- `prefers-reduced-motion` production-browser check: positions remain static across
  multiple frames while focus and link state changes still work.
- Hard production-browser gate on isolated `:3100`, full live snapshot:
  1. warm the graph for 3 seconds;
  2. sample rAF for 10 continuous seconds at Tier 0;
  3. record node count, edge count, FPS, active tier, and animated-node count;
  4. require sustained >=50fps to claim full mode passes;
  5. force/observe a below-gate condition and record Tier 0 -> Tier 1 (and Tier 2 if
     needed), then recovery only after the locked >=55fps window.
- Workshop interaction smoke: hover stability, click focus freeze, background life,
  Catalog morph web floor, post-morph 180ms return, no console errors.
- `npx tsc --noEmit`; focused Vitest suite; `node scripts/repo-map/check.cjs` if shared
  imports/component boundaries change; TEST-01/02/03 and PERF-02 stay green.
</verification>

---

*Phase: 32-ambient-life-link-expression*
*Context gathered: 2026-07-16*
