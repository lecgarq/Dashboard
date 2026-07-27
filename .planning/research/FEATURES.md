# Features Research: v2.3 New Graphs

**Domain:** BIM/VDC admin analytics (ACC-adjacent internal dashboard) — new ECharts panels for `/access-analysis` and `/template-mty`
**Researched:** 2026-07-02
**Confidence:** MEDIUM (chart-behavior patterns are well-attested across ACC Insight / BIM 360 Account Analytics / Procore / generic data-pipeline-monitoring precedent; several field-level specifics are [VERIFIED] against this repo's own Prisma schema and loader precedent, not against Autodesk's UI directly)

## Scope Note

This is a **feature-shape** research pass for 9 candidate charts already scoped in `ROADMAP.md` "v2.3 Candidates (Seeds)". It groups them into 4 coherent categories, rates complexity, and flags dependencies/pitfalls found by reading this repo's own schema and existing loader precedent (`coordinationByProjectView.ts`, `acc-issues-backfill.cjs`) alongside external research on how comparable BIM/VDC and construction-tech admin dashboards (ACC Insight, BIM 360 Account Analytics, Procore Analytics, generic RFI/issue-tracker funnels, generic data-pipeline-monitoring UIs) present these same chart archetypes.

## Feature Landscape

### Category 1 — Issue/Workflow Analytics

Covers: **AccIssue funnel** (issues over time/status/type) and **issue-fetch coverage donut**.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Issues-over-time timeline (createdAt histogram) | ACC Insight's own issue dashboards and every RFI/issue tracker (ConstructionOnline, Procore, Autodesk BIM 360) lead with a time-series count; this repo already has the visual language for it (existing activity timeline). | LOW | `AccIssue.createdAt` [VERIFIED schema.prisma:850]. Reuse the existing `activityByTime`-style timeline pattern; add a "Data available from" floor caption only if issues have their own coverage gap (VERIFY: does `AccIssue.createdAt` have a known floor like ACCDS activity does?). |
| Issues-by-status breakdown (funnel/bar) | Every construction issue/RFI dashboard reviewed (ConstructionOnline RFI Breakdown: Overdue/Waiting/Resolved; generic Jira-style funnels) treats status-breakdown as the single most expected chart — it is the "state of the work" view. | LOW | `AccIssue.status` [VERIFIED schema.prisma:846] is a free-text string (nullable) from the raw ACC API, NOT a closed enum in this schema — confirm actual distinct values before choosing bucket labels (`groupBy(['status'])` first, per the `coordinationByProjectView.ts` precedent at line 27-29 which already does `groupBy(["projectId","status"])`). |
| Cross-filter click-through from issue chart to a filtered list/drawer | Constructiononline explicitly notes: "Clicking into the individual dashboard segments automatically filters the selected RFI view" — this is the expected interaction, not a nice-to-have, for any issue-status chart. | LOW-MED | This dashboard's existing convention already wires `onSliceClick`/`activeSlice` cross-filter for donuts (role/company/module) — apply the same `FilterBanner` pattern rather than inventing a new interaction. |
| Issues-by-type breakdown | Table stakes in generic issue trackers, BUT: | MED-HIGH | **Pitfall (repo-grounded):** `AccIssue.issueTypeId` / `issueSubtypeId` [VERIFIED schema.prisma:847-848] are raw APS GUIDs. `scripts/acc-issues-backfill.cjs:224` stores them verbatim from the raw API payload (`it.issueTypeId`) with **no local name-resolution table** in this schema (grep of `lib/` and `scripts/` found zero `issueType`-name lookups). Charting "by type" today would render bare GUIDs as category labels — a direct violation of this repo's own TRUTH-01 precedent ("Unknown project", never a raw GUID). Either (a) call the ACC issue-types metadata endpoint to resolve names (a new external call, arguably out of "no new data sources"), or (b) scope "by type" out of MVP and ship status+time only, or (c) group by `rawJson`-embedded label if the raw payload happens to include one (VERIFY: inspect a sample `rawJson` row for an embedded type name before committing to this slice). |
| Issue-fetch coverage donut (ok / zero_issues / forbidden / error) | Not a native ACC Insight feature — this is domain-specific to how this dashboard's data was collected (a scraped/DC-derived issue extraction, not a live API pass-through). Its closest analogue is the DC-coverage badges this dashboard already ships (TRUTH-01/TRUTH-04). | LOW | `AccIssueProjectFetchResult.status` [VERIFIED schema.prisma:888, enum-like string `ok\|zero_issues\|forbidden\|error`] is a clean groupBy target. `AccIssueFetchRun` already surfaces `projectsOk`/`projectsForbidden`/`coordinationCount` and is read today by `coordinationByProjectView.ts` (lines 33-36) — this candidate is a straightforward widen of an existing loader, not new plumbing. |

