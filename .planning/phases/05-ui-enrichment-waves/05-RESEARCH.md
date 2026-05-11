# Phase 5: UI Enrichment Waves - Research

**Researched:** 2026-05-11
**Domain:** React/Next.js dashboard enrichment — TanStack/tRPC user list, cosmos.gl 3D graph, dashboard widgets (echarts + framer-motion + bubble/orbit + heatmap)
**Confidence:** HIGH for stack and existing patterns (this is a leaf phase over a mature codebase). MEDIUM for cosmos.gl 3-tier shape/halo techniques and folder-cluster layout. LOW for performance behavior of folder-node integration (gated by Phase 4 anyway).

## Summary

Phase 5 is **not greenfield**. Every requirement is an enrichment of an existing surface: the user list (`UsersDirectoryClient.tsx`, 1,527 lines), the cosmos.gl spatial graph (`AccUsersGraph.tsx`, 3,068 lines), or the 9 dashboard widgets under `app/(dashboard)/users/dashboard/widgets/`. The hard task is preserving the v1 UX (label polish curve, 60 FPS, interactivity contract) while threading new fields end-to-end from Prisma → tRPC → context → widget.

Three sub-phases are locked: **5.1 GRAPH** (highest risk, runs first), **5.2 LIST**, **5.3 DASH**. GRAPH-04 is the only requirement gated on Phase 4 — every other requirement starts immediately and runs in parallel with Phase 4. The interactivity contract (DASH-18: hover-detail → click-through → cross-widget spotlight) is the v1.0 Phase 4.1 lesson — must be baked into every task from line one. Color is never the sole signal: pills carry text, edges carry thickness, admin tiers carry shape.

**Primary recommendation:** Plan 5.1/5.2/5.3 as **3 separate plan directories** (`5.1-graph-wave/`, `5.2-list-wave/`, `5.3-dash-wave/`) — each with its own PLAN.md and UAT gate. Inside each, sequence by widget, and inside each widget sequence by interactivity layer: **(a) data plumbing → (b) hover detail → (c) click-through → (d) cross-widget spotlight**. Bake the contract in, do not retrofit.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wave sequencing & split**
- Split into 5.1 / 5.2 / 5.3 — three sub-phases, each with its own PLAN.md and UAT gate.
- Order: GRAPH (5.1) → LIST (5.2) → DASH (5.3) — highest-risk wave goes first to de-risk early.
- Run in parallel with Phase 4 — only GRAPH-04 (folder nodes in 3D) is blocked by Phase 4 perf pre-flight. LIST and DASH waves do not depend on Phase 4 and start immediately. GRAPH wave starts but **carves out GRAPH-04** until Phase 4 returns.
- Interactivity contract is a hard gate on every widget — modified AND new widgets must pass hover-detail / click-through / cross-widget spotlight before that sub-phase's UAT closes. No exceptions, baked in from task 1 of each sub-phase (per v1.0 feedback memory).
- Separate UAT session per sub-phase — each of 5.1/5.2/5.3 closes with its own `/gsd:verify-work`. Faster feedback loop; issues caught before next wave starts.

**LIST wave (5.2)**
- **Status column**: dedicated column with active/pending/disabled pill + multi-select filter facet in the toolbar (matches existing filter pattern).
- **projectAdmin indicator**: small "Admin" pill inline next to the user's name in the row.
- **last-file-activity column (lazy)**: on-scroll batched fetch with skeleton shimmer in the cell while loading. No user action required.
  - Empty state: em-dash `—` with tooltip "No activity in 90d". Signals intentional empty vs loading.
- **Per-module products tier**: new dedicated collapsible "Module Access" section in the side panel, listing each ACC module + tier (e.g. "Docs: Editor", "Build: Member").

**GRAPH wave (5.1)**
- **Hover detail**: rich tooltip card on hover — name, status, company, accessLevels, last sign-in, last file activity. No click required (information-dense per feedback memory).
- **3-tier admin overlay**:
  - Visual: **shape change per tier** (e.g. circle / diamond / star glyphs). Hub admin tier: **star glyph + gold halo + ~1.5× base node size** so hub admins (rare, important) are unmistakable at any zoom.
  - Activation: **toggle button in graph toolbar, OFF by default**. Single "Show admin tiers" toggle — keeps default graph clean, on-demand for audits.
- **Per-project role filter**:
  - Behavior: **AND with existing filters** (intersect with status/module).
  - UI: new collapsible "Role" group in the existing graph filter sidebar, alongside status/module.
- **Folder nodes (GRAPH-04, conditional on Phase 4 GO)**:
  - Visual: separate **cluster region** of the 3D space — "users live here, folders live there". Connected to user nodes by edges that cross the gap.
  - Selection: clicking a folder node spotlights all users with access AND opens side panel with folder path, role breakdown, members-assigned counts, orphan-role flags.
  - Edges (user → folder): **thin translucent, color-coded by permission tier** (View / Download / Edit / Full).
- **Orphan roles**: subtle **amber warning halo** on folder nodes when orphan roles exist, AND a Recommendations entry surfacing the specific orphan. Two surfaces, one signal.
- **Selection spotlight (cross-widget)**: dim non-selected nodes to ~20% opacity, add bright halo on selected set. Reuses v1 spotlight pattern.
- **Labels**: keep current UAT-approved polish curve unchanged — `pow(zoom, 0.2)` clamped `[0.85, 1.4]`, pill backgrounds, 11px floor / 18px ceiling.

