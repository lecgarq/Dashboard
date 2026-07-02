# Project Research Summary

**Project:** LECG Dashboard - v2.3 "New Graphs"
**Domain:** New ECharts analytics panels on an existing internal BIM/VDC dashboard (/access-analysis + /template-mty), sourced entirely from already-populated but currently-unvisualized Prisma models
**Researched:** 2026-07-02
**Confidence:** HIGH

## Executive Summary

v2.3 is a pure charting milestone, not a data-collection milestone: all 9 candidate panels read Prisma models that are already populated (some materialized specifically for this purpose in v2.2, e.g. AccFolderPermissionSummary) and render through an already-proven registration pattern (lib/server/<name>View.ts loader -> pure *Counts.ts transform -> "use client" ECharts component -> mainCharts.tsx Promise.all -> AccessAnalysisCharts.tsx orchestrator). No new npm dependencies are needed: echarts@6.1.0 already ships treemap, heatmap, funnel, and calendar series natively, and the canonical components/ui/EChart.tsx wrapper already handles zinc dark-theme injection for any new series type.

The recommended approach is to build in dependency/risk-ordered waves rather than feature-request order: start with the three panels that read small, already-materialized tables with zero query risk (permission footprint by role, ingest freshness, issue-fetch coverage donut), then the issue funnel (small table, new groupBy shapes), then member-scale panels needing a small vocabulary-mapping step (dormant users, provisioned-vs-active coverage), then panels that reuse shared, test-pinned query modules (permission-tier x folder-depth heatmap via folderPermQuery.ts), and finally the two panels touching the largest tables or riskiest transforms (activity verb/object breakdown against 4.55M rows; folder storage treemap needing a hierarchy walk). This ordering front-loads near-zero-risk wins and defers the two genuinely open questions - the AccIssue "by type" GUID-naming problem and the heatmap's need for its own OOM-regression test - until they can be deliberately resolved rather than rushed.

The dominant risk category is not "will it work" but "will it stay honest and stay fast": several fields look like obvious data sources but are known traps. AccDcIngestRun.rowsByModule is a confirmed always-zero field, AccFolderPermissionSummary.totalBytes is a BigInt that crashes RSC serialization if not converted, and the historical "428/1,152" DC-coverage figure was already corrected once and must not be reintroduced. Query-perf risk concentrates on AccActivityAccds (4.55M rows) and AccFolderPermission (~6M rows): every new loader touching either must aggregate server-side (groupBy/$queryRaw), never findMany() plus JS-reduce, mirroring the TEST-01 guardrail already proven in v2.1/v2.2. Finally, /access-analysis already renders 15 panel surfaces; shipping all 9 new ones flat and always-visible would dilute the workshop narrative, so a final curation/grouping pass is a required phase, not an afterthought.

## Key Findings

### Recommended Stack

Zero new dependencies. echarts@6.1.0 (installed, peer-compatible with echarts-for-react@3.0.6) natively supports every series type the 9 panels need (treemap, heatmap + visualMap, funnel, bar/line/pie). The one genuine integration gap: lib/colors/echartsTheme.ts's mergeEChartsTheme does not auto-theme visualMap/calendar components - the tier x depth heatmap (the only panel needing visualMap) must supply an explicit zinc-safe gradient (e.g. zinc-800 to indigo-500 to amber-400) rather than ECharts' default blue-white ramp.

**Core technologies:**
- echarts@6.1.0 (installed) - chart rendering, all needed series types built in, no plugin packages required
- echarts-for-react@3.0.6 (installed) - React wrapper, peer range explicitly covers 6.1.0
- components/ui/EChart.tsx (in-repo, canonical) - theme-aware wrapper every new panel must render through; do NOT use the legacy app/(dashboard)/access-analysis/components/EChart.tsx
- date-fns@4.1.0 (installed) - date bucketing for timeline/recency panels
- roleColors.ts (in-repo) - reuse for any role-keyed dimension instead of inventing a new palette

### Expected Features

