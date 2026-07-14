# Phase 25: Dimension Aperture — Group, Color & Filter - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

On `/users/spatial-graph` (= `/users/access-analysis`, the same shell — **NOT** the
23-panel `/access-analysis` charts page), Group-by, Color-by, and the toolbar filter
chips all draw from an owner-chosen set of already-computed node dimensions instead of
the three hardcoded strings each control was limited to before v2.4. Every exposed
dimension states its real data coverage at the point of selection.

This is an **encoding** change, not a layout change. Selecting a dimension re-groups /
re-colors / filters nodes on the existing precomputed embedding — **it does not move
nodes** (that is Phase 27's force-anchor revival) and it does **not** render the 208-dim
catalog slider wall (that is Phase 26). No new data, no new loader, no new Prisma table.

Requirements: DIM-01 (group by any chosen dim), DIM-02 (color by any chosen dim),
DIM-04 (filter by any chosen dim), DIM-05 (honest coverage labels).

</domain>

<evidence>
## Grounding Sources

- `.claude/skills/lecg-dashboard/SKILL.md` — zinc-dark taste, source roots, no-new-WebGL
  on data surfaces, `npx tsc --noEmit` before rebuilds, label-don't-hide data honesty.
- `.planning/STATE.md` — Phase 24 COMPLETE (2/2). `dimensionIdSpace.ts` now the single
  source both Group-by (`groupByDimensions.ts`) and Color-by (`nodeColors.ts`) resolve
  from (DIM-03). This phase **widens** that unified id-space; widening two still-divergent
  lists first was the explicitly-flagged trap.
- `.planning/ROADMAP.md` (Phase 25 details, lines 503–520) — success criteria for
  DIM-01/02/04/05, "UI hint: yes".
- `.planning/REQUIREMENTS.md` (DIM-01/02/04/05, lines 58–77) — the ~14-dim available
  palette from `featureSnapshot.ts:127-235`; DIM-04's current chip source is the separate
  `SliderContext.DIMENSIONS` (12 registry dims) that must be swapped to the unified aperture.
- `.planning/codebase/CONCERNS.md` / v2.4 grounding facts in STATE.md — node grain =
  user×project membership (`nodeId = user_id::project_id`, ~16,942 nodes); all chosen dims
  are already node-level in `featureSnapshot.ts` so no cross-grain aggregation rule is needed.
- VERIFY: exact data source + coverage figure per added dimension (which are
  DC-sourced vs live-API vs computed-from-all-nodes). The "~48%" activity-volume coverage
  used illustratively during discussion is **not verified** — do not ship a made-up number.
- VERIFY: the ~550/1,153 figure is `AccDcProject (550)` vs `AccProject (1,153)` from the
  data census; confirm it is the correct coverage denominator for each DC-sourced dim.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Reuse the existing controls — `GroupByControls` `<select>`, `nodeColors` color modes, and
  the toolbar filter chips. No new control surface is introduced.
- Extend the Phase-24 `dimensionIdSpace.ts` as the single source all three controls resolve
  from; do not reintroduce a second hardcoded array.
- Organize the widened option lists with theme section headers / optgroups
  (Identity · Activity · Risk · Permission) so ~17 options stay scannable — an anti-overbloat
  measure the owner explicitly cares about.
- Filter is **add-a-chip**: the user picks a dimension from a menu, then multi-selects its
  values — the toolbar does not show all ~17 dimensions as always-visible chips.
- Zinc dark theme; all node/legend colors resolved from theme tokens. No new WebGL (the graph
  already runs cosmos.gl; reviving its force engine is Phase 27, not this phase).
- Band cut-points for continuous dims are derived from the actual data distribution during
  planning/execution; the exact thresholds are Claude's discretion, but every band must be
  labeled.

</defaults>

<decisions>
## Implementation Decisions

### Aperture set (DIM-01 / DIM-02 / DIM-04)
Owner chose to expose the **full available palette** — this was a deliberate, asked-for
choice, not an assumption. Baseline `role · project · user` stays; the following are added,
all already computed per node in `featureSnapshot.ts` (no new data):
- **Identity & org:** company, internal/external, admin/member
- **Activity & engagement:** activity volume, activity recency, sign-in recency,
  dominant activity mix, module signature
- **Risk & tenure:** risk score, membership tenure
- **Permission & reach:** permission tier, permission strength, folder breadth,
  accessible-data (TB)

All three controls (Group-by, Color-by, filter) draw from this one set via
`dimensionIdSpace.ts`. Filter chips **stop** reading the separate `SliderContext.DIMENSIONS`
array (DIM-04).

### Continuous-dimension banding
Group-by and Color-by need discrete buckets, so continuous dims band into labeled tiers,
e.g. risk `Low/Med/High/Crit`, membership tenure `<1m/6m/1y/2y+`, activity & sign-in recency
`<7d/30d/90d/older`, activity volume `None/Low/Med/High`, permission strength `Low/Med/High`,
folder breadth by quartile, accessible-data by TB band. Cut-points from real distribution;
labels mandatory.

### Color-by rendering (DIM-02)
**Banded swatches only — no sequential ramps.** Same buckets as Group-by, one shared legend,
categorical distinct zinc-safe colors from resolved theme tokens. Chosen explicitly on the
owner's "do not overbloat the spatial graph" constraint. (Ramp-for-ordered-dims was offered
and rejected — see Deferred.)

