# Feature Landscape — v3.0 Hub Story & Scenario Explorer

**Domain:** BIM/VDC operational analytics — ACC hub access, activity, and coordination
**Page:** `/access-analysis` (additive; 14 existing panels preserved)
**Audience:** Non-technical executives + BIM/VDC managers; one presenter (Luis), live workshops
**Data authority:** Prisma/PostgreSQL — `AccActivity`, `AccProjectMember`, `AccProjectRole`, `AccRole`, `AccFolder`, `AccFolderPermission`, `AccDcProjectUser`, `AccDcRole`, `AccIssue`; coverage cap = 428/1,152 admin-accessible projects
**Researched:** 2026-06-22
**Overall confidence:** HIGH — grounded in verified repo source, existing component contracts, and project decisions from PROJECT.md

---

## Context: Existing Interaction Model (Do Not Break)

The following primitives are already shipped in `app/(dashboard)/access-analysis/` and
must be reused, extended, or wrapped — never replaced — by v3.0 features.

| Primitive | File (verified) | Contract |
|-----------|-----------------|----------|
| `AccessAnalysisCharts` | `components/AccessAnalysisCharts.tsx` | Single-mount client component that owns cross-filter state (`sliceFilters`, `selected`). All new panels inside the existing layout inherit its filter state. |
| `FilterBanner` | `components/FilterBanner.tsx` | Named-dimension cross-filter UI. Accepts `filters: SliceFilters`, shows "N of M projects". Any new filterable dimension must extend `SliceFilters` type and call `toggleSliceFilter`. |
| `ProjectPicker` | `components/ProjectPicker.tsx` | Office-grouped multi-select with `CoverageDots` per row and "Full data only" quick filter. Drives the `selected: Set<string>` that gates every panel. |
| `CoverageBadges` / `ActivityCoverageBadge` | `components/CoverageBadges.tsx`, `components/ActivityCoverageBadge.tsx` | Honest coverage chips/dots anchored to `ProjectCoverage` (hasActivity, folderCrawled, fileCrawled). Must appear on every activity-derived panel. |
| `DrillSheet` | `components/ui/DrillSheet.tsx` | Right-slide 480px panel shell. The shared drill target for people lists and author profiles. Extend by passing new children — do not create parallel slide-in mechanisms. |
| `AuthorProfileDrawer` | `components/AuthorProfileDrawer.tsx` | Lazy-loaded (dynamic import) user profile triggered by email click. Already wired via `onUserClick` callbacks in every chart. |
| `PeopleDrillList` + `SectionHeaderWithPeople` | `components/PeopleDrillList.tsx` | People list rendered inside `DrillSheet`. New panels that surface people use the same "View N people" button pattern. |
| `EChart` | `components/ui/EChart.tsx` | Themed ECharts wrapper (reads `resolvedTheme`). All new charts use this — never raw `echarts-for-react`. ECharts 6.1.0 already ships Sankey, calendar heatmap, bar, heatmap, and treemap natively. |
| `PremiumSurface` | `components/ui/PremiumSurface.tsx` | Panel wrapper with depth (glass, shadow, gradient). Every section panel wraps in `PremiumSurface variant="base"`. |
| `Reveal` | `components/ui/animated-list.tsx` | Staggered reveal on panel mount. Wrap every new top-level panel. |
| `MainCharts` RSC | `mainCharts.tsx` | Single async RSC in one Suspense boundary. New data fetches go into its `Promise.all`; new lazy/expand-triggered data uses Server Actions (pattern established by `TerrainReveal` / `FolderActivityReveal`). |

**Cross-filter protocol:** New chart dimensions (e.g. "module", "folder tier", "action type") that should participate in cross-filter must: (1) extend `SliceFilters` in `projectFilter.ts`, (2) add a dim label to the `labels` prop of `FilterBanner`, and (3) call `toggleSliceFilter(dim, val)` on segment click. Slice clicks must NOT open people sheets — that is a locked v2.0 decision (see `AccessAnalysisCharts.tsx` line 119 comment).

---

## Category A — Scenario Explorer

The centerpiece: a flexible measure x dimension (optionally x second dimension) pivot that auto-renders the right chart type, is clickable/drillable, and ships named saved presets for live-demo use.

### A1. Measure Picker
**Classification:** TABLE-STAKES
**Complexity:** Low
**Depends on existing:** `projectFilter.ts` filter primitives; `AccessAnalysisCharts` state

What it is: a compact segmented control or dropdown that selects what is counted. Supported measures from the existing Prisma schema:
- Activity count (source: `AccActivity.rawAction` + `createdAt`)
- Member count (source: `AccProjectMember`)
- Role count (source: `AccProjectRole` -> `AccRole`)
- Issue count (source: `AccIssue`)
- VERIFY: File/storage size could use `AccFolder.fileSize` if populated by the Slice D crawl

