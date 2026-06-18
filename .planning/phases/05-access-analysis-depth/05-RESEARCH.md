# Phase 5: /access-analysis Depth & Cross-Filtering — Research

**Researched:** 2026-06-18
**Domain:** Next.js RSC + ECharts presentation-layer surgery; client-side cross-filter state; Prisma index addition
**Confidence:** HIGH — all findings verified directly from source files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cross-filter & drill interaction (INT-02, INT-04, INT-05)**
- Slice click = refocus + pill, NOT auto-open panel. Clicking a chart slice smoothly refocuses the other charts and drops an active-filter pill. The slide-in people panel does NOT open on the same click.
- Clicked chart highlights its slice: picked slice pulls out slightly and glows; other slices in that chart dim. Clear visual anchor of what is driving the filter.
- Filters stack as AND. Role "PM" + company "Acme" = people who are both. Clicking a different role swaps the role; clicking a different company swaps the company (one active value per dimension, ANDed across dimensions).
- People list opens via a "View N people →" affordance in each panel header — opens the shared slide-in panel for that chart's current filtered view. This is the INT-02 segment→slide-in target.
- Project Picker stays a distinct control. Picker = WHICH projects are in scope; slice-pills = drilling WITHIN those projects. Slice filters live in their own pill bar above the charts; the 400+ project picker is NOT folded into pills.
- Clearing: clicking an already-active slice toggles that filter off. A "Clear all" wipes every slice filter at once; each pill also has its own X. (Project Picker is untouched by Clear all.)
- Filter scope = donuts + activity timeline only. Folder-permission terrain and Model Coordination panel stay project-scoped.
- KPI strip updates instantly, no re-animation. KPI numbers track the active filter so they stay honest, but count-up animates only on first page load — not on every drill.
- Empty-after-filter state: a panel with no matching data for the current filter combination shows a small inline "No data for this filter" note — layout does not jump, panels are not hidden.

**Loading order & terrain (PERF-02, ACC-03)**
- Tiered load: Tier 1 = KPIs + all donuts (~300ms target); Tier 2 = activity timeline; Tier 3 = terrain (on expand). Replaces any single blocking Promise.all.
- Terrain is collapsed, click-to-reveal. Shows as a collapsed "Folder permission terrain — show" panel; it only builds when expanded.
- Terrain default content = account-wide overview the moment it opens, with a picker to focus a single project.
- Skeletons = shaped shimmer placeholders per panel (donut rings, bars, KPI tiles), within the 200ms bar.

**Visual depth & layout (VIS-01, VIS-02, ACC-01, ACC-02, THM-01)**
- Depth intensity: noticeable but legibility-first. Clear 2.5D depth (soft layered shadows, gentle glow, glass panels) tuned so every label stays sharp at projector brightness.
- Layout: denser 2-up grid. Donuts arranged two-per-row on wide screens, stacking to one column when narrow; timeline and terrain stay full-width.
- Donut restyle: full treatment — gradient fills + rounded segment ends + selected-slice glow + soft drop-shadow 2.5D lift. All donuts + timeline use the shared themed EChart wrapper with universalTransition drill morphs.
- Theme: tune BOTH light and dark (zinc) to the same contrast bar. Both must pass WCAG AA on data values at projector brightness.

**Analytics & data honesty (NA-01)**
- Polish-only — no new metrics or panels this phase.
- Keep all current panels: roles, companies, activity-by-role, activity-by-company, modules, timeline, terrain, Model Coordination — all retained, just restyled and re-laid-out.
- Coverage caveat = clear badge on activity panels. A small consistent badge (e.g. "Activity: 428 / 1,152 projects") on each activity-derived panel, extending the coverage badges that already exist.

### Claude's Discretion
- Exact pill-bar visual styling, placement details, and animation of pills appearing/leaving.
- Exact shimmer geometry, gradient stops, glow radii, and shadow tokens (within the Phase 1 token set).
- `universalTransition` morph choreography and the ≤200ms directional drill timing curve.
- Responsive breakpoint(s) at which the 2-up grid collapses to 1-up.
- The precise wording/iconography of the "View N people →" affordance and the inline empty-state note.
- Whether the `AccActivity (email, projectId)` composite index is added as part of terrain/timeline perf work (planning gate — add here, not deferred).

### Deferred Ideas (OUT OF SCOPE)
- New analytics beyond the existing panels — backlog (NA-V2-01); any future addition must pass the Prisma-schema feasibility gate.
- Project-grouped persistent accordion in the project picker — already deferred as ACC-V2-01.
- Merging/trimming any existing panel.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACC-01 | All panels are wrapped in PremiumSurface with depth + staggered reveal | PremiumSurface.tsx exists at `components/ui/PremiumSurface.tsx`; all panels currently use bare `panel-elevated` class; migration is a mechanical wrap task |
| ACC-02 | All donuts + the timeline use the shared themed EChart wrapper with depth/glow and universalTransition drill morphs | Canonical wrapper exists at `components/ui/EChart.tsx`; page-local copy at `access-analysis/components/EChart.tsx` is the OLD wrapper (no theme); migration = swap import + enable notMerge=false + add universalTransition |
| ACC-03 | Folder-permission terrain is click-to-expand / lazy-loaded (no 2–3s lag on first interaction) | Terrain is currently ALWAYS rendered in AccessAnalysisCharts.tsx:193–206; server action `loadFolderPermissionTerrain` + `initialTerrain` are in the blocking Promise.all on page.tsx:18 |
| PERF-02 | /access-analysis renders its first tier (KPIs + donuts) fast (~300ms target), streaming heavier tiers progressively | Current page.tsx:18 has one blocking Promise.all for ALL seven loaders including terrain; needs tier split via React Suspense streaming |
| PERF-05 | No page introduces a new WebGL context on a data surface (GPU budget preserved; verified < 400MB GPU memory) | Page currently uses Canvas2D (ECharts canvas renderer) + custom SVG terrain — zero WebGL; no new WebGL may be added |
| INT-02 | Chart segments are clickable and open the relevant people/detail in the slide-in panel | Charts already have onEvents:{click} wired for local drill-down; redirect target is "View N people" affordance → DrillSheet |
| INT-04 | On /access-analysis, clicking a chart cross-filters the other charts client-side (zero new queries) | filterRowsBySelection pattern exists; needs sliceFilter state layer added to AccessAnalysisCharts.tsx |
| INT-05 | An active-filter / drill-state pill bar shows current filters with one-click dismiss | New component needed; state lives alongside selected (project) Set in AccessAnalysisCharts.tsx |
| VIS-01 | Chart panels and key surfaces use 2.5D depth (glass, layered shadow, catch-light) in both themes | PremiumSurface base variant uses `.panel-elevated` which already has dual-theme depth; extension is wrapping existing panels |
| VIS-02 | Donut/pie charts use gradient fills, selected-segment glow, and rounded segments | Donuts already have borderRadius:7, shadowBlur, emphasis glow; need gradient fills (linearGradient in itemStyle) + universalTransition |
| VIS-05 | Drill-down transitions are smooth and directional (≤200ms); motion fires only on mount/drill, never on filter change | KPI strip must NOT re-animate on slice-filter change; Reveal components fire once on mount (whileInView + once:true) — this is correct; KPI animation on filter change needs explicit guard |
| THM-01 | All 4 pages are fully polished and legible in both light and dark (zinc) themes — including chart canvases and projector-brightness data-label contrast (WCAG AA on data values) | All donuts and timeline use manual `resolvedTheme` branching (not canonical EChart wrapper); migration to canonical wrapper handles tooltip/axis colors; data-label colors still baked as hex in each chart's option — need WCAG AA audit |
| NA-01 | Any new per-page metric proposed during planning passes a Prisma-schema feasibility gate (named model, stated coverage, no schema change) before implementation; under-covered sources are labeled in the UI | Phase is polish-only; no new metrics; the coverage badge exists (`CoverageBadges.tsx`); activity panels need an "Activity: 428 / 1,152 projects" text badge added |
</phase_requirements>

