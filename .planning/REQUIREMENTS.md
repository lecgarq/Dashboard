# Requirements: LECG Dashboard — Workshop-Grade UI/UX Overhaul

**Defined:** 2026-06-17
**Core Value:** When these pages are presented to all users in a workshop, the data makes people lean in — fast, tactile, visually premium, and explorable live.

## v1 Requirements

Scoped to 4 pages — `/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`. Foundation, Speed, Interactivity, and Visual items are cross-cutting (built once, applied to all 4); per-page items layer on top.

### Foundation & Design System

- [x] **FND-01**: A shared depth/glow/glass design-token set lives in `globals.css` and drives all 4 pages (no hardcoded hex in TSX)
- [x] **FND-02**: A reusable `PremiumSurface` card primitive (base / float / glass / inset variants) replaces ad-hoc panel styling across the 4 pages
- [x] **FND-03**: A single shared `EChart` wrapper auto-applies the correct light/dark theme via `resolvedTheme`, so every chart themes consistently
- [x] **FND-04**: A central motion facade exposes shared reveal/stagger presets and disables motion under `prefers-reduced-motion`
- [x] **FND-05**: A reusable virtualized `DataTable` primitive (sort, sticky header, row-click, inline row-expand, density toggle) is available for table pages

### Speed & Perceived Performance

- [x] **PERF-01**: Each of the 4 pages shows a skeleton/loading state within ~200ms of navigation
- [x] **PERF-02**: `/access-analysis` renders its first tier (KPIs + donuts) fast (~300ms target), streaming heavier tiers (timeline, terrain) progressively rather than blocking on one `Promise.all`
- [x] **PERF-03**: Each tRPC endpoint is fetched at most once per page load (no redundant/double fetch)
- [x] **PERF-04**: `/users` initial client payload is reduced (heavy per-user data deferred to detail-open); no load-time regression vs. today
- [x] **PERF-05**: No page introduces a new WebGL context on a data surface (GPU budget preserved; verified < 400MB GPU memory)

### Interactivity & Drill-down

- [x] **INT-01**: A single shared slide-in detail panel (shadcn `Sheet`) is the drill-target for every click source across the 4 pages
- [x] **INT-02**: Chart segments are clickable and open the relevant people/detail in the slide-in panel
- [x] **INT-03**: Table rows are clickable (open detail) and expandable inline (summary) without full-page navigation
- [x] **INT-04**: On `/access-analysis`, clicking a chart cross-filters the other charts client-side (zero new queries)
- [x] **INT-05**: An active-filter / drill-state pill bar shows current filters with one-click dismiss

### Visual Depth & Motion

- [x] **VIS-01**: Chart panels and key surfaces use 2.5D depth (glass, layered shadow, catch-light) and no longer look flat — in both themes
- [x] **VIS-02**: Donut/pie charts use gradient fills, selected-segment glow, and rounded segments
- [x] **VIS-03**: Page content reveals with a staggered entrance under a hard motion budget (< 400ms total, once per load)
- [x] **VIS-04**: KPI numbers count up smoothly on first load
- [x] **VIS-05**: Drill-down transitions are smooth and directional (≤ 200ms); motion fires only on mount/drill, never on filter change
- [x] **VIS-06**: One or two selective real-3D hero accents appear only on non-data regions (`/forma-proposal` background, `/users` header) — never on data pages

### Theming & Legibility

- [x] **THM-01**: All 4 pages are fully polished and legible in both light and dark (zinc) themes — including chart canvases and projector-brightness data-label contrast (WCAG AA on data values)

### Per-Page: /users

- [x] **USR-01**: `UsersDirectoryClient` is decomposed (Zustand store + single data hook + extracted sub-components; shell ~200 lines) with existing filter/sort/search/virtualization behavior unchanged, guarded by a golden-path integration test written before extraction
- [x] **USR-02**: The user directory is presented as a premium `DataTable` — pinned name column, sticky frosted header, sortable, density toggle, row-click → detail panel, row-expand → inline summary

### Per-Page: /access-analysis

- [x] **ACC-01**: All panels are wrapped in `PremiumSurface` with depth + staggered reveal
- [x] **ACC-02**: All donuts + the timeline use the shared themed `EChart` wrapper with depth/glow and `universalTransition` drill morphs
- [x] **ACC-03**: Folder-permission terrain is click-to-expand / lazy-loaded (no 2–3s lag on first interaction)

### Per-Page: /template-mty