**Must have (v1 - lowest risk, highest ROI):**
- Permission footprint by role - near-zero backend work, AccFolderPermissionSummary already materialized (22,082 rows) by Ph18/19
- Issue-fetch coverage donut - extends the existing AccIssueFetchRun/AccIssueProjectFetchResult read already used by coordinationByProjectView.ts
- AccIssue funnel - status + time only for v1; defer "by type" (raw GUIDs, no name-resolution table exists)
- Dormant users by sign-in recency - mirrors BIM 360's own native "Last Sign In" pattern; must honestly label the "never signed in" (lastSignIn: null) bucket

**Should have (v1.x, after validation):**
- Ingest freshness/throughput panel - credibility-supporting but secondary; keep visually small
- Activity verb/object-type breakdown - needs top-N/other bucketing design before charting

**Defer (v2+, blocked on open design questions):**
- Folder storage treemap - defer until depth-capping/leaf-rollup UX is designed (unreadable-treemap risk)
- Permission tier x folder-depth heatmap - defer until a dedicated OOM/perf regression test exists for the new aggregation
- Provisioned-vs-active module coverage - defer until the products JSON to ModuleId[] vocabulary alignment is designed
- AccIssue "by type" slice - resolve GUID-naming (external APS call vs. descope) first

**Anti-features (explicitly reject):** live-refresh/polling for the freshness panel (contradicts "no manual sync UI" convention), any dollar-cost/license-value framing (no billing data exists in the Prisma DB), a Kanban/board view for issues (this is read-only analytics, not a PM tool), CSV export UI, and a fully-expandable recursive folder-tree browser bolted onto the treemap.

### Architecture Approach

Both target pages follow an identical, already-proven pipeline: an async RSC (mainCharts.tsx for access-analysis, page.tsx for template-mty) fans out a Promise.all of lib/server/<name>View.ts loaders, each producing a small serializable shape via server-only Prisma/raw-SQL; a pure, unit-tested *Counts.ts module (co-located __tests__/) transforms raw rows into chart-ready summaries; a "use client" components/<Name>Chart.tsx renders through the canonical EChart wrapper; and a client orchestrator (AccessAnalysisCharts.tsx / TemplateAnalysisCharts.tsx) wires everything into <Reveal><PremiumSurface> sections plus an optional kpis[] strip.

**Major components:**
1. lib/server/<name>View.ts - server-only loader, in-process 5-min TTL cache, must aggregate in Postgres (never findMany()+JS-reduce) for any large table
2. <name>Counts.ts + co-located test - pure DB-free transform, the established unit-testable seam
3. mainCharts.tsx (+ AccessAnalysisCharts.tsx) - the two files every one of the 9 candidates touches; the cross-filter bus (sliceFilters/applySliceFilters) only recognizes "role"/"company" today, so new dimensions default to project-picker-only filtering unless a phase explicitly extends applySliceFilters
4. folderPermQuery.ts::loadFolderPermRows - the single shared, test-pinned owner of the AccFolderPermission join; new consumers (the heatmap) must import it, never duplicate or edit its return shape

Recommended build order (from ARCHITECTURE.md, risk-graded): Wave A (permission footprint, ingest freshness, issue-fetch coverage - trivial risk, small/materialized tables) then Wave B (issue funnel) then Wave C (dormant users, provisioned-vs-active - member-scale tables + vocabulary mapping) then Wave D (tier x depth heatmap - shared-query reuse) then Wave E (activity verb/object breakdown, folder storage treemap - largest tables / hardest transforms, done last for isolation).

### Critical Pitfalls