**DASH wave (5.3)**
- **KpiStrip tiles** (pending invites / project admins / folders crawled): **append to existing strip** at the end. Natural growth, no layout disruption. May wrap on narrow screens.
- **Recommendations new findings** (stale invite, orphan role): **severity-based interleave** with existing findings. Orphan role = high severity, stale invite = medium. Single ranked list, users see the most important regardless of finding type.
- **AdminConstellation 3-tier reskin**: **mirrors the GRAPH wave admin overlay styling** (same star/glyph/halo conventions). One visual language across surfaces — supports cross-widget consistency.
- **RolesModulesHeatmap hub vs per-project**: single header toggle "Hub view / Project view". Default = Hub view (preserves current behavior).
- **Folder fallback contract (if Phase 4 NO-GO on GRAPH-04)**:
  - Folder × role matrix widget (already required by Phase 4) becomes the canonical folder surface.
  - Clicking a folder cell in the matrix opens a **dedicated folder detail panel** with path, roles, member counts, orphan flags.
  - No graph integration, but full interactivity (DASH-18 contract) preserved.
  - GRAPH-04 logged as contingency in roadmap backlog if NO-GO.

**Cross-cutting**
- **Performance budget**: **minimum 60 FPS** on UAT hardware with all overlays + filters active. Hard floor — below that, planner must defer or simplify a feature.
- **Accessibility**: color encoding is never the sole signal. Status pills carry text, permission edges use thin/thick variants in addition to color, admin tiers use shape change in addition to color. Pattern: **color enhances, never solely encodes**.

### Claude's Discretion
- Exact gold/silver/bronze (or chosen) color ramp for admin tiers — pick from existing brand palette.
- Specific severity scoring algorithm for stale-invite vs orphan-role Recommendations findings.
- Skeleton shimmer animation timing for lazy `last-file-activity` cells.
- Default sort and column order in the enriched user list.
- Side-panel collapsible default state for the new "Module Access" section.
- KpiStrip wrap behavior on narrow viewports.
- Hover tooltip card layout/typography details.

### Deferred Ideas (OUT OF SCOPE)
- Holistic a11y polish phase (high-contrast mode toggle, keyboard nav pass).
- Mobile-specific responsive treatment.
- GRAPH-04 if Phase 4 NO-GO — deferred to a future phase pending different rendering strategy. Dashboard-only fallback (matrix + drill panel) ships either way.
- Per-project filter via right-click context menu on project nodes — sidebar group pattern chosen instead.
</user_constraints>

<phase_requirements>
## Phase Requirements

### Wave 5.1 — GRAPH (4 reqs)

| ID | Description | Research Support |
|----|-------------|-----------------|
| GRAPH-01 | Per-project industry-role assignments become a graph filter dimension. | Existing `accGraphFilters.ts` exposes `roles[]` — extend to include `perProjectRoles[]` with AND-intersect semantics (CONTEXT lock). Sidebar group pattern lives in `AccUsersGraph.tsx` filter panel. |
| GRAPH-02 | User node hover shows enriched detail (status, companyName, accessLevels, last sign-in, last file activity). | Reuse 250ms hover-prefetch + 5min staleTime pattern from `FileActivityCell` (Phase 03-03 SUMMARY). Tooltip card = floating panel anchored to pointer; install `@radix-ui/react-tooltip` (not present in repo — see Standard Stack). |
| GRAPH-03 | 3-tier admin overlay (hub / project / executive) via shape change + gold halo on hub. | Cosmos.gl point shapes via `setPointShape` per-point uniform; halo as outer ring via second draw pass OR pre-baked sprite atlas (see Architecture Pattern 2). |
| GRAPH-04 | Folder nodes — conditional on Phase 4 GO. Separate cluster region, edges color-coded by permission tier. | Cosmos.gl supports heterogeneous point types via `pointColors` + `pointSizes`. Cluster separation: assign initial `pointPositions` for folders to an offset (e.g. `+800, +800` in world space) and use a higher gravity coefficient ON the folder subset only. |

### Wave 5.2 — LIST (4 reqs)

| ID | Description | Research Support |
|----|-------------|-----------------|
| LIST-01 | `status` column (active/pending/deleted) + multi-select filter facet. | Field already on `AccProjectMember.status` (verified). Aggregate at tRPC: status is per-project — use "any active" / "all deleted" reducer documented in CONTEXT for the row pill. |
| LIST-02 | `projectAdmin` indicator inline + filter facet. | Field on `AccProjectMember.projectAdmin` (boolean). Row pill next to user name; facet AND-intersects with existing filters. |
| LIST-03 | Last-file-activity column lazy-loaded post-paint. | `accActivity.getLastFileActivity` already exists from Phase 03-03 (verified via STATE.md). Reuse Phase 03-03 hover-prefetch pattern, but auto-fire via IntersectionObserver on row visibility (CONTEXT: "on-scroll batched fetch, no user action"). |
| LIST-04 | Side-panel detail shows per-module `products` access tier. | `AccProjectMember.products` is `Json` per-module tier map. Render as collapsible "Module Access" section in `AccUserSidePanel.tsx`. Use `moduleLabel()` from `lib/acc/modules.ts`. |