---

## Summary

Phase 5 is presentation-layer surgery on a page that already has solid data infrastructure. Every data loader and server-side summarizer is in place; the phase adds visual depth, a new slice-filter state layer on top of the existing project-filter pattern, and tiered loading via React Suspense streaming. No new queries, no new tRPC hooks, no new data pipelines.

The single biggest structural change is splitting `page.tsx`'s blocking `Promise.all` into Suspense tiers so KPIs + donuts stream first. The most important new client behaviour is the `sliceFilters` state object in `AccessAnalysisCharts.tsx` — a small extension of the existing `selected` Set pattern that `filterRowsBySelection` already handles. The donut charts each need their import swapped from the local `EChart` (no theme) to the canonical `components/ui/EChart.tsx` (uses `resolvedTheme`, `mergeEChartsTheme`), plus `notMerge=false` and `universalTransition` to enable morph animations.

**Primary recommendation:** Extend `AccessAnalysisCharts.tsx` with a `sliceFilters` state object; add a pill bar component; wrap each section in `PremiumSurface`; swap all local EChart imports to canonical; split page.tsx into Suspense tiers; add `AccActivity(userEmail, projectId)` composite index via `prisma migrate dev`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Data loading (all aggregations) | Server (RSC page.tsx) | — | All seven loaders are already server-only; no client fetch needed |
| Tiered streaming | Server (React Suspense boundaries) | — | Wrapping awaits in Suspense lets Next.js stream Tier 1 while Tier 2/3 resolve |
| Slice cross-filter state | Client (AccessAnalysisCharts.tsx useState) | — | In-memory re-bucket of already-loaded rows; zero new queries |
| Project picker state | Client (AccessAnalysisCharts.tsx useState) | — | Existing `selected` Set; unchanged |
| Pill bar rendering | Client (new PillBar component) | — | Reads slice-filter state; emits clear/toggle events |
| "View N people" slide-in | Client (DrillSheet from Phase 1) | — | Reuses existing DrillSheet + PeopleDrillList |
| Chart theming | Client (canonical EChart wrapper) | — | mergeEChartsTheme is pure; wrapper owns resolvedTheme |
| Terrain lazy-reveal | Client (useState expand gate in AccessAnalysisCharts) | Server action | terrain action fires only on first expand |
| Coverage badge | Client (inline text in panel header) | — | Extends existing CoverageBadges.tsx helpers |
| Composite DB index | Database (Prisma migration) | — | AccActivity (userEmail, projectId) for activityByActor GROUP BY |

---

## Standard Stack

All libraries are already installed — this phase installs nothing new.

### Core (already in use)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| echarts + echarts-for-react | see package.json | Chart rendering | Already the chart engine on the page |
| next-themes | installed | resolvedTheme for EChart | Used by canonical EChart wrapper |
| framer-motion | 12.40.0 | Reveal + AnimatePresence for pills | Already the motion library |
| @prisma/client | installed | Composite index migration | Existing ORM |

**No new packages required for this phase.**

---

## Package Legitimacy Audit

Not applicable — this phase installs zero new packages.

---

## Architecture Patterns

### System Architecture Diagram

```
page.tsx (RSC)
  │
  ├─ [Tier 1 — immediate] ──────────────────────────────────────────┐
  │   Promise.all([loadInstanceView, loadProjectCoverage])           │
  │   → rows, coverage                                               │
  │   → <AccessAnalysisCharts Tier1> (KPIs + all donuts)            │
  │                                                                  │
  ├─ [Tier 2 — Suspense] ──────────────────────────────────────────┐│
  │   loadActivityTimeline()                                        ││
  │   → <ActivityTimelineChartSuspense>                             ││
  │                                                                  │
  └─ [Tier 3 — Suspense + expand gate] ────────────────────────────┐
      loadTerrainProjects() (cheap)
      loadFolderPermissionTerrain() (expensive — deferred to expand)
      → <TerrainReveal> (collapsed by default; expand fires server action)

AccessAnalysisCharts.tsx (Client Component)
  │
  ├─ useState: selected (Set<string>)          ← project picker, existing
  ├─ useState: sliceFilters (Record<dim, val>) ← NEW cross-filter state
  │
  ├─ filterRowsBySelection(rows, selected)     ← existing, unchanged
  ├─ applySliceFilters(filteredRows, sliceFilters) ← NEW pure helper
  │
  ├─ memos: roleSummary, companySummary, activityByRoleSummary, ...
  │          each re-computes from doubly-filtered rows
  │
  ├─ <PillBar filters={sliceFilters} onClear onRemove />  ← NEW
  │
  ├─ <PremiumSurface> wrapping every section  ← ACC-01 (REUSE existing)
  │
  └─ <EChart> (canonical) with universalTransition  ← ACC-02 (SWAP import)
       onEvents.click → setSliceFilters(dim, val)   ← INT-04 hook point
```

### Recommended Project Structure

No new folders. All new files live inside existing directories:

```
app/(dashboard)/access-analysis/
├── components/
│   ├── AccessAnalysisCharts.tsx   (EXTEND: sliceFilters state + PremiumSurface wraps)
│   ├── PillBar.tsx                (NEW: active slice-filter pills + clear)
│   ├── ActivityCoverageBadge.tsx  (NEW: "Activity: 428 / 1,152 projects" badge)
│   ├── [existing charts].tsx      (MODIFY: swap EChart import, add gradient fills)
│   └── EChart.tsx                 (KEEP but migrate consumers to canonical)
└── page.tsx                       (MODIFY: split Promise.all into Suspense tiers)

components/ui/
├── EChart.tsx                     (CANONICAL — already exists, consumers migrate to it)
└── PremiumSurface.tsx             (CANONICAL — already exists)

prisma/
└── migrations/
    └── [new]/migration.sql        (ADD: AccActivity composite index)
```

---

## Investigation 1: The `/access-analysis` Page

**Route:** `app/(dashboard)/access-analysis/page.tsx` (RSC)

**Current data loading — single blocking Promise.all (page.tsx:18):**
```
[view, moduleRows, activityActorRows, coordinationData, coverage, terrainProjects, timelineRows]
= await Promise.all([
    loadInstanceView(),          // AccProjectMember + AccRole join
    loadModuleActivity(),        // AccActivityAccds + AccActivity union GROUP BY (project, action)
    loadActivityByActor(),       // AccActivityAccds + AccActivity union GROUP BY (project, email)
    loadCoordinationByProject(), // AccIssue
    loadProjectCoverage(),       // AccDcProject coverage flags
    loadTerrainProjects(),       // AccFolderPermission aggregate (cheap)
    loadActivityTimeline(),      // AccActivityAccds + AccActivity union GROUP BY (project, month)
  ])
```

Then: a SECOND sequential await `loadFolderPermissionTerrain(defaultProject.id)` (expensive — loads the terrain for the default project before the page renders at all).

**Panel list rendered by AccessAnalysisCharts.tsx:**
1. `<StatStrip>` — 6 KPI tiles (Projects, Memberships, Distinct roles, Companies, Activities, Coordination issues) — line 170
2. `<ProjectPicker>` — 400+ project multi-select — line 172
3. Activity timeline (`<ActivityTimelineChart>`) — lines 183–191
4. Folder permission terrain (`<FolderPermissionTerrain>`) — lines 193–206 — ALWAYS rendered when `terrainProjects.length > 0`
5. Role distribution (`<RolesPieChart>`) — lines 208–216
6. Users by company (`<CompaniesPieChart>`) — lines 218–226
7. Activity by role (`<ActivityByRolePieChart>`) — lines 228–239 — conditional on activityActorRows
8. Activity by company (`<CompaniesActivityPieChart>`) — lines 241–253 — conditional on activityActorRows
9. Activity by module (`<ModulesPieChart>`) — lines 255–259
10. Model Coordination (`<CoordinationByProject>`) — lines 261–275 — conditional on coordinationData

**Layout:** Single full-width flex column (`flex-col gap-8`). Each section wrapped in `<Reveal>` (whileInView fade-up). No 2-up grid exists yet.

**Root scroll owner:** `<div className="h-full overflow-y-auto">` at page.tsx:59. Correct per the dashboard-page-scroll convention (memory note).

---

## Investigation 2: The Existing Zero-Query Cross-Filter (The Seam for INT-04)

**The pattern (projectFilter.ts:53–59):**
```typescript
// REUSE: filterRowsBySelection<T extends { projectId: string }>(rows, selected): T[]
export function filterRowsBySelection<T extends { projectId: string }>(
  rows: ReadonlyArray<T>,
  selected: ReadonlySet<string>,
): T[] {
  return rows.filter((r) => selected.has(r.projectId));
}
```

**How it drives all donuts now (AccessAnalysisCharts.tsx:111–133):**
- `roleSummary` = `summarizeRoles(filterRowsBySelection(roleRows, selected))` — line 111
- `moduleSummary` = `summarizeModules(filterRowsBySelection(moduleRows, selected))` — line 112
- `activityByRoleSummary` uses two `filterRowsBySelection` calls — lines 113–119
- `companySummary`, `activityByCompanySummary`, `coordSummary` follow the same pattern

**Where a segment-click hooks in (INT-04 seam):**

The exact hook point for cross-filter is:
1. Add a new state in `AccessAnalysisCharts.tsx` alongside the existing `selected` (line 101):
   ```typescript
   // CURRENT (line 101):
   const [selected, setSelected] = useState<Set<string>>(...)
   // ADD:
   const [sliceFilters, setSliceFilters] = useState<Record<string, string>>({})
   // e.g. { role: "Project Manager", company: "Hermosillo" }
   ```

2. Write a new pure helper `applySliceFilters(rows, sliceFilters)` — mirrors `filterRowsBySelection`. Each donut's memo adds this second filter step after `filterRowsBySelection`.

3. Each donut's `onEvents.click` handler (already wired) calls `setSliceFilters` instead of (or in addition to) its current local `setDrill`:
   - `RolesPieChart.tsx:204`: `onEvents={{ click: (p) => p.name && toggleDrill(p.name) }}` — refactor so `toggleDrill` lifts the selected role to parent via an `onSliceClick?: (dim: string, val: string) => void` prop.
   - Same for `CompaniesPieChart`, `ActivityByRolePieChart`, `CompaniesActivityPieChart`.

4. KPI numbers re-derive from the doubly-filtered summaries (no re-animation — VIS-05 constraint).

**Project Picker is untouched** — it sets `selected` (project scope), not `sliceFilters` (dimension drill).

**Filter scope boundary (locked decision):** Terrain and Model Coordination do NOT receive sliceFilters. They are props-isolated already — adding `sliceFilters` only to the donuts' memo chain satisfies the locked scope.

---

## Investigation 3: Phase 1 Shared Foundation

### PremiumSurface (`components/ui/PremiumSurface.tsx`)

**API:**
```typescript
interface PremiumSurfaceProps extends React.ComponentProps<"div"> {
  variant?: "base" | "float" | "glass" | "inset";  // default: "base"
  glow?: boolean;  // adds shadow-[var(--glow-primary)] ring
  className?: string;
  children: React.ReactNode;
}
```

**Variant `"base"`** uses `.panel-elevated` — the same class all chart panels use now (they use it directly without PremiumSurface). Wrapping with `<PremiumSurface variant="base">` adds no visual change but provides the RSC-safe `relative` positioning context for the `::after` catch-light pseudo-element (`globals.css:461`).

**Does PremiumSurface already support the CONTEXT visual requirements?**
- 2.5D depth/shadow: YES — `panel-elevated` has dual-theme box-shadows, hover lift, catch-light (globals.css:447–490)
- Glow ring on selected slice: PARTIAL — `glow` prop adds `--glow-primary` but this is a card-level glow, not a per-slice chart glow. Per-slice glow is ECharts `emphasis.itemStyle.shadowBlur` — already present in all donuts. The card-level `glow` prop can be used on the active panel to show which dimension is filtered.
- No extension to PremiumSurface is needed.