1. **Client-side/unindexed aggregation reopens the 4.55M-row OOM class** - every new loader touching AccActivityAccds/AccActivity/AccFolder must use groupBy/$queryRaw, never findMany()+JS-reduce; add a row-count-bound Vitest test in the same phase as the loader.
2. **Ingest-freshness panel must not chart AccDcIngestRun.rowsByModule** - confirmed always-zero; substitute AccActivity/AccActivityAccds counts joined by ingestRunId/time window.
3. **AccFolderPermissionSummary.totalBytes is BigInt** - convert to Number/formatted string inside the loader, never in the client component, or RSC serialization crashes.
4. **mainCharts.tsx's Promise.all fan-out must not grow unbounded** - currently 8 entries; consolidate related loaders (e.g. one issueAnalyticsView.ts for multiple issue cuts) once 3+ new loaders share a data domain, and re-measure page load time per wave.
5. **Never reintroduce the stale "428/1,152" DC-coverage figure** - already corrected once (Ph11 TRUTH-01) to ~550/~1,153 via dcCoverageView.ts; any new coverage caption must call a live loader, never a literal.
6. **Panel overload dilutes the workshop story** - /access-analysis already has 15 panel surfaces; a dedicated curation phase (grouping/expand-collapse, above-the-fold cap) is required after all new panels land, not automatic.

## Implications for Roadmap

Based on combined research, suggested phase structure (5 phases matching the architecture-recommended waves, sequenced cheapest/most-isolated to largest-table/most-coupled):

### Phase 1: Foundation Wins - Permission Footprint, Ingest Freshness, Issue Coverage
**Rationale:** All three read already-small or already-materialized tables (22,082-row AccFolderPermissionSummary, 72-row AccDcIngestRun, per-run AccIssueProjectFetchResult) with zero new query risk and no shared-file contention beyond mainCharts.tsx/AccessAnalysisCharts.tsx. Establishes the byte-formatting (BigInt to Number) and coverage-labeling conventions the rest of the milestone reuses.
**Delivers:** Permission-footprint-by-role bar chart, ingest freshness/throughput panel (using AccActivity/ingestRunId, not rowsByModule), issue-fetch coverage donut (4-bucket status, sourced from the latest AccIssueFetchRun).
**Addresses:** FEATURES.md P1 items (permission footprint, issue-fetch coverage) plus the P2 freshness panel pulled forward for shared-convention value.
**Avoids:** Pitfall 2 (rowsByModule lie), Pitfall 3 (BigInt crash), Pitfall 5 (stale coverage figure).

### Phase 2: Issue Funnel (Status + Time)
**Rationale:** Small table (approximately 14k rows, two orders of magnitude below AccActivityAccds), straightforward sibling of Phase 1 coverage donut, but needs its own groupBy shapes - sequenced right after Phase 1 so it can reuse the coverage-donut framing precedent (trust before metric).
**Delivers:** Issue funnel chart (status breakdown plus date_trunc month timeline), explicitly deferring the by-type slice pending a GUID-naming decision.
**Uses:** coordinationByProjectView.ts groupBy (projectId, status) pattern as the direct analog, minus the isCoordination filter, plus activityTimelineView.ts date_trunc idiom for the time cut.
**Implements:** New lib/server/issueFunnelView.ts plus issueFunnelCounts.ts plus IssueFunnelChart.tsx, following the standard registration pattern.

### Phase 3: Member-Scale Panels - Dormant Users and Provisioned-vs-Active Coverage
**Rationale:** Both touch AccProjectMember (tens-of-thousands rows, not multi-million); sequencing dormant-users first lets provisioned-vs-active reuse a freshly-exercised AccProjectMember loader plus the products JSON to ModuleId array vocabulary-mapping helper it additionally needs.
**Delivers:** Dormant-users-by-sign-in-recency chart (with an explicit Never-signed-in bucket for null lastSignIn) and provisioned-vs-active module coverage chart (framed strictly as usage-gap, never cost/license framing).
**Addresses:** FEATURES.md P1 (dormant users) and P2 (provisioned-vs-active, a genuine differentiator vs ACC native admin UI).
**Avoids:** the null-lastSignIn silent-drop UX pitfall; the module-vocabulary-mismatch risk that would otherwise produce a misleading gap.