- [x] **TPL-01**: The members table uses the premium `DataTable` (sort + row-click → slide-in profile)
- [x] **TPL-02**: Role pies use shared depth/glow theming; the role-similarity graph shows non-clipped hover labels and node-click → slide-in role members
- [x] **TPL-03**: All panels use `PremiumSurface` + staggered reveal + skeleton

### Per-Page: /forma-proposal

- [x] **FRM-01**: `HierarchyView` is split (layout hook + canvas render + thin shell) with its public API unchanged; heavy d3 bundle deferred via `dynamic(ssr:false)`
- [ ] **FRM-02**: Permission-editor panels use `PremiumSurface` depth; a selective real-3D background accent is added (`frameloop="demand"`, `pointer-events:none`)

### Data Integrity (New Analytics Gate)

- [x] **NA-01**: Any new per-page metric proposed during planning passes a Prisma-schema feasibility gate (named model, stated coverage, no schema change) before implementation; under-covered sources (e.g. `AccActivity` covers 428/1,152 projects) are labeled as such in the UI

## v2 Requirements

Acknowledged but deferred — not in this milestone's roadmap.

### Forma Proposal

- **FRM-V2-01**: Role-permission diff view (requires a new `template.getBaseline(roleId)` tRPC query; HIGH complexity, fully independent)

### Access Analysis

- **ACC-V2-01**: Project-grouped persistent accordion in the project picker (current dropdown is functional)

### Analytics

- **NA-V2-01**: Additional new analytics beyond the gated per-page set surfaced during planning

## Out of Scope

| Feature | Reason |
|---------|--------|
| `/users/spatial-graph` redesign | Separate future project; needs full dedicated attention (real 3D) |
| New data pipelines / external integrations | Existing Prisma DB is the single source of truth |
| Data model / Prisma schema changes | Read-only query/index additions only; no model changes |
| End-user engagement / retention features | This is a presentation/workshop showcase, not an engagement product |
| `echarts-gl` or WebGL on data pages | GPU budget + speed constraint; depth comes from CSS/ECharts instead |
| Backend / data-architecture redesign | Server-driven hybrid stays; this is presentation-layer surgery |

## Traceability

Each v1 requirement maps to exactly one phase. See ROADMAP.md for phase detail.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 — Shared Design Foundation | Complete |
| FND-02 | Phase 1 — Shared Design Foundation | Complete |
| FND-03 | Phase 1 — Shared Design Foundation | Complete |
| FND-04 | Phase 1 — Shared Design Foundation | Complete |
| INT-01 | Phase 1 — Shared Design Foundation | Complete |
| VIS-06 | Phase 1 — Shared Design Foundation | Complete |
| USR-01 | Phase 2 — /users Decomposition | Complete |
| PERF-03 | Phase 2 — /users Decomposition | Complete |
| FND-05 | Phase 3 — DataTable Primitive | Complete |
| USR-02 | Phase 4 — /users Table & Polish | Complete |
| PERF-01 | Phase 4 — /users Table & Polish | Complete |
| PERF-04 | Phase 4 — /users Table & Polish | Complete |
| INT-03 | Phase 4 — /users Table & Polish | Complete |
| VIS-03 | Phase 4 — /users Table & Polish | Complete |
| VIS-04 | Phase 4 — /users Table & Polish | Complete |
| ACC-01 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| ACC-02 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| ACC-03 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| PERF-02 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| PERF-05 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| INT-02 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| INT-04 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| INT-05 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| VIS-01 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| VIS-02 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| VIS-05 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| THM-01 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| NA-01 | Phase 5 — /access-analysis Depth & Cross-Filtering | Complete |
| TPL-01 | Phase 6 — /template-mty & /forma-proposal Polish | Complete |
| TPL-02 | Phase 6 — /template-mty & /forma-proposal Polish | Complete |
| TPL-03 | Phase 6 — /template-mty & /forma-proposal Polish | Complete |
| FRM-01 | Phase 6 — /template-mty & /forma-proposal Polish | Complete |
| FRM-02 | Phase 6 — /template-mty & /forma-proposal Polish | Pending |

**Note:** Phase 7 (Pre-Workshop UAT) is a cross-cutting verification gate — it re-exercises VIS-05, PERF-01..05, THM-01, and INT-01..05 across all four pages but owns no requirement exclusively. Each of those requirements is owned by the phase that builds it (above) and re-verified at the projector in Phase 7.

**Coverage:**

- v1 requirements: 28 total
- Mapped to phases: 28 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-17*
*Last updated: 2026-06-17 after roadmap creation (traceability filled, 28/28 mapped)*
