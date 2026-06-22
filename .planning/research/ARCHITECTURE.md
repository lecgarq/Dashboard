# Architecture Patterns — v3.0 Access Analysis: Hub Story & Scenario Explorer

**Project:** LECG Dashboard
**Researched:** 2026-06-22
**Scope:** Three questions: (a) scenario-pivot engine integration, (b) role-quality computation location, (c) DC re-extraction runbook.

---

## Part A: Scenario-Pivot Engine — Integration Architecture

### Verified Existing RSC-Loader Pattern

The current `/access-analysis` architecture (verified from source files) is:

```
page.tsx  (async RSC, force-dynamic)
  └─ <Suspense fallback={<DonutSkeletons />}>
       └─ MainCharts (async RSC)   ← app/(dashboard)/access-analysis/mainCharts.tsx
            ├─ Promise.all([
            │    loadInstanceView()          ← lib/server/accessInstanceView.ts
            │    loadModuleActivity()        ← lib/server/moduleActivityView.ts
            │    loadActivityByActor()       ← lib/server/activityByActorView.ts
            │    loadCoordinationByProject() ← lib/server/coordinationByProjectView.ts
            │    loadProjectCoverage()       ← lib/server/projectCoverageView.ts
            │    loadTerrainProjects()       ← lib/server/folderPermissionTerrainView.ts
            │    loadActivityTimeline()      ← lib/server/activityTimelineView.ts
            │  ])
            └─ <AccessAnalysisCharts {...props} />   ← client component
                  ├─ useMemo: summarize*/classify* transforms (pure, in-memory)
                  ├─ useState: selected, sliceFilters, profileEmail, peopleSheet
                  └─ server actions on expand (lazy heavy panels):
                       loadProjectClashes()               ← coordinationActions.ts
                       loadTerrainForProject()            ← folderTerrainActions.ts
                       loadOverviewTerrain()              ← folderTerrainActions.ts
                       loadFolderActivityProjectsAction() ← folderActivityActions.ts
                       loadFolderActivityTreeAction()     ← folderActivityActions.ts
```

**All 7 `lib/server/*View.ts` functions share the same contract:**
- `import "server-only"` at the top
- Module-level TTL cache (5 min, warmed at page load)
- `db.$queryRaw` or Prisma model calls for aggregation
- Returns flat typed-row arrays (not nested objects with computed state)
- Exported `build*` or `summarize*` pure functions for testability

**Client-side transform helpers live in the route directory (not `lib/`):**
- `app/(dashboard)/access-analysis/roleCounts.ts` — `summarizeRoles()`
- `app/(dashboard)/access-analysis/moduleCounts.ts` — `summarizeModules()`
- `app/(dashboard)/access-analysis/companyActivityCounts.ts` — `summarizeActivityByCompany()`
- `app/(dashboard)/access-analysis/roleActivityCounts.ts` — `summarizeActivityByRole()`
- `app/(dashboard)/access-analysis/coordinationCounts.ts` — `summarizeCoordination()`
- `app/(dashboard)/access-analysis/timelineCounts.ts` — `summarizeActivityTimeline()`
- `app/(dashboard)/access-analysis/dormantActivity.ts` — `rankDormantByPeople()`
- `app/(dashboard)/access-analysis/projectFilter.ts` — `filterRowsBySelection()`, `applySliceFilters()`

The cross-filter state (`selected`, `sliceFilters`) lives in `AccessAnalysisCharts` client component and is deliberately not externalized to Zustand or context (locked decision from phase 05-04: splitting the client component would require lifting that state, an architectural change not in scope for v3.0).

---

### Where Pivot Aggregation Should Run

**Recommendation: server-side, in a new `lib/server/scenarioPivotView.ts`.**

Rationale grounded in existing code patterns:

1. **Payload size.** Raw `AccActivity` is ~623k rows. A pivot that `GROUP BY (dim_a, dim_b)` server-side returns hundreds of rows. Client-side pivot over raw events would repeat the same transport problem that `moduleActivityView.ts` already solved (it groups in SQL, returns ~2–3k rows instead of shipping 623k).