**Why table-stakes:** Without a measure selector the explorer reduces to a fixed chart — the owner explicitly defined the feature as combinatorial (Activity x Folder, Role x Users, etc.), implying measure is a first-class axis.

**Design note:** 3-5 measures max in the initial cut. Do not expose raw counts vs. unique counts as two separate measures; derive the right unit per dimension pairing automatically (e.g. member count always uniques by email).

**Empty/coverage state:** When the selected measure has zero rows in the current project selection, show the same no-data pattern used by `ActivityTimelineChart` (icon + "No [measure] found" + "Select at least one project above").

---

### A2. Primary Grouping Dimension Picker
**Classification:** TABLE-STAKES
**Complexity:** Low-Medium
**Depends on existing:** `summarizeRoles`, `summarizeModules`, `summarizeCompanies` pure transform pattern

What it is: a dimension dropdown that sets the grouping axis. Supported dimensions from verified Prisma sources:

| Dimension | Prisma source | Already computed? |
|-----------|--------------|-------------------|
| Role | `AccProjectRole` -> `AccRole.name` | Yes — `summarizeRoles` |
| Company | `AccProjectMember.companyName` | Yes — `summarizeCompanies` |
| Module | `AccActivity.rawAction` -> `classifyActivity` | Yes — `summarizeModules` |
| Folder | `AccFolder.name` / folder tier | Partial — `FolderPermissionTerrain` has it |
| Time (month/year) | `AccActivity.createdAt` | Yes — `summarizeActivityTimeline` |
| Action type (view/upload/edit/delete) | `AccActivity.rawAction` | Partial — `classifyActivity` in `lib/acc/activityCategories.ts` |
| Project | `AccProject.name` | Yes — `projectFilter.ts` |
| User | `AccProjectMember.email` | Yes — per-person rows in `loadInstanceView` |

**Design note:** Not every measure x dimension pair makes sense. Auto-disable invalid pairings (e.g. "Member count x Action type" has no natural join). Show a brief explanation when a combination is disabled rather than silently hiding it.

**Why table-stakes:** The dimension pick is half the explorer's definition. Without it there is no "pivot."

---

### A3. Auto Chart-Type Selection
**Classification:** TABLE-STAKES
**Complexity:** Medium
**Depends on existing:** `EChart` wrapper; ECharts 6.1.0 (verified in `package.json` — ships Sankey, calendar, heatmap, bar, treemap natively)

What it is: given a (measure, dimension) pair, deterministically pick and render the most legible chart type. Recommended mapping:

| Primary grouping | Measure | Recommended chart | Rationale |
|-----------------|---------|-------------------|-----------|
| Categorical (role, company, module, action) | Any count | Horizontal bar (sorted desc) | Most legible for 5-20 categories; scannable in live demo |
| Time (month) | Activity count | Area/line (same as existing `ActivityTimelineChart`) | Already familiar to audience; shows trend |
| Folder (hierarchy) | Any | Treemap | Encodes hierarchy + magnitude; existing `FolderPermissionTerrain` precedent |
| User | Any count | Horizontal bar (top-N) | Preserve privacy-adjacent framing: rank by count, not by identity |
| Project | Any count | Horizontal bar or donut | Matches existing donut style |

**Why table-stakes:** Without auto chart-type the owner must configure the chart manually — that is the BI tool anti-feature. The whole point is "you pick the dimension pair, it auto-renders."

**Auto-render rule:** Expose no chart-type dropdown. The system chooses. If the audience needs the full cross-tab, the second grouping (A4) enables that path.

---

### A4. Optional Second Grouping (Cross-Tab Mode)
**Classification:** DIFFERENTIATOR
**Complexity:** High
**Depends on existing:** `EChart` heatmap series type (built into ECharts 6.1.0)

What it is: when a second dimension is selected, the explorer switches to a heatmap grid (x = dim1, y = dim2, cell = measure magnitude). Example: Role x Module activity -> who does what across the hub. This is the "matrix" view the owner described ("Role x Users, so on so on").

**Why differentiator (not table-stakes):** Most of the high-value presets (A6) cover specific dimension pairs as standalone charts. Cross-tab is powerful but complex to make legible for a non-technical audience. Ship presets first; cross-tab second.

**When to render:** Only when the combination is meaningful and the cardinality is bounded (both dimensions <= 30 categories). If either dimension produces > 30 distinct values in the current selection, auto-truncate to top-N by measure and show "Showing top 30 of N" notice (coverage-honest pattern).

**Cross-tab chart types:**
- Heatmap: the default. `EChart` heatmap series with color scale from theme tokens (not hardcoded hex).
- Chord/Sankey: only for Company -> Role or Role -> Module (see C5, Interconnections section).