### Wave 5.3 — DASH (5 reqs)

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-14 | KpiStrip: pending-invite tile + project-admin tile + folders-crawled tile. | Append to existing 6-tile strip in `KpiStripWidget.tsx` (verified). Layout already uses `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` — bump `lg:grid-cols-9` or wrap to 2 rows. |
| DASH-15 | Recommendations gains "stale invite" + "orphan role" findings. | `dashboardAnalytics.ts` is the findings producer; add two new finding kinds to `DashboardFindings` (extend `findingsContext.tsx`), bubble through `RecommendationsWidget.tsx` (verified — bubble cluster widget). Severity interleave is at sort time. |
| DASH-16 | AdminConstellation 3-tier with ring colors. | `AdminAccessWidget.tsx` orbit widget — currently single-tier (`isAccountAdmin === true`). Extend filter + ring color by tier; CONTEXT locks star/glyph/halo mirroring graph treatment. |
| DASH-17 | RolesModulesHeatmap hub vs per-project toggle. | `RolesModulesHeatmapWidget.tsx` uses ECharts; add header toggle that swaps the aggregation function between `aggregateHubRoles` and `aggregateProjectRoles`. Default = Hub (CONTEXT lock). |
| DASH-18 | Interactivity contract — UAT gate. | Cross-widget spotlight already exists via `selectionContext.tsx` (`SelectedFinding` discriminated union — verified). For each modified widget: (a) hover handler dims non-hovered to 20% via `useHoverSpotlight`, (b) click handler calls `setSelected({ kind, ... })`, (c) `DashboardSidePanel.tsx` mounts a body per kind. |

**Phase 4 contingency:** If Phase 4 returns NO-GO on GRAPH-04, the dashboard-only folder fallback (DASH-14 folders-crawled tile + a folder-detail panel reachable from the Phase 4 matrix widget) ships regardless. Plan should sequence the matrix-click → folder-detail-panel hookup as part of Wave 5.3.
</phase_requirements>

## Standard Stack

### Core (already in repo — DO NOT introduce alternatives)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.x (App Router) | RSC + client islands | Project foundation |
| React | 19.x | Widget components | Project foundation |
| tRPC | 11.x | Data plumbing (Prisma → React Query) | Used by every router in `server/routers/` |
| @tanstack/react-query | 5.x (via tRPC) | Query cache, staleTime, lazy fetch | Already drives `bulkAccSummary` |
| Prisma | 5.x | DB access | All ACC models live here |
| Tailwind v4 | 4.x | Styling | Project convention |
| shadcn/ui (Radix-backed) | current | Pills, sheets, buttons | `components/ui/*` |
| framer-motion | 12.x | Widget entrance + spring | Used by Admin/Recommendations widgets |
| ECharts (echarts-for-react) | current | Heatmap | RolesModulesHeatmap |
| d3-hierarchy / d3-scale / d3-time | current | Bubble pack + calendar | Recommendations + RecentlyAdded |
| @cosmos.gl/graph | **3.0.0-beta.9** | GPU spatial graph | Verified in package.json:36. Patches in `patches/` — DO NOT upgrade in Phase 5. |
| sonner | 2.0.7 | Toasts | Already imported by AccUsersGraph |
| Vitest | current | Unit tests | Project convention (vitest.config.ts present) |

### Supporting — NEW dependencies needed

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@radix-ui/react-tooltip` | latest | Hover tooltip card (GRAPH-02 hover detail; LIST-03 em-dash "No activity in 90d") | Tooltip card for graph hover. shadcn ships a Tooltip primitive — install via `npx shadcn@latest add tooltip`. **Verify via Context7 before install.** |
| `@radix-ui/react-popover` | latest | Inline filter group expand/collapse, "(+N others)" popover (already in `RecentlyAddedWidget`) | Popovers on filter sidebar Role group. Install via `npx shadcn@latest add popover` if not present. |
| `react-intersection-observer` | optional | LIST-03 lazy column auto-fire on row visibility | Alternative: hand-rolled `IntersectionObserver` (~20 lines, no dep). **Recommend hand-rolled** to avoid new dep — pattern already in graph for label visibility. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn Tooltip (Radix-backed) | Hand-rolled portal+positioning | shadcn is 30 lines of glue and projects already use Radix elsewhere. Hand-rolled costs >300 lines for cross-widget consistency. |
| Cosmos.gl per-point shapes | Sprite atlas pre-baked at app start | Per-point uniforms are simpler but cost a GPU re-upload on every change. Sprite atlas is faster but requires building textures. **Recommend per-point** because shapes change at most once per session (toggle on/off). |
| New tRPC router for folder detail | Extend `accActivity` router OR add `accFolder` router | Naming consistency — create `server/routers/acc-folder.ts` if Phase 4 hasn't already. Verify by reading Phase 4 PLAN.md when it lands; do NOT block on it. |
| Top-level "Show admin tiers" toggle as URL param | localStorage | URL param composes with deep links (e.g. share an audit link); already used by graph display mode (`writeGraphDisplayMode`). **Recommend URL param**. |

**Installation (if Phase 4 didn't add them already):**
```bash
npx shadcn@latest add tooltip popover
```

## Architecture Patterns

### Recommended Sub-phase Structure

```
.planning/phases/05-ui-enrichment-waves/
├── 05-CONTEXT.md                  (exists)
├── 05-RESEARCH.md                 (this file)
├── 05.1-graph-wave/
│   ├── 05.1-PLAN.md
│   ├── 05.1-01-PLAN.md            (GRAPH-02 hover detail — bake in contract from line 1)
│   ├── 05.1-02-PLAN.md            (GRAPH-01 per-project role filter)
│   ├── 05.1-03-PLAN.md            (GRAPH-03 3-tier admin overlay)
│   └── 05.1-04-PLAN.md            (GRAPH-04 folder nodes — CONDITIONAL on Phase 4 GO)
├── 05.2-list-wave/
│   ├── 05.2-01-PLAN.md            (LIST-01 status column + facet)
│   ├── 05.2-02-PLAN.md            (LIST-02 projectAdmin indicator + facet)
│   ├── 05.2-03-PLAN.md            (LIST-03 lazy last-file-activity column)
│   └── 05.2-04-PLAN.md            (LIST-04 side-panel Module Access section)
└── 05.3-dash-wave/
    ├── 05.3-01-PLAN.md            (DASH-14 KpiStrip tiles)
    ├── 05.3-02-PLAN.md            (DASH-15 Recommendations new findings)
    ├── 05.3-03-PLAN.md            (DASH-16 AdminConstellation 3-tier)
    ├── 05.3-04-PLAN.md            (DASH-17 Heatmap hub/project toggle)
    └── 05.3-05-PLAN.md            (DASH-18 interactivity contract gate — enforced via test matrix)