### Phase 4: Permission Tier x Folder-Depth Heatmap
**Rationale:** Reuses folderPermQuery.ts loadFolderPermRows, a shared module already guarded by byte-identical golden-master tests (TEST-01/02/03) from v2.1/v2.2 - sequencing this after Phase 3 means the team is freshly re-familiarized with the folder-permission code area (from Phase 1 permission-footprint work) before touching this test-pinned surface.
**Delivers:** 2D ECharts heatmap (tier x depth), an additive query variant (new exported function importing loadFolderPermRows, never editing it in place), plus a new aggregate-bound regression test specific to this grouping (not automatically covered by existing pins).
**Implements:** lib/server/folderPermHeatmapView.ts (imports, does not fork, the shared join).
**Avoids:** Pitfall 8 (golden-master breakage) - explicit gate: npm test must stay green with zero edits to existing expected-value blocks.

### Phase 5: Largest-Table Panels - Activity Verb/Object Breakdown, Folder Storage Treemap, Workshop Curation
**Rationale:** Both remaining candidates touch the largest tables (AccActivityAccds 4.55M rows; AccFolder 415,908 rows) or need the most complex transform (hierarchy walk for the treemap); doing them last isolates any load-time regression to a single phase, easy to bisect. This phase also folds in the mandatory curation pass, since by this point all 9 panels exist and the cumulative panel-count question can be answered concretely rather than speculatively.
**Delivers:** Activity verb/object-type breakdown (server-side groupBy, top-N plus other bucketing, reusing the dataFloor/12-month-floor caption pattern; built directly off raw AccActivityAccds columns, NOT via activityClassification.ts spatial-graph-adjacent classifier), folder storage treemap (depth-capped 2-3 levels, N-more-folders rollup), and a final panel-count/grouping review across all 24 (15 existing plus 9 new) access-analysis surfaces.
**Uses:** Proven moduleActivityView.ts/activityTimelineView.ts groupBy pattern for the verb breakdown; folderActivityView.ts buildProjectNameMap/resolveProjectName helpers for the treemap.

### Phase Ordering Rationale

- Ordering is risk-graded by table size and shared-module coupling (per ARCHITECTURE.md explicit wave recommendation), not by feature-request priority - this front-loads near-zero-risk wins and pushes the two genuinely open design questions (issue by-type naming, heatmap dedicated perf test) to the phases where they can be deliberately resolved.
- Phase 1 deliberately batches 3 candidates because they share almost no file surface beyond mainCharts.tsx/AccessAnalysisCharts.tsx and all read tables the codebase has already proven safe (materialized or trivially small).

- Phase 4 is isolated on its own because it is the only remaining candidate touching a test-pinned shared module (folderPermQuery.ts) - bundling it with anything else risks conflating a golden-master regression with an unrelated change.
- Phase 5 intentionally bundles the workshop-curation gate with the two heaviest panels, since PITFALLS.md is explicit that curation must happen after all new panels are built, not per-panel - doing it earlier would require re-litigating panel count after every subsequent phase.
- The AccIssue by-type slice and provisioned-vs-active cost-framing anti-feature are treated as explicit non-goals within their phases, not silently dropped - plan-phase should carry these constraints forward into each phase UAT criteria.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (heatmap):** needs its own perf/regression-test design pass against folderPermQuery.ts before implementation - TEST-01/02/03 do not automatically cover a new tier x depth aggregation shape.
- **Phase 5 (activity verb/object breakdown):** needs a top-N/other bucketing design decision (cardinality of activityVerb/objectType/serviceGroup should be sampled first) and explicit confirmation that no import path touches activityClassification.ts spatial-graph-coupled helpers.
- **Phase 5 (folder storage treemap):** needs a depth-capping/leaf-rollup UX decision before implementation - this is a design question, not a data question.