### Canonical EChart Wrapper (`components/ui/EChart.tsx`)

**API:**
```typescript
interface EChartProps {
  option: EChartsOption;
  height?: number;  // default 280
  onEvents?: Record<string, (params: { name?: string; data?: unknown; seriesName?: string }) => void>;
  notMerge?: boolean;  // default true; set false to enable universalTransition morphs
  className?: string;
}
```

**How it reads theme:** `const { resolvedTheme } = useTheme()` (line 39); defaults `dark = resolvedTheme !== "light"` before next-themes resolves (avoids dark→light flash); passes key={resolvedTheme} for clean canvas remount on theme switch (line 49).

**Does the canonical EChart wrapper support universalTransition?**
- The wrapper passes `option` through to ReactECharts. `universalTransition` is an ECharts option-level feature — callers add `{ universalTransition: { enabled: true } }` inside their series config. The wrapper does NOT block it.
- To enable universalTransition morphs: set `notMerge={false}` (the wrapper exposes this prop) AND add `universalTransition: true` in the series config. Both changes happen in the individual chart components, not in the wrapper.

**Page-local vs canonical EChart:**

| Location | File | Theme-aware? | Used by |
|----------|------|-------------|---------|
| Page-local (OLD) | `app/(dashboard)/access-analysis/components/EChart.tsx` | NO — passes raw option | RolesPieChart, ActivityByRolePieChart, CompaniesPieChart, CompaniesActivityPieChart, ModulesPieChart, ActivityTimelineChart |
| Canonical (Phase 1) | `components/ui/EChart.tsx` | YES — mergeEChartsTheme | Currently unused on this page |

**Migration task (ACC-02):** Swap import from `"./EChart"` to `"@/components/ui/EChart"` in all six chart components. Remove the manual `const dark = resolvedTheme !== "light"` + `cTitle/cSub/cTipBg/cTipBorder/cTipText` variables in each chart (these are replaced by `mergeEChartsTheme`). The caller-owned `itemStyle.color` (slice colors) and `emphasis.itemStyle.shadowBlur` (glow) are NOT touched by `mergeEChartsTheme` (per echartsTheme.ts:157: "series[].itemStyle and series[].data are intentionally NOT touched").

**THM-01 gap after migration:** `mergeEChartsTheme` injects tooltip/axis chrome colors. Data-label colors (title text inside donuts like `cTitle`, `cSub`, center text values) are still baked as hex in each chart's option. After migration, the planner must add a task to verify WCAG AA on center-label and tooltip-title values in both themes. Light theme data labels use `#111827` on `#FFFFFF` card — passes. Dark theme uses `#fafafa` on `rgba(24,24,27,0.96)` — passes. The projector-brightness gap is ambient brightness affecting perceived contrast, not CSS contrast ratio — the WCAG AA check is the standard metric.

### Token set (globals.css)

Relevant Phase 1 tokens already defined:
- `--glow-primary`: `0 0 24px -4px rgba(99,102,241,0.30)` (light) / `rgba(99,102,241,0.55)` (dark) — line 162/258
- `--glow-accent`: line 163/259
- `--depth-float`: line 165/261
- `--depth-card`: line 164/260
- `--shimmer-stop`: line 135/232 — used by `.animate-shimmer` for loading skeletons
- `.panel-elevated` with `::after` catch-light — lines 447–490

**For skeleton shimmers:** `.animate-shimmer` + `--shimmer-stop` CSS var is the existing mechanism (globals.css:395–398). Shaped donut/bar skeletons = `<Skeleton>` (`components/ui/skeleton.tsx`) wrapping appropriate geometry divs, styled with `animate-shimmer`.

---

## Investigation 4: Coverage Badges

**Existing component (`app/(dashboard)/access-analysis/components/CoverageBadges.tsx`):**

| Export | What it renders | Current use |
|--------|----------------|-------------|
| `CoverageDots` | Two dots (activity + folders) | ProjectPicker per-row |
| `CoverageChips` | Three labeled chips (activity / folders / files) | Not used on page yet |
| `FullyCoveredBadge` | "Full data" pill | Not used on page yet |
| `isFullyCovered(c)` | Boolean helper | ProjectPicker |

**The `coverage: ProjectCoverage[]` prop is already on `AccessAnalysisCharts`.** Each `ProjectCoverage` item has `{ projectId, hasActivity, folderCrawled, fileCrawled }` (from `lib/server/projectCoverageView`).

**What CONTEXT requires:** A small "Activity: 428 / 1,152 projects" text badge on each activity-derived panel header. This is NOT a per-project dot/chip — it is an account-wide count comparing projects-with-activity to total projects.

**What exists to extend vs build new:**
- `CoverageBadges.tsx` components are per-project (driven by individual `ProjectCoverage`). They do not expose an account-wide summary badge.
- A new `ActivityCoverageBadge` component is needed: receives `totalProjects` and `coveredProjects` counts, renders a small inline text like `"Activity: {coveredProjects} / {totalProjects} projects"`.
- The counts are derivable from `coverage?: ProjectCoverage[]` already passed to `AccessAnalysisCharts`: `coveredProjects = coverage.filter(c => c.hasActivity).length`, `totalProjects = coverage.length` (or pull from the known 1,152 constant). The constant "1,152" is the total ACC project universe. Using `coverage.length` (which is per-DC-accessible projects) may differ from 1,152 — the planner should decide whether to hardcode or derive.
- Placement: in the `SectionHeader` or immediately below it for panels that use activity data: Activity over time, Activity by role, Activity by company, Activity by module.

---

## Investigation 5: Prisma Feasibility Gate + the Composite Index

### AccActivity model (prisma/schema.prisma:542–561)

```
model AccActivity {
  id          String   @id
  autodeskId  String
  userEmail   String?
  projectId   String?
  rawAction   String
  service     String?
  tool        String?
  details     String?
  sourceFile  String
  ingestRunId String?
  createdAt   DateTime

  @@unique([autodeskId, rawAction, createdAt, projectId])
  @@index([autodeskId, createdAt(sort: Desc)])
  @@index([userEmail, createdAt(sort: Desc)])    // line 557 — drives per-user file activity
  @@index([projectId, createdAt(sort: Desc)])    // line 558
  @@index([rawAction])
  @@index([ingestRunId])
}
```

**Does `@@index([userEmail, projectId])` already exist?** NO. The current indexes include `[userEmail, createdAt]` and `[projectId, createdAt]` separately, but no `[userEmail, projectId]` composite.

