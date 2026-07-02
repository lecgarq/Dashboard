# Architecture Research — v2.3 New Graphs

**Domain:** Internal BIM/VDC ops dashboard — adding ECharts panels to two existing
Next.js 16 App Router pages (`/access-analysis`, `/template-mty`) over an
already-populated Prisma/PostgreSQL schema. No new services, no new data
sources, no new WebGL.
**Researched:** 2026-07-02
**Confidence:** HIGH for the registration pattern and all 9 Prisma model/field
claims (verified directly against `prisma/schema.prisma`, `mainCharts.tsx`,
`AccessAnalysisCharts.tsx`, and existing loader analogs). MEDIUM for two exact
row counts not present in a repo artifact (marked `VERIFY:` below).

## Standard Architecture

### System Overview (verified pipeline, `/access-analysis`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ app/(dashboard)/access-analysis/page.tsx  (RSC, <Suspense>)          │
│   └── mainCharts.tsx :: MainCharts()  — async RSC                    │
│         await Promise.all([ 8 loaders today ])                       │
├──────────────────────────────────────────────────────────────────────┤
│ lib/server/<name>View.ts   — "server-only", db.$queryRaw / groupBy   │
│   in-process TTL cache (5 min) keyed by nothing/force flag           │
├──────────────────────────────────────────────────────────────────────┤
│ app/(dashboard)/access-analysis/<name>Counts.ts  — PURE transform    │
│   co-located __tests__/<name>Counts.test.ts (Vitest, no DB)          │
├──────────────────────────────────────────────────────────────────────┤
│ app/(dashboard)/access-analysis/components/<Name>Chart.tsx           │
│   "use client", @/components/ui/EChart (theme-aware canonical        │
│   wrapper), palette via roleColors.ts or a local module palette      │
├──────────────────────────────────────────────────────────────────────┤
│ components/AccessAnalysisCharts.tsx  — "use client" orchestrator      │
│   <Reveal><PremiumSurface> + SectionHeader, sliceFilters bus,        │
│   kpis[] StatStrip, ProjectPicker `selected` Set                     │
└──────────────────────────────────────────────────────────────────────┘
```

`/template-mty` is the analogous but simpler pipeline: `app/(dashboard)/template-mty/page.tsx`
awaits its own `Promise.all` (5 loaders: `loadTemplateOverview`,
`loadTemplateFolderTerrain`, `loadTemplatePermissionAccess`, `loadTemplateRoleTree`,
`loadTemplateRoleSimilarity`) and passes everything into one client orchestrator,
`app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx`. Its data
source for members/roles is the fixed 19-member MTY template roster
(`loadTemplateOverview` in `lib/server/templateView.ts`), NOT a per-project
selection — several v2.3 candidates (issue funnel, ingest freshness, issue-fetch
coverage) don't have an MTY-scoped analog and are **access-analysis-only** for
that reason (see per-candidate table).

### Component Responsibilities (verified)

| Component | Responsibility | Verified at |
|-----------|-----------------|-------------|
| `lib/server/<name>View.ts` | Server-only Prisma/raw-SQL loader, in-process TTL cache, returns a small serializable shape | `lib/server/coordinationByProjectView.ts`, `moduleActivityView.ts`, `activityTimelineView.ts`, `activityByActorView.ts`, `folderActivityView.ts`, `dcCoverageView.ts` |
| `mainCharts.tsx :: MainCharts()` | Single `Promise.all` fan-out for every access-analysis loader; passes results as props to one client component | `app/(dashboard)/access-analysis/mainCharts.tsx:29-80` |
| `app/(dashboard)/access-analysis/<name>Counts.ts` | Pure, DB-free transform: raw rows → chart-ready summary (slices, totals, drill maps) | `moduleCounts.ts`, `roleCounts.ts`, `companyCounts.ts`, `timelineCounts.ts`, `coordinationCounts.ts`, `roleActivityCounts.ts`, `companyActivityCounts.ts` (all co-located with `__tests__/*.test.ts`) |
| `components/<Name>Chart.tsx` | `"use client"` ECharts wrapper around `@/components/ui/EChart` (canonical, theme-aware); owns its own palette + tooltip + drill UI | `RolesPieChart.tsx`, `ModulesPieChart.tsx`, `ActivityByRolePieChart.tsx`, `CompaniesActivityPieChart.tsx` |
| `AccessAnalysisCharts.tsx` | Orchestrator: owns `selected` (ProjectPicker set), `sliceFilters` (cross-filter bus), `kpis[]`, renders every panel in `<Reveal><PremiumSurface>` | `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx:64-548` |
| `folderPermQuery.ts :: loadFolderPermRows` | SINGLE shared owner of the base `AccFolderPermission` join (both `l2Only` access-analysis branch and all-folders template-mty branch) | `lib/server/folderPermQuery.ts:39-63` |

## Verified `mainCharts.tsx` Promise.all (exact, today)

```ts
// app/(dashboard)/access-analysis/mainCharts.tsx:30-40
const [view, moduleRows, activityActorRows, coordinationData, coverage,
       terrainProjects, timeline, dcCoverage] = await Promise.all([
  loadInstanceView(),          // lib/server/accessInstanceView.ts
  loadModuleActivity(),        // lib/server/moduleActivityView.ts
  loadActivityByActor(),       // lib/server/activityByActorView.ts
  loadCoordinationByProject(), // lib/server/coordinationByProjectView.ts
  loadProjectCoverage(),       // lib/server/projectCoverageView.ts
  loadTerrainProjects(),       // lib/server/folderPermissionTerrainView.ts
  loadActivityTimeline(),      // lib/server/activityTimelineView.ts
  loadDcCoverage(),            // lib/server/dcCoverageView.ts
]);
```

Adding a new panel means: add one more loader call to this array (or, if it's
independent of the others, an additional standalone `await` — the array is not
size-limited, but every entry blocks the RSC's first paint, so **loaders here
must all be fast/cached**, see row-count risk below), thread the result through
as a new prop on `<AccessAnalysisCharts .../>`, and add the matching optional
prop + section to `AccessAnalysisCharts.tsx` following the existing
`terrainProjects && loadTerrain && loadOverview &&` conditional-render idiom.

## Verified cross-filter bus (`sliceFilters`)

`AccessAnalysisCharts.tsx` owns one `SliceFilters` state object
(`Record<string, string>`, one value per "dimension", ANDed —
`app/(dashboard)/access-analysis/projectFilter.ts:62`). Charts participate by:

1. Accepting `onSliceClick={(val) => toggleSliceFilter("<dim>", val)}` and
   `activeSlice={sliceFilters.<dim>}` props (verified: `RolesPieChart`,
   `CompaniesPieChart`, `ActivityByRolePieChart`, `CompaniesActivityPieChart` all
   do this at `AccessAnalysisCharts.tsx:362-441`).
2. **BUT** `applySliceFilters()` (`projectFilter.ts:71-83`) only implements
   matching logic for exactly two dimension keys today: `"role"` (matches
   `r.roles.includes(val)`) and `"company"` (matches `r.company === val`). Any
   new dimension (issue `status`, activity `activityVerb`, permission `tier`,
   member `products` tier) is **not automatically cross-filterable** — the row
   shape and the `if (role !== undefined) / if (company !== undefined)` branches
   in `applySliceFilters` must be extended to recognize it. This is a small,
   scoped, additive change (add a branch + widen the generic constraint), not a
   rewrite, but it is a real per-candidate cost to budget if a new chart is
   meant to drive/receive the cross-filter, not just read the `selected`
   (project-picker) set.
3. Charts that only need the plain project-picker filter (not the click-driven
   cross-filter) just call `filterRowsBySelection(rows, selected)` — this needs
   no changes, since every row already carries `projectId` (verified pattern
   used by `moduleSummary` at `AccessAnalysisCharts.tsx:184-187`, which
   deliberately opts OUT of `applySliceFilters` because `ModuleActivityRow` has
   no `roles`/`company`).

**Roadmap implication:** any candidate whose chart data has no natural
`roles`/`company` (issues, ingest runs, activity verbs, permission tiers, folder
storage, dormant-by-sign-in, module coverage) should default to
project-picker-only filtering (cheapest, matches the existing `moduleSummary`
precedent) unless a phase explicitly plans the `applySliceFilters` extension.

## Per-Candidate Verification (all 9 seeds from ROADMAP.md "v2.3 Candidates")

Every model + field below is verified directly against `prisma/schema.prisma`
(line numbers as of this research pass). Row counts are from
`.planning/STATE.md`'s live census where present; unlisted counts are marked
`VERIFY:`.

### 1. Issues over time / by status / by type

- **Model/fields (verified, schema.prisma:840-869):** `AccIssue.createdAt`
  (`DateTime?`), `.status` (`String?`), `.issueTypeId` (`String?`),
  `.issueSubtypeId` (`String?`), `.projectId`. Indexes exist on `projectId`,
  `isCoordination`, `clashId`, `fetchRunId`, and the composite
  `(projectId, isCoordination)` — **no index on `status`/`issueTypeId`/`createdAt`
  alone**, but that's fine at this row count (see below).
- **Closest analog:** `lib/server/coordinationByProjectView.ts` — already does
  `db.accIssue.groupBy({ by: ["projectId", "status"], where: { isCoordination: true }, _count: { id: true } })`.
  The new loader is the same shape MINUS the `isCoordination: true` filter (full
  issue set, not just the coordination-classified subset) and ADDS a
  `date_trunc('month', "createdAt")` grouping dimension for the timeline variant
  — mirror `activityTimelineView.ts`'s `date_trunc` pattern for the time-series
  cut, and `groupBy(["status"])` / `groupBy(["issueTypeId"])` (plain Prisma
  `groupBy`, no raw SQL needed — `AccIssue` has no compound-source UNION like
  the activity tables) for the status/type cuts.
- **Row-count risk:** LOW. `AccDcIngestRun` census confirms 72 ingest runs;
  `AccIssueFetchRun`/`AccIssueProjectFetchResult` are per-run/per-project rows
  (small). `AccIssue` itself: `VERIFY:` exact row count (prior session memory
  cites ~14,233 issues / ~1,765 coordination-validated, not independently
  re-verified against the live DB in this pass) — either way it is two orders
  of magnitude below `AccActivityAccds`, so a full-table `groupBy` with no
  extra index is cheap; no new index needed.
- **Lands on:** `/access-analysis` only. `/template-mty` has no per-project
  issue data (it's a template roster, not a live project) — do not attempt an
  MTY variant.
- **New files:** `lib/server/issueFunnelView.ts` (loader), `app/(dashboard)/access-analysis/issueFunnelCounts.ts` (+`__tests__/issueFunnelCounts.test.ts`), `app/(dashboard)/access-analysis/components/IssueFunnelChart.tsx`.
- **Modified:** `mainCharts.tsx` (+1 Promise.all entry + prop), `AccessAnalysisCharts.tsx` (+1 panel + optional KPI).

### 2. Permission footprint by role (folder count + bytes)

- **Model/fields (verified, schema.prisma:549-561):** `AccFolderPermissionSummary`
  — `projectId`, `roleId`, `folderCount` (`Int`), `totalBytes` (`BigInt`),
  `permTypes` (`String[]`), unique on `(projectId, roleId)`, indexed on both
  `projectId` and `roleId` individually.
- **Closest analog:** none charts it yet — `lib/server/acc-hot-cache.ts`
  (`getCachedAccDcBulkUsers`, per PROJ-02/Phase 19) is the only current reader,
  and it's for the bulk-users cache, not a chart. The new loader is a plain
  `db.accFolderPermissionSummary.findMany()` (or a `groupBy(["roleId"])` summed
  across projects if the chart is account-wide rather than per-project) — the
  simplest loader of the 9, structurally closest to `dcCoverageView.ts`'s
  `db.<model>.count()`-style directness.
- **Row-count risk:** TRIVIAL. Per Phase 18's reconciliation, this projection
  is 22,082 rows total (`(projectId, roleId)` pairs) — cheap `findMany`, zero
  touch of the ~6M-row `AccFolderPermission` raw table (that's the whole point
  of REF-03). `totalBytes` is `BigInt` — the loader must convert to `Number`
  (or a string) before serializing to the client component; `AccDcIngestRun`'s
  Phase 19 deviation note (BigInt literals break ES2017 target) is the same
  class of bug to watch for here.
- **Lands on:** `/access-analysis` (per-project selection, matches the existing
  ProjectPicker) — could also work on `/template-mty` filtered to the MTY
  project id, but the MTY page's existing `permissionAccess.ts` already covers a
  similar "tier reach by role" story off a different (hardcoded-roster) data
  path; a bytes/folder-count variant on `/access-analysis` is the higher-value,
  non-duplicative add.
- **New files:** `lib/server/permissionFootprintView.ts`, `app/(dashboard)/access-analysis/permissionFootprintCounts.ts` (+test), `components/PermissionFootprintChart.tsx` (bar or small treemap).
- **Modified:** `mainCharts.tsx`, `AccessAnalysisCharts.tsx`.

### 3. Ingest freshness / throughput panel

- **Model/fields (verified, schema.prisma:812-829):** `AccDcIngestRun` —
  `startedAt`, `endedAt`, `status`, `sliceWindowStart/End`, `projectsProcessed`,
  `rowsByModule` (`Json`), `rowsByAdminCsv` (`Json`), `quotaUsed`, `diffSummary`
  (`Json?`), `unknownModulesSeen` (`String[]`), `errorMessage`. Indexed on
  `startedAt desc` and `status`.
- **Caveat (confirmed by PROJECT.md + ROADMAP.md v2.3 seed table):**
  `rowsByModule` is a **known-zero telemetry gap** — do not chart it as row
  throughput. Measure "rows ingested" from `AccActivity`/`AccActivityAccds`
  directly (e.g. `COUNT(*) WHERE ingestRunId = <runId>` — both tables carry
  `ingestRunId`, verified schema.prisma:573 and :599) and join that count
  against `AccDcIngestRun.startedAt/endedAt/status/quotaUsed` for a real
  throughput-over-time panel.
- **Closest analog:** none — zero current consumers found in `lib/server` or
  `app` (verified via grep). Structurally closest to `activityTimelineView.ts`'s
  `date_trunc` time-series shape (one point per run, not per month).
- **Row-count risk:** TRIVIAL. 72 rows in the live census (`.planning/STATE.md:63`).
  The only cost is the per-run `COUNT(*)` join against `AccActivity`/`AccActivityAccds`
  grouped by `ingestRunId` — both tables index `ingestRunId`
  (`AccActivity` schema.prisma:582, `AccActivityAccds` schema.prisma:606), so a
  `groupBy(["ingestRunId"])` is an index-covered aggregate, not a scan.
- **Lands on:** `/access-analysis` only (ingest is account-wide, no MTY tie-in).
- **New files:** `lib/server/ingestFreshnessView.ts`, `app/(dashboard)/access-analysis/ingestFreshnessCounts.ts` (+test), `components/IngestFreshnessChart.tsx`.
- **Modified:** `mainCharts.tsx`, `AccessAnalysisCharts.tsx`.

### 4. Issue-fetch coverage donut

- **Model/fields (verified, schema.prisma:871-902):** `AccIssueFetchRun` —
  `projectsTotal/Ok/Forbidden`, `issuesUpserted`, `coordinationCount`, `status`.
  `AccIssueProjectFetchResult` — `runId`, `projectId`, `projectName`, `status`
  (`"ok" | "zero_issues" | "forbidden" | "error"`), `issueCount`,
  `coordinationCount`, indexed on `runId`, `projectId`, `status`, and the
  composite `(runId, status)`.
- **Closest analog:** `coordinationByProjectView.ts` already reads
  `db.accIssueFetchRun.findFirst({ orderBy: { startedAt: "desc" }, select: { projectsOk, projectsForbidden, startedAt, coordinationCount } })`
  for the coverage footnote (line 33-36) — the new donut is a direct extension:
  `db.accIssueProjectFetchResult.groupBy({ by: ["status"], where: { runId: latestRun.id }, _count: { id: true } })`
  against the SAME latest run, honest-labeled per status bucket
  (`ok / zero_issues / forbidden / error`) instead of collapsing to
  ok-vs-forbidden. Mirrors the existing `DcCoverage` "covered/total" pattern in
  `dcCoverageView.ts` but with 4 buckets instead of 2.
- **Row-count risk:** TRIVIAL. `AccIssueProjectFetchResult` is bounded by
  projects-per-run (~1,153 max) times the number of runs kept; a single-run
  `groupBy` filtered to `runId` is a handful of rows.
- **Lands on:** `/access-analysis` only, likely as a badge/donut adjacent to
  the existing "Model Coordination" section (it already reads the same
  `AccIssueFetchRun` row for its footnote counts — a natural site to co-locate).
- **New files:** `lib/server/issueFetchCoverageView.ts`, `app/(dashboard)/access-analysis/issueFetchCoverageCounts.ts` (+test), `components/IssueFetchCoverageDonut.tsx`.
- **Modified:** `mainCharts.tsx`, `AccessAnalysisCharts.tsx` (or, if scoped tightly, extend `coordinationByProjectView.ts`'s existing `CoordinationByProjectData` shape instead of a new loader — smaller diff, same data source, worth a phase-level design call).

### 5. Dormant users by sign-in recency

- **Model/fields (verified, schema.prisma:455-477):** `AccProjectMember.lastSignIn`
  (`DateTime?`), `.addedOn` (`DateTime?`), `.projectId`, `.email`. Indexed on
  `email`, `projectId`, `autodeskId` — **no index on `lastSignIn`**, but see
  row-count risk.
- **Closest analog:** `app/(dashboard)/access-analysis/dormantActivity.ts`
  (`rankDormantByPeople`) is the existing "dormant" concept, but it's
  activity-based (zero recorded actions in scope), not sign-in-recency-based —
  a genuinely distinct dimension per the ROADMAP.md seed note ("distinct from
  the existing dormant-role/company tails"). No existing loader reads
  `AccProjectMember.lastSignIn` for a chart (verified: the 61 files matching
  `lastSignIn` are almost all `/users` page and DC-snapshot (`AccDcUser`)
  code — none are access-analysis/template-mty consumers of
  `AccProjectMember.lastSignIn` specifically).
- **Row-count risk:** LOW-MEDIUM. `VERIFY:` exact `AccProjectMember` row count
  (not in `.planning/STATE.md`'s census table as read) — reasoned estimate: one
  row per (project, member), bounded by `AccProject` (1,153) × typical
  project roster size, almost certainly in the tens-of-thousands range, i.e.
  far below `AccActivityAccds`. A bucketed `groupBy` (e.g. bucket by
  `age(now(), "lastSignIn")` into "never / >90d / >30d / active") should be
  done as a raw SQL `CASE WHEN` aggregate (mirrors `activityTimelineView.ts`'s
  `date_trunc` bucketing idiom) rather than pulling all rows to JS.
- **Lands on:** `/access-analysis` (per-project picker scope, matches
  `roleRows`/`membershipRows` shape already threaded through `mainCharts.tsx`).
- **New files:** `lib/server/signInRecencyView.ts`, `app/(dashboard)/access-analysis/signInRecencyCounts.ts` (+test), `components/SignInRecencyChart.tsx`.
- **Modified:** `mainCharts.tsx`, `AccessAnalysisCharts.tsx`.

### 6. Activity verb / object-type breakdown

- **Model/fields (verified, schema.prisma:585-607):** `AccActivityAccds.activityVerb`
  (`String`, indexed), `.objectType` (`String?`, **not indexed**),
  `.serviceGroup` (`String?`, **not indexed**), `.createdAt` (indexed desc).
- **Closest analog:** `lib/server/moduleActivityView.ts` (groups
  `AccActivityAccds.activityVerb` aliased as `rawAction`, UNIONed with the
  `AccActivity` DC-backfill) is the closest existing precedent for exactly this
  row-count class of aggregate, and `activityByActorView.ts` /
  `activityTimelineView.ts` are the same shape with a different `GROUP BY`
  key. **This candidate is simpler than those three**, because the ROADMAP.md
  seed explicitly scopes it to `AccActivityAccds` alone (no DC-backfill UNION
  needed) — a single `groupBy(["activityVerb", "objectType"])` or
  `groupBy(["serviceGroup"])`.
- **Row-count risk:** MEDIUM — this is the one candidate the milestone context
  explicitly flags: `AccActivityAccds` is 4,554,785 rows (verified,
  `.planning/STATE.md:59`). A `GROUP BY` aggregate collapsing to a few hundred
  (verb × objectType) combinations is the SAME operation
  `moduleActivityView.ts`/`activityTimelineView.ts`/`activityByActorView.ts`
  already perform successfully in production against this table (all three are
  live, cached 5-min TTL loaders) — so the pattern is proven safe, but:
  - MUST stay server-side `db.$queryRaw` or Prisma `groupBy` (never
    `findMany()` + JS reduce — that's the exact OOM class TEST-01 guards
    against for `AccFolderPermission`).
  - `objectType`/`serviceGroup` have no index; Postgres will hash-aggregate via
    a sequential scan of ~4.55M rows. The three existing analogs already do
    this successfully (they group by `activityVerb`/`userEmail`/`projectId`,
    some of which ALSO lack a covering composite index for the exact grouping
    used), so it is an accepted, working pattern at this row count — but if a
    phase wants tighter latency, adding `@@index([objectType])` /
    `@@index([serviceGroup])` is a low-risk follow-on (same shape as the
    Phase 09 `roleId` index precedent), not a blocker.
  - Respect the ~12-month ACCDS floor label (TRUTH-02 precedent: surface
    `dataFloor`/`floorByProject` the same way `activityTimelineView.ts` does).
- **Lands on:** `/access-analysis` (activity-derived → needs the existing
  `ActivityCoverageBadge` treatment, same as the module-activity donut).
- **New files:** `lib/server/activityVerbBreakdownView.ts`, `app/(dashboard)/access-analysis/activityVerbCounts.ts` (+test), `components/ActivityVerbChart.tsx`.
- **Modified:** `mainCharts.tsx`, `AccessAnalysisCharts.tsx`.

### 7. Folder storage treemap

- **Model/fields (verified, schema.prisma:506-527):** `AccFolder.fileCount`
  (`Int?`), `.totalSizeBytes` (`Float?` — note: Float, NOT BigInt, "avoids
  BigInt JS friction" per the schema's own comment at line 519), `.lastModifiedTime`
  (`DateTime?`), `.parentId`, `.fullPath` (`String?`), `.projectId` (indexed).
- **Closest analog:** none charts folder-size rollups yet. Structurally closest
  to `folderActivityView.ts::loadFolderActivityProjects` (per-project
  aggregate, ranked desc, resolves project names via the same
  `AccProject`+`AccDcProject` merged-name-map pattern at
  `buildProjectNameMap`/`resolveProjectName` — reuse those two exported pure
  helpers verbatim rather than re-deriving project-name fallback logic).
- **Row-count risk:** LOW. `AccFolder` is 415,908 rows total, but only 111,308
  have been content-crawled (`fileCount`/`totalSizeBytes` populated — verified
  `.planning/STATE.md:52`), so a `WHERE "totalSizeBytes" IS NOT NULL` predicate
  (or `folderCrawlStatus IN ('ok','partial')` on the parent `AccProject`, same
  predicate Phase 18's backfill used) keeps the aggregate small. A per-project
  `SUM("totalSizeBytes")` / `SUM("fileCount")` grouped by `projectId` is cheap
  and index-covered (`@@index([projectId])` exists). A true treemap (folder
  hierarchy, not just per-project totals) needs `parentId`/`fullPath` walked
  client-side from a single project's folder set (bounded — one project's
  folder count, not all 416k) — do that walk in the pure `*Counts.ts`
  transform, not in the loader.
- **Lands on:** `/access-analysis` — could also suit `/template-mty` since MTY
  is itself one `AccProject` with its own folder tree, but MTY's existing
  Folder Permission Terrain already visualizes its folder tree in 3D; a 2D
  storage treemap there would be additive, not conflicting — mark as a
  stretch/second-slice target, not core scope.
- **New files:** `lib/server/folderStorageView.ts`, `app/(dashboard)/access-analysis/folderStorageCounts.ts` (+test), `components/FolderStorageTreemap.tsx` (ECharts `treemap` series type).
- **Modified:** `mainCharts.tsx`, `AccessAnalysisCharts.tsx`.

### 8. Permission tier × folder-depth heatmap

- **Model/fields (verified):** reuses `lib/server/folderPermQuery.ts::loadFolderPermRows`
  (`FolderPermRow`: `folder_id`, `role_id`, `role_name`, `perm_type`,
  `n_actions`) joined against `AccFolder.parentId`/`fullPath` (schema.prisma:506-527)
  to derive folder depth.
- **Closest analog:** this is explicitly the 2D-safe alternative to the 3D
  Folder Permission Terrain (`FolderPermissionTerrain.tsx` /
  `folderTerrainModel.ts` / `terrainViewModel.ts`) — same base data
  (`loadFolderPermRows`), different presentation (ECharts `heatmap` series
  instead of R3F terrain). **MUST call `loadFolderPermRows` — do not re-derive
  or duplicate the `AccFolderPermission` join SQL** (the module's own header
  comment at `folderPermQuery.ts:12-14` explicitly forbids adding new
  single-use queries there; a new loader file should IMPORT
  `loadFolderPermRows` and add its own depth-bucketing/pivot logic on top,
  mirroring how `templateFolderTerrain.ts`/`folderPermissionTerrainView.ts`
  already consume it).
- **Row-count risk:** LOW at the per-project scope this loader already runs at
  (a single project's `AccFolderPermission` rows via the `l2Only`-style JOIN,
  not the full ~6.04M-row table) — this is exactly the win REF-02 already
  banked. Depth must come from walking `AccFolder.parentId` chains (bounded
  per-project, not per whole table).
- **Lands on:** `/access-analysis` (per-project picker; likely nested inside
  or beside the existing `TerrainReveal` collapsed section, since it's an
  alternate view of the same terrain data, not a new data domain).
- **New files:** `lib/server/folderPermHeatmapView.ts` (imports `loadFolderPermRows`, adds depth), `app/(dashboard)/access-analysis/folderPermHeatmapCounts.ts` (+test), `components/FolderPermHeatmap.tsx`.
- **Modified:** possibly `TerrainReveal.tsx` to host a 2D/3D toggle — `VERIFY:` exact integration point once the phase scopes whether this replaces or sits beside the terrain.

### 9. Provisioned-vs-active module coverage

- **Model/fields (verified):** `AccProjectMember.products` (`Json`,
  schema.prisma:469, comment: "per-module tier map") for provisioning, vs.
  `AccDcProjectUserProduct.accessLevel` (schema.prisma:732-741, composite id
  `(projectId, userId, productKey)`) as the DC-derived alternative provisioning
  source, compared against `AccActivityAccds`/`AccActivity`'s already-charted
  module-activity donut (`moduleActivityView.ts`) for the "used" side.
- **Closest analog:** `app/(dashboard)/template-mty/moduleAccess.ts::summarizeModuleAccess`
  is the closest EXISTING transform shape (counts members per module id from a
  `modules?: ModuleId[]` field) — but it operates on the hardcoded MTY roster,
  not live `AccProjectMember.products` JSON. The new loader must first resolve
  the `products` Json tier-map into the same `ModuleId[]` vocabulary
  `app/(dashboard)/access-analysis/modules.ts`/`moduleOverrides.ts` already
  define, then diff against `moduleActivityView.ts`'s activity-derived module
  set for the provisioned-vs-active gap.
- **Row-count risk:** `VERIFY:` exact `AccProjectMember` row count (same gap as
  candidate 5) and `AccDcProjectUserProduct` row count (not in
  `.planning/STATE.md`'s census as read; bounded by the ~550 DC-covered
  projects × users × product keys, materially smaller than `AccActivityAccds`).
  Either way this is a `findMany`/`groupBy` over a member-count-scale table
  (tens of thousands), not a multi-million-row table — LOW risk.
- **Lands on:** `/access-analysis` primarily (live `AccProjectMember.products`
  is the richer, non-DC-gated source); a `/template-mty` variant is redundant
  with the existing `ModuleAccessChart`/`moduleAccess.ts` and should NOT be
  duplicated — if MTY needs an "active" overlay, extend the existing
  `moduleAccess.ts` rather than adding a parallel loader.
- **New files:** `lib/server/moduleProvisionCoverageView.ts`, `app/(dashboard)/access-analysis/moduleProvisionCounts.ts` (+test), `components/ModuleProvisionCoverageChart.tsx`.
- **Modified:** `mainCharts.tsx`, `AccessAnalysisCharts.tsx`; `app/(dashboard)/access-analysis/modules.ts`/`moduleOverrides.ts` if the `products` Json vocabulary needs mapping helpers added (reuse, don't fork).

## Summary Table

| # | Chart | Model(s) | Row risk | Page | Loader analog |
|---|-------|----------|----------|------|----------------|
| 1 | Issue funnel | `AccIssue` | LOW (~14k, VERIFY: exact) | access-analysis | `coordinationByProjectView.ts` |
| 2 | Permission footprint by role | `AccFolderPermissionSummary` | TRIVIAL (22,082) | access-analysis | `dcCoverageView.ts` (direct count/find shape) |
| 3 | Ingest freshness/throughput | `AccDcIngestRun` + `ingestRunId` join | TRIVIAL (72 runs) | access-analysis | `activityTimelineView.ts` (time-series shape) |
| 4 | Issue-fetch coverage donut | `AccIssueFetchRun`/`AccIssueProjectFetchResult` | TRIVIAL | access-analysis | `coordinationByProjectView.ts` (already reads `AccIssueFetchRun`) |
| 5 | Dormant by sign-in | `AccProjectMember.lastSignIn` | LOW-MED (VERIFY: exact count) | access-analysis | `dormantActivity.ts` (different dimension, same "dormant" concept) |
| 6 | Activity verb/object breakdown | `AccActivityAccds` | MEDIUM (4.55M rows, proven pattern) | access-analysis | `moduleActivityView.ts` / `activityTimelineView.ts` |
| 7 | Folder storage treemap | `AccFolder` | LOW (415,908 rows, 111,308 sized) | access-analysis (+ maybe template-mty) | `folderActivityView.ts` (project-name-map reuse) |
| 8 | Permission tier × depth heatmap | `folderPermQuery.ts` + `AccFolder` | LOW (per-project scope) | access-analysis | `templateFolderTerrain.ts` (consumer of shared join) |
| 9 | Provisioned-vs-active module coverage | `AccProjectMember.products` / `AccDcProjectUserProduct` | LOW (VERIFY: exact count) | access-analysis (mty via extend, not fork) | `moduleAccess.ts` (MTY-roster analog) |

## Recommended Build Order

Grouped by **dependency + row-count risk**, matching the repo's existing
solo-workflow risk-management convention (see ROADMAP.md's v2.1/v2.2 ordering
notes — cheapest/most-isolated first, riskiest/most-coupled last):

1. **Wave A — trivial-risk, zero-dependency, small tables** (parallelizable,
   no shared-file contention): #2 Permission footprint (22,082-row projection,
   already materialized by Ph18/19 — purely a new consumer), #3 Ingest
   freshness (72 rows), #4 Issue-fetch coverage donut (co-locatable with the
   existing `coordinationByProjectView.ts` read of `AccIssueFetchRun`).
2. **Wave B — small-table, new loader, no shared-query coupling**: #1 Issue
   funnel (full `AccIssue` table, no `isCoordination` filter — a straightforward
   sibling of Wave A's #4, but a distinct loader file since it needs its own
   `groupBy` shapes for status/type/time).
3. **Wave C — member-scale tables, needs a small vocabulary/mapping step**:
   #5 Dormant by sign-in, #9 Provisioned-vs-active module coverage (the latter
   should follow #5 since both touch `AccProjectMember` and #9 additionally
   needs the `products` Json → `ModuleId[]` mapping helper, which benefits from
   #5 already having exercised a fresh `AccProjectMember` loader in this
   milestone).
4. **Wave D — shared-query reuse, must not fork `folderPermQuery.ts`**: #8
   Permission tier × depth heatmap (imports `loadFolderPermRows`; do after Wave
   C so the team has already re-familiarized itself with the terrain/
   folder-permission code area from #2).
5. **Wave E — larger table, proven-safe pattern, do last for isolation**: #6
   Activity verb/object breakdown (4.55M-row table — even though the pattern is
   proven by three existing loaders, sequence it after the smaller/cheaper
   panels so any TTL-cache/first-paint latency regression is isolated and easy
   to bisect) and #7 Folder storage treemap (415,908-row table, but needs its
   own hierarchy-walk transform logic, so it benefits from being scoped after
   the team has done at least one non-trivial pure-transform in this
   milestone).

Each wave can be its own phase; #2/#3/#4 could even be a single phase (all
three are "read an already-small/already-materialized table, no new schema, no
new index") given they share almost no file surface (`mainCharts.tsx` and
`AccessAnalysisCharts.tsx` are the only two files every candidate touches — plan
for a merge/rebase point there each phase, not a blocking dependency).

## Anti-Patterns To Avoid (dashboard-specific)

- **Never `findMany()` + JS-side `reduce`/`groupBy` on `AccActivityAccds`,
  `AccFolder`, or `AccFolderPermission`.** Every existing analog (`moduleActivityView.ts`,
  `activityTimelineView.ts`, `activityByActorView.ts`, `folderActivityView.ts`)
  aggregates server-side via `db.$queryRaw` `GROUP BY` or Prisma `groupBy` —
  this is the TEST-01 guardrail's whole point (OOM regression on
  `AccFolderPermission`'s ~6M rows) and applies by extension to any table in
  the same size class.
- **Never duplicate the `AccFolderPermission` base join.** `folderPermQuery.ts`'s
  own header comment forbids new single-use queries there — import
  `loadFolderPermRows`, don't inline new SQL against `AccFolderPermission`.
- **Never chart `AccDcIngestRun.rowsByModule`** as a throughput metric — it's a
  confirmed always-zero field (PROJECT.md, ROADMAP.md v2.3 seed table). Compute
  rows-per-run from `AccActivity`/`AccActivityAccds.ingestRunId` instead.
- **Never assume a new chart is cross-filterable for free.** `applySliceFilters`
  only recognizes `"role"`/`"company"` today — wire `onSliceClick`/`activeSlice`
  only if the phase plan also extends `applySliceFilters` (or scope the new
  chart to project-picker-only filtering via `filterRowsBySelection`, the
  existing `moduleSummary` precedent).
- **Never import `app/(dashboard)/access-analysis/components/EChart.tsx`** for
  a new chart — that's the legacy pre-theme wrapper the repo's own comment
  marks for eventual removal. New charts import `@/components/ui/EChart` (the
  canonical, theme-resolving wrapper every current pie/donut chart already
  uses).
- **Never re-derive project-name fallback logic.** Reuse
  `buildProjectNameMap`/`resolveProjectName` from `folderActivityView.ts` (or
  the equivalent `nameById` `Map` pattern every other loader repeats) — every
  loader in this codebase independently merges `AccProject` (authoritative,
  1,153) over `AccDcProject` (550-subset) names; a new loader should follow the
  same precedence, not invent a new one.
- **Never fork the MTY module-access story.** `/template-mty`'s
  `moduleAccess.ts`/`ModuleAccessChart.tsx` already covers "which modules is
  the roster provisioned for" — candidate #9's provisioned-vs-active gap
  belongs on `/access-analysis` (live data) or as an extension of the existing
  MTY transform, not a parallel MTY loader.

## Integration Points (file-exact)

| File | Change | Candidates touching it |
|------|--------|--------------------------|
| `app/(dashboard)/access-analysis/mainCharts.tsx` | Add 1 `Promise.all` entry + 1 prop per new panel | ALL 9 (access-analysis side) |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` | Add 1 optional prop + 1 `<Reveal><PremiumSurface>` section + (optional) 1 `kpis[]` entry per new panel; extend `applySliceFilters`/`SliceFilters` only if the phase wants a new cross-filterable dimension | ALL 9 |
| `app/(dashboard)/access-analysis/projectFilter.ts` | Extend `applySliceFilters` with a new dimension branch (additive) | Only if a specific candidate is scoped to drive/receive the click cross-filter |
| `lib/server/folderPermQuery.ts` | Import-only (`loadFolderPermRows`) — no edits | #8 |
| `lib/server/coordinationByProjectView.ts` | Possibly extend `CoordinationByProjectData` in place (smaller diff) instead of a new loader | #4 (design choice) |
| `app/(dashboard)/access-analysis/modules.ts` / `moduleOverrides.ts` | Add a `products` Json → `ModuleId[]` mapping helper if not already present | #9 |
| `app/(dashboard)/template-mty/moduleAccess.ts` | Extend (not fork) if MTY needs a provisioned-vs-active overlay | #9 (optional stretch) |
| `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx` | Only touched if #7 (folder storage) gets an MTY stretch variant | #7 (optional stretch) |

## Sources

- `.planning/PROJECT.md`, `.planning/ROADMAP.md` (v2.3 Candidates seed table + registration-pattern description) — repo-native, verified current.
- `prisma/schema.prisma` lines 437-902 (every model/field cited above read directly).
- `app/(dashboard)/access-analysis/mainCharts.tsx`, `components/AccessAnalysisCharts.tsx`, `projectFilter.ts` — verified Promise.all wiring and cross-filter bus mechanics.
- `lib/server/coordinationByProjectView.ts`, `folderPermQuery.ts`, `moduleActivityView.ts`, `activityTimelineView.ts`, `activityByActorView.ts`, `folderActivityView.ts`, `dcCoverageView.ts` — loader-pattern analogs read in full.
- `app/(dashboard)/template-mty/page.tsx`, `moduleAccess.ts`, `permissionAccess.ts`, `components/TemplateAnalysisCharts.tsx` — MTY-side pipeline and closest existing analogs.
- `.planning/STATE.md` — live row-count census (`AccFolder` 415,908 / 111,308 sized; `AccFolderPermission` ~6.04M; `AccActivityAccds` 4,554,785; `AccDcIngestRun` 72).
- `components/ui/EChart.tsx` vs `app/(dashboard)/access-analysis/components/EChart.tsx` — confirmed canonical vs legacy wrapper via the component's own header comment.

---
*Architecture research for: v2.3 New Graphs (LECG Dashboard)*
*Researched: 2026-07-02*