2. **Existing pattern.** `moduleActivityView.ts` uses `db.$queryRaw` with a CTE + `GROUP BY` to produce bucketed rows. The scenario pivot is the same shape: `GROUP BY dim_a, dim_b, SUM/COUNT(measure)`. The new view follows the identical loader contract.

3. **On-demand vs preload.** Presets that are common enough to always show go into `Promise.all` in `mainCharts.tsx`. Novel user-defined dimension combinations (the picker path) should be server actions — fired on interaction, exactly like `loadProjectClashes` and `loadOverviewTerrain`. This avoids inflating the initial parallel-fetch budget.

4. **Auto-chart-type logic is client-only.** `ScenarioExplorer.tsx` inspects the returned `PivotCell[]` shape (single-dimension → donut/bar; two-dimension → heatmap/sankey) and renders the correct ECharts series. No chart-type logic belongs server-side.

**Concrete integration points for the pivot engine:**

```
NEW  lib/server/scenarioPivotView.ts
       import "server-only"
       loadPivotPresets(): Promise<PresetPivotResult[]>   ← added to mainCharts Promise.all
       (on-demand aggregation moved to server action below)

NEW  app/(dashboard)/access-analysis/scenarioActions.ts
       "use server"
       loadPivotOnDemand(measure, dimA, dimB?): Promise<PivotCell[]>

NEW  app/(dashboard)/access-analysis/components/ScenarioExplorer.tsx
       "use client"
       receives pivotPresets prop (no fetch for presets)
       calls loadPivotOnDemand (server action) for custom picks

MODIFIED  app/(dashboard)/access-analysis/mainCharts.tsx
       add loadPivotPresets() to the existing Promise.all (one more parallel loader)

MODIFIED  app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx
       add pivotPresets prop to interface
       add <ScenarioExplorer> panel — all existing panels untouched
```

**Reusing existing helpers in the pivot query:**

- `moduleOverrides.ts` / `classifyActivity()` is currently in `app/(dashboard)/access-analysis/moduleOverrides.ts` and is imported by 4 scripts (6 existing dependency-cruiser warnings). The correct path before adding the pivot engine: move this file to `lib/acc/moduleOverrides.ts` (CONCERNS.md priority 1, safe cleanup). Then `scenarioPivotView.ts` imports from `lib/acc/`, and the route components update their imports. Do not add another scripts-to-app import to work around this.

- `mergeRoleNames()` is in `lib/server/accessInstanceView.ts` — already server-only, directly importable by new view files without changes.

- Folder breadth/reach aggregates already exist in `lib/server/folderPermissionTerrainView.ts` and `lib/server/folderActivityView.ts`. The pivot engine composes those rather than writing new raw queries for the same data.

---

### New View Integration (additive, each follows the same loader pattern)

| New View | Server Loader | Client Transform | Notes |
|---|---|---|---|
| Calendar heatmap | `lib/server/activityCalendarView.ts` NEW | `summarizeCalendar()` in route dir | Query: `GROUP BY DATE(createdAt)` over merged AccActivity/AccActivityAccds CTE; same union pattern as timelineView |
| Behavior-mix over time | extend `activityTimelineView.ts` to add `rawAction` to GROUP BY | `summarizeBehaviorMix()` NEW | Avoids a separate DB round-trip; same merge CTE |
| Hottest files/models | `lib/server/hotObjectsView.ts` NEW | rows → HotObjectsPanel | `AccActivityAccds` has `objectId`, `objectName`, `folderId` — group by those |
| Folder reach/exposure | `lib/server/folderReachView.ts` NEW (or extend terrainView) | `summarizeFolderReach()` NEW | `AccFolderPermission` + `AccDcUser` internal flag; internal vs external breakdown |
| Sankey Company→Role→Module | `lib/server/interconnectionsView.ts` NEW | `buildSankeyLinks()` NEW | Same source as `accessInstanceView` data — may be derivable without a new DB round-trip by accepting the already-loaded `AccessInstance[]` rows as input |
| Chord / firm co-occurrence | same `interconnectionsView.ts` | `buildChordMatrix()` NEW | (company × project) co-memberships from `accessInstanceView` rows |

