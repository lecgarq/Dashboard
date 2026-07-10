# Requirements: LECG Dashboard — v2.3 New Graphs

**Defined:** 2026-07-02
**Core Value:** Truthful, fast analytics over the fully extracted ACC dataset — every metric derivable from the local Prisma DB and honest about coverage.
**Source:** owner direction 2026-07-02 (ROADMAP.md "v2.3 Candidates (Seeds)") scoped through `.planning/research/` (STACK/FEATURES/ARCHITECTURE/PITFALLS + SUMMARY, committed `57011f2d`).
**Prior milestone:** v2.2 Structural Refactors (8/8 shipped, tagged `v2.2`) — its requirements are preserved in `PROJECT.md` Requirements → Validated and in git HEAD.

**Overarching guardrails:** every panel follows the established registration pattern
(`lib/server/<name>View.ts` loader → pure `*Counts.ts` transform with co-located test →
`"use client"` chart via `@/components/ui/EChart` → `AccessAnalysisCharts.tsx`
`<Reveal><PremiumSurface>`); zero new npm dependencies (`echarts@6.1.0` covers all
chart types); zinc theme with resolved ECharts colors; no new WebGL on data surfaces;
under-covered data labeled, never hidden; aggregates server-side SQL/`groupBy` only
(never `findMany` + JS reduce on large tables); `/users/spatial-graph` untouched;
existing characterization tests (TEST-01/02/03) stay green and byte-identical.

## v2.3 Requirements

In scope for this milestone. Each maps to a roadmap phase (numbering continues from Phase 20).

### Issue Analytics (ISSUE)

- [x] **ISSUE-01**: User can see per-project issue-fetch coverage (`ok` / `zero_issues` / `forbidden` / `error` from `AccIssueProjectFetchResult.status`) as a donut that frames trust for the issue metrics rendered beside it (TRUTH convention: coverage precedes the metric).
- [x] **ISSUE-02**: User can see issues over time (histogram/timeline on `AccIssue.createdAt`, full 17,360-issue set — not just the coordination-classified subset), following the existing activity-timeline visual pattern.
- [x] **ISSUE-03**: User can see issues by status (8 verified live statuses: open, closed, completed, in_review, draft, pending, not_approved, in_progress) with the existing `onSliceClick`/`activeSlice` cross-filter/drill convention.
- [x] **ISSUE-04**: Issue type/subtype GUIDs resolve locally to human-readable names — a new Prisma lookup table populated by a one-time APS issue-types metadata backfill (existing 3-leg auth, `acc-issues-backfill.cjs` pattern; 316 type / 515 subtype GUIDs verified live 2026-07-02). Unresolved IDs render an honest fallback label ("Unknown type"), never a raw GUID.
- [ ] **ISSUE-05**: User can see issues by type (resolved names via ISSUE-04) as a breakdown chart with top-N + "other" bucketing.

### Permission Footprint (PERM)

- [x] **PERM-01**: User can see permission reach by role — folder count + human-readable bytes per role — charted from the already-materialized `AccFolderPermissionSummary` (22,082 rows, cron-refreshed since Ph18/19; `totalBytes` BigInt converted server-side before the RSC→client boundary).

### Engagement (ENG)

- [x] **ENG-01**: User can see dormant users bucketed by `AccProjectMember.lastSignIn` recency bands (e.g. <30d / 30–90d / 90–365d / >365d), with a labeled "never signed in" bucket for `null` values (not silently dropped).

### Pipeline Health (PIPE)

- [x] **PIPE-01**: User can see a compact, visually secondary ingest-freshness panel (latest `AccDcIngestRun`: started/ended, status, duration, projects processed) with throughput measured from `AccActivity` row counts by time window — never from `rowsByModule` (known always-zero telemetry gap). No live polling (static per-page-load read).

## Future Requirements

Tracked but **not** in the v2.3 roadmap.

Deferred from the v2.3 seed pool (research-flagged design work required first):

- **Folder storage treemap** — `AccFolder` rollups; needs depth-cap / leaf-rollup UX design (unreadable-treemap failure mode).
- **Permission tier × folder-depth heatmap** — new aggregation against the OOM-hardened `folderPermQuery.ts` path; needs its own perf regression test before scheduling.
- **Activity verb/object-type breakdown** — `AccActivityAccds` facets; needs top-N bucketing design; must carry the ~12-mo ACCDS floor label; must read raw columns (not spatial-graph taxonomy helpers — BND-03 boundary risk).
- **Provisioned-vs-active module coverage** — needs module-key vocabulary alignment (`products` Json vs activity module labels) or the "gap" is a labeling artifact; strictly no $-cost framing.
- **`/template-mty` variants** — footprint/storage panels could get MTY-scoped versions; deferred with their parents.

Carried forward from v2.2's deferred seeds:

- **SVC-01**: `service`-override classification refinement (~966 clash-issue rows). Needs a classification design decision.
- **Spatial-graph milestone**: the deferred `/users/spatial-graph` concerns (CONCERNS §3, §8.2/8.3).
- **DC-01**: unlock the 724 Data-Connector-403 projects via APS Account Admin provisioning (external).
- **DC-02**: per-project roles/modules via the DC CSV `activity_in_module` / `total_activity` join.
- **Per-folder terrain projection**: only if terrain read cost becomes a concern (Ph19 boundary note).

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Live-refresh / auto-polling freshness panel | Contradicts the "no manual sync UI" convention; `AccDcIngestRun` only changes once per cron cycle |
| License-cost / $-value framing on any chart | No billing data in the Prisma DB — any $-figure would be invented (Evidence Standard violation) |
| Kanban/board view for issues | Read-only analytics dashboard; boards imply write affordances this product doesn't have |
| CSV export / audit-log download UI | Duplicates Data Connector exports; new file-generation surface out of milestone shape |
| Recursive folder-tree browser UI | Duplicates ACC's native file browser; scope explosion beyond "chart panel" |
| `/users/spatial-graph` changes | Standing out-of-scope boundary (own future milestone) |
| New WebGL on data surfaces | Standing PROJECT.md constraint |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ISSUE-01 | Phase 20 | Complete |
| ISSUE-02 | Phase 21 | Complete |
| ISSUE-03 | Phase 21 | Complete |
| ISSUE-04 | Phase 22 | Complete |
| ISSUE-05 | Phase 22 | Pending |
| PERM-01 | Phase 20 | Complete |
| ENG-01 | Phase 20 | Complete |
| PIPE-01 | Phase 20 | Complete |

**Coverage:**

- v2.3 requirements: 8 total
- Mapped to phases: 8 (100%)
- Unmapped: 0

Phase 23 (Workshop Curation & Milestone Close) carries no new requirement mapping — it is
the milestone-closing curation/verification gate covering all 8 requirements collectively
(see `ROADMAP.md` Phase 23 Goal).

---
*Requirements defined: 2026-07-02*
*Last updated: 2026-07-02 after roadmap creation (8/8 requirements mapped to Phases 20-22; Phase 23 closes the milestone) — see `.planning/ROADMAP.md`*
