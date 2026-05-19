# Phase 1: Data + Math Foundation - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure TypeScript data and math layers. `dataLayer.ts` builds an Arrow table (one row per `(email, projectId)`) sourced from existing tRPC endpoints and materializes it in DuckDB-WASM. `mathLayer.ts` exports `computeTargetPositions(features[], sliders[]) → Float32Array`. Both modules have zero React, DOM, or engine imports. All Vitest tests pass. No physics, no render, no UI.

</domain>

<decisions>
## Implementation Decisions

### Feature normalization
- **Activity count**: `log1p(count)` → min-max scaled to [0,1]. Long tail compressed, light users distinguishable from heavy.
- **Last sign-in age**: Claude's discretion (suggest inverse + 90-day clip: `1 - min(age/90, 1)` — recent = high, anything older than 90d treated as cold).
- **Boolean features** (isAdmin, isExternal): direct mapping — `true → 1.0`, `false → 0.0`. Slider strength modulates contribution.
- **Location**: normalization happens during the Arrow build step in `dataLayer.ts`. Normalized columns stored alongside raw columns. Math layer reads pre-normalized values — tests don't need to mock normalization.

### Per-dimension seed function
- **Shape**: radial. `f_d(node) = normalized_value × R × (cos θ_d, sin θ_d)` where `θ_d = (d/D) × 2π`. High value = far from origin along the axis; low value = near center.
- **Radius R**: Claude's discretion (suggest fixed constant ~300 world units to match d3-force-3d defaults; revisit if datasets grow).
- **Z-axis (3D mode)**: Claude's discretion (suggest seed remains 2D — z=0 at seed time; physics nudges z during simulation; 3D is a camera change, not a math change).
- **Zero state**: when ALL sliders = 0, target = `(0,0,0)`. Physics repulsion then spreads nodes organically. Matches MATH-04 "pure organic" semantic. Required for deterministic tests.

### Categorical dimension encoding
- **Role IDs**: one axis per distinct role (Project Admin, Member, Viewer, etc.). Each role gets its own angle on the dimension wheel. Lets users cluster by specific role.
- **Module IDs** (Docs, Cost, Sheets, etc.): one axis per module. Per-node weight = `activity_in_module / total_activity`. Multi-module users get a weighted-average position across their modules (NOT dominant-module-wins). Exposes who splits attention across modules.
- **Folder permission tier** (NoAccess / View / Upload / Edit / Manage): categorical — one axis per tier, NOT ordinal. Each tier clusters its own region.
- **Multi-value composition**: weighted average of angles. `position = Σ(weight_i × angle_i × R) / Σ(weight_i)`. A user with split-Docs/Cost activity sits between those axes; a user with two roles sits between those angles.

### Position cache (DuckDB-WASM)
- **Cache key**: `sha1(sorted(nodeIds) + sliderValues)`. Filter changes alter visibility (alpha mask), not identity — same nodeIds and same sliders → same cached position. Sliders are part of the key because they DO change positions.
- **Slider movement**: new cache entry per slider state. Fast jumps between known slider configurations; no recompute when revisiting a state.
- **Schema**: Claude's discretion (suggest two tables — `nodes` for features, `positions_cache` for `(key, nodeId, x, y, z)` rows; cleaner separation, queryable for debugging).

### Test strategy (Vitest)
- Slider = 0 contributes zero to position (test exact 0).
- Slider = 1 contributes full target (test exact value).
- Two sliders blend additively and monotonically (per MATH-04).
- Specific test depth: Claude's discretion (suggest hand-picked examples covering slider=0, slider=1, two-slider blend, plus one fast-check property test for monotonicity in each slider — fast to write, fast to run).

### Claude's Discretion
- Last sign-in age normalization curve (inverse + 90d clip suggested).
- Seed radius R value (suggest 300 world units).
- Z-axis seed behavior in 3D (suggest z=0 at seed; let physics handle depth).
- DuckDB-WASM schema layout (suggest two-table split).
- Exact Vitest test count + whether to add fast-check property tests.

</decisions>

<specifics>
## Specific Ideas

- The cache key intentionally excludes feature data: a data refresh that doesn't change node IDs or slider values is treated as a no-op for layout. This is desired — node features change rarely; positions should be stable session-to-session.
- Categorical dims (role IDs, modules, permission tiers) all use the same pattern: one axis per category + weighted-average position when a node has multiple values. Symmetric across all three categorical dims — no special cases.

</specifics>

<deferred>
## Deferred Ideas

- Cluster hull rendering, cluster labels, per-dimension color themes — deferred to v2 POLISH-01/02/03.
- UMAP / t-SNE pre-processing — explicitly out of scope (per REQUIREMENTS).
- Cross-tab pie chart embedding — deferred to v2 PIES-01.

</deferred>

---

*Phase: 01-data-math-foundation*
*Context gathered: 2026-05-19*