**Which query needs it?** `activityByActorView.ts:61–63` — the DC backfill leg of the union:
```sql
SELECT d."projectId" AS pid, d."userEmail" AS email, COUNT(*)::int AS c
  FROM "AccActivity" d
  LEFT JOIN astart a ON a."projectId" = d."projectId"
  WHERE d."projectId" IS NOT NULL AND d."projectId" <> ''
    AND d."userEmail" IS NOT NULL
    AND (a.s IS NULL OR d."createdAt" < a.s)
  GROUP BY 1, 2
```
This query groups by `(projectId, userEmail)` on `AccActivity`. A composite index `(userEmail, projectId)` would support this group-by. The existing separate indexes can be used but a composite is more efficient for covering both columns together. The createdAt filter `(d.createdAt < a.s)` still benefits from the existing per-column indexes; the composite adds coverage for the group-by columns.

**Migration mechanism:** The project has a `prisma/migrations/` directory with `.sql` files (verified: 10+ migrations present, most recent `20260529180000_add_folder_rollup_columns`). The correct mechanism is:
```bash
npx prisma migrate dev --name add_acc_activity_email_project_index
```
Memory note says "Local migrate broken (pgvector); used raw ALTER" — this applied to a different schema change (adding a vector extension column). For a plain composite index, `prisma migrate dev` should work. If it fails, the fallback is:
```sql
CREATE INDEX IF NOT EXISTS "AccActivity_userEmail_projectId_idx"
  ON "AccActivity"("userEmail", "projectId");
```
followed by manually inserting the migration record. The planner should include both paths.

**Add to Prisma schema:**
```prisma
@@index([userEmail, projectId])  // composite — speeds up activityByActor GROUP BY (projectId, userEmail)
```

### NA-01 Feasibility Gate — No New Metrics This Phase

CONTEXT is explicit: polish-only, no new metrics. The only NA-01 action is the coverage badge described in Investigation 4. No Prisma query additions required for NA-01 beyond the index.

---

## Investigation 6: Redundant-Fetch Audit (Pitfall 2)

**All data fetches on the /access-analysis page:**

| Source | Location | Fetch mechanism | Notes |
|--------|----------|----------------|-------|
| `loadInstanceView()` | page.tsx:18 | Server-only await in RSC | Returns `view` → slimmed to `rows` (ProjectRoleRow[]) and `membershipRows` |
| `loadModuleActivity()` | page.tsx:18 | Server-only await in RSC | Returns `moduleRows` |
| `loadActivityByActor()` | page.tsx:18 | Server-only await in RSC | Returns `activityActorRows` |
| `loadCoordinationByProject()` | page.tsx:18 | Server-only await in RSC | Returns `coordinationData` |
| `loadProjectCoverage()` | page.tsx:18 | Server-only await in RSC | Returns `coverage` |
| `loadTerrainProjects()` | page.tsx:18 | Server-only await in RSC | Returns `terrainProjects` |
| `loadActivityTimeline()` | page.tsx:18 | Server-only await in RSC | Returns `timelineRows` |
| `loadFolderPermissionTerrain(defaultProject.id)` | page.tsx:36 | Server-only sequential await | Returns `initialTerrain` |
| tRPC `bulkUsers.useQuery` | AuthorProfileDrawer.tsx:37 | Client tRPC — lazy-loaded dynamic import | Only fires when a person's name is clicked; behind `dynamic(ssr:false)` at AccessAnalysisCharts.tsx:33 |
| tRPC `bulkAccSummary.useQuery` | AuthorProfileDrawer.tsx:38 | Client tRPC — lazy | Same as above |
| tRPC `enrichedUsers.useQuery` | AuthorProfileDrawer.tsx:39 | Client tRPC — lazy | Same as above |

**Verdict:** Zero redundant fetches exist today. The three tRPC hooks in AuthorProfileDrawer are gated behind `dynamic(ssr:false)` + `enabled: boolean` flag — they fire only when the drawer opens. Phase 5 must preserve this: new cross-filter interaction must NOT add any `useQuery` call for already-fetched data. The pill bar and "View N people" slide-in must use data already in props.

**Cross-filter slice-filter state change:** When a slice is clicked, the doubly-filtered memos re-compute from existing in-memory data — `filterRowsBySelection` + `applySliceFilters` run client-side with zero network calls.

---

## Investigation 7: Existing Tests + Gates

**Test files in access-analysis:**
```
app/(dashboard)/access-analysis/
├── page.test.tsx                                      (RSC integration — 1 describe, 1 test)
├── __tests__/
│   ├── AccessAnalysisCharts.test.tsx
│   ├── ActivityByRolePieChart.test.tsx
│   ├── ActivityTimelineChart.test.tsx
│   ├── CompaniesPieChart.test.tsx
│   ├── CompaniesActivityPieChart.test.tsx
│   ├── CoordinationByProject.test.tsx
│   ├── FolderPermissionTerrain.test.tsx               (pre-existing 2 failures noted in memory)
│   ├── ModulesPieChart.test.tsx
│   ├── NoActivityBars.test.tsx
│   ├── PeopleDrillList.test.tsx
│   ├── RolesPieChart.test.tsx
│   ├── catalogTargets.test.ts
│   ├── companyActivityCounts.test.ts
│   ├── companyCounts.test.ts
│   ├── coordinationClash.test.ts
│   ├── coordinationCounts.test.ts
│   ├── dormantActivity.test.ts
│   ├── folderInheritance.test.ts
│   ├── folderTerrain.test.ts
│   ├── moduleCounts.test.ts
│   ├── modules.test.ts
│   ├── projectFilter.test.ts
│   ├── projectGroups.test.ts
│   ├── relativeTime.test.ts
│   ├── roleActivityCounts.test.ts
│   ├── roleCounts.test.ts
│   └── timelineCounts.test.ts
```