---

### A5. Drill Behavior (Click-to-People)
**Classification:** TABLE-STAKES
**Complexity:** Low (reuses existing DrillSheet + PeopleDrillList)
**Depends on existing:** `DrillSheet`, `PeopleDrillList`, `AuthorProfileDrawer`; the `onUserClick` -> `setProfileEmail` chain

What it is: clicking a bar segment, heatmap cell, or Sankey link opens the `DrillSheet` with `PeopleDrillList` showing the people who make up that count. Each person row in the list is clickable -> `AuthorProfileDrawer`.

**Why table-stakes:** Without drill the explorer is a static chart deck. The audience will always ask "who is this?" — the presenter needs a one-click answer without leaving the page.

**Drill protocol (locked rules from v2.0):**
1. Chart slice clicks set cross-filter OR open people sheet — not both. For the explorer, slice click should open people sheet (the chart itself IS the filter; cross-filter applies to the main dashboard panels below, not inside the explorer).
2. Use the shared `DrillSheet` shell — do not create a new slide-in mechanism.
3. People list sources from in-memory summaries only — no tRPC query on drill (zero new server round-trips on click, established by Pitfall 2 in v2.0 research).

---

### A6. Named Saved Presets
**Classification:** TABLE-STAKES
**Complexity:** Low
**Depends on existing:** component state pattern (no persistence needed — presets are hardcoded configs, not user-saved state)

What it is: a horizontal row of named preset buttons that, on click, set the (measure, dimension1, optionally dimension2) to a pre-defined combination and immediately render the chart. Presets are hardcoded named configs — not user-configurable, not persisted to a database. This is a live-demo affordance, not a dashboard builder.