```

### Pattern 1: Interactivity Contract — bake in from task 1

**What:** Every widget task ships hover → click → spotlight in the SAME plan, not retrofitted.
**When to use:** Every modified or new widget in Phase 5.
**Why:** v1.0 Phase 4.1 lesson — widgets retrofitted with interactivity after the fact lost UAT.

**Template task structure for any widget plan:**
```
Task 1: Data plumbing (Prisma → tRPC procedure → React Query → widget prop)
Task 2: Render the new field (column / pill / overlay)
Task 3: Hover detail (Tooltip component + dim non-hovered to 20% via useHoverSpotlight)
Task 4: Click handler → setSelected({ kind, ... }) via selectionContext
Task 5: DashboardSidePanel body for the new selection kind
Task 6: Cross-widget spotlight — verify a click in widget A dims non-matching in widget B
```

**Source:** Verified pattern in `selectionContext.tsx` + `DashboardSidePanel.tsx` (Phase 04.1 / 03-03).

### Pattern 2: Cosmos.gl per-point attribute updates

**What:** Update `pointColors`, `pointSizes`, `pointShapes` via the renderer's setter for the entire array; do NOT mutate in place.
**When to use:** Admin tier overlay toggle (GRAPH-03), folder cluster (GRAPH-04).
**Source:** Existing pattern in `AccUsersGraph.tsx` (verified at lines ~1187, 1323 — `getSimulationAlpha`, `setPoints*`).

```typescript
// Pattern from AccUsersGraph.tsx — extend for admin tier shapes
const pointSizes = new Float32Array(nodes.length);
const pointColors = new Float32Array(nodes.length * 4);
for (let i = 0; i < nodes.length; i++) {
  const n = nodes[i];
  pointSizes[i] = n.isHubAdmin ? BASE * 1.5 : BASE; // CONTEXT: 1.5× for hub admins
  // pack RGBA into pointColors[i*4 .. i*4+3]
}
renderer.setPoints({ positions, sizes: pointSizes, colors: pointColors });
```

**Cosmos.gl alpha inversion (verified via memory):** `getSimulationAlpha()` in beta.9 returns `1 - progress` — inverted from d3 alpha. Existing gating logic at AccUsersGraph.tsx:1414 accounts for this; **do not re-invert** when adding new gates.

### Pattern 3: Lazy column fetch on row visibility (LIST-03)

**What:** Use `IntersectionObserver` per row; when row scrolls into viewport, fire a tRPC batch query for visible-but-unfetched rows.
**When to use:** `last-file-activity` column.
**Source:** Phase 03-03 `FileActivityCell` uses 250ms hover-prefetch — adapt to scroll trigger (CONTEXT: "no user action required").

```typescript
// pseudocode
const visibleEmails = useVisibleRowEmails(); // IntersectionObserver pool
const { data } = trpc.accActivity.getLastFileActivity.useQuery(
  { emails: visibleEmails },
  { staleTime: 300_000, enabled: visibleEmails.length > 0 }
);
```

**Empty state:** em-dash `—` with `<Tooltip>` "No activity in 90d" (CONTEXT lock).

### Pattern 4: Selection context extension

**What:** Extend `SelectedFinding` discriminated union with new kinds for Phase 5.
**Source:** `selectionContext.tsx:32-40` already supports 7 kinds (junk/duplicate/outlier/role/admin/day/userActivity).

**New kinds to add:**
- `{ kind: "folder"; folderUrn: string }` — GRAPH-04 folder node click + DASH-15 orphan-role click + Phase 4 matrix-cell click
- `{ kind: "staleInvite"; email: string }` — DASH-15 stale invite click
- `{ kind: "adminTier"; tier: "hub" | "project" | "executive" }` — DASH-16 click on a tier ring

`DashboardSidePanel.tsx` gains corresponding render branches.

### Pattern 5: Findings extension (DASH-15)

**What:** Add `staleInvites` and `orphanRoles` to `DashboardFindings`; severity-interleave at the sort step in `RecommendationsWidget.tsx`.
**Where:** `lib/acc/dashboardAnalytics.ts`. Add `detectStaleInvites(users)` (pending status + addedOn > 30d) and `detectOrphanRoles(folders, members)` (folder role with zero assigned members).
**Severity (CONTEXT lock):** orphan role = HIGH, stale invite = MEDIUM.

### Anti-Patterns to Avoid

- **Retrofitting interactivity after the visual reskin lands** — v1.0 Phase 4.1 feedback memory. Always Tasks 1→6 in one plan, never split across plans.
- **Color as sole signal** — CONTEXT cross-cutting lock. Always pair color with text (status pill labels), shape (admin tier glyphs), or weight (edge thickness).
- **New tabs / pages / views** — REQUIREMENTS.md "Out of Scope" — enrich only.
- **Adding Sync All / Refresh buttons** — Memory: "No manual sync UI". `DashboardClient.tsx:88-95` already has a Refresh button (v1 vestige); do NOT add new ones, and surface this to the user during planning as a pre-existing inconsistency to clean up (v2.x CLN bucket).
- **Mutating cosmos.gl point arrays in place** — always re-create the typed array and call `setPoints(...)`. Verified pattern in existing code.
- **Eager-loading file activity into `BulkAccUser`** — Phase 3 explicitly forbids this (REQUIREMENTS ACTV-03 "NOT eager-loaded"). LIST-03 MUST stay lazy.
- **Rebuilding the label polish curve** — UAT-approved 2026-05-08, locked by memory. Do not touch `pow(zoom, 0.2)` clamp `[0.85, 1.4]`, 11/18px floor/ceiling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hover tooltip with auto-flip/auto-shift | Custom portal + getBoundingClientRect | shadcn `Tooltip` (Radix) | Radix handles edge collision, escape key, focus restore, ARIA |
| Filter facet UI | Custom checkbox group | Existing `cosmosUtils.ts` + `accGraphFilters.ts` pattern | Already battle-tested; just add new dimension to the existing union |
| Severity-interleaved finding list | Custom sort + dedupe | Extend `dashboardAnalytics.ts` `computeAllFindings` | Single producer keeps `RecommendationsWidget` dumb |
| Folder tree visualization in side panel | Custom indented div tree | Reuse `AccFolder.fullPath` string slash-split, render as breadcrumb | Folder hierarchy is shallow; full tree is overkill |
| Spotlight halo for selected nodes | Custom WebGL pass | Cosmos.gl `pointGreyoutOpacity` + per-point color modulation | Already used in v1 spotlight pattern |
| Lazy fetch coordinator | Custom debounce + batch | tRPC's `useQuery` with `enabled` + React Query staleTime | The framework already handles batching, dedup, cancellation |
| Cross-widget selection wiring | Custom event bus | `selectionContext.tsx` (already shipped, 7 kinds) | Verified — extend the discriminated union, add panel branches |

**Key insight:** Phase 5 is mostly *extending* existing patterns, not building new ones. The biggest hand-rolling temptation is the cosmos.gl folder cluster (GRAPH-04) — resist by treating folders as ordinary cosmos points with offset initial positions and a different color/shape, NOT a second renderer.

## Common Pitfalls

### Pitfall 1: Cosmos.gl alpha inversion (high cost if forgotten)

**What goes wrong:** Adding a new rAF gate that uses `getSimulationAlpha()` and inverting twice → labels/overlays never show OR always show.
**Why it happens:** Cosmos.gl v3 inverts d3 semantics. Memory documents this; existing code (line 1414 of AccUsersGraph.tsx) already accounts for it.
**How to avoid:** When adding admin overlay or folder visibility gates, mirror the existing pattern at line 1414 verbatim. Do not derive a new gating expression.
**Warning signs:** Overlay flickers, or only appears when simulation is fully cooled.

### Pitfall 2: Eager-loading file activity into bulkAccSummary

**What goes wrong:** LIST-03 implementer adds `lastFileActivity` to `BulkAccUser` — breaks REQUIREMENTS ACTV-03 (lazy contract).
**Why it happens:** Easy to "just add the field" rather than thread a second query.
**How to avoid:** Explicitly forbid in the plan task. Use the existing `getLastFileActivity` procedure from Phase 03-02; new procedure if needed is `accActivity.getLastFileActivityBatch({ emails: string[] })`.
**Warning signs:** `bulkAccSummary` query becomes slow; FindingsContext starts referencing activity dates.

### Pitfall 3: Phase 4 GO/NO-GO timing

**What goes wrong:** GRAPH-04 plan is drafted assuming GO; Phase 4 returns NO-GO mid-implementation.
**Why it happens:** Phase 5 starts in parallel with Phase 4 (CONTEXT lock).
**How to avoid:**
1. Plan GRAPH-04 LAST in Wave 5.1 sequence.
2. Plan the dashboard fallback (DASH-15 orphan-role surfacing + matrix → folder-detail panel) BEFORE GRAPH-04 in Wave 5.3.
3. Maintain a single source of truth for the folder-detail panel — same component used by GRAPH-04 click AND DASH matrix click. Architecture: `<FolderDetailPanel>` component, mounted in `DashboardSidePanel` via `kind: "folder"` selection.
**Warning signs:** Diverging folder-detail code paths in graph vs dashboard.

### Pitfall 4: 60 FPS budget on UAT hardware

**What goes wrong:** Folder cluster adds 5,000 extra nodes (typical hub has 100 projects × 50 folders); FPS drops below 60.
**Why it happens:** Cosmos.gl scales well on GPU but the simulation cost of 5,000 extra points + 50,000 extra edges (folder-user permission edges) is non-trivial.
**How to avoid:** Phase 4 perf pre-flight produces the artifact. Cap edges to "most-restricted permission tier only" per user-folder pair so each user-folder pair contributes 1 edge, not 4.
**Warning signs:** Performance overlay shows simAlpha never reaching 0; pan/zoom feels janky.

### Pitfall 5: Filter intersection bugs

**What goes wrong:** Per-project role filter is OR'd with status filter instead of AND'd (CONTEXT lock = AND).
**Why it happens:** `accGraphFilters.ts` mixes include-lists and exclude-lists; easy to get the wrong type.
**How to avoid:** Add Vitest unit tests to `accGraphFilters.test.ts` covering the new dimension's AND-intersection with each existing dimension (4 combinations minimum).
**Warning signs:** Toggling per-project role shows MORE nodes, not fewer.

### Pitfall 6: Per-module products tier rendering

**What goes wrong:** `AccProjectMember.products` is `Json` — opaque to TypeScript. Renderer accidentally renders the raw JSON.
**Why it happens:** Prisma `Json` type is `unknown` at the boundary.
**How to avoid:** Add a Zod schema + parser at the tRPC boundary; export typed `ProductsTier = Record<ModuleName, 'administrator' | 'member' | 'none'>`. Pattern already exists for `products` in `lib/acc/quick-sync-extraction.ts` (verified).
**Warning signs:** Side panel shows `{"docs":"member"}` instead of "Docs: Member".

### Pitfall 7: AccProjectMember status is per-project, but user list is per-user

**What goes wrong:** LIST-01 needs a *single* status pill per row, but a user may be `active` on project A and `pending` on project B.
**Why it happens:** `BulkAccUser` is the dashboard aggregate; `AccProjectMember.status` is per-project.
**How to avoid:** CONTEXT does not lock the reduction rule. Recommend: **"any active" wins → active; else any pending → pending; else deleted**. Add `aggregatedStatus: 'active' | 'pending' | 'deleted'` to `BulkAccUser` in `bulkAccSummary`. Surface the per-project breakdown in the side panel as a sub-list.
**Warning signs:** Status filter behaves erratically (a user appears in both "active" and "pending" facets).

### Pitfall 8: Existing v1 "Refresh" button in DashboardClient

**What goes wrong:** Memory feedback says "No manual sync UI" — Refresh button exists at `DashboardClient.tsx:88-95`.
**Why it happens:** v1 vestige; user feedback came in Phase 4.1 retrospective.
**How to avoid:** Either (a) remove during Wave 5.3 cleanup, (b) leave it and surface the inconsistency to the user during plan-phase, or (c) defer to CLN bucket. **Recommend (b) — ask the user during plan-phase**, do not silently delete user-facing chrome.
**Warning signs:** UAT comments referencing the Refresh button on dashboard.

## Code Examples

### Example 1: Extend SelectedFinding for folder kind

```typescript
// app/(dashboard)/users/dashboard/selectionContext.tsx — extend the union
export type SelectedFinding =
  | { kind: "junk"; finding: JunkRoleFinding }
  | { kind: "duplicate"; finding: DuplicateRoleFinding }
  | { kind: "outlier"; finding: OutlierFinding }
  | { kind: "role"; role: string; severity: Severity | undefined }
  | { kind: "admin"; email: string }
  | { kind: "day"; dateIso: string; emails: string[] }
  | { kind: "userActivity"; email: string }
  // Phase 5 additions:
  | { kind: "folder"; folderUrn: string }          // GRAPH-04 + DASH matrix cell click
  | { kind: "staleInvite"; email: string }         // DASH-15
  | { kind: "adminTier"; tier: "hub" | "project" | "executive" }  // DASH-16
  | null;

