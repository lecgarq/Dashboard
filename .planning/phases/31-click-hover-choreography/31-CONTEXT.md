# Phase 31: Click & Hover Choreography - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

The live `/users/spatial-graph` interaction becomes one coherent focus system:

1. **LIFE-01** — clicking a node starts an immediate, ≤200ms focus transition:
   moderate camera ease to the node, the clicked node plus its ten distinct Phase-30
   matches stay lit, direct match edges rise above the dimmed web, and the unified
   right rail opens. Background click, Esc, and the rail Close action clear the same
   focus state and restore the exact pre-click view.
2. **LIFE-02** — hovering keeps the existing focus ring, temporarily raises that
   node's incident similarity edges above any click selection, and reveals an
   ~80ms-delayed tooltip with permission tier, activity recency, and folder breadth.
3. **LIFE-04** — the separate floating `NeighborMatchesPanel` card is retired.
   Identity, closest matches / why-similar explanations / twin affordance, and the
   existing ACC profile body become one continuous animated right rail.

**Acceptance surface:** the production-default flag-OFF 2D projector map on
`/users/spatial-graph` and its `/users/access-analysis` alias. The parked flag-ON
3D path keeps its existing event wiring and must not regress, but receives no bespoke
orbit/camera choreography.

**Out of scope:** ambient node motion and recency-modulated breathing (Phase 32);
base similarity-link width/opacity remapping, morph behavior, and general link
expression (Phase 32); embedding, neighbor payload, why-similar ranking, or edge-set
recomputation (Phases 29–30 are complete); SSR/chunk/time-to-graph work (Phase 33);
new data extraction, scraping, dependencies, routes, WebGL surfaces, or profile
content redesign.

**Name-collision trap (standing):** change
`app/(dashboard)/users/access-analysis/` (the spatial graph), not
`app/(dashboard)/access-analysis/` (the 23-panel charts page).
</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 31 + `.planning/REQUIREMENTS.md` LIFE-01, LIFE-02,
  LIFE-04 — camera focus, match lighting, edge emphasis, substantive tooltip, unified
  animated panel, ≤200ms response, reduced motion, and frozen-handle safety.
- `.planning/STATE.md` Phase-30 result — the live payload is already
  `{matches:[{nodeId, score, why}], twins:{count, ids}}`; lighting must use `matches`
  only. Twins are exact-vector position clumps, not focus neighbors.
- `app/(dashboard)/users/access-analysis/GraphInteractions.tsx` — owns hover state,
  installs the renderer handlers, routes click/background/Esc to `onIsolate`, pushes
  selected indices, and is the narrow interaction orchestration boundary.
- `app/(dashboard)/users/access-analysis/usePredicateEngine.ts:148-168` — current
  isolate mask lights the clicked node, supplied similarity neighbors, **and every
  same-user project membership**. The owner selected match-only lighting, so the
  same-user branch must be removed from the isolate rule while filter/lasso behavior
  remains unchanged.