**Recommended initial presets** (derived from the owner's examples and existing chart coverage):

| Preset name | Measure | Dim1 | Dim2 | Chart |
|-------------|---------|------|------|-------|
| Activity by Role | Activity count | Role | — | Horizontal bar |
| Activity by Module | Activity count | Module | — | Horizontal bar |
| Activity by Company | Activity count | Company | — | Horizontal bar |
| Who Works Where | Member count | Project | Role | Heatmap |
| Action Mix | Activity count | Action type | — | Donut |
| Monthly Trend | Activity count | Time (month) | — | Area line |
| Top Contributors | Activity count | User (top 20) | — | Horizontal bar |

**Why table-stakes for live demo:** The owner described presets explicitly as required. Without them, a live demo starts at a blank picker — too slow and fragile for a workshop setting.

**Preset UX:** Each preset is a pill/chip button. Active preset gets a primary ring. Manually changing measure/dim deselects the active preset (moves to "Custom" state). Clicking the same preset twice is a no-op (idempotent).

---

### A7. Explorer Coverage State (Honesty Strip)
**Classification:** TABLE-STAKES
**Complexity:** Low
**Depends on existing:** `ActivityCoverageBadge` component; `covCovered`/`covTotal` derived from `activityCoverageCounts(coverage)`

What it is: the explorer panel header always shows the `ActivityCoverageBadge` when the active measure is activity-derived. It shows "Showing 428 of 1,152 projects" context when relevant. No extra computation — wired from the same `coverage` prop already passed to `AccessAnalysisCharts`.

**Why table-stakes:** The entire analytics surface is built on a 428/1,152 partial extract. Executives asking "is this all our projects?" must get an honest answer immediately visible in context, not buried in a tooltip.

**Coverage rule:** Non-activity measures (member count, role count) do NOT carry the activity coverage badge — those are fully covered by the member feed. Be precise about which badge appears where.

---

## Category B — Sectioned Hub Narrative

A sticky in-page navigation bar and themed section wrappers that organize the existing 14 panels plus new v3.0 panels into a legible story arc for non-technical audiences.

### B1. Sticky In-Page Section Nav
**Classification:** TABLE-STAKES
**Complexity:** Medium
**Depends on existing:** Page scroll model (`h-full overflow-y-auto` on the page root div — verified in `page.tsx` line 12); no new layout primitives needed

What it is: a horizontal sticky nav bar pinned below the existing page header (not the global sidebar). Contains named section anchors. Clicking a section name scrolls to that section's heading via the browser native `scrollIntoView`. On scroll, the active section highlights (IntersectionObserver on section headings).

**Sections (ordered):**
1. Overview (KPI strip + project picker + filter banner — already at top)
2. People & Roles (role/company donuts, folder activity by role)
3. Activity (timeline, calendar heatmap, behavior-mix, hottest files)
4. Folders (terrain, folder reach & exposure)
5. Coordination (Model Coordination panel, issues)
6. Interconnections (Sankey, chord) — new in v3.0
7. Scenario Explorer — new in v3.0 (placed last so it does not interrupt the narrative flow; it is the "dive deeper" affordance)

**Why table-stakes:** Without the nav, the "sectioned hub story" goal is just a visual separator exercise. The nav is what makes a long scrolling page navigable for a live audience watching one presenter.

**Implementation note:** The nav is a `position: sticky` bar inside the page scroll container (not fixed to viewport). It should collapse to horizontal scroll if viewport is narrower than all section labels — this page is primarily used on a wide projector.

**Anti-pattern:** Do not use Next.js `router.push` with hash links — that triggers a full navigation. Use `document.getElementById(id).scrollIntoView({ behavior: "smooth" })` inside the click handler.

---

### B2. Section Wrapper Components
**Classification:** TABLE-STAKES
**Complexity:** Low
**Depends on existing:** `PremiumSurface`, `Reveal`, `SectionHeader` (already defined locally in `AccessAnalysisCharts.tsx`)

What it is: a `SectionBlock` component that wraps a group of panels under a section heading (icon + title + subtitle + optional section-level coverage badge). Provides the `id` anchor for scroll targeting.

**Design:** Thin visual separator line or gradient accent above the section title — not a full card around the entire section (that would produce card-inside-card layout, which is explicitly forbidden in UI defaults). The section wrapper is structural, not decorative.

**Why table-stakes:** Section anchors are required by B1. The section wrapper standardizes the heading appearance and the anchor ID naming so scroll targeting is reliable.

---

### B3. Hub-Wide Default Landing View
**Classification:** TABLE-STAKES
**Complexity:** Low
**Depends on existing:** Existing KPI strip (`StatStrip` with `kpis` array in `AccessAnalysisCharts.tsx`) + `ProjectPicker` already default to all projects selected

What it is: when the page loads with no project filter active and no cross-filter active, the page presents a hub-wide summary: all 428 projects, all panels showing aggregate counts. This is already mostly true (the `selected` state initializes to all options). The v3.0 requirement is to frame this explicitly as the "hub story" — a page header update describing the coverage context.

**Coverage honesty rule:** The page header description must include the coverage context, e.g., "Across 428 admin-accessible projects (of 1,152 total)." This is descriptive fact, not a warning.

**Why table-stakes:** The sectioned layout only makes sense if the default state tells a complete story. A page that opens with no data or requires immediate manual configuration fails the live demo goal.

---

### B4. Section-Level Coverage Badges
**Classification:** TABLE-STAKES
**Complexity:** Low
**Depends on existing:** `CoverageBadges.tsx` — `ActivityCoverageBadge`, `CoverageChips`, `FullyCoveredBadge`

What it is: each section that contains activity-derived panels carries an `ActivityCoverageBadge` inline with the section heading. Folder-derived panels carry a folder-crawl count badge. Non-activity panels (member/role distribution) carry no badge.

**Why table-stakes:** The coverage-honest contract from v2.0 (NA-01) applies at section level too. When a non-technical executive looks at the "Activity" section, they must immediately see its data scope, not hunt for a tooltip.

---

## Category C — New View Types

### C1. Calendar Heatmap (Activity Timing)
**Classification:** TABLE-STAKES
**Complexity:** Low (ECharts 6.1.0 ships `calendar` coordinate system natively — already in `package.json`)
**Depends on existing:** `AccActivity.createdAt` (verified Prisma field); `EChart` wrapper; `ActivityCoverageBadge`
**Section placement:** Activity

What it is: a yearly calendar grid where each day cell's color encodes total activity count. When a day cell is clicked, it opens the `DrillSheet` with a breakdown of that day's activity (by action type or by user). Uses ECharts `calendar` type with `heatmap` series — zero new chart library needed.

**Granularity:** Day-level. The `AccActivity.createdAt` field provides full datetime precision. Group by `DATE(createdAt)` on the server.

**Server query:** A new `loadActivityCalendar()` view function in `lib/server/` returning `{ date: string, count: number }[]`. Single SQL group-by. Wire into `MainCharts` `Promise.all`.

**Chart behavior:**
- Empty weeks are rendered with zero-weight cells (do not hide them — the calendar grid shape itself is information: shows when data coverage starts)
- Year picker or dataZoom (ECharts built-in) to switch between years when data spans multiple years
- Color scale from theme tokens matching the amber accent already used by `ActivityTimelineChart`
- Tooltip: "N activities on [date]"

**Why table-stakes:** Activity timing is the most commonly requested executive insight ("when is the team working?"). The calendar format is immediately legible to a non-technical audience without any explanation. The data is already in `AccActivity.createdAt`.

**Coverage badge:** Show `ActivityCoverageBadge` in the panel header, wired from the same `coverage` prop already in `AccessAnalysisCharts`.

---

### C2. Behavior Mix Over Time (view/upload/edit/delete)
**Classification:** DIFFERENTIATOR
**Complexity:** Medium
**Depends on existing:** `AccActivity.rawAction` -> `classifyActivity()` in `lib/acc/activityCategories.ts` (VERIFY exact path); `EChart` stacked bar; `ActivityCoverageBadge`
**Section placement:** Activity

What it is: a stacked bar chart (per month) where each bar segment encodes a behavior category: View, Upload, Edit/Markup, Delete/Archive, Admin. Uses the existing `classifyActivity` taxonomy. Shows how the behavioral mix of the hub shifts over time — executives can see "are users mostly viewing or actively collaborating?"

**Behavior categories** (derived from `rawAction` via `classifyActivity`; VERIFY exact category names match the output of `lib/acc/activityCategories.ts`):
- View / Download
- Upload / Publish
- Edit / Markup / Comment
- Delete / Archive
- Admin / Permission

**Server query:** Extend or add alongside `loadActivityTimeline()`. Group by `(DATE_TRUNC('month', createdAt), classifyActivity(rawAction))`. The action classification can run in JavaScript post-query using the existing pure function rather than in SQL.

**Why differentiator (not table-stakes):** The calendar heatmap (C1) already answers "when" at day granularity. The behavior mix adds "what type" over time — valuable but requires the audience to know the category names. Worth building but not blocking.

**Attribution honesty:** Classification can only be as good as `classifyActivity`. The existing `AccActivity.service` attribution gap (40.7% of rows have service-level ambiguity per memory notes) means "Model Coordination" category is unreliable. Show a footnote: "Action categories are classified from rawAction; Model Coordination attribution may include Build activity."

---

### C3. Hottest Files / Models
**Classification:** DIFFERENTIATOR
**Complexity:** Medium
**Depends on existing:** `AccActivityAccds` model (verified in schema — has `objectName`, `folderId`, `folderName`); `DrillSheet` for file-level drill; `EChart` horizontal bar
**Section placement:** Activity

What it is: a top-N horizontal bar chart showing the most-accessed files or models by activity count. Uses `AccActivityAccds` (which has `objectName` and `objectType` fields). Drill on a bar -> `DrillSheet` with per-user breakdown for that file.

**Why differentiator:** Depends on `AccActivityAccds` data completeness. VERIFY: confirm how many rows are in `AccActivityAccds` for the 428-project extract after Phase 1 re-extraction. If coverage is thin, this view needs a coverage badge and may degrade gracefully.

**Empty state:** "No file-level activity data available for the selected projects. File activity requires the ACCDS activity feed to be ingested." — honest, not a spinner that never resolves.

---

### C4. Folder Reach & Exposure (Factual, No Scores)
**Classification:** TABLE-STAKES
**Complexity:** Medium
**Depends on existing:** `AccFolder` + `AccFolderPermission` (verified schema); `FolderPermissionTerrain` existing component; `PeopleDrillList` for drill
**Section placement:** Folders

What it is: a set of factual panels showing:
- **Internal vs. External access** — for each folder tier, how many members are internal vs. external. Source: `AccFolderPermission.roleId` -> `AccProjectRole` -> `AccProjectMember.companyName` cross-reference. Uses the existing `AccFolder` + `AccFolderPermission` join already powering `FolderPermissionTerrain`.
- **Who-can-reach-what** — for a selected role, which folder tiers does it have access to? Horizontal stacked bar or matrix. Source: same `AccFolderPermission` data the terrain already renders.
- **Dormant access** — roles with permissions but zero activity in the period. Already exists as `rankDormantByPeople` in `dormantActivity.ts`. Surface this more prominently in the Folders section.
- **Storage/data reach** — if `AccFolder.fileSize` and `AccFolder.fileCount` are populated (depends on Slice D folder crawl), show a treemap of storage by folder tier.

**Why table-stakes:** Folder reach is the primary "risk framing" data for executives without using the word "risk." "External company X can access 47 folders across 12 projects" is a factual statement that executives immediately understand. The data is already in the DB via `FolderPermissionTerrain`.

**Descriptive-not-prescriptive rule:** These panels state facts only. Labels: "External access" not "Permission leak." "Dormant access" not "Zombie permissions." No severity colors (no red/orange scoring). Use the zinc theme's neutral palette.

**Coverage note:** Folder data coverage depends on `AccProject.folderCrawlStatus`. Panels must show `CoverageChips` for folder-crawled projects vs. total.

---

### C5. Interconnections — Sankey (Company -> Role -> Module)
**Classification:** DIFFERENTIATOR
**Complexity:** Medium
**Depends on existing:** `EChart` Sankey series (built into ECharts 6.1.0 — verified); `AccProjectMember.companyName` + `AccProjectRole` + `AccActivity` join; `DrillSheet` for link drill
**Section placement:** Interconnections

What it is: a three-level Sankey diagram showing flow from Company -> Role -> Module. Width of each link encodes activity count. The chart answers "which companies drive activity in which roles and modules?"

**Data assembly:** Server-side join of `AccProjectMember.companyName` -> `AccProjectRole` -> activity attribution (same join chain used by `summarizeActivityByCompany` and `summarizeActivityByRole`). The triple-join produces `(company, role, module, count)` rows.

**Drill on link click:** Opens `DrillSheet` with `PeopleDrillList` for the people who make up that flow segment.

**Why differentiator (not table-stakes):** High visual impact for live demos but adds complexity in the data join and label management. The bar/donut panels already cover the same data from individual angles — Sankey adds the connective story. Worth building after the sectioned layout and presets are stable.

**Legibility rules:**
- Cap company nodes at top 10 by activity (show "Other" bucket)
- Cap role nodes at top 15
- Cap module nodes at the full taxonomy (<= 10 modules in ACC)
- Use ECharts `orient: 'horizontal'`; label fontSize minimum 11px (projector legibility)
- Color nodes by ECharts theme color palette (not hardcoded hex)

---

### C6. Interconnections — Chord / Co-occurrence Matrix
**Classification:** DIFFERENTIATOR
**Complexity:** High
**Depends on existing:** `EChart` (VERIFY: ECharts 6.1.0 includes chord diagram as `graph` series with `layout: 'circular'` — confirm before plan); `AccProjectMember` cross-project join
**Section placement:** Interconnections

What it is: a chord diagram showing firm-to-firm collaboration (which companies share project memberships) or role co-occurrence (which roles appear together on the same projects). Two sub-modes selectable via a toggle.

**Why differentiator:** High complexity, niche use case. The Sankey (C5) covers the more impactful story. The chord adds "which firms work together" which is valuable for the executive audience but can be deferred to a later milestone or shipped after C5 stabilizes.

**VERIFY:** Confirm ECharts 6.1.0 chord diagram API before planning. The `graph` series with circular layout is available in ECharts 5+, but verify axis labeling fits within the projector layout.

---

### C7. Hygiene Facts — Role Junk / Duplicates (No Severity)
**Classification:** TABLE-STAKES
**Complexity:** Low
**Depends on existing:** Existing computed role data in `AccRole` and `AccProjectRole`; `DataTable` (`components/ui/DataTable.tsx`)
**Section placement:** People & Roles

What it is: a compact `DataTable` listing roles that match junk/duplicate patterns:
- Roles with very low member counts (< 2 members across all projects) — potential orphan roles
- Roles with identical or near-identical names (duplicates across projects)
- Roles with zero activity despite active memberships (dormant roles — overlaps with C4 dormant access)

**Why table-stakes:** PROJECT.md explicitly lists "surface the already-computed junk/duplicate/outlier role facts" as an Active v3.0 requirement. The data is in `AccRole.memberCount` and `AccProjectRole`. The junk/duplicate detection is pure server-side logic, no new Prisma models needed.

**Descriptive-not-prescriptive rule:** Column headers: "Member count", "Projects", "Activity (last 12 mo)". No "Risk" or "Health Score" column. The presenter judges what to do with the facts.

**Empty state:** "No roles match junk/duplicate patterns in the current project selection." This is a positive outcome, not a bug.

---

## Anti-Features (Do Not Build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Custom dashboard builder (drag/drop panels, save layouts) | Turns the presenter tool into a BI product; scope explosion; the audience watches, they do not configure | Hardcode the section order and presets; allow only the preset picker in the explorer |
| Risk scores / severity grades | Explicitly rejected by owner ("I dont care about risk scores… I would make it myself"). Descriptive, not prescriptive. | State facts (counts, percentages, dates) and let the presenter narrate the interpretation |
| User-persisted saved presets (write to DB, per-user configurations) | This is a single-presenter tool; no user accounts drive the dashboard; adds a full CRUD surface | Hardcode named presets as TypeScript config objects in the explorer component |
| Date range filter UI (custom from/to date inputs) | The data re-extraction for v3.0 is all-time; a date filter implies iterative querying not compatible with the RSC pre-load pattern; adds UI complexity for marginal value | Show all-time data with the timeline chart (existing) for temporal navigation; the calendar heatmap handles day-level exploration |
| Export / download buttons (CSV, PNG) | Out of scope for a live-demo presentation tool; adds security surface (full dataset download) | The presenter shows the data live; screenshots of the ECharts visualizations are sufficient |
| Real-time / push updates | No live data ingestion during a workshop; DC extract is batch; would require WebSocket or SSE | The static build on :3000 is the correct model; refresh means a rebuild |
| Predictive / ML analytics | No model, no training data pipeline, no inference infra; violates the "existing Prisma DB is the source" constraint | Descriptive trends from historical data only |
| Mobile-first responsive layout for the new sections | The workshop runs on a wide projector; mobile is not a use case for this page | Ensure it does not break below lg: but optimize for projector width (>= 1280px) |
| Comments / annotations on charts | Collaboration feature; this is a read-only analytics surface | The presenter speaks the narrative; no in-app annotation |
| Cross-page navigation from chart drill (router.push) | Clicking a role in the explorer should NOT navigate to /template-mty; that breaks the in-page narrative flow | All drill stays in DrillSheet within the page |
| New Prisma models / DB tables for explorer presets | Presets are hardcoded UI config, not persistent data | TypeScript objects in an explorerPresets.ts file |

---

## Feature Dependencies

```
B1 (Sticky Nav) -> B2 (Section Wrappers) -> required before new panels land in sections
A6 (Named Presets) -> A1 (Measure Picker) + A2 (Grouping Picker) + A3 (Auto Chart Type)
A5 (Drill) -> DrillSheet + PeopleDrillList (already exists)
C1 (Calendar Heatmap) -> loadActivityCalendar() new view in lib/server/
C2 (Behavior Mix) -> classifyActivity() from lib/acc/activityCategories.ts (VERIFY exact path)
C3 (Hottest Files) -> AccActivityAccds data completeness (data re-extraction Phase 1)
C4 (Folder Reach) -> AccFolderPermission + folder crawl coverage
C5 (Sankey) -> triple join server view; EChart Sankey series
C7 (Hygiene Facts) -> AccRole + AccProjectRole; no new data dependency
Data re-extraction (Phase 1 of milestone) -> C1, C2, C3, C4 all depend on fresh data
```

---

## MVP Recommendation for Phase Ordering

**Phase 1 (prerequisite, not a UI phase):** Data re-extraction for all 428 admin-accessible projects (all-time). This unlocks calendar heatmap, behavior mix, and hottest files to be meaningful.

**Phase 2 — Sections + Nav (structural foundation):** Build B1 (sticky nav), B2 (section wrappers), B3 (hub-wide default), B4 (section coverage badges). Reorganize existing 14 panels into the themed sections. No new analytics yet — just structure. Lowest-risk phase and immediately makes the page feel like a "story" in the workshop.

**Phase 3 — Explorer Core (table-stakes only):** Build A1 (measure picker), A2 (grouping dimension), A3 (auto chart type), A5 (drill), A6 (named presets), A7 (coverage state). With 7 hardcoded presets, the explorer is immediately useful without building the full combinatorial engine. Cross-tab (A4) deferred.

**Phase 4 — Activity Depth:** C1 (calendar heatmap), C2 (behavior mix), C7 (hygiene role facts). All three have low-to-medium complexity and high audience legibility. C3 (hottest files) goes here only if AccActivityAccds coverage is confirmed adequate after Phase 1 re-extraction.

**Phase 5 — Folder Reach + Interconnections:** C4 (folder reach), C5 (Sankey). Highest visual impact for the live demo finale. C6 (chord) deferred to v3.1 unless timeline permits.

**Defer:** A4 (cross-tab mode), C6 (chord), export buttons, custom presets.

---

## Phase-Specific Risks and Flags

| Phase topic | Likely pitfall | Mitigation |
|-------------|---------------|------------|
| Sticky nav scroll targeting | `router.push` with hash = full navigation, not in-page scroll | Use `getElementById().scrollIntoView()` inside click handler |
| Explorer state and cross-filter interaction | Explorer's slice click opens DrillSheet; main dashboard's slice click sets cross-filter — same `toggleSliceFilter` API, different behavior. Easy to confuse. | Keep explorer state locally in an ExplorerPanel component; pass `sliceFilters` and `toggleSliceFilter` as props from `AccessAnalysisCharts` but only the main panels wire back to filter updates |
| AccessAnalysisCharts bundle size | Adding explorer + new charts to the single client component that already owns cross-filter state risks bundle bloat | Use `dynamic()` import for ExplorerPanel (same pattern as `AuthorProfileDrawer`); the explorer does not need to mount on initial paint |
| Calendar heatmap ECharts config | ECharts `calendar` type requires explicit year range; if data spans 3+ years, the default single-year calendar clips silently | Add year picker or use dataZoom inside the calendar series; test with actual `AccActivity.createdAt` range first |
| Sankey cardinality | A full Company x Role x Module join without capping produces unreadable diagrams (50+ nodes) | Server-side: return only top-10 companies, top-15 roles, all modules; client: verify node count before rendering; show "Showing top N" notice |
| AccActivityAccds completeness | Hottest files (C3) depends on this table; if the all-time re-extraction did not populate it, the view will be empty | Make C3 conditional on ACCDS row count > 0; show honest empty state; do not block Phase 4 on this |
| Section nav on projector | A long nav strip may wrap on projector if section labels are verbose | Keep section labels <= 15 characters each; use `overflow-x-auto` on the nav bar as a fallback |
| Motion budget | New sections with staggered Reveal on scroll could produce repeated animation if user scrolls up/down during demo | Use `once: true` in the Reveal intersection observer so panels animate only on first entry, not on scroll re-entry |

---

## Sources and Evidence Confidence

| Claim | Source | Confidence |
|-------|--------|------------|
| ECharts 6.1.0 ships calendar, Sankey, heatmap | `package.json` line 104 | HIGH [VERIFIED] |
| `AccActivity` schema (rawAction, createdAt, projectId) | `prisma/schema.prisma` lines 542-562 | HIGH [VERIFIED] |
| `AccFolderPermission` schema | `prisma/schema.prisma` lines 529-540 | HIGH [VERIFIED] |
| `AccActivityAccds` schema (objectName, folderId) | `prisma/schema.prisma` lines 564-586 | HIGH [VERIFIED] |
| Cross-filter protocol (slice click != people sheet) | `AccessAnalysisCharts.tsx` line 119 comment | HIGH [VERIFIED] |
| DrillSheet 480px right-slide shell | `components/ui/DrillSheet.tsx` | HIGH [VERIFIED] |
| Coverage badge components | `components/CoverageBadges.tsx`, `ActivityCoverageBadge.tsx` | HIGH [VERIFIED] |
| CoverageDots per project picker row | `components/ProjectPicker.tsx` line 173 | HIGH [VERIFIED] |
| MainCharts RSC single Suspense boundary decision | `mainCharts.tsx` + `page.tsx` decomposition comment | HIGH [VERIFIED] |
| 428/1,152 project coverage cap | PROJECT.md Active section | HIGH [VERIFIED] |
| No risk scores (descriptive only) | PROJECT.md Key Decisions table, owner constraint | HIGH [VERIFIED] |
| AccRole.memberCount field | `prisma/schema.prisma` line 483 | HIGH [VERIFIED] |
| DataTable component | `components/ui/DataTable.tsx` (referenced in known-patterns.md) | HIGH [VERIFIED] |
| classifyActivity location | Path assumed from architecture pattern; `lib/acc/activityCategories.ts` | MEDIUM [VERIFY exact file name before plan] |
| ECharts chord diagram via `graph` series | ECharts 6.x documentation pattern | MEDIUM [VERIFY API before phase plan] |
| AccActivityAccds row count / coverage adequacy | Not yet checked — depends on Phase 1 re-extraction | LOW [VERIFY after Phase 1] |
| AccFolder.fileSize / fileCount population rate | Depends on Slice D folder crawl completion | LOW [VERIFY after Phase 1] |

---

## Dashboard Self-Check

**Context:** PROJECT.md (v3.0 milestone goals, constraints, key decisions), ARCHITECTURE.md, CONVENTIONS.md, `AccessAnalysisCharts.tsx`, `FilterBanner.tsx`, `ProjectPicker.tsx`, `CoverageBadges.tsx`, `DrillSheet.tsx`, `ActivityTimelineChart.tsx`, `mainCharts.tsx`, `page.tsx`, `prisma/schema.prisma`, `package.json`, `known-patterns.md` — all loaded and verified.

**Evidence:** Every feature claim is grounded in a verified Prisma model, component file, or explicit PROJECT.md decision. No invented routes, tRPC procedures, or packages.

**Constraints applied:**
- Additive only — no existing panels removed
- Descriptive, not prescriptive — no risk scores, no severity grades
- 428/1,152 coverage honesty on every activity-derived panel
- No new WebGL on data surfaces
- Zinc dark theme, ECharts resolved theme colors
- DrillSheet as the single drill mechanism (no parallel slide-in)
- Slice click != people sheet (locked v2.0 rule enforced)
- No user-persisted state, no custom dashboard builder scope

**Gates selected:** This is a research artifact (no code changes). Phase execution gates: `npx tsc --noEmit` before rebuild; Vitest for pure transform tests; Playwright for new interactive panel smoke tests.

**VERIFY:**
- Exact file name and export of `classifyActivity` in `lib/acc/` — path assumed from architecture pattern
- ECharts 6.1.0 chord diagram API (`graph` series + circular layout) — confirm before C6 phase plan
- `AccActivityAccds` row count after Phase 1 re-extraction — determines whether C3 (Hottest Files) is viable
- `AccFolder.fileSize` / `AccFolder.fileCount` population rate after folder crawl — determines storage treemap viability in C4