// Also extend `isSelectionValid()` — folder/staleInvite reconcile against
// new findings shapes; adminTier always valid (user-list reference).
```

### Example 2: tRPC procedure for per-project role facet (GRAPH-01)

```typescript
// server/routers/acc-graph.ts (new — or extend users.ts)
export const accGraphRouter = router({
  perProjectRoleFacets: protectedProcedure
    .query(async ({ ctx }) => {
      // Distinct role names with member counts, joined to AccProjectRole
      const rows = await ctx.db.accProjectRole.findMany({
        where: { memberId: { not: null } },
        select: { role: { select: { name: true } } },
        distinct: ['roleId'],
      });
      return rows.map(r => r.role.name).filter(Boolean).sort();
    }),
});

// Client: hook reused in accGraphFilters sidebar
const { data: perProjectRoles } = trpc.accGraph.perProjectRoleFacets.useQuery(
  undefined,
  { staleTime: 5 * 60 * 1000 },
);
```

### Example 3: Tooltip card for graph hover (GRAPH-02)

```typescript
// Mount Tooltip primitive once at the graph container; update content per hover
import * as Tooltip from "@radix-ui/react-tooltip";

<Tooltip.Provider delayDuration={150}>
  <Tooltip.Root open={hoveredNode !== null}>
    <Tooltip.Trigger asChild>
      <div ref={anchorRef} style={{ position: 'absolute', left: hx, top: hy }} />
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content className="rounded-md border bg-popover p-3 text-sm shadow-md">
        <div className="font-semibold">{hoveredNode?.name}</div>
        <div className="text-muted-foreground">{hoveredNode?.email}</div>
        <div>Status: <Pill>{hoveredNode?.status}</Pill></div>
        <div>Company: {hoveredNode?.company ?? "—"}</div>
        <div>Last sign-in: {fmtRelative(hoveredNode?.lastSignIn)}</div>
        <div>Last file activity: {fmtRelative(hoveredNode?.lastFileActivity)}</div>
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

