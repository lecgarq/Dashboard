# Project Research Summary

**Project:** LECG Dashboard — v3.0 Access Analysis: Hub Story & Scenario Explorer
**Domain:** BIM/VDC operational analytics — ACC hub access, activity, and coordination
**Researched:** 2026-06-22
**Confidence:** HIGH (all four files grounded in verified repo source, Prisma schema, and project post-mortems)

---

## Executive Summary

v3.0 turns `/access-analysis` from a flat 14-panel scroll into a navigable, sectioned hub story with a flexible scenario explorer at its center. The approach is fully additive — no existing panel is removed — and every new capability layers on top of the RSC-loader pattern already established in v2.0: async RSC functions aggregate in `Promise.all`, heavy on-demand views use server actions, and client-side transforms stay pure and testable. The tech stack requires zero new packages: ECharts `^6.1.0` (already in `package.json`) ships Sankey, calendar heatmap, treemap, and the new ECharts 6.0 chord series natively. The scenario pivot engine aggregates server-side in a new `lib/server/scenarioPivotView.ts`, fires on-demand via `scenarioActions.ts`, and auto-selects chart type client-side via a static rule table — no BI-builder complexity.

The hard architectural prerequisite before any data-dependent view phase is DC re-extraction. The ACC Data Connector quota is ~25 requests/UTC-day; re-extracting all-time data for all 428 admin-accessible projects requires approximately 9 requests (possibly up to 18 with 403-bisect retries) spread over multiple days. All activity-dependent panels — calendar heatmap, behavior-mix, hottest files, scenario presets — are meaningless until this extraction is current. A second prerequisite is migrating `app/(dashboard)/access-analysis/moduleOverrides.ts` to `lib/acc/moduleOverrides.ts` before building the pivot engine; it fixes 4 of 6 existing dependency-cruiser boundary warnings and is the only path that lets `scenarioPivotView.ts` import the activity taxonomy without violating the lib/app boundary.

The top risks are: (1) pivot queries touching `AccFolderPermission` without SQL `LIMIT` — the v2.0 OOM incident showed this table produces 5M rows uncapped; (2) ECharts Sankey/chord cardinality blowup if node counts are not capped server-side before rendering; (3) coverage-honesty omissions on new panels — every activity-derived panel must display "428 of 1,152 projects" in-line, not in a tooltip; (4) prescriptive risk framing — no red colors, no "High Risk" labels, descriptive facts only; and (5) APS refresh-token rotation — a single-use token not persisted after an extraction run breaks the live dashboard login. All five are avoidable with the guardrails specified in PITFALLS.md.

---

## Key Findings

### Recommended Stack

No new packages required. The entire v3.0 feature set is covered by the existing `echarts@^6.1.0`, `echarts-for-react@^3.0.6`, `@tanstack/react-table`, `framer-motion`, and `next-themes` versions already in `package.json`. ECharts 6.0 (included in 6.1.0) added the native `type: 'chord'` series — this is the only new chart type that needs API verification before use (VERIFY: `ChordSeriesOption` export). `mergeEChartsTheme` in `lib/colors/echartsTheme.ts` covers tooltip and axis text injection automatically, but `visualMap`, `calendar`, `treemap` breadcrumb, and `chord`/`sankey` arc colors are caller-owned and must be wired manually using the `ECHARTS_DARK`/`ECHARTS_LIGHT` palette pattern from `ActivityTimelineChart.tsx` (lines 44–47).

**Core technologies (unchanged from v2.0):**
- `echarts@^6.1.0` — all chart rendering including Sankey, chord, calendar heatmap, treemap — already installed
- `echarts-for-react@^3.0.6` — React wrapper with built-in ResizeObserver and dispose-on-unmount; instance leak risk exists only if a chart bypasses the `components/ui/EChart.tsx` wrapper
- `lib/colors/echartsTheme.ts` — `mergeEChartsTheme`, `ECHARTS_DARK`, `ECHARTS_LIGHT`; use `ActivityTimelineChart.tsx` pattern for uncovered fields
- `next-themes@^0.4.6` — `resolvedTheme` drives `dark: bool` for all chart palette resolution
- Server Actions (`"use server"`) — the established pattern for on-demand heavy loads; use for `scenarioActions.ts`, NOT a new tRPC procedure