Phases with standard patterns (skip research-phase, proceed straight to plan-phase):
- **Phase 1:** all three panels have a directly analogous existing loader (coordinationByProjectView.ts, dcCoverageView.ts-style direct read); zero new query risk.
- **Phase 2:** coordinationByProjectView.ts plus activityTimelineView.ts together fully specify the shape needed.
- **Phase 3:** moduleAccess.ts (MTY analog) plus dormantActivity.ts (existing dormant concept, different dimension) give enough precedent; the main task is careful null-bucket handling and vocabulary alignment, both already documented above.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified directly against installed package.json/node_modules versions and the in-repo EChart.tsx/echartsTheme.ts wrappers; no new dependencies needed, low uncertainty |
| Features | MEDIUM | Chart-archetype expectations are well-attested against ACC Insight/BIM 360/Procore precedent, but several field-level specifics (exact row counts, issueTypeId naming resolution) are marked VERIFY rather than fully confirmed against a live DB query |
| Architecture | HIGH | Every model/field claim verified directly against prisma/schema.prisma line numbers and existing loader files read in full; two exact row counts (AccIssue, AccProjectMember) are marked VERIFY (not present in a repo artifact at research time) |
| Pitfalls | HIGH | Every pitfall is repo-grounded with a cited file/model/line - no generic ECharts/Next.js gotchas, all specific to this codebase known history (TEST-01/02/03, BigInt Ph19 deviation, rowsByModule telemetry gap, DC-coverage correction) |

**Overall confidence:** HIGH

### Gaps to Address

- **AccIssue by-type slice is explicitly unresolved** - issueTypeId/issueSubtypeId are raw APS GUIDs with no local name-resolution table in this schema; requires either a new external APS metadata call (tension with no-new-data-sources) or a v1 descope. Roadmap should NOT include this in any phase success criteria until resolved.
- **Exact row counts for AccIssue and AccProjectMember** are not present in .planning/STATE.md census as read - reasoned estimates (tens of thousands, well below AccActivityAccds) are used for risk-grading, but the assigned phase should re-verify with a quick count query before finalizing loader design.
- **Whether the tier x depth heatmap replaces or sits beside the existing 3D Folder Permission Terrain** (a 2D/3D toggle vs a standalone new section) is an open integration-point design call, not resolved by research - flag for discuss-phase.
- **Whether the issue-fetch coverage donut extends coordinationByProjectView.ts existing CoordinationByProjectData shape in place vs a new standalone loader** is a phase-level design call (smaller diff either way) - flag for plan-phase.

## Sources

### Primary (HIGH confidence)
- C:/LECG/Dashboard/prisma/schema.prisma - all 9 candidates models/fields verified directly
- C:/LECG/Dashboard/package.json, node_modules/echarts/package.json, node_modules/echarts-for-react/package.json - exact installed versions
- C:/LECG/Dashboard/app/(dashboard)/access-analysis/mainCharts.tsx, components/AccessAnalysisCharts.tsx, projectFilter.ts - Promise.all wiring, cross-filter bus, verified in full
- C:/LECG/Dashboard/lib/server/coordinationByProjectView.ts, folderPermQuery.ts, moduleActivityView.ts, activityTimelineView.ts, activityByActorView.ts, folderActivityView.ts, dcCoverageView.ts - loader precedent, read in full
- C:/LECG/Dashboard/components/ui/EChart.tsx, lib/colors/echartsTheme.ts - canonical theme wrapper, read in full
- .planning/PROJECT.md, .planning/ROADMAP.md (v2.3 Candidates seed table), .planning/codebase/CONCERNS.md, .planning/STATE.md - planning-doc facts and live row-count census

### Secondary (MEDIUM confidence)
- Autodesk BIM 360/ACC Insight and Account Analytics documentation (learnacc.autodesk.com, knowledge.autodesk.com) - chart-archetype expectations for issue/dormant-user views
- Procore Analytics support docs - confirms seat/license-gap analytics is a known off-the-shelf gap this milestone provisioned-vs-active panel fills
- echarts.apache.org v6 upgrade guide plus feature notes - confirms treemap/heatmap/funnel/calendar have no breaking changes in v6

### Tertiary (LOW confidence)
- Prior-session project memory (project_rowsbymodule_telemetry_disconnect, Ph19 BigInt deviation note) - used to corroborate repo-grounded pitfalls, not independently re-verified in this pass beyond schema/code confirmation

---
Research completed: 2026-07-02
Ready for roadmap: yes