**Anchor strategy:** Cosmos.gl provides node screen coords via the existing hover handler. Track `[hx, hy]` in state, position an invisible 1×1 div there, anchor the tooltip to it. Avoids reimplementing positioning logic.

### Example 4: Stale invite finding (DASH-15)

```typescript
// lib/acc/dashboardAnalytics.ts — extend
export interface StaleInviteFinding {
  email: string;
  daysPending: number;
  severity: "MEDIUM";  // CONTEXT lock
}

export interface OrphanRoleFinding {
  folderUrn: string;
  folderPath: string;
  roleName: string;
  severity: "HIGH";  // CONTEXT lock
}

export interface DashboardFindings {
  junkRoles: JunkRoleFinding[];
  duplicateRoles: DuplicateRoleFinding[];
  outlierCombos: OutlierFinding[];
  roleSeverityIndex: Map<string, Severity>;
  // Phase 5 additions:
  staleInvites: StaleInviteFinding[];
  orphanRoles: OrphanRoleFinding[];
}

export function detectStaleInvites(
  members: { email: string; status: string; addedOn: Date | null }[],
  now: Date,
): StaleInviteFinding[] {
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  return members
    .filter(m => m.status === "pending" && m.addedOn && (now.getTime() - m.addedOn.getTime()) > THIRTY_DAYS)
    .map(m => ({
      email: m.email,
      daysPending: Math.floor((now.getTime() - m.addedOn!.getTime()) / (24 * 60 * 60 * 1000)),
      severity: "MEDIUM" as const,
    }));
}

export function detectOrphanRoles(
  permissions: { folderUrn: string; folderPath: string; roleName: string }[],
  projectRoles: { roleId: string; memberId: string | null }[],
): OrphanRoleFinding[] {
  const rolesWithMembers = new Set(
    projectRoles.filter(pr => pr.memberId !== null).map(pr => pr.roleId)
  );
  return permissions
    .filter(p => !rolesWithMembers.has(p.roleName))  // adjust keying to actual roleId
    .map(p => ({ ...p, severity: "HIGH" as const }));
}
```