**Do-not-add list:** `echarts-gl`, `echarts-stat`, `d3-chord`, `recharts`, `visx`, `nivo`, any new animation library.

**Cross-agent reconciliation — ECharts dispose:** Stack says `echarts-for-react` v3 handles dispose automatically; Pitfalls warns about leak risk. These are not contradictory: the risk exists only if a component calls `echarts.init()` directly, bypassing the `EChart.tsx` wrapper. Rule: always use `EChart.tsx` wrapper, never raw `echarts.init()`.

---

### Expected Features

**Must have (table stakes):**
- B1 Sticky in-page section nav — IntersectionObserver active highlight; `scrollIntoView` not `router.push`
- B2 Section wrappers — `SectionBlock` with `id` anchors; structural, not decorative (no card-inside-card)
- B3 Hub-wide default landing — page header states "Across 428 admin-accessible projects (of 1,152 total)" as fact
- B4 Section-level coverage badges — `ActivityCoverageBadge` inline with Activity section heading
- A1 Measure picker — 3-5 measures: activity count, member count, role count, issue count
- A2 Primary grouping dimension picker — role, company, module, folder, time, action type, project, user
- A3 Auto chart-type selection — static rule table; no chart-type dropdown exposed
- A5 Drill behavior — slice click → `DrillSheet` + `PeopleDrillList`; in-memory only, zero new server round-trips
- A6 Named saved presets — 7 hardcoded TypeScript config objects; not persisted to DB
- A7 Explorer coverage state — `ActivityCoverageBadge` always visible when measure is activity-derived
- C1 Calendar heatmap — `AccActivity` grouped by date; manual `visualMap` + `calendar` color wiring required
- C4 Folder reach & exposure (factual) — internal vs external access, dormant facts, storage treemap if crawl data available
- C7 Hygiene facts — `DataTable` of junk/duplicate/outlier roles from existing `computeAllFindings()`; no severity colors

**Should have (differentiators):**
- C2 Behavior mix over time — stacked bar by action category; extend `activityTimelineView.ts` with rawAction GROUP BY
- C3 Hottest files/models — top-N `AccActivityAccds` horizontal bar; conditional on ACCDS data completeness post-extraction
- C5 Sankey (Company → Role → Module) — 3-level flow; top-10 companies, top-15 roles, all modules; "Other" bucket mandatory
- A4 Optional second grouping (cross-tab heatmap) — when both dimensions ≤ 30 categories

**Defer to v3.1:**
- C6 Chord / co-occurrence matrix — high complexity; VERIFY API before planning; Sankey covers the more impactful story
- Export/download, custom user-persisted presets, date range filter UI, real-time updates, mobile-first layout

---

### Architecture Approach

Fully additive over the existing RSC-loader pattern. `mainCharts.tsx` gains `loadPivotPresets()` and `loadRoleHygiene()` in its `Promise.all`; the seven existing loaders are untouched. Novel dimension combinations fire as server actions from `scenarioActions.ts`. Auto-chart-type logic lives client-side in `ScenarioExplorer.tsx` (static rule table). Role hygiene runs server-side in new `roleHygieneView.ts` calling `computeAllFindings()` from `lib/acc/dashboardAnalytics.ts` — currently wired only to `/users`, confirmed zero references on `/access-analysis`.

**New/modified files:**