**Calendar heatmap and hottest objects are the most likely candidates for the lazy server-action pattern** (load on expand) rather than inclusion in the initial `Promise.all` — they are dense single-purpose views that do not drive cross-filter state. All others can be preloaded if the query is fast.

---

### Build Order

1. DC re-extraction (dedicated first phase; all data-dependent views are meaningless without current data).
2. Move `app/(dashboard)/access-analysis/moduleOverrides.ts` → `lib/acc/moduleOverrides.ts` (prerequisite for pivot engine; fixes 4 of 6 existing dependency-cruiser warnings).
3. Pivot engine: `lib/server/scenarioPivotView.ts` + `scenarioActions.ts` + `ScenarioExplorer.tsx` + mainCharts wiring.
4. Sectioned layout + sticky nav (restructures `AccessAnalysisCharts.tsx` layout; no new data loading).
5. Activity depth views (calendar heatmap, behavior-mix, hottest objects) — new loaders + transforms, each additive.
6. Folder reach & exposure — extends terrain; medium risk because `folderPermissionTerrainView.ts` is a large server file.
7. Hygiene facts + interconnections — surfaces `computeAllFindings()` via new `roleHygieneView.ts`; new Sankey/chord via `interconnectionsView.ts`.

---

## Part B: Role-Quality Computation — Location and Surfacing Gap

### Where the Computation Lives

**Verified location:** `lib/acc/dashboardAnalytics.ts`

Three exported pure functions (DASH-03, DASH-04, DASH-05) and one composing entry point (DASH-09):

```typescript
// lib/acc/dashboardAnalytics.ts
findJunkRoles(users: BulkAccUser[], now: Date): JunkRoleFinding[]
  // DASH-03: signals are zeroMembers, zeroModules, allInactive90d
  // Severity: HIGH (3 signals) | MEDIUM (2) | LOW (1)
  // "zeroMembers" is a proxy: role in user.allRoles but not bound to any project assignment

findDuplicateRoles(users: BulkAccUser[]): DuplicateRoleFinding[]
  // DASH-04: identical module sets (strict equality) + ≥80% name token overlap
  // Returns pairs: { roleA, roleB, moduleOverlap: 1.0, nameOverlap, affectedMembers, affectedProjects }

findOutlierModuleCombos(users: BulkAccUser[], thresholdPct = 0.05): OutlierFinding[]
  // DASH-05: module sets held by < 5% of all members

computeAllFindings(users: BulkAccUser[], now?: Date): DashboardFindings
  // DASH-09: aggregates the three above + roleSeverityIndex Map<string, Severity>
```

**Input type:** `BulkAccUser[]` from `lib/acc/acc-types.ts`. The function is a pure transform — no DB access. Fully tested in `lib/acc/dashboardAnalytics.test.ts`.

### Where It Is Currently Surfaced

`computeAllFindings` is wired **only on the `/users` page**, not on `/access-analysis`:

- `app/(dashboard)/users/dashboard/selectionContext.tsx` — imports the finding types for the selection-context discriminated union
- `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` — renders findings in a right-side drill-down panel (DASH-10); triggers via click on the `/users` page widgets

**Confirmed gap:** a Grep across `app/(dashboard)/access-analysis/**` returns zero references to `dashboardAnalytics`. The role-hygiene computation is complete and tested but not surfaced on the hub-story page.

### How to Surface on `/access-analysis` (Additive, No Score)

**Input data constraint:** `computeAllFindings` requires `BulkAccUser[]`, which includes `allRoles`, `allModules`, `projects[].roles`, `projects[].modules`, and `lastSignIn`. The `/access-analysis` page currently loads the leaner DC-snapshot view (`AccessInstance[]` from `loadInstanceView()`), which has `roles[]` and `modules[]` per instance but does not aggregate them into the `BulkAccUser` shape.