**Dependency note:** the coverage donut should render adjacent to (or precede) the issue funnel, not after — construction dashboards and this repo's own TRUTH convention both treat "how much of this can I trust" as a prerequisite frame for the metric itself, not an afterthought footnote.

### Category 2 — Permission & Storage Footprint

Covers: **permission footprint by role**, **folder storage treemap**, **permission tier × folder-depth heatmap**.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Permission footprint by role (folder count + bytes) | BIM 360/ACC Account Analytics' own "Analytics" tab already shows member/project/company summary cards; a role-scoped reach summary is the natural admin question ("what can this role actually touch?") that ACC's native UI does NOT answer directly (Autodesk's own admin surfaces permissions per-folder, not aggregated per-role) — this is a genuine differentiator, not a copy of a native feature. | LOW | `AccFolderPermissionSummary` [VERIFIED schema.prisma:549-561] already has exactly the needed shape (`projectId`, `roleId`, `folderCount`, `totalBytes: BigInt`, `permTypes: String[]`) and is populated + refreshed by cron (Ph18/19, shipped). Zero new backend work — purely a charting task. Note: `totalBytes` is `BigInt`; ECharts/JSON-serialization needs `Number()` conversion (watch overflow only past ~9 PB, not a real risk here) and a human-readable byte formatter (KB/MB/GB), matching the existing storage-formatting convention if one exists (VERIFY: check for an existing `formatBytes` helper before writing a new one). |
| Folder storage treemap | Storage/file-count rollups exist in BIM 360/ACC's native file browser (per-folder, not chart form); a treemap is the standard visualization for hierarchical size data (folder→subfolder) in every dashboard/BI tool (Databricks, generic BI treemaps) reviewed. | MED | `AccFolder.fileCount` / `totalSizeBytes` / `lastModifiedTime` [VERIFIED schema.prisma:518-522] plus `parentId` for hierarchy. **Complexity driver:** ECharts treemap needs a real parent-child tree built from `parentId`, not a flat groupBy — for large projects with deep folder trees this is a non-trivial transform (recursive tree-build + depth-capping for label legibility). Cap displayed depth (e.g., 2-3 levels) and/or cap leaf count with an "N more folders" rollup bucket to avoid an unreadable thousand-leaf treemap — this is the single biggest UX risk in this category. |
| Permission tier × folder-depth heatmap (2D) | The existing 3D isometric terrain already answers this question in 3D; a 2D heatmap is the standard "same data, cheaper/clearer read" alternative — heatmaps-by-two-categorical-axes are a well-established BI pattern (matrix/heatmap is explicitly called out as a standard freshness-dashboard visualization in data-pipeline-monitoring precedent, and is directly analogous here: tier × depth instead of table × hour). | MED-HIGH | Reuses `loadFolderPermRows` (`lib/server/folderPermQuery.ts`) [per ROADMAP.md v2.3 seed table] + `AccFolder.parentId`/`fullPath` for depth bucketing. **Perf/complexity flag:** `folderPermQuery.ts` performs a raw scan pattern the codebase has spent two milestones (v2.1/v2.2) hardening against OOM (TEST-01 exists specifically to guard this query family) — a NEW consumer of this same raw path must either reuse the already-hardened aggregate shape or explicitly re-run the OOM-regression reasoning for the new grouping (tier × depth is a different aggregation than the existing terrain/summary paths, so it is not automatically covered by TEST-01/TEST-02's existing golden masters). Depth must be derived from `fullPath` (string split) or a recursive `parentId` walk — confirm which is cheaper before implementing. |

**Dependency note:** all three panels in this category share the folder-permission data family; sequencing the low-complexity permission-footprint-by-role panel FIRST validates the byte-formatting/perm-tier-labeling conventions that the other two heavier panels (treemap, heatmap) can then reuse, rather than each panel inventing its own formatting.

### Category 3 — User Engagement & Coverage

Covers: **dormant users by sign-in recency**, **activity verb/object-type breakdown**, **provisioned-vs-active module coverage**.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Dormant users by `lastSignIn` recency | Table stakes — BIM 360's own Account Admin "Members" tab surfaces a "Last Sign In" column today, and Autodesk's own support docs describe using it plus Data Connector exports specifically "to identify dormant users based on their last login dates." This dashboard is re-deriving a feature Autodesk's native admin UI already treats as baseline. | LOW | `AccProjectMember.lastSignIn` (nullable `DateTime?`) / `addedOn` [VERIFIED schema.prisma:465-466]. Bucket into recency bands (e.g., <30d / 30-90d / 90-365d / >365d / never signed in) — the "never signed in" (`lastSignIn: null`) bucket is a real, expected state (per Autodesk's own caveat that "Last Sign-in does not reflect model opens in Revit," i.e. it can legitimately be null/stale for provisioned-but-unused seats) and must be labeled, not silently dropped from the chart. |
| Activity verb/object-type breakdown | Differentiator — richer than the existing module-activity donut, closer to a raw audit-log facet view than a typical BIM 360 report (Autodesk's native activity log is a per-member export, not an aggregated verb/object chart). | MED | `AccActivityAccds.activityVerb` / `objectType` / `serviceGroup` [VERIFIED schema.prisma:591-595]. **Complexity driver:** verb/objectType are free-text-ish fields from the raw ACCDS crawl — likely high-cardinality; needs a top-N + "other" bucket, same treatment the module-donut already needed. MUST carry the same ~12-month ACCDS floor caption/tooltip this dashboard already ships on the activity timeline (TRUTH-02 precedent) — this is a hard truthfulness requirement, not optional polish, since it's the same underlying table. |
| Provisioned-vs-active module coverage | Differentiator — this is the "seat utilization" story that Procore explicitly does NOT surface natively in its base product (Procore's own docs show license/seat analytics requires the paid Power BI-backed Analytics add-on, i.e. it's a known gap in off-the-shelf construction-tech dashboards, not a solved problem this project is merely copying). | MED | `AccProjectMember.products` (Json per-module tier map) [VERIFIED schema.prisma:469] vs. `AccDcProjectUserProduct.accessLevel` [VERIFIED schema.prisma:732-741] as the "provisioned" side, cross-referenced against the existing module-activity donut's "active" side. **Complexity driver:** this is a genuine two-source join (provisioning JSON/DC table vs. activity table), not a single groupBy — needs a shared module-key vocabulary between `products` JSON keys and the activity classification's module labels (`lib/acc/activityClassification.ts` / `moduleOverrides.ts`, already extracted in Phase 10) to avoid comparing apples to oranges. **Do not present this as a cost/license chart** — there is no billing/cost data in the Prisma DB; frame it strictly as "provisioned tier vs. observed activity" (a usage-gap story), never as $-value license waste, or the claim becomes unverifiable per PROJECT.md's Prisma-DB-only constraint. |

### Category 4 — Pipeline Health

Covers: **ingest freshness/throughput panel**.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Ingest freshness / throughput panel | Not a BIM/VDC end-user feature at all — it's an operational-observability panel, closer to a data-pipeline-monitoring dashboard (Databricks-style run status/duration/last-run) than anything ACC/BIM 360/Procore ship to their own admins. For THIS dashboard specifically it is a differentiator that supports the "truthful and honest about coverage" core value, and is a natural extension of the OBS-01/OBS-02/OBS-03 observability work already shipped in v2.1 (session-health line on the `:4321` progress monitor). | LOW-MED | `AccDcIngestRun` (`startedAt`/`endedAt`, `status`, `rowsByModule`, `quotaUsed`, `projectsProcessed`) [VERIFIED schema.prisma:812-829]. **Known caveat carried from ROADMAP.md:** `rowsByModule` is a documented always-zero telemetry gap — do NOT chart it directly; measure rows/throughput from `AccActivity`/`AccActivityAccds` `createdAt` counts directly instead, joined by time window to the ingest-run's `startedAt`/`endedAt`. Keep this panel visually small/secondary (a status strip or single compact panel, not a headline chart) — for a live workshop-demo audience, "here's when our data was last refreshed" is credibility-supporting but not itself an exciting story; over-sizing it risks making the demo feel like an engineering status page rather than a BIM insight product. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Live-refresh / auto-polling for the freshness panel | "Real-time" feels more impressive in a demo | Contradicts this dashboard's own established convention ("no manual sync UI" — sync/refresh is cron-only, no live status polling) and adds client-side complexity for zero data-truthfulness benefit, since the underlying `AccDcIngestRun` rows only change once per cron cycle anyway | Static per-page-load read of the latest `AccDcIngestRun`; refresh via normal page navigation, same as every other panel |
| License-cost / $-value overlay on the provisioned-vs-active chart | "Shows ROI/waste in dollars" sounds compelling for a workshop pitch | No billing/cost data exists anywhere in the Prisma DB (PROJECT.md constraint: "New analytics must be derivable from the existing Prisma DB") — any $-figure would be invented, violating the Evidence Standard outright | Frame purely as tier-provisioned vs. observed-activity counts/percentages; let the audience draw their own cost inference verbally |
| Kanban/board view for issues (drag between status columns) | Jira/Trello-style boards are the "expected" issue UI in many people's mental model | This is a read-only analytics dashboard, not a project-management tool; a board implies write/mutate affordances this dashboard explicitly does not have (Prisma DB is analytics-only, not a live ACC issue editor) and would be a scope explosion vs. a chart panel | Status-breakdown bar/funnel chart with drill-down to a read-only filtered list, matching the existing `FilterBanner`/drill pattern |
| Per-user exportable audit-log / CSV download UI for activity verb/object breakdown | "Let me export this for offline analysis" is a common admin ask | Adds an export/file-generation surface this dashboard doesn't otherwise have, and duplicates data Autodesk's own Data Connector CSVs already provide outside this tool | Keep it a chart-only panel with drill-down to an in-app filtered list (same UX as existing donut drill-downs), not a file export feature |
| Full recursive folder-tree browser UI (expand/collapse every folder) bolted onto the storage treemap | Feels like "more complete" data exposure | Duplicates ACC's own native folder browser, and a fully-expandable arbitrary-depth tree UI is a different (heavier) feature than an analytics treemap — scope creep beyond "chart panel" | Cap treemap depth (2-3 levels) with an "N more" rollup leaf; link/drill into the existing terrain/permission views for deeper folder-level detail instead of rebuilding a tree browser |

## Feature Dependencies

```
Issue-fetch coverage donut (AccIssueFetchRun/AccIssueProjectFetchResult)
    └──informs (narrative precedent, not code dep)──> AccIssue funnel (status/time reliable framing)

AccIssue funnel "by type" slice
    └──requires──> issueTypeId/issueSubtypeId name-resolution decision (VERIFY — currently raw GUIDs, no local lookup)

Permission footprint by role (AccFolderPermissionSummary)
    └──establishes byte-formatting + perm-tier-label conventions, reused by──> Folder storage treemap
    └──establishes byte-formatting + perm-tier-label conventions, reused by──> Permission tier × folder-depth heatmap

Permission tier × folder-depth heatmap
    └──shares raw-scan risk with──> folderPermQuery.ts (already OOM-hardened for terrain/summary shapes; NEW aggregation needs its own regression check, not automatically covered by TEST-01/TEST-02)

Provisioned-vs-active module coverage
    └──requires──> existing module-activity donut's module-label vocabulary (lib/acc/activityClassification.ts / moduleOverrides.ts) to align "provisioned module key" with "charted activity module"

Activity verb/object-type breakdown
    └──carries same ~12-mo floor caveat as──> existing activity timeline (both read AccActivityAccds)

Ingest freshness/throughput panel
    └──must NOT chart──> AccDcIngestRun.rowsByModule (known-zero) — substitute AccActivity/AccActivityAccds counts by time window
```

### Dependency Notes

- **Issue-fetch coverage donut informs the AccIssue funnel:** this repo's own truthfulness convention (TRUTH-01–04, already shipped in v2.1) treats "how much can you trust this metric" as a precondition frame, not a footnote — sequence or co-locate accordingly.
- **"By type" requires a naming decision first:** this is the single highest-risk item in the whole candidate pool because it is the only one where the repo currently has NO clean path to a truthful label (raw GUID only). Resolve this before committing "by type" to any phase's success criteria — it may need to be explicitly deferred or descoped to "status + time only" for MVP.
- **Permission-footprint-by-role should ship before the treemap/heatmap:** it is by far the lowest-complexity of the three folder-permission panels (data pre-aggregated, zero new query risk) and establishes shared conventions (byte formatting, tier labeling) the two heavier panels can then reuse instead of re-deriving.
- **Heatmap reuses a query family under active OOM-hardening scrutiny:** `folderPermQuery.ts` existing tests (TEST-01/TEST-02) pin specific existing shapes (terrain rows, summary aggregate) — a genuinely new tier×depth groupBy is a new code path against a large raw table and should get its own regression test, following the same pattern (row-count bound assertion) rather than assuming existing tests cover it.
- **Provisioned-vs-active conflicts with nothing structurally**, but its truthfulness depends entirely on the module-key vocabulary alignment; get this wrong and the "gap" shown is an artifact of label mismatch, not real under-provisioning/under-use.

## MVP Definition

### Launch With (v1 — this milestone's likely core slice)

- [ ] Issue-fetch coverage donut — lowest complexity, extends an already-loaded (`AccIssueFetchRun`) pattern, and frames trust for the funnel below it
- [ ] AccIssue funnel — status + time only (defer "by type" pending the GUID-naming decision)
- [ ] Permission footprint by role — near-zero backend work (data already materialized + refreshed since Ph18/19); highest ROI-to-effort ratio in the whole pool
- [ ] Dormant users by sign-in recency — table-stakes-equivalent feature (mirrors BIM 360's own native "Last Sign In" column), low complexity, must label the null/"never signed in" bucket honestly

### Add After Validation (v1.x)

- [ ] Ingest freshness/throughput panel — valuable for credibility but secondary/operational; add once the above land and workshop feedback confirms appetite for an "under the hood" panel
- [ ] Activity verb/object-type breakdown — needs top-N/other bucketing design pass before charting; add once module-donut's existing bucketing pattern can be directly reused

### Future Consideration (v2+)

- [ ] Folder storage treemap — defer until the depth-capping/leaf-rollup UX is designed; highest visual-design risk of the pool (unreadable-treemap failure mode)
- [ ] Permission tier × folder-depth heatmap — defer until a dedicated OOM/perf regression test exists for the new tier×depth aggregation against `folderPermQuery.ts`
- [ ] Provisioned-vs-active module coverage — defer until the provisioning-vocabulary-to-activity-vocabulary alignment is explicitly designed (real risk of a misleading "gap" if module keys don't line up 1:1)
- [ ] AccIssue "by type" slice — resolve the GUID-naming question (external APS call vs. descope) before adding

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Permission footprint by role | HIGH | LOW | P1 |
| Issue-fetch coverage donut | MEDIUM | LOW | P1 |
| AccIssue funnel (status+time) | HIGH | LOW | P1 |
| Dormant users by sign-in recency | MEDIUM | LOW | P1 |
| Ingest freshness/throughput panel | LOW-MEDIUM | LOW-MED | P2 |
| Activity verb/object-type breakdown | MEDIUM | MEDIUM | P2 |
| Folder storage treemap | MEDIUM | MEDIUM | P2 |
| Provisioned-vs-active module coverage | HIGH | MEDIUM | P2 |
| Permission tier × folder-depth heatmap | MEDIUM | MED-HIGH | P3 |
| AccIssue "by type" slice | MEDIUM | HIGH (blocked on naming decision) | P3 |

**Priority key:**
- P1: Lowest-risk, highest-ROI slice — no new query-perf risk, no unresolved naming/vocabulary problems, directly mirrors an established convention in this repo or a native ACC/BIM 360 feature.
- P2: Real value, moderate design/complexity cost that should get its own small design pass (bucketing, vocabulary alignment, depth-capping) before implementation.
- P3: Either blocked on an open question (issue-type naming) or carries new query-perf risk against an already-hardened raw-scan path (heatmap) — should not be scheduled until its specific blocker is resolved.

## Competitor Feature Analysis

| Feature | ACC Insight / BIM 360 Account Analytics | Procore (base + Analytics add-on) | Our Approach |
|---------|------------------------------------------|-------------------------------------|--------------|
| Issue status/time charts | Native (Insight dashboards; risk/design/quality cards) — [CITED] learnacc.autodesk.com | Native (RFI/issue widgets across construction-tech peers generally) | Match table-stakes shape; add cross-filter drill to a filtered list per this dashboard's existing donut convention |
| Dormant-user / last-sign-in view | Native (Account Admin "Members" tab Last Sign In column; DC export used explicitly for dormancy) — [CITED] Autodesk support docs | Not directly found in search; VERIFY | Match/extend the native BIM 360 pattern; recency-bucket rather than raw-date list |
| Role-scoped permission-footprint aggregate | NOT found in ACC's native admin UI (permissions are per-folder, not aggregated per-role) | N/A | Differentiator — ship it; this is genuinely new relative to Autodesk's own admin surfaces |
| Seat/license provisioned-vs-active gap | NOT native to ACC | Requires paid Power BI-backed Analytics add-on — [CITED] Procore support docs (known gap in base product) | Differentiator — but keep strictly usage-based, no cost/$ framing, since no billing data exists in this DB |
| Ingest/pipeline freshness panel | N/A (not an Autodesk-admin-facing concept at all) | N/A | Differentiator unique to this dashboard's own truthfulness convention; keep small/secondary, not a headline panel |

## Sources

- [Construction Dashboards and Data Analytics | Autodesk Construction Cloud](https://construction.autodesk.eu/tools/dashboards-and-data-analytics/)
- [Project-Level Insight | learnacc.autodesk.com](https://learnacc.autodesk.com/insight-project-level-insight)
- [Account Analytics | BIM 360 | Autodesk Knowledge Network](https://knowledge.autodesk.com/support/bim-360/learn-explore/caas/CloudHelp/cloudhelp/ENU/BIM360D-Administration/files/About-Account-Admin/GUID-20087020-B0D4-402D-B821-CDA57B9A9814-html.html)
- [How to find active member usage information for BIM 360 | Autodesk support](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/How-to-find-active-member-usage-information-for-BIM-360.html)
- [How to generate a report with last log in activities for projects in BIM 360/ACC | Autodesk support](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/How-to-generate-a-report-with-last-log-in-activities-for-projects-in-BIM-360-ACC.html)
- [Manage Account Members | BIM 360 | Autodesk Knowledge Network](https://knowledge.autodesk.com/support/bim-360/learn-explore/caas/CloudHelp/cloudhelp/ENU/BIM360D-Administration/files/About-Account-Admin/GUID-ED8251C5-D8EE-45DF-9F96-0A7BEBF2BFD0-html.html)
- [Maximizing the Value of Project Data with Procore Dashboards — Vertex Innovations](https://vertex-us.com/insight/maximizing-the-value-of-project-data-with-procore-dashboards/)
- [Procore Analytics — Procore support](https://support.procore.com/integrations/procore-analytics)
- [Construction RFI Project Management | Autodesk Forma](https://construction.autodesk.com/tools/construction-rfi-tracking/)
- [Construction RFI Tracking Software | UDA ConstructionOnline](https://us.constructiononline.com/construction-rfi-tracking-software)
- [Data Pipeline Monitoring Dashboard | Yaro Labs](https://yaro-labs.com/blog/data-pipeline-monitoring-dashboard)
- [Data Freshness Monitoring | Streamkap](https://streamkap.com/resources-and-guides/data-freshness-monitoring)
- Repo evidence: `prisma/schema.prisma` (models `AccIssue`, `AccIssueFetchRun`, `AccIssueProjectFetchResult`, `AccFolderPermissionSummary`, `AccFolder`, `AccFolderPermission`, `AccProjectMember`, `AccActivityAccds`, `AccDcIngestRun`, `AccDcProjectUserProduct` — all line-cited above), `lib/server/coordinationByProjectView.ts`, `scripts/acc-issues-backfill.cjs`, `.planning/ROADMAP.md` "v2.3 Candidates (Seeds)", `.planning/PROJECT.md`

---
*Feature research for: LECG Dashboard v2.3 New Graphs*
*Researched: 2026-07-02*