| File | Type | Change |
|---|---|---|
| `lib/server/scenarioPivotView.ts` | NEW | Preset pivot aggregation; `import "server-only"` |
| `lib/server/roleHygieneView.ts` | NEW | Runs `computeAllFindings()`; added to `Promise.all` |
| `lib/server/activityCalendarView.ts` | NEW | `GROUP BY DATE(createdAt)`; lazy server-action candidate |
| `lib/server/hotObjectsView.ts` | NEW | `AccActivityAccds` group by object |
| `lib/server/interconnectionsView.ts` | NEW | Sankey + chord matrix from accessInstanceView rows |
| `app/(dashboard)/access-analysis/scenarioActions.ts` | NEW | `"use server"` on-demand pivot |
| `app/(dashboard)/access-analysis/components/ScenarioExplorer.tsx` | NEW | Client; rule-table chart selector |
| `app/(dashboard)/access-analysis/components/HygieneFacts.tsx` | NEW | Client; renders `DashboardFindings` |
| `app/(dashboard)/access-analysis/mainCharts.tsx` | MODIFY | Add new loaders to `Promise.all` |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` | MODIFY | Additive: new props + panels only |
| `lib/acc/moduleOverrides.ts` (moved from `app/`) | MIGRATE | Prerequisite; dep-cruiser warnings 6 → 2 |
| `lib/acc/dashboardAnalytics.ts` | NO CHANGE | Already correct |

**Pivot rule table (first-match wins):**
- activity × date → calendar heatmap
- company × role → sankey
- role × module → sankey
- company × company → chord
- folder × size → treemap
- role → pie
- company → pie
- * → bar (fallback)

**Server caps (mandatory):**
- Sankey: ≤50 nodes / ≤200 links; top-10 companies, top-15 roles, "Other" bucket in SQL
- Chord: ≤20 entities / ≤100 edges
- Treemap: ≤3 levels / ≤500 leaves
- Pivot max-groups guard: cartesian product > 2,000 cells → return warning + top-N

---

### Critical Pitfalls

1. **AccFolderPermission OOM** — Any pivot query touching `AccFolderPermission` without SQL `LIMIT` + `GROUP BY` will OOM. v2.0 incident: 5M rows, 77s, process killed. Every query against this table must cap at the Prisma/raw-query level. `PG_POOL_MAX=32` and 8 GB heap are backstops, not primary defenses.

2. **Sankey/chord cardinality blowup** — ACC has 77 roles, 428 projects, ~3,367 users. Naive cross-join produces hundreds of Sankey nodes. Server-side caps and "Other" bucket must be in the server-action spec, enforced with a unit test (adversarial input → assert ≤ cap).

3. **ECharts instance leak** — Risk exists only when code bypasses `EChart.tsx` wrapper and calls `echarts.init()` directly. Enforce wrapper rule in every chart component. Verify with Playwright canvas-count check after each chart phase.

4. **APS refresh-token rotation** — APS v2 tokens are single-use. Any DC extraction must persist both new `access_token` and `refresh_token` to DB atomically. Broke the live dashboard 2026-06-01; recovery: `node scripts/aps-login.cjs`.

5. **Coverage-honesty omission + prescriptive risk framing** — Two non-negotiable owner constraints: (a) every activity-derived panel shows "428 of 1,152 projects" in-line; (b) no label implies a verdict ("External access" not "Exposed"). Both are explicit acceptance criteria in every phase plan; verify with `rg -i "risk|danger|critical|exposed|suspicious"`.

---

## Implications for Roadmap

Phases continue from v2.0 (phases 1–7 shipped). v3.0 phases are numbered 8–14.

### Phase 8: DC Re-Extraction (Data Currency Gate)

> **CORRECTION (2026-06-22, owner):** The refresh uses the FREE ACCDS web-session crawler (`scripts/accds-activity-ingest.cjs`, session bootstrapped by `scripts/accds-login.cjs` → `AccActivityAccds`), NOT the Data Connector API. There is NO ~25/day quota, no `DC_403_BISECT`, and no APS refresh-token rotation — auth is the logged-in ACC web session (`scratch/acc-session.json`, gitignored). The DC quota/token/403 runbook in this file and in ARCHITECTURE.md §C applies ONLY to the OPTIONAL secondary DC `AccActivity` refresh. The corrected source of truth is ROADMAP.md Phase 8 + REQUIREMENTS DATA-01..04.

**Rationale:** Hard gate — all activity-dependent views are meaningless without current data. Runs in parallel with Phase 9 (no data dependency between them).

**Delivers:** All 428 projects re-extracted all-time; `AccDcBackfillProgress.earliestCovered` ≤ 2019-01-02 for all 428; zero new Unmapped actions from `diag-activity-types.cjs`.

**Key env vars:** `DC_MAX_REQUESTS=20`, `DC_403_BISECT=1` (mandatory), `DC_DAILY_SAFE_BUDGET=20`, `DC_PRIORITY_BACKFILL=1`, `DC_SKIP_ADMIN_SNAPSHOT=1` (intra-day continuation only).

**Phase gate:** `fully_backfilled = 428` AND `diag-activity-types.cjs` zero Unmapped. Do not proceed to Phases 12+ until this passes.

**Avoids:** Pitfalls 10 (quota exhaustion), 11 (token breakage), 12 (403 cascade), 8 (taxonomy drift).

**Research flag:** Standard patterns — full runbook documented in ARCHITECTURE.md §C.

---

### Phase 9: Structural Prerequisites (Parallel with Phase 8)

**Rationale:** No data dependency; can run concurrently with Phase 8. Unblocks all subsequent phases.

**Delivers:**
- `moduleOverrides.ts` migrated to `lib/acc/`; all import sites updated; dep-cruiser warnings 6 → 2
- `CoverageHonesty` UI atom — reusable component rendering "Based on N of M projects" strip
- `countDistinctUsers()` helper in `lib/acc/` — shared by all phases with people-count metrics

**Avoids:** Pitfalls 3 (OOM), 4 (coverage omission), 6 (double counting), dep-cruiser boundary violation.

**Research flag:** Standard patterns. No research phase needed.

---

### Phase 10: Sectioned Hub Narrative

**Rationale:** Pure layout work — must precede new analytics panels so they land in correct sections. Lowest risk phase; immediately makes the page feel like a navigable story.

**Delivers:** Sticky section nav (B1), `SectionBlock` wrappers (B2), hub-wide coverage header (B3), section-level coverage badges (B4). All 14 existing panels reorganized without changing their data or behavior.

**Key constraints:** `scrollIntoView({ behavior: "smooth" })` not `router.push`; no card-inside-card; section labels ≤ 15 chars; `position: sticky` inside scroll container.

**Avoids:** Pitfall 9 (prescriptive labels — section titles factual), Pitfall 13 (theme drift — no new charts this phase).

**Research flag:** Standard patterns. No research phase needed.

---

### Phase 11: Scenario Explorer Core

**Rationale:** The centerpiece. Requires Phase 9 (moduleOverrides migration) and Phase 10 (section slot). Table-stakes subset only (A1–A3, A5, A6, A7); cross-tab (A4) defers.

**Delivers:** `scenarioPivotView.ts` + `scenarioActions.ts` + `ScenarioExplorer.tsx` + mainCharts wiring. 7 hardcoded named presets. Drill on any segment → `DrillSheet`.

**Critical rules:**
- Pivot aggregation server-side only; never client-side over raw rows
- `scenarioActions.ts` server action for on-demand picks — NOT a new tRPC procedure
- Auto-chart-type is a static rule table — no chart-type dropdown exposed
- Any pivot touching `AccFolderPermission`/`AccActivity` must have max-groups guard (>2,000 cells → warning)
- All pivot results include `coverageNote` field; component renders it unconditionally

**Avoids:** Pitfalls 2 (cardinality), 3 (folder OOM), 4 (coverage), 1 (instance leak).

**Research flag:** Needs `gsd:plan-phase --research-phase 11` — pivot aggregation query plan against real ACC data needs verification.

---

### Phase 12: Activity Depth Views

**Rationale:** Unlocked by Phase 8 (current data) and Phase 10 (section slot). Calendar heatmap and behavior-mix extend existing loader patterns with minimal risk.

**Delivers:** C1 (calendar heatmap), C2 (behavior-mix stacked bar), C7 (hygiene facts table). C3 (hottest files) conditional on `AccActivityAccds` row count > 0 post-Phase 8.

**Before speccing calendar heatmap:** Run `SELECT MIN(createdAt), MAX(createdAt), COUNT(*) FROM "AccActivity"` — VERIFY exact timestamp column name and actual date range. Default range to where ≥ 80% of activity falls, not current calendar year. (RESOLVED: timestamp column is `AccActivity.createdAt`, indexed by autodeskId/userEmail/projectId + createdAt DESC.)

**Attribution honesty:** Behavior-mix must include footnote: "Model Coordination attribution may include Build activity." Every activity loader returns `{ data, attributionQuality: { resolved: N, unresolved: M } }`.

**Role hygiene:** `roleHygieneView.ts` calls `computeAllFindings()` server-side; only `DashboardFindings` prop passed to client — never `BulkAccUser[]`.

**Avoids:** Pitfalls 5 (attribution gap), 14 (calendar date mismatch), 13 (theme drift — manual calendar/visualMap color wiring).

**Research flag:** One diagnostic query before calendar spec (timestamp column name — now resolved). Otherwise standard.

---

### Phase 13: Folder Reach & Exposure

**Rationale:** Medium risk (large `folderPermissionTerrainView.ts` server file); comes after simpler activity phases stabilize the new loader pattern.

**Delivers:** C4 — internal vs external access breakdown, who-reaches-which-folder, dormant access (surfaces `rankDormantByPeople` more prominently), storage treemap if `AccFolder.totalSizeBytes`/`fileCount` populated.

**Key rules:** All `AccFolderPermission` queries use `GROUP BY` + `LIMIT`; verify response < 5s. Always `COUNT(DISTINCT email)` for people counts. Labels: "External access" not "Exposed", "Dormant access (>90 days)" not "Risk". Folder dimension in pivot: always group by tier (L1/L2), never leaf folders.

**Avoids:** Pitfalls 3 (OOM), 6 (double counting), 9 (prescriptive labels).

**Research flag:** Standard patterns. Treemap wiring follows STACK.md §6.

---

### Phase 14: Interconnections (Sankey)

**Rationale:** Highest visual impact for workshop finale. Depends on stable data and section structure from prior phases. Chord (C6) deferred to v3.1 pending API verification.

**Delivers:** C5 — Sankey (Company → Role → Module) with drill-to-people on link click. `lib/server/interconnectionsView.ts` + `buildSankeyLinks()`. Role names from `AccRole` via `mergeRoleNames()` — never `AccDcRole`.

**Sankey caps (non-negotiable):** Top-10 companies + "Other"; top-15 roles; all modules (≤10). `layoutIterations: 8–16`. Label `fontSize` minimum 11px. `lineStyle.color: 'source'` for ribbon gradient.

**Avoids:** Pitfalls 2 (cardinality — caps + unit test), 7 (AccDcRole empty).

**Research flag:** Chord API needs runtime verification (`ChordSeriesOption` export) before including in this phase. Sankey patterns are well-documented in STACK.md §2.

---

### Phase Ordering Rationale

- Phase 8 gates Phases 12–14 on data freshness; runs in parallel with Phase 9
- Phase 9 gates Phase 11 on the `moduleOverrides.ts` migration; establishes shared atoms for all downstream phases
- Phase 10 must precede Phases 11–14 so new panels land in correct section slots from day one
- Phase 11 before 12–14: pivot engine section slot and server-action pattern must be established first
- Phases 12 and 13 can run sequentially or in parallel (separate agents; no shared files)
- Phase 14 is last: widest data coverage dependency; benefits from stable section structure

> Optional finale: a light projector/perf UAT pass (mirroring v2.0's Phase 7) may be appended after Phase 14 if the owner wants a single pre-workshop acceptance gate; otherwise per-phase gates suffice.

### Research Flags

Needs research phase before planning:
- **Phase 11 (Scenario Explorer):** Pivot aggregation query plan against real ACC data (623k AccActivity rows, 5M AccFolderPermission); PivotResult discriminated union shape needs validation

Needs one diagnostic query result, then standard:
- **Phase 12 (Activity Depth):** Exact timestamp column name in `AccActivity` (RESOLVED: `createdAt`)

Standard patterns (no research phase needed):
- **Phase 8:** Full runbook in ARCHITECTURE.md §C
- **Phase 9:** File migration + helper extraction
- **Phase 10:** IntersectionObserver + scrollIntoView
- **Phase 13:** Extends existing terrain loader
- **Phase 14 (Sankey only):** Patterns in STACK.md §2; chord needs API verification first

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `package.json` verified; wrapper/theme behavior verified from source. Only gap: `ChordSeriesOption` runtime export (VERIFY) |
| Features | HIGH | All grounded in verified Prisma schema, existing components, PROJECT.md owner decisions. AccActivityAccds row count and AccFolder size are LOW pending Phase 8 |
| Architecture | HIGH | All 7 existing loaders verified; `computeAllFindings()` gap confirmed by grep; DC flag names verified from dcIngest.ts source |
| Pitfalls | HIGH | All 16 pitfalls grounded in verified repo files and MEMORY.md post-mortems (OOM incident, token breakage, AccDcRole empty, build-blocks-on-test-error) |

**Overall confidence:** HIGH

### Gaps to Address

All VERIFY items consolidated — planners must resolve before the relevant phase (several already resolved during synthesis, noted inline):

| VERIFY Item | Phase | Status / How to Resolve |
|---|---|---|
| `AccActivity` timestamp column name | 12 | RESOLVED — `createdAt` (schema.prisma:553) |
| `AccDcUser.lastSignIn` field presence | 12 | RESOLVED — present (schema.prisma:634) |
| `classifyActivity` file path and export | 12 | RESOLVED — `lib/acc/activityCategories.ts:539` |
| `AccFolder.fileCount` / `totalSizeBytes` presence | 13 | RESOLVED — present (schema.prisma:518–519), nullable until crawl |
| APS token storage model | 8 | RESOLVED — `refresh_token` on the Account model (schema.prisma:43) + `server/auth.ts` |
| `BulkAccUser[]` fields needed by `computeAllFindings()` vs DC-snapshot tables | 11/12 | Read `lib/acc/dashboardAnalytics.ts` signatures; check if `AccProjectMember` join is needed |
| `ChordSeriesOption` export from `echarts` at runtime | v3.1 (C6) | Import type in throwaway test; if missing, use `EChartsOption` with inline type assertion |
| `AccActivityAccds` row count after Phase 8 re-extraction | 12 | `SELECT COUNT(*) FROM "AccActivityAccds"` after Phase 8; gate C3 on count > 0 |
| `AccFolder` size population rate after folder crawl | 13 | `SELECT COUNT(*) FILTER (WHERE "totalSizeBytes" IS NOT NULL) FROM "AccFolder"` after Phase 8 |
| Exact attribution-gap percentage in `AccActivity` (cited 3–20%) | 12 | `SELECT COUNT(*) FILTER (WHERE "userEmail" IS NULL), COUNT(*) FROM "AccActivity"` |

---

## Sources

### Primary — HIGH confidence (verified from repo files)

- `package.json` — ECharts 6.1.0, echarts-for-react 3.0.6 version facts [VERIFIED]
- `components/ui/EChart.tsx` — wrapper lifecycle, `notMerge`, `key={resolvedTheme}` [VERIFIED]
- `lib/colors/echartsTheme.ts` — `mergeEChartsTheme` covered vs uncovered fields [VERIFIED]
- `prisma/schema.prisma` — `AccActivity` (542), `AccActivityAccds` (564), `AccDcUser` (627), `AccFolder` (506), `AccFolderPermission`, `AccRole` models [VERIFIED]
- `app/(dashboard)/access-analysis/mainCharts.tsx` — all 7 existing loader functions [VERIFIED]
- `lib/acc/dashboardAnalytics.ts` — `computeAllFindings` signatures; gap on `/access-analysis` confirmed by grep [VERIFIED]
- `lib/acc/activityCategories.ts:539` — `classifyActivity` export [VERIFIED]
- `lib/acc/dcIngest.ts` — quota mechanics, DC flag names [VERIFIED]
- `.planning/codebase/CONCERNS.md` — `moduleOverrides.ts` boundary violation priority 1 [VERIFIED]
- `ActivityTimelineChart.tsx` lines 44–47 — canonical palette pattern [VERIFIED]
- MEMORY.md post-mortems — OOM incident, APS token breakage, AccDcRole empty, build-blocks-on-test-error [VERIFIED]
- PROJECT.md — v3.0 milestone goals, owner constraints [VERIFIED]

### Secondary — MEDIUM confidence (external sources)

- apache/echarts GitHub — SankeySeries.ts, ChordSeries.ts, TreemapSeries.ts defaults
- ECharts 6.0 release handbook — chord series introduction (official)
- echarts CalendarModel.d.ts — calendar option types
- npm/GitHub echarts-for-react — ResizeObserver + dispose behavior in v3

### Tertiary — LOW confidence (depends on Phase 8 results)

- `AccActivityAccds` row count and coverage adequacy — depends on re-extraction outcome
- `AccFolder` size population rate — depends on folder crawl completion
- Exact attribution-gap percentage — needs real query against post-extraction data

---

*Research completed: 2026-06-22*
*Ready for roadmap: yes*
*Phases: 8–14 (continuing from v2.0 phases 1–7)*