**Recommended approach: new `lib/server/roleHygieneView.ts`** that:
1. Queries the minimum fields from `AccDcProjectUser`, `AccDcProjectUserRole`, `AccDcProjectUserProduct`, `AccDcUser` (the same tables already used by `loadInstanceView()`).
2. Assembles a compatible `BulkAccUser[]`-like structure (or a minimal subset that satisfies `computeAllFindings()`).
3. Calls `computeAllFindings()` and returns `{ junkRoles, duplicateRoles, outlierCombos }` (dropping `roleSeverityIndex` — it drives `/users` inline badges which are not the rendering target here).
4. Added to `Promise.all` in `mainCharts.tsx`.

VERIFY: Whether assembling `BulkAccUser[]` from DC-snapshot tables alone satisfies the `lastSignIn` requirement (it needs user.lastSignIn; `AccDcUser` may not carry this field — if not, the `allInactive90d` signal will always be vacuously true and should be labeled as such in the panel subtitle).

**Rendering target:** A new `HygieneFacts.tsx` collapsible panel in `AccessAnalysisCharts.tsx`:
- Lists junk-role findings as fact-rows: role name, signal flags (no member count assigned / no modules / all-inactive — plain language, no severity color-coding per "descriptive not prescriptive" constraint).
- Lists duplicate pairs as a table: roleA | roleB | shared modules.
- Outlier combos: a compact table of rare module combinations with member count and percentage.
- Panel subtitle includes the coverage caveat: "Computed from DC-snapshot members (428/1,152 projects)."

---

## Part C: DC Re-Extraction Runbook

### Verified Scripts

| Script | Purpose | Auth mechanism |
|---|---|---|
| `scripts/dc-build-extract-list.cjs` | Builds ordered project-ID file from DB state (read-only, no network) | DB only |
| `scripts/dc-extract-id-list.cjs` | Submits APS DC extraction requests; handles 403 bisection, quota cap, token refresh, ingest via `lib/acc/ingestActivityZip.ts` | 3-legged APS token from DB |
| `scripts/dc-daily-ingest.cjs` | Daily cron entry point; delegates to `lib/acc/dcIngest.ts:runDcIngest()` (progressive-slice pattern) | 3-legged APS token from DB |
| `scripts/aps-login.cjs` | One-time browser-based 3-legged APS login; repairs or rotates the stored refresh token | Browser OAuth |

### APS Refresh-Token Rotation Hazard

APS v2 refresh tokens are **single-use**. When `dc-extract-id-list.cjs` calls `refreshAccessToken()` (lines 70–100), APS returns both a new `access_token` and a new `refresh_token`. Both are persisted to `Account.refresh_token` and `Account.access_token` in the DB. If the script crashes between the APS API call and the `prisma.account.update`, the old token is invalidated and the new one is lost — the dashboard's Autodesk login breaks. Recovery: run `scripts/aps-login.cjs`.

Mitigation: keep `DC_MAX_REQUESTS` small (10–20) per run so each run is short, reducing the window for a crash-between-refresh-and-persist. The persist happens before any extraction (in `refreshAccessToken`, not mid-batch).

### Quota Mechanics (Verified from `lib/acc/dcIngest.ts`)

- `loadQuotaUsedToday()` counts **both** `AccDcIngestRun.quotaUsed` (set by `runDcIngest`) and `AccDataConnectorJob` row count (set by `dc-extract-id-list.cjs`). Both paths contribute to the shared daily count.
- Default safe daily budget: 20 requests. Env var to override: `DC_DAILY_SAFE_BUDGET` (integer, capped at 25 in code). Note: the env var name is `DC_DAILY_SAFE_BUDGET`, not `DC_SAFE_BUDGET`.
- `DC_PRIORITY_BACKFILL=1` reorders slices inside `dc-daily-ingest.cjs` only; has no effect on `dc-extract-id-list.cjs` (which uses the ID file order).
- `DC_FAIRNESS_RESERVE` controls reserve slots within `dc-daily-ingest.cjs`'s prioritized ordering only.
- `DC_SKIP_ADMIN_SNAPSHOT=1` skips the admin-CSV diff in `dc-daily-ingest.cjs`. Use for intra-day continuation batches to prevent a partial admin CSV from triggering a false quarantine.
- `DC_BACKFILL_CUTOFF_DATE=YYYY-MM-DD` sets a historical ceiling date for `dc-daily-ingest.cjs`'s progressive extraction.