### Example 5: IntersectionObserver for lazy column (LIST-03)

```typescript
// app/(dashboard)/users/lib/useVisibleRowEmails.ts (new)
import { useEffect, useRef, useState } from "react";

export function useVisibleRowEmails<T extends HTMLElement>(
  rowRefs: Map<string, T>,
): string[] {
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      entries => {
        setVisible(prev => {
          const next = new Set(prev);
          for (const e of entries) {
            const email = e.target.getAttribute("data-email");
            if (!email) continue;
            if (e.isIntersecting) next.add(email);
            else next.delete(email);
          }
          return next;
        });
      },
      { rootMargin: "200px" }, // prefetch slightly off-screen
    );
    for (const [, el] of rowRefs) observerRef.current.observe(el);
    return () => observerRef.current?.disconnect();
  }, [rowRefs]);

  return Array.from(visible);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One mega-PLAN.md per phase | Sub-phase PLAN.md per wave (5.1/5.2/5.3) | This phase (CONTEXT lock) | Faster UAT cycle, smaller blast radius per failure |
| Retrofit interactivity after visual reskin | Bake-in template (data → render → hover → click → spotlight → cross-widget) | v1.0 Phase 4.1 retrospective | Eliminates Phase 4.1-class UAT failures |
| `Refresh` button in dashboard chrome | No manual sync UI; Railway release + cron only | v1.0 retrospective (memory) | Existing button is vestigial — surface during planning |
| Cosmos.gl v3 d3-style alpha | Inverted alpha (`1 - progress`) | beta.9 patch (memory) | Don't re-invert; mirror existing gate at line 1414 |

**Deprecated/outdated:**
- v1 spotlight pattern using full re-render — kept, but cosmos.gl `pointGreyoutOpacity` is the GPU-cheap path; verify existing implementation uses it.

## Open Questions

1. **Does Phase 4 produce a tRPC procedure for folder-detail (path / roles / member counts / orphan flags)?**
   - What we know: Phase 4 PLAN.md is still pending (ROADMAP shows "Directory ready — plan pending").
   - What's unclear: Whether `accFolder.getDetail({ urn })` or similar exists when Wave 5.1 starts.
   - Recommendation: Plan Wave 5.1 GRAPH-04 with an explicit dependency check task — "Verify or create `accFolder.getDetail` tRPC procedure". Either Phase 4 ships it, or Wave 5.1 ships it. **Do not block.**

2. **Per-module products tier UI label mapping**
   - What we know: `AccProjectMember.products` is `Json`; Phase 2 stored `{ docs: "member", build: "administrator", ... }` (from MEM-03 decision).
   - What's unclear: The exact set of module keys actually written. CONTEXT example mentions "Docs: Editor" but ACC tiers are `administrator | member | none`, not `Editor`. Editor might be a label used inside Docs sub-permissions.
   - Recommendation: Plan task to inspect a real production row's `products` JSON before designing the side-panel section. Use `lib/acc/modules.ts moduleLabel()` for module names. Add tier→display-label map.

3. **AccProjectMember status reduction rule**
   - What we know: Field is per-project (verified prisma schema:460).
   - What's unclear: How to surface ONE pill per user in the list (Pitfall 7).
   - Recommendation: Lock "any-active wins → active; else any-pending → pending; else deleted" in the plan and surface to user during plan-phase. CONTEXT does not lock this.

4. **AdminConstellation 3-tier — what is "executive" tier visually?**
   - What we know: `AccProjectMember.executive` boolean + `isAccountAdmin` for hub admin.
   - What's unclear: Whether "executive" gets star, diamond, or its own shape.
   - Recommendation: Wave 5.3 plan locks shapes — propose: **star (hub) / diamond (project admin) / circle-with-ring (executive)**. User reviews during plan-phase.

5. **Sub-phase numbering convention**
   - What we know: GSD tooling uses `05.1`, `05.2`, etc. for decimal phases.
   - What's unclear: Whether the planner agent will auto-create subdirectories or expect them pre-staged.
   - Recommendation: Let the planner orchestrator handle this; do not pre-create directories in research output.

## Validation Architecture

> `.planning/config.json` shows `workflow.research: true` but NO `workflow.nyquist_validation` flag — defaulting to OFF. Including a lightweight test-coverage section since Vitest is already the project standard and 4 test files exist for `accGraphFilters.test.ts`, `accGraphTopology.test.ts`, `cosmosUtils.test.ts`, `dashboardAnalytics.test.ts`, plus `quick-sync-extraction.test.ts`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (latest in `vitest.config.ts`) |
| Config file | `C:/LECG/Dashboard/vitest.config.ts` |
| Quick run command | `npm test -- --run <pattern>` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRAPH-01 | perProjectRole filter AND-intersects with status/module | unit | `npm test -- --run accGraphFilters` | ✅ extend `accGraphFilters.test.ts` |
| GRAPH-02 | Hover tooltip renders enriched detail | manual UAT | (manual) | ❌ — visual contract |
| GRAPH-03 | Admin tier shape/size mapping correct for hub/project/executive | unit | `npm test -- --run adminTierShape` | ❌ new — `adminTierShape.test.ts` |
| GRAPH-04 | Folder cluster offset positioning + edge permission tier mapping | unit | `npm test -- --run folderCluster` | ❌ new — conditional on Phase 4 GO |
| LIST-01 | Status reduction (any-active wins) | unit | `npm test -- --run accStatusReduction` | ❌ new |
| LIST-02 | projectAdmin facet filtering | unit | (extend filter test) | ✅ extend |
| LIST-03 | Lazy fetch fires only for visible rows | integration | (manual + react-testing-library if added) | ❌ |
| LIST-04 | Products JSON → tier label mapping | unit | `npm test -- --run productsTierMap` | ❌ new |
| DASH-14 | KpiStrip new tiles render with correct counts | unit | `npm test -- --run kpiStripCounts` | ❌ new |
| DASH-15 | detectStaleInvites + detectOrphanRoles + severity interleave | unit | `npm test -- --run dashboardAnalytics` | ✅ extend `dashboardAnalytics.test.ts` |
| DASH-16 | AdminConstellation 3-tier filter + ring color mapping | unit | `npm test -- --run adminConstellationTier` | ❌ new |
| DASH-17 | Heatmap hub vs per-project aggregation toggle | unit | `npm test -- --run heatmapToggle` | ❌ new |
| DASH-18 | Cross-widget spotlight: click in widget A dims in widget B | manual UAT | (manual) | ❌ — UAT gate |

### Sampling Rate
- **Per task commit:** `npm test -- --run <suite-touched>` (~5s)
- **Per wave merge:** `npm test -- --run` full suite (~30s)
- **Phase gate:** Full suite green per sub-phase before `/gsd:verify-work`

### Wave 0 Gaps (per sub-phase)
- 5.1: `app/(dashboard)/users/adminTierShape.test.ts` (new) + extend `accGraphFilters.test.ts`
- 5.2: `accStatusReduction.test.ts`, `productsTierMap.test.ts`
- 5.3: extend `dashboardAnalytics.test.ts` with stale-invite + orphan-role cases; add `kpiStripCounts.test.ts`, `adminConstellationTier.test.ts`, `heatmapToggle.test.ts`

## Sources

### Primary (HIGH confidence)
- `C:/LECG/Dashboard/prisma/schema.prisma:453-528` — verified ACC v2 model shapes
- `C:/LECG/Dashboard/lib/acc/acc-types.ts` — verified `BulkAccUser` interface
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/selectionContext.tsx` — verified existing 7-kind discriminated union
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/DashboardClient.tsx` — verified Refresh button presence (vestige)
- `C:/LECG/Dashboard/app/(dashboard)/users/accGraphFilters.ts` — verified existing filter dimension structure
- `C:/LECG/Dashboard/package.json:36` — verified cosmos.gl 3.0.0-beta.9 pinned
- `C:/LECG/Dashboard/server/routers/*.ts` — verified existing tRPC router layout (`acc-activity.ts`, `acc-sync.ts`)
- `C:/LECG/Dashboard/.planning/STATE.md` — verified Phase 03-03 hover-prefetch + getLastFileActivity contract
- `C:/LECG/Dashboard/.planning/REQUIREMENTS.md` — verified 13-req scope + out-of-scope items
- `C:/LECG/Dashboard/.planning/phases/05-ui-enrichment-waves/05-CONTEXT.md` — verified locked decisions

### Secondary (MEDIUM confidence)
- v1.0 memory entries (cosmos alpha inversion, no-manual-sync, widget interactivity, label polish curve) — repeatedly referenced across multiple SUMMARY.md files
- Phase 4.1 retrospective lessons informing DASH-18 hard gate

### Tertiary (LOW confidence)
- Cosmos.gl beta.9 specific API for per-point shape uniforms — not verified against Context7 in this session. **Flag for plan-time verification** via `mcp__context7__query-docs` on `@cosmos.gl/graph` before GRAPH-03 task starts.
- Radix Tooltip vs shadcn Tooltip wrapper — verified Radix is the underlying lib for `components/ui/*` but no existing tooltip primitive in repo (verified by Glob). Install needed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is already in `package.json`; only Tooltip/Popover need to be added via shadcn CLI.
- Architecture: HIGH for selection/findings/filter extension (mirrors v1 patterns); MEDIUM for cosmos.gl admin overlay (pattern exists but new shape uniforms); LOW for folder cluster (conditional + perf-gated).
- Pitfalls: HIGH — most pitfalls derive from documented memory + verified code, not speculation.
- Tests: MEDIUM — framework + existing test files verified; specific new test commands proposed but not yet implemented.

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (30 days — stable codebase, no breaking deps expected; revisit if cosmos.gl bumps off beta.9 or if Phase 4 returns NO-GO).