- `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` — frozen Cosmos handle
  exposes hover/selection and coordinate conversion but not focus camera methods yet.
  Installed Cosmos 3.3.0 already provides `zoomToPointByIndex`,
  `setZoomTransformByPointPositions`, and `getZoomLevel`; both programmatic zoom
  methods accept `enableSimulation=false`, so no custom camera engine is needed.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx:358-406,523-560` —
  on-demand Phase-30 matches, nodeId→index join, match-only `neighborIndices`,
  always-on similarity web, separate absolute matches card, and the right-rail profile
  are already assembled in one route shell.
- `app/(dashboard)/users/access-analysis/SimilarityWebOverlay.tsx` +
  `similarityWeb.ts` — Canvas2D curved web uses one affine projection and batched
  paths at ~30Hz. It currently has no selected/hovered edge layer; focus should extend
  this overlay and reuse its projection/curve/color data, not create another renderer.
- `app/(dashboard)/users/access-analysis/RightPanelStack.tsx` — established
  user-detail > lasso > sliders precedence, resizable stable width, and a 200ms
  Framer Motion rail transition. Phase 31 composes inside this existing top layer.
- `app/(dashboard)/users/UserProfilePanel.tsx` — the rail profile already opens from
  cached/in-memory data with no click-time live ACC request. Its ACC body is retained;
  duplicate identity chrome is removed by the unified composition.
- `app/(dashboard)/users/access-analysis/NeighborMatchesPanel.tsx` — Phase-30
  content is complete: distinct matches, why chips, twin chip/list, coverage suffixes,
  and match re-isolation. Phase 31 changes placement/chrome, not this data contract.
- `app/(dashboard)/users/access-analysis/NodeTooltip.tsx` — current tooltip is an
  identity-heavy portal; it has a canvas-origin prop but `GraphInteractions` does not
  supply the graph rect, so Phase 31 must keep the upgraded tooltip correctly anchored
  after toolbar/page offsets.
- `app/(dashboard)/users/access-analysis/interactionTypes.ts` — the client snapshot
  already holds `permTier`, `activityRecencyBucket`,
  `permissionTypeSummary.folderBreadth`, and `permissionCoverage`; no new query or
  scrape is required.
</evidence>

<defaults>
## Inferred Dashboard Defaults

- Reuse Cosmos 3.3.0 camera APIs, the current selection context, the existing
  Canvas2D similarity overlay, the Phase-30 neighbor payload, and installed
  Framer Motion. No new abstraction, dependency, data route, or renderer.
- Camera duration and rail entrance/exit default to **180ms ease-out**, leaving
  margin under the hard 200ms budget. Hover ring/edge emphasis is immediate;
  only tooltip disclosure waits ~80ms.
- Reduced motion snaps the camera and node/edge state immediately and renders the
  rail without translation (instant or opacity-only). It does not suppress content.
- The first null→node click snapshots the pre-focus view. Selecting another match
  moves the camera to that match without replacing the snapshot; the eventual clear
  returns to the view from before the focus session began.
- Snapshot enough public camera state to restore exactly: canvas-center space
  coordinate plus current zoom level. Restore through
  `setZoomTransformByPointPositions(..., enableSimulation=false)`.
- Async neighbor data never delays the initial response: node ring, camera, and rail
  begin immediately from the click. The matches section uses a compact skeleton while
  the existing on-demand query resolves, then shows the real list, an honest empty
  state, or an inline error; no spinner and no fake matches.
- Preserve right-rail precedence and underlay behavior: user focus remains above lasso;
  clearing it returns to the existing lasso panel when one exists, otherwise Layout /
  Dimensions.
- Preserve theme tokens and current brand colors. Focus uses the established blue ring;
  no glow field, decorative gradient, nested card, or new visual vocabulary.
- PERF-02 remains absolute: camera, click, hover, panel, mask, and overlay changes must
  never call Cosmos `start`, mutate cluster/simulation configuration, or reheat GPU
  physics.
</defaults>

<decisions>
## Implementation Decisions (owner, 2026-07-16)

### 1. Camera = moderate contextual focus with exact view restore
- On click, call the native Cosmos point focus at approximately **2.25× scale** over
  **180ms**, centered on the node, with `canZoomOut=false` and
  `enableSimulation=false`. Existing closer zoom is preserved rather than pulled back.
- Snapshot the pre-focus center + zoom once per focus session. Background click, Esc,
  and Close all use one clear path that restores that snapshot over 180ms.
- Under reduced motion both focus and restore snap with duration 0.

### 2. Lighting = selected node + ten distinct matches only
- Full-opacity focus set is exactly the clicked node plus
  `neighborsQuery.data.matches` joined to graph indices.
- Do **not** light exact twins or the clicked person's other project memberships.
  Non-focus nodes keep the established 0.15 greyout.
- The selected node retains the focus ring. Matches are lit by opacity and their
  direct curves, without ten competing outline rings.
- All available direct selected→match curves render above the dimmed global web.
  If the capped global edge set omitted one, derive that focused curve from the
  on-demand match payload so the visual never claims fewer matches than the panel.
- During click focus the background web falls to roughly 15% of its normal alpha;
  focused curves draw last at full palette alpha with a fixed emphasis width. Phase 32
  still owns the general strength→width/opacity redesign.

### 3. Panel = one continuous right rail, matches first
- Remove the floating absolute matches card.
- One rail contains, in order:
  1. a single identity header with Close;
  2. closest distinct matches with scores and why-similar chips, plus the existing
     identical-twin affordance;
  3. the existing full ACC profile body below a section divider.
- Do not repeat the identity header or retain an "Open profile" action—the profile is
  already present. Clicking a match/twin re-isolates it, eases the camera to it, and
  refreshes the same rail in place.
- The whole rail enters/exits as one 180ms state transition; match rows do not perform
  an ornamental stagger.

### 4. Hover = temporary edge layer above persistent selection
- Hover ring and incident similarity-edge emphasis start immediately whether or not a
  node is already selected. The click selection remains underneath and is not cleared.
- Hovered incident edges draw after selected edges; hover exit restores the selected
  edge layer exactly. Hover does not fetch neighbors and does not replace the click
  mask.
- Tooltip appears after approximately **80ms** and cancels cleanly on exit or node
  change. It retains compact identity context, then shows:
  - permission tier;
  - activity recency from `activityRecencyBucket`;
  - folder breadth from `permissionTypeSummary.folderBreadth`.
- Coverage is truthful: partial breadth is labeled partial; unknown permission coverage
  renders breadth/tier as unavailable rather than numeric zero or a confident value.
  The portal is positioned from the actual graph wrapper rect.

### Codex's Discretion
- Exact component split for the unified rail, focus-edge buffer representation,
  skeleton row count, concise tooltip copy, and the precise fixed focused-edge width,
  within the locked ordering, timings, focus membership, and Phase-32 scope fence above.
</decisions>

<specifics>
## Specific Ideas

- The intended workshop beat is one continuous response: click → camera settles while
  the neighborhood lights → the same right rail explains the person and why the ten
  matches belong nearby. It should feel like inspecting the graph, not opening two
  unrelated widgets.
- Match-to-match navigation remains spatial: the rail stays put while the camera and
  highlighted neighborhood move to the chosen person.
</specifics>

<workshop>
## Workshop Impact

- Surface: `/users/spatial-graph` and `/users/access-analysis` alias.
- Presenter gains a reversible focus mode that keeps enough map context to narrate the
  neighborhood, visibly connects every listed match, and keeps profile plus similarity
  evidence in one scan path.
- Hover becomes a fast preview rather than a competing selection mode.
</workshop>

<data_truth>
## Data Truthfulness

- No new source or scrape. Click matches and explanations come from the Phase-30
  `instanceNeighbors` payload; tooltip facts come from the already-loaded
  `NodeFeatureSnapshot`.
- Exact twins remain disclosed in the rail but are not falsely presented as the ten
  distinct lit matches.
- Permission tier and breadth obey `permissionCoverage`; unknown coverage never renders
  as zero/none with false certainty.
- The focus overlay may synthesize a missing selected→match curve from the authoritative
  on-demand match payload, but must use its stored similarity score and real endpoints.
</data_truth>

<deferred>
## Deferred Ideas

- Recency-modulated node breathing/drift and its ≥50fps degradation rule — Phase 32.
- Strength-driven base link widths/opacities, hover-priority styling generalization,
  and slider-morph link behavior — Phase 32.
- Bespoke 3D orbit-to-node choreography — not planned while the production flag remains
  off; reconsider only if 3D becomes a shipped workshop mode.
</deferred>

<verification>
## Verification Expectations

- Focused unit tests:
  - `usePredicateEngine` proves isolate lights only selected + supplied matches, not
    same-user memberships or twins.
  - `GraphCanvas2D` camera handle proves focus/restore call Cosmos with
    `enableSimulation=false`, reduced motion uses duration 0, and no simulation start.
  - `GraphInteractions` proves click-session snapshot semantics, background/Esc clear,
    hover-over-selection precedence, 80ms tooltip delay, and timer cancellation.
  - `SimilarityWebOverlay` (or its extracted pure focus resolver) proves background <
    selected < hovered draw priority and direct match-edge fallback.
  - unified rail rendering proves matches precede the profile, one identity header
    exists, loading/empty/error states are honest, and match click re-isolates.
  - `NodeTooltip` proves tier/recency/breadth plus partial/unknown coverage rendering.
- Existing Phase-30 panel/why/twin tests remain green after the presentational move.
- `GraphCanvas.test.ts` PERF-02 frozen-handle invariant stays green; TEST-01/02/03 stay
  green; no GPU simulation start appears in click/hover browser instrumentation.
- `npx tsc --noEmit`; `node scripts/repo-map/check.cjs` if shared imports or component
  boundaries move.
- Production-build browser gate on isolated `:3100`: full ~22k-node graph, click a
  node, verify visible response begins within 200ms, ten distinct matches/lighted
  curves agree with the rail, match-to-match navigation works, Esc/background/Close
  restore the original view, hover restores selection, reduced motion snaps, and the
  console stays clean.
</verification>

---

*Phase: 31-click-hover-choreography*
*Context gathered: 2026-07-16*