### Concrete Re-Extraction Runbook

**Goal:** Re-extract all-time activity (from 2019-01-01 to now) for all 428 admin-accessible projects using `dc-extract-id-list.cjs`. The 428 projects fit into `ceil(428/50) = 9 requests` if all succeed; 403-triggered bisection may double individual chunks (worst case ~18 total).

**Step 1 — Verify / refresh the APS token.**
```
node --env-file=.env scripts/aps-login.cjs
```
Run if: (a) last extraction was > 1 hour ago, or (b) any prior run crashed after calling APS. Opens a browser, complete the Autodesk sign-in, and the new `access_token` + `refresh_token` persist to DB automatically. The script binds port 6263 by default (not 3000) — dashboard can remain running.

**Step 2 — Build the ordered project-ID file.**
```
DC_START_DATE=2019-01-01T00:00:00.000Z \
DC_LIST_OUT=tmp/dc-extract-list.txt \
node --env-file=.env scripts/dc-build-extract-list.cjs
```
Prints: `eligible=N remaining=M est. requests=ceil(M/50)`. The file lists IDs in value-first order (projects with existing activity first; zero-activity last). Re-running regenerates based on current `AccDcBackfillProgress.earliestCovered` state — this is the resume mechanism. No DB writes, no network.

**Step 3 — Dry-run to confirm plan.**
```
DC_IDS_FILE=tmp/dc-extract-list.txt \
DC_START_DATE=2019-01-01T00:00:00.000Z \
DC_MAX_REQUESTS=3 \
DC_DRY_RUN=1 \
node --env-file=.env scripts/dc-extract-id-list.cjs
```
Confirms: auth token valid, account ID resolved, chunk plan printed, no requests submitted. Check output for `account=<id>; token OK`.