### Coverage labels (DIM-05)
**Inline + badge.** A coverage subtitle inside each picker option
(e.g. `Company · 550/1,153 proj`, `Risk score · all nodes`, `Activity vol · DC-sourced`),
**plus** a small persistent caveat marker on the active-dimension badge
(e.g. `[Company ⚠ 550/1,153]`). Always visible, info-dense. DC-sourced dims show project
coverage; banded dims show boundaries; all-node dims say so. No under-covered dim is
silently presented as complete.

### Filter behavior (DIM-04)
**Multi-select values to keep.** Pick a dimension → check which values stay
(e.g. companies Hermosillo + ACME) → non-matching nodes filter out. Composes across
multiple filtered dimensions.

### Claude's Discretion
- Exact band cut-points per continuous dimension (from data distribution).
- Precise option grouping / optgroup layout and empty-state / no-match wording.
- The specific zinc-safe swatch palette per banded dimension (contrast-checked on dark bg).
- Filter chip menu affordance for choosing which dimension to filter.

</decisions>

<specifics>
## Specific Ideas

- Owner rejected the first framing ("all ~14 `featureSnapshot` fields") and required being
  asked which dimensions — the set is an owner decision, surfaced by theme, not inferred.
- "Do not overbloat the spatial graph" is a standing constraint for this phase: broad
  *menu*, restrained *rendering* (bands not ramps, one legend, add-a-chip filtering).
- Coverage-label and filter previews the owner selected verbatim:
  - `Active: [Company ⚠ 550/1,153]`
  - `[Company ▾] ☑ Hermosillo ☑ ACME ☐ (others) → graph shows only kept nodes`

</specifics>

<workshop>
## Workshop Impact

- **Surface:** `/users/spatial-graph` (identical shell to `/users/access-analysis`).
  The 23-panel `/access-analysis` charts page is **untouched** — name-collision trap.
- The presenter can slice the graph live by company, activity, risk, or permission and
  recolor/filter on the fly, and every slice honestly states its coverage without opening
  dev tools. Turns three hardcoded cuts into an owner-curated dimension menu.

</workshop>

<data_truth>
## Data Truthfulness

- No data changes. Source stays `accDcGraph.bulkUsers` + the offline `AccInstanceEmbedding`.
- All chosen dims are already node-level (user×project grain), so no cross-grain aggregation
  rule is required — the DIM-05 caveat is about *coverage*, not *grain*.
- **Coverage figures must be verified from source before display.** Each added dim is labeled
  as DC-sourced (with its real project coverage), live-API-sourced, or all-nodes. The "~48%"
  used in discussion is illustrative and unverified — `VERIFY:` real per-dim coverage.

</data_truth>

<deferred>
## Deferred Ideas

- **Sequential color ramps** for ordered dims (risk/activity/tenure) — offered, rejected now
  as overbloat; revisit only if bands prove insufficient.
- **Node motion on dimension select** (dimension physically restructures the graph) — Phase 27
  (force-anchor revival).
- **208-dim catalog slider wall** — Phase 26.
- **Issue dimensions on the graph** and a **temporal scrubber** — v2.5 (need a resolution-rate
  spike / a new time-interaction concept; already recorded in STATE.md).

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` passes before any rebuild.
- `npm test` stays green with **no regression** to the Phase-24 invariance-gate tests
  (`groupByDimensions.test.ts`, `nodeColors.test.ts`) and existing dimension tests.
- Inspect `/users/spatial-graph`: zinc theme intact, banded legends readable on the dark
  background, coverage labels present inline + on the active badge, filter multi-select keeps
  matching nodes, Group-by/Color-by/filter all resolve from `dimensionIdSpace.ts`.
- Confirm **no node motion** (still the static embedding) and **no new WebGL**; confirm the
  23-panel `/access-analysis` page and `/users/spatial-graph` layout engine are untouched.

</verification>

---

*Phase: 25-dimension-aperture-group-color-filter*
*Context gathered: 2026-07-14*