**Verification commands (MUST be in every plan's verification block):**

```bash
# Unit test suite (excludes e2e)
npx vitest run --exclude "**/tests/e2e/**"

# TypeScript gate — REQUIRED before any rebuild (next build typechecks ALL files incl. test files)
npx tsc --noEmit

# e2e (runs on :3100, requires separate server)
npm run test:e2e
```

**Known pre-existing FolderPermissionTerrain test failures:** Memory notes these as pre-existing WIP failures from a concurrent session (`Phase 02-01` decision: "1 skip + 2 pre-existing FolderPermissionTerrain failures"). Plans must NOT treat these as regressions introduced by Phase 5.

**Test writing rule:** Do NOT use jest-dom matchers (e.g. `toBeInTheDocument`). Use `.hasAttribute`, `querySelector`, `getAttribute`. Memory note confirms this constraint.

**Baseline test count (as of Phase 2-01):** 2015 total (2012 pass + 1 skip + 2 pre-existing failures). Phase 5 plans must hold or exceed 2012 passing tests.

---

## Investigation 8: Theme / Contrast Mechanics (THM-01)

**How the page currently reads theme:**

All six chart components use the page-local EChart wrapper (`access-analysis/components/EChart.tsx` — no theme awareness) and each manually branches on `resolvedTheme`:
```typescript
// RolesPieChart.tsx:62-63 (same pattern in all 5 donuts + timeline):
const { resolvedTheme } = useTheme();
const dark = resolvedTheme !== "light";
// Then: cTitle, cSub, cTipBg, cTipBorder, cTipText derived from dark boolean
```

**After migration to canonical wrapper:** `mergeEChartsTheme` injects tooltip/axis chrome. The manual `dark` + color variables can be removed from each chart. Data-series colors (`itemStyle.color`) remain caller-owned.

**Data-label colors after migration:**

The center labels in donuts use `cTitle` (dark: `#fafafa`, light: `#111827`) for the big number and `cSub` (dark: `#a1a1aa`, light: `#6b7280`) for the sub-label. These are hardcoded in the chart option objects; after migration they become the caller's responsibility (no longer covered by mergeEChartsTheme which intentionally does not touch series data). The planner must ensure these stay theme-correct after import swap — the pattern already works, but the migration must not silently break it by removing the manual variables before adding theme-derived equivalents.

**WCAG AA verification at projector brightness (THM-01):**
- Light theme center label: `#111827` on `#FFFFFF` = 16:1 contrast ratio — passes AA (4.5:1 minimum)
- Dark theme center label: `#fafafa` on `rgba(24,24,27,0.96)` ≈ `#18181b` = ~20:1 — passes
- Light sub-label: `#6b7280` on `#FFFFFF` = 4.6:1 — barely passes AA
- Dark sub-label: `#a1a1aa` on `#18181b` = 5.6:1 — passes
- Projector brightness does not change CSS contrast ratios but reduces perceived contrast. The WCAG AA check is the standard metric per CONTEXT decision (THM-01).
- The planner should include a task to run WCAG AA ratio checks on all chart text colors in both themes using the browser DevTools color picker or aXe.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 2.5D card depth | Custom shadow CSS | `PremiumSurface variant="base"` (`components/ui/PremiumSurface.tsx`) | Dual-theme panel-elevated class already exists |
| Chart theme injection | Per-chart resolvedTheme branches | `components/ui/EChart.tsx` + `mergeEChartsTheme` | Already handles all axis/tooltip chrome for both themes |
| Motion entrance | CSS keyframes | `Reveal`, `useEntrance` from `animated-list.tsx`; `fadeUp`, `useSafeVariants` from `motion.ts` | Handles reduced-motion; already on the page |
| Slide-in people panel | Custom drawer | `DrillSheet` (`components/ui/DrillSheet.tsx`) + `PeopleDrillList` | INT-01 compliant; already used by AuthorProfileDrawer |
| Skeleton shimmer | Custom loading state | `<Skeleton className="animate-shimmer">` + `--shimmer-stop` CSS var | Already in `components/ui/skeleton.tsx` |
| Coverage dot display | Custom badge | `CoverageDots`, `CoverageChips` from `CoverageBadges.tsx` | Per-project coverage already handled |

**Key insight:** Every infrastructure primitive (surface, chart wrapper, motion, sheet, skeleton, coverage) already exists from Phases 1–4. This phase is assembly and extension, not invention.

---

## Common Pitfalls

### Pitfall 1: Adding a tRPC useQuery for cross-filtered data
**What goes wrong:** Developer adds a `trpc.someEndpoint.useQuery(sliceFilters)` to re-fetch filtered data from the server.
**Why it happens:** Cross-filter looks like a data-fetching problem because it changes which data is shown.
**How to avoid:** All data is already in memory as server-loaded props. `filterRowsBySelection` + new `applySliceFilters` run client-side with zero network calls. Any new `useQuery` for already-loaded data is a Pitfall 2 violation (PERF-03).
**Warning signs:** Any `import { trpc }` in a new component that already receives rows as props.

### Pitfall 2: Re-animating KPIs on slice-filter change (VIS-05 violation)
**What goes wrong:** The KPI count-up animation fires every time a slice is clicked.
**Why it happens:** The count-up animation is tied to the KPI value change, which happens on every filter interaction.
**How to avoid:** The count-up animation (from StatStrip / VIS-04) must only fire on first mount. Use a `useRef(false)` initialized flag or framer-motion's `initial` prop with a first-render guard. Slice-filter changes must update the displayed number without triggering the animation.
**Warning signs:** Test that clicking a donut slice does NOT restart the KPI count-up.

### Pitfall 3: Breaking terrain by removing initialTerrain from the blocking await
**What goes wrong:** Removing `loadFolderPermissionTerrain` from the blocking Promise.all but forgetting that `initialTerrain` is still passed to AccessAnalysisCharts — the terrain expand now has nothing to show on first open.
**How to avoid:** The CONTEXT decision is that terrain reveals account-wide overview on expand. The `loadOverview` server action already exists (`folderTerrainActions.ts`). On expand, fire `loadOverview()` (via the existing `loadOverview` prop), not `loadFolderPermissionTerrain(defaultProject.id)`. This means `initialTerrain` can be dropped from page.tsx, and the terrain component calls `loadOverview` on first expand.
**Warning signs:** Terrain shows blank/null on first expand after removing initialTerrain.

### Pitfall 4: Using `notMerge={true}` (default) with universalTransition
**What goes wrong:** `universalTransition` morphs don't animate — charts re-initialize on every filter change.
**Why it happens:** `notMerge={true}` is the EChart wrapper's default. It destroys and recreates the ECharts instance on every option update, which prevents cross-state animation.
**How to avoid:** Set `notMerge={false}` on every donut that uses universalTransition. The canonical EChart wrapper exposes this prop.
**Warning signs:** Slice transitions are instant jumps instead of smooth morphs when the project picker or slice-filter changes.

### Pitfall 5: Breaking donut tests by removing local theme variables
**What goes wrong:** After swapping to the canonical EChart import, deleting `const dark = ...` and `const cTitle = ...` breaks tests that check subtitle/label text rendered into the echarts mock's `data-subtexts` or `data-names` attributes.
**Why it happens:** The test mock at `page.test.tsx:58–72` stringifies `props.option.title[*].subtext` — if the option construction changes, the test assertions fail.
**How to avoid:** Migrate one chart at a time and run `npx vitest run` after each. Keep center-label text construction in the chart option (the canonical wrapper does not touch title/center labels), just remove the manual tooltip/axis color variables that mergeEChartsTheme now handles.
**Warning signs:** `page.test.tsx` "2 roles" assertion fails after swap.

### Pitfall 6: Building Suspense tier split that breaks RSC serialization
**What goes wrong:** Moving `loadActivityTimeline` or `loadTerrain` into a child RSC inside a `<Suspense>` boundary but accidentally importing a client component directly (without `dynamic(ssr:false)`) causes the RSC payload to fail serialization.
**Why it happens:** RSC → Client boundary rules are strict in Next.js App Router.
**How to avoid:** The Suspense boundary pattern for this project: create a small RSC async component (e.g. `TimelineTierLoader`) that awaits the data, then renders the client chart component with data as props. No client-side `useQuery` involved.

---

## Code Examples

### Cross-filter state pattern (new, mirrors existing project filter)

```typescript
// In AccessAnalysisCharts.tsx — ADD alongside existing `selected` state
const [sliceFilters, setSliceFilters] = useState<Record<string, string>>({})
// e.g. { role: "Project Manager", company: "Hermosillo SA" }

// Toggle: clicking same value again clears it
const toggleSliceFilter = (dim: string, val: string) => {
  setSliceFilters((prev) => {
    const next = { ...prev };
    if (next[dim] === val) delete next[dim];
    else next[dim] = val;
    return next;
  });
};

// Apply after filterRowsBySelection (pure helper — no network call)
// Add to projectFilter.ts alongside filterRowsBySelection:
function applySliceFilters<T extends { roles?: string[]; company?: string | null }>(
  rows: ReadonlyArray<T>,
  filters: Record<string, string>,
): T[] {
  return rows.filter((r) => {
    if (filters.role && !r.roles?.includes(filters.role)) return false;
    if (filters.company && r.company !== filters.company) return false;
    return true;
  });
}
```

### Canonical EChart import swap (ACC-02)

```typescript
// BEFORE (in RolesPieChart.tsx, ActivityByRolePieChart.tsx, etc.):
import { EChart } from "./EChart";  // page-local, no theme

// AFTER:
import { EChart } from "@/components/ui/EChart";  // canonical, mergeEChartsTheme

// Also: remove manual theme variables (handled by mergeEChartsTheme now):
// DELETE: const { resolvedTheme } = useTheme();
// DELETE: const dark = resolvedTheme !== "light";
// DELETE: const cTitle = dark ? "#fafafa" : "#111827";  etc.
// KEEP: itemStyle.color (series data colors — not touched by mergeEChartsTheme)
// KEEP: emphasis.itemStyle.shadowBlur (glow — not touched)
// SET:  notMerge={false} for universalTransition
```

### universalTransition in donut series

```typescript
// In each pie series config (RolesPieChart.tsx, CompaniesPieChart.tsx, etc.):
series: [{
  type: "pie",
  universalTransition: true,  // ADD — enables morph between filter states
  // ... existing radius, data, itemStyle, emphasis ...
}]
// EChart wrapper: notMerge={false}  ← required for universalTransition to fire
```

### Shimmer skeleton for donut panels

```typescript
// Uses existing Skeleton + animate-shimmer from globals.css + skeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";

function DonutSkeleton() {
  return (
    <div className="panel-elevated p-5">
      <div className="flex items-center justify-center" style={{ height: 400 }}>
        {/* Donut ring shimmer */}
        <div className="relative h-48 w-48">
          <Skeleton className="absolute inset-0 rounded-full animate-shimmer" />
          <Skeleton className="absolute inset-10 rounded-full bg-card" />  {/* center hole */}
        </div>
      </div>
    </div>
  );
}
```

### PremiumSurface wrap (ACC-01)

```typescript
// BEFORE (in AccessAnalysisCharts.tsx section rendering):
<Reveal><section className="flex flex-col gap-3">
  <SectionHeader title="Role distribution" ... />
  <RolesPieChart ... />
</section></Reveal>

// AFTER:
<Reveal><PremiumSurface variant="base" className="flex flex-col gap-3 p-0 overflow-hidden">
  <section className="flex flex-col gap-3 p-5">
    <SectionHeader title="Role distribution" ... />
    <RolesPieChart ... />
  </section>
</PremiumSurface></Reveal>
// Note: variant="base" uses panel-elevated — same class the charts use already
```

### Composite index migration

```prisma
// In prisma/schema.prisma, AccActivity model — ADD after existing indexes:
@@index([userEmail, projectId])  // composite — speeds up activityByActor GROUP BY (projectId, userEmail)
```

```bash
# Apply:
npx prisma migrate dev --name add_acc_activity_email_project_index
# Fallback if migrate fails (e.g. pgvector conflict):
# Run raw SQL against local PG, then update migration_lock manually
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single blocking Promise.all for all data | Tier split via React Suspense streaming | This phase (Phase 5) | First meaningful content < 300ms |
| Flat single-column panel layout | 2-up grid for donuts (full-width for timeline + terrain) | This phase | Less scrolling, dashboard feel |
| Page-local EChart (no theme) | Canonical EChart (mergeEChartsTheme) | Phase 5 migration | Consistent dual-theme charts |
| Local drill-only segment click | Segment click cross-filters all donuts via sliceFilters state | This phase | INT-04 / headline "lean-in" feature |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `coverage.length` from `loadProjectCoverage()` is close to 1,152 (the total ACC project universe count) | Investigation 4 | If coverage only returns DC-accessible projects (428), the badge would read "428 / 428" instead of the intended "428 / 1,152" — misleading |
| A2 | `prisma migrate dev` will succeed for a plain composite index without the pgvector failure mode | Investigation 5 | If it fails, raw ALTER SQL fallback is required; planner should include both paths |
| A3 | The three tRPC hooks in AuthorProfileDrawer (bulkUsers, bulkAccSummary, enrichedUsers) are already correctly gated by `dynamic(ssr:false)` and will not be affected by Phase 5 changes | Investigation 6 | Minor — AuthorProfileDrawer is untouched by Phase 5; risk is near-zero |

**If this table is empty:** Not applicable — three low-risk assumptions documented above.

---

## Open Questions

1. **Coverage badge denominator.** The CONTEXT says "Activity: 428 / 1,152 projects". The 1,152 is the total ACC project universe. The `coverage: ProjectCoverage[]` prop gives per-project coverage flags from `loadProjectCoverage()`. Does this loader return ALL projects (1,152) or only DC-accessible ones (428)? If it returns only DC-accessible, the "/ 1,152" denominator must be hardcoded or fetched from a separate count. **Resolution for planning:** The planner should inspect `lib/server/projectCoverageView.ts` and use the correct denominator — hardcode 1,152 as a named constant if the loader only returns the 428, or use `coverage.length` if it returns all.

2. **Suspense tier boundaries.** Page.tsx must be split into 3 tiers. The exact RSC component decomposition (whether to inline `<Suspense>` in page.tsx or extract named async components) is Claude's discretion. The planner should pick the simplest pattern that keeps the file readable.

---

## Environment Availability

Step 2.6: All dependencies are already installed. Local PG 18 running (Task Scheduler). No new external dependencies. SKIPPED (no new external dependencies required).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (vitest.config.* — see package.json) |
| Config file | vitest.config.ts (root) |
| Quick run command | `npx vitest run --exclude "**/tests/e2e/**"` |
| Full suite command | `npx vitest run --exclude "**/tests/e2e/**"` (same for unit) |
| E2E command | `npm run test:e2e` (Playwright on :3100) |
| TypeScript gate | `npx tsc --noEmit` (required before every rebuild) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACC-01 | PremiumSurface wraps each panel | unit (snapshot/render) | `npx vitest run access-analysis/__tests__/AccessAnalysisCharts` | ✅ (extend existing) |
| ACC-02 | Canonical EChart used; universalTransition fires | unit (mock verify import) | `npx vitest run access-analysis/__tests__/RolesPieChart` | ✅ (extend existing) |
| ACC-03 | Terrain starts collapsed; expand fires loadOverview not loadFolderPermissionTerrain | unit (click test) | `npx vitest run access-analysis/__tests__/FolderPermissionTerrain` | ✅ (2 pre-existing fails — do not regress further) |
| PERF-02 | Tier 1 data available before Tier 2 awaits | unit (mock timing) | `npx vitest run access-analysis/page` | ✅ (extend page.test.tsx) |
| PERF-05 | No WebGL context | manual / lint grep | grep for echarts-gl / WebGLRenderingContext | manual |
| INT-02 | "View N people" affordance opens DrillSheet | unit (click → sheet open) | `npx vitest run access-analysis/__tests__/AccessAnalysisCharts` | ✅ Wave 0 gap |
| INT-04 | Clicking role slice sets sliceFilters + recomputes summaries | unit (click → state change) | `npx vitest run access-analysis/__tests__/AccessAnalysisCharts` | ✅ Wave 0 gap |
| INT-05 | Pill bar renders active filter; X dismisses it | unit (render + click) | `npx vitest run access-analysis/__tests__/PillBar` | ❌ Wave 0 gap — new file |
| VIS-01 | panel-elevated class present on each section | unit (className check) | part of AccessAnalysisCharts test | ✅ extend |
| VIS-02 | universalTransition in series option | unit (option inspection) | part of RolesPieChart test | ✅ extend |
| VIS-05 | KPI count-up does NOT re-fire on slice-filter change | unit (state change without animation) | manual — document as human_needed | manual |
| THM-01 | WCAG AA contrast on chart labels both themes | manual browser | DevTools color picker / aXe | manual |
| NA-01 | Coverage badge renders "428 / N" on activity panels | unit (text assertion) | `npx vitest run access-analysis/__tests__/ActivityCoverageBadge` | ❌ Wave 0 gap — new file |

### Wave 0 Gaps

- [ ] `app/(dashboard)/access-analysis/__tests__/PillBar.test.tsx` — covers INT-05 (pill render + clear)
- [ ] `app/(dashboard)/access-analysis/__tests__/ActivityCoverageBadge.test.tsx` — covers NA-01 badge render
- [ ] Extend `AccessAnalysisCharts.test.tsx` — covers INT-02 "View N people" affordance + INT-04 slice-click state change

*(If no gaps: "None — existing test infrastructure covers all phase requirements" — not applicable here; three gaps identified.)*

---

## Security Domain

`security_enforcement` is not set in `.planning/config.json` — treat as enabled.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — page is behind dashboard auth (NextAuth); no auth changes |
| V3 Session Management | No | No session changes |
| V4 Access Control | No | RSC page is behind existing middleware; no new routes |
| V5 Input Validation | Yes — slice-filter values come from user click (ECharts event names) | Values are chart series names (strings from server-loaded data); they are never sent to the server, only used to filter in-memory arrays. No server-side validation needed. Ensure no `dangerouslySetInnerHTML` with filter values. |
| V6 Cryptography | No | N/A |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via slice-filter pill label | Spoofing | Pill text comes from chart series names which originate from server-loaded DB data (role/company names). Render as React text nodes (not innerHTML). |
| Prototype pollution via `Record<string, string>` filters | Tampering | Mitigated by using `Object.hasOwn` checks when iterating; do not use spread with user-supplied keys for security-sensitive paths. |

---

## Sources

### Primary (HIGH confidence)
- `app/(dashboard)/access-analysis/page.tsx` — actual RSC data loaders and Promise.all shape (VERIFIED)
- `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` — full client component incl. filterRowsBySelection usage (VERIFIED)
- `app/(dashboard)/access-analysis/projectFilter.ts` — filterRowsBySelection signature (VERIFIED)
- `components/ui/PremiumSurface.tsx` — props API and variant classes (VERIFIED)
- `components/ui/EChart.tsx` — canonical wrapper props and theme mechanism (VERIFIED)
- `components/ui/DrillSheet.tsx` — slide-in panel API (VERIFIED)
- `lib/colors/echartsTheme.ts` — mergeEChartsTheme and palette (VERIFIED)
- `app/globals.css` — all CSS tokens, panel-elevated, animate-shimmer (VERIFIED)
- `components/ui/motion.ts` — fadeUp, useSafeVariants, stagger (VERIFIED)
- `prisma/schema.prisma:542–561` — AccActivity model and existing indexes (VERIFIED)
- `lib/server/activityByActorView.ts` — the GROUP BY (projectId, userEmail) query (VERIFIED)
- `app/(dashboard)/access-analysis/components/CoverageBadges.tsx` — existing badge components (VERIFIED)
- `app/(dashboard)/access-analysis/components/RolesPieChart.tsx` — donut chart structure with theme branch (VERIFIED)
- `.planning/config.json` — nyquist_validation absent = enabled (VERIFIED)

### Secondary (MEDIUM confidence)
- Memory notes: pre-existing FolderPermissionTerrain failures, build typechecks test files, jest-dom constraint, local PG 18 migration mechanism [ASSUMED from memory]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are installed; no new packages
- Architecture: HIGH — all files read directly; data flow verified from source
- Cross-filter seam: HIGH — exact hook points identified by line number
- Prisma index: HIGH — schema read directly; absence of composite confirmed
- Migration mechanism: MEDIUM — migrations dir exists; pgvector failure mode is historical memory note
- Pitfalls: HIGH — derived from reading actual code + prior phase decisions

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (30 days — stack is stable)