**Step 4 — Run daily extraction batches (repeat until complete).**
```
DC_IDS_FILE=tmp/dc-extract-list.txt \
DC_START_DATE=2019-01-01T00:00:00.000Z \
DC_MAX_REQUESTS=20 \
node --env-file=.env scripts/dc-extract-id-list.cjs
```
- `DC_MAX_REQUESTS=20` stays within the ~25 req/UTC-day safe budget (leaves 5 for the cron's daily run).
- `DC_CHUNK_SIZE` defaults to 50 (APS hard cap per request). Do not increase.
- `DC_NO_BISECT` defaults to false — allow bisection on 403 errors to recover partial chunks.
- Script records every submitted `AccDataConnectorJob` row, which `loadQuotaUsedToday` counts.
- On HTTP 429 (quota exhaustion), script throws and exits. Re-run the next UTC day.

**Step 5 — Resume the next UTC day.**
```
DC_LIST_OUT=tmp/dc-extract-list.txt node --env-file=.env scripts/dc-build-extract-list.cjs
```
Regenerates the remaining IDs (already-extracted projects drop out because their `AccDcBackfillProgress.earliestCovered` covers the floor date). Then repeat Step 4.

**Step 6 — Intra-day continuation (optional, if budget allows).**
If a second batch is needed the same UTC day:
```
DC_SKIP_ADMIN_SNAPSHOT=1 \
DC_IDS_FILE=tmp/dc-extract-list.txt \
DC_START_DATE=2019-01-01T00:00:00.000Z \
DC_MAX_REQUESTS=5 \
node --env-file=.env scripts/dc-extract-id-list.cjs
```
`DC_SKIP_ADMIN_SNAPSHOT=1` prevents a partial admin CSV from triggering a quarantine diff. Use for intra-day continuation only.

**Step 7 — Verify "current through today."**

Run against the local Postgres:
```sql
-- Coverage: how many of the 428 projects have all-time data (earliestCovered <= 2019-01-02)?
SELECT
  COUNT(*) FILTER (WHERE "earliestCovered" <= '2019-01-02'::date) AS fully_backfilled,
  COUNT(*) AS total_with_progress,
  MIN("earliestCovered") AS oldest_covered,
  MAX("latestCovered") AS newest_covered
FROM "AccDcBackfillProgress";

-- Activity volume and date range
SELECT
  COUNT(*) AS total_rows,
  MIN("createdAt") AS earliest_activity,
  MAX("createdAt") AS latest_activity,
  COUNT(DISTINCT "projectId") AS distinct_projects
FROM "AccActivity";

-- Today's quota usage (to verify you did not exceed the daily cap)
SELECT
  COUNT(*) AS jobs_today
FROM "AccDataConnectorJob"
WHERE "startedAt"::date = CURRENT_DATE;
```

**Phase gate:** Do not start calendar heatmap, hottest objects, behavior-mix, or scenario pivot presets until:
- `fully_backfilled` equals the expected project count (~428), AND
- `latest_activity` is within 48 hours of the extraction run date.

---

## Component Boundaries Summary

| Component | Layer | File | Change Type |
|---|---|---|---|
| `lib/server/scenarioPivotView.ts` | Server/Domain | NEW | Additive |
| `lib/server/roleHygieneView.ts` | Server/Domain | NEW | Additive |
| `lib/server/activityCalendarView.ts` | Server/Domain | NEW | Additive |
| `lib/server/hotObjectsView.ts` | Server/Domain | NEW | Additive |
| `lib/server/interconnectionsView.ts` | Server/Domain | NEW | Additive |
| `app/(dashboard)/access-analysis/scenarioActions.ts` | Route/Server Action | NEW | Additive |
| `app/(dashboard)/access-analysis/components/ScenarioExplorer.tsx` | Client | NEW | Additive |
| `app/(dashboard)/access-analysis/components/HygieneFacts.tsx` | Client | NEW | Additive |
| `app/(dashboard)/access-analysis/mainCharts.tsx` | RSC | MODIFY | Additive (new loaders in Promise.all) |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` | Client | MODIFY | Additive (new props + panels; existing panels untouched) |
| `lib/acc/moduleOverrides.ts` (moved from `app/`) | Domain | MIGRATE | Prerequisite for pivot engine; fixes 4 of 6 dep-cruiser warnings |
| `lib/acc/dashboardAnalytics.ts` | Domain | NO CHANGE | Already correct; consumed by `roleHygieneView.ts` |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Client-side pivot over raw activity rows
**What:** Load full `AccActivity` rows to the client, pivot in-browser.
**Why bad:** 623k rows x serialization = transport explosion; defeats the TTL-cache pattern; reverses the `moduleActivityView` fix.
**Instead:** Always `GROUP BY` server-side; ship only aggregated `PivotCell[]`.

### Anti-Pattern 2: New tRPC procedure for on-demand pivots
**What:** Add a tRPC route to `server/routers/acc-activity.ts` for the scenario-picker path.
**Why bad:** Introduces a client-side `useQuery` and a new React Query key; adds latency for the auth wrapper; the existing server-action pattern (coordinationActions, folderTerrainActions) is already established for on-demand heavy loads.
**Instead:** `"use server"` action in `scenarioActions.ts`.

### Anti-Pattern 3: Importing `dashboardAnalytics.ts` directly from a client component
**What:** Call `computeAllFindings()` inside `AccessAnalysisCharts.tsx` on the client.
**Why bad:** Requires shipping `BulkAccUser[]` to the browser (large payload); `lib/acc/dashboardAnalytics.ts` is a pure function that works server-side.
**Instead:** Run `computeAllFindings()` inside `roleHygieneView.ts` (server-only), pass only the `DashboardFindings` result as a prop.

### Anti-Pattern 4: Growing the scripts-to-app import count
**What:** Import `moduleOverrides.ts` from `lib/server/scenarioPivotView.ts` while it still lives under `app/(dashboard)/access-analysis/`.
**Why bad:** Adds a 7th dependency-cruiser warning; entrenches the boundary violation that CONCERNS.md lists as cleanup priority 1.
**Instead:** Migrate `moduleOverrides.ts` to `lib/acc/` first, then import from there.

---

## Dashboard Self-Check

**Context loaded:**
- `.planning/PROJECT.md` (v3.0 milestone, constraints, decisions)
- `.planning/codebase/ARCHITECTURE.md`, `CONCERNS.md`, `INTEGRATIONS.md`
- `app/(dashboard)/access-analysis/page.tsx`, `mainCharts.tsx`
- `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` (full file)
- All 9 `lib/server/*View.ts` files read
- `lib/acc/dashboardAnalytics.ts` (full file) + test file header
- `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` (surfacing location confirmed)
- `app/(dashboard)/users/dashboard/selectionContext.tsx` (import confirmed)
- `scripts/dc-build-extract-list.cjs`, `dc-daily-ingest.cjs`, `dc-extract-id-list.cjs`, `aps-login.cjs`
- `lib/acc/dcIngest.ts` quota section (lines 715–1122)
- `prisma/schema.prisma` — `AccActivity`, `AccDcIngestRun`, `AccDcBackfillProgress`, `AccDataConnectorJob` models

**Evidence:**
- All 7 loader functions in `mainCharts.tsx` verified by reading the file.
- `moduleOverrides.ts` location and 4 scripts-to-app imports verified via CONCERNS.md + Grep.
- `computeAllFindings` gap confirmed: Grep of `app/(dashboard)/access-analysis/**` for `dashboardAnalytics` returns 0 matches.
- `dashboardAnalytics.ts` is imported only by `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` and `selectionContext.tsx`.
- DC flag names verified from `lib/acc/dcIngest.ts` source (`DC_DAILY_SAFE_BUDGET` not `DC_SAFE_BUDGET`; `DC_FAIRNESS_RESERVE`, `DC_SKIP_ADMIN_SNAPSHOT`, `DC_BACKFILL_CUTOFF_DATE`, `DC_PROGRESSIVE_SLICE_DAYS`).
- Token rotation persist logic confirmed in `dc-extract-id-list.cjs` lines 90–99.
- `AccDcBackfillProgress` model verified in `prisma/schema.prisma` (line 810).

**Constraints applied:**
- Additive integration confirmed — 7 existing loaders preserved; 14 existing panels untouched.
- No severity scoring surfaced on `/access-analysis` (owner constraint: descriptive not prescriptive).
- No new WebGL — all new charts are ECharts series (heatmap, sankey, chord are standard ECharts types).
- `import "server-only"` on all new loaders.
- `components/` does not reach Prisma or `server/db.ts`.
- `no-scripts-to-app` warning count does not grow (the `moduleOverrides.ts` migration prerequisite reduces it from 6 to 2).
- Baseline direct-Prisma-in-UI finding (`coordinationActions.ts`) not expanded.

**Gates:**
- `npx tsc --noEmit` before rebuild.
- `npm run repo-map:check` after `moduleOverrides.ts` migration.
- `npm run build` + Task Scheduler restart for deploy.

**VERIFY:**
- Whether `AccDcUser` carries a `lastSignIn` field (needed for the `allInactive90d` signal in `findJunkRoles`). If absent, the signal will always be vacuously true for all DC-snapshot users and must be labeled as approximate in the panel.
- The exact `BulkAccUser[]` fields consumed by `computeAllFindings()` vs what is derivable from DC-snapshot tables alone — determines whether `roleHygieneView.ts` can avoid touching `AccProjectMember` (the `/users` router's heavier source).
