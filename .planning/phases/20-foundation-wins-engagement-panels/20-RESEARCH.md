# Phase 20: Foundation Wins & Engagement Panels - Research

**Researched:** 2026-07-02
**Domain:** Four new ECharts analytics panels on `/access-analysis`, each reading an
already-small or already-materialized Prisma table (PERM-01, PIPE-01, ISSUE-01, ENG-01).
**Confidence:** HIGH for PERM-01/PIPE-01/ISSUE-01 (every model/field/loader-analog verified
directly against `prisma/schema.prisma` and existing loader files, plus a live read-only
DB query this pass). **HIGH-but-BLOCKING for ENG-01** — the CONTEXT.md/REQUIREMENTS.md-cited
data source (`AccProjectMember.lastSignIn`) was live-queried this pass and is **100% NULL**
across all 14,566 rows. See `<user_constraints>` and the ENG-01 critical-finding section below
before planning that panel.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Page placement & ordering — domain-grouped insertion**
- Each panel joins its natural neighborhood in the existing flow:
  - **Dormant users** near Role distribution (people/engagement neighborhood).
  - **Permission footprint** after the role charts (access domain).
  - **Issue-fetch coverage donut** directly above the Model Coordination section, so
    coverage precedes the issue metrics beside/below it and Phase 21's funnel lands
    under it.
  - **Ingest freshness** as a compact secondary strip at the very bottom of the page.
- No new appended "v2.3 section"; the page keeps reading as themes, which also
  pre-positions Phase 23's grouping review.

**Permission footprint chart form**
- Horizontal bars, one per role, sorted by total bytes descending; bar length = bytes
  with human-readable axis/labels (e.g. "42.3 GB"); folder count as a secondary
  label/tooltip per bar.
- Top ~10 roles + "Other" rollup (exact N is Claude's discretion around 10, chosen
  for comfortable panel height).
- Clicking a role drills to its per-project breakdown — a drill list of that
  role's projects with folder count + bytes each, sourced straight from
  `AccFolderPermissionSummary` (no raw-table touch).

**Dormant users interaction**
- Vertical bar per recency band, ordered <30d / 30–90d / 90–365d / >365d / Never
  signed in; the "Never signed in" bar visually distinguished (muted/hatched — exact
  treatment Claude's discretion).
- Clicking a band opens the existing drill list (same `onSliceClick`/`activeSlice`
  convention as Activity by role).
- Drill rows: user name, company, exact last sign-in date ("Never" for the null
  bucket), sorted most-dormant first (oldest lastSignIn at top; Never bucket rows
  are inherently uniform).

**Issue-fetch coverage donut interaction**
- Clicking any bucket drills to the list of projects in that bucket — including
  `ok` and `zero_issues`, not just problem buckets (consistent click behavior across
  the whole chart).

**Ingest freshness look**
- Single slim row of small stat tiles: last run started/ended, status badge, duration,
  projects processed, and throughput as "N activity rows this run" (live from
  `AccActivity` by `ingestRunId`). No chart, no run history.
- Muted styling so it reads as ops metadata, not an analytics headline.
- Stale-run flag: amber badge when the latest run is old (threshold ~36h — exact value
  Claude's discretion, aligned with the ≤1-ingest-cycle staleness doc from Ph19).

**Cross-filter scope**
- Permission footprint, dormant users, and issue coverage all obey the FilterBanner
  project selection (their sources are project-keyed).
- Ingest freshness stays account-global with an explicit "account-wide" caption.

### Claude's Discretion
- Exact top-N cutoff (around 10), exact stale threshold (around 36h), exact tile copy,
  spacing, empty-state wording, "Never signed in" visual treatment, loading skeletons,
  and how the 4 loaders consolidate into the `mainCharts.tsx` fan-out — all within the
  Dashboard defaults above.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (Milestone-level deferrals — treemap,
tier×depth heatmap, verb breakdown, module coverage — are already recorded in
`REQUIREMENTS.md` Future Requirements.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| PERM-01 | Permission reach by role — folder count + human-readable bytes from `AccFolderPermissionSummary` (22,082 rows), `totalBytes` BigInt converted server-side | Model verified `prisma/schema.prisma:549-561`; loader analog `lib/server/dcCoverageView.ts`/`projectCoverageView.ts`; live query confirms 22,082 rows / 107 distinct roleIds / 904 distinct projectIds / 0 unmatched roleIds against `AccRole` (155 rows); exact code example below |
| PIPE-01 | Compact ingest-freshness panel — latest `AccDcIngestRun` + live `AccActivity` throughput by `ingestRunId`, never `rowsByModule`, no polling | Model verified `prisma/schema.prisma:812-829`; `ingestRunId` indexed on `AccActivity` (`schema.prisma:582`); live query confirms latest run (`status: "quarantined"`, 1,086 `AccActivity` rows for that `ingestRunId`, 687,170 rows with `ingestRunId IS NULL`) — status is NOT a fixed enum, see Pitfall below |
| ISSUE-01 | Issue-fetch coverage donut — 4 honest buckets from `AccIssueProjectFetchResult.status` for the latest `AccIssueFetchRun`, coverage precedes metric, drills to project list per bucket | Models verified `prisma/schema.prisma:871-902`; loader analog `lib/server/coordinationByProjectView.ts` (already reads `AccIssueFetchRun`); live query confirms latest run breakdown `error=596, zero_issues=437, ok=119` (projectsTotal 1,152) — a genuinely lopsided, honest distribution |
| ENG-01 | Dormant users by `AccProjectMember.lastSignIn` recency bands with explicit "Never signed in" `null` bucket | **CRITICAL FINDING**: `AccProjectMember.lastSignIn` is confirmed 100% NULL (14,566/14,566 rows) in the live DB this pass — the literal cited source cannot produce a real recency distribution. A reliable alternative (`AccDcUser.lastSignIn`, 1,254/3,870 non-null) already backs the `/users` `activeUserTiers.ts` precedent. See dedicated section below — this is the single most important thing the planner must resolve before writing PLAN.md. |
</phase_requirements>

## Summary

Three of the four requirements (PERM-01, PIPE-01, ISSUE-01) are exactly as low-risk as
ROADMAP.md/PROJECT.md describe: each reads an already-small or already-materialized table
via a `lib/server/<name>View.ts` loader that is structurally a smaller variant of an
existing, working loader in this codebase (`dcCoverageView.ts`, `projectCoverageView.ts`,
`coordinationByProjectView.ts`). All three have their exact Prisma fields verified against
`prisma/schema.prisma`, and this research pass ran live read-only counts against the local
Postgres DB to confirm real values (not just row-count estimates).

**ENG-01 is different and needs a decision before planning.** REQUIREMENTS.md/CONTEXT.md
name `AccProjectMember.lastSignIn` as the data source. A live query this pass
(`SELECT COUNT(*) FROM "AccProjectMember" WHERE "lastSignIn" IS NULL`) returns **14,566 of
14,566** — literally every row. Building the chart exactly as specified against this field
renders a single 100%-height "Never signed in" bar and four empty bands — technically
satisfies the letter of the success criteria (an honest null-bucket, verifiable against any
project) but delivers none of the "who has gone quiet" story CONTEXT.md's interaction design
implies. The codebase already has a working, non-degenerate alternative: `AccDcUser.lastSignIn`
(account-level Data Connector snapshot; 3,870 rows, 1,254 non-null = 32.4%) is the exact field
`lib/acc/dcUserAssembly.ts:306` resolves into `BulkAccUser.lastSignIn`, which `/users`'
`lib/acc/activeUserTiers.ts` already buckets into 7d/30d/90d/>90d/Never for `ActiveUserTiersWidget`.
Swapping ENG-01's source to `AccDcUser` (joined per-project through `AccDcProjectUser`) produces
a real distribution but narrows project coverage from the full 1,153-project live-API universe
to the ~550 DC-covered projects, and technically deviates from CONTEXT.md's locked model
citation — a data-authority change, not a free implementation choice. This is flagged as the
top Open Question below; do not silently pick one without recording the choice in PLAN.md.

**Primary recommendation:** Build PERM-01, PIPE-01, ISSUE-01 following the exact
`lib/server/<name>View.ts` → `<name>Counts.ts` (pure, tested) → `components/<Name>Chart.tsx`
→ `mainCharts.tsx`/`AccessAnalysisCharts.tsx` registration pattern, reusing
`buildProjectNameMap`/`resolveProjectName` (`lib/server/folderActivityView.ts:31-57`) and
`formatRelativeTime`/`formatAbsolute` (`app/(dashboard)/access-analysis/relativeTime.ts`)
verbatim. For ENG-01, resolve the data-source question first (recommend: switch to
`AccDcUser.lastSignIn` joined via `AccDcProjectUser`, with an explicit "DC-covered projects
only" coverage caption mirroring `dcCoverageView.ts`'s convention), then apply the same
registration pattern.

## User-Constraint × Data-Reality Cross-Check

This section double-checks every locked CONTEXT.md decision against what the live schema/data
actually supports, since CONTEXT.md's discuss-phase session did not run a live DB query.

| Locked decision | Data reality (verified this pass) | Status |
|---|---|---|
| PERM-01: role has `roleId`/`totalBytes`/`folderCount`, drills to per-project rows | `AccFolderPermissionSummary` unique on `(projectId, roleId)`, exactly what a role→projects drill needs; all 107 distinct `roleId`s resolve to a real `AccRole.name` (0 unmatched) | Confirmed — CONTEXT.md's decision is directly buildable |
| PIPE-01: "N activity rows this run" from `AccActivity` by `ingestRunId` | Latest run (`cmr3gct8z0000t8z4gmo79kqe`, 2026-07-02) has exactly 1,086 matching `AccActivity` rows; `ingestRunId` is indexed (`schema.prisma:582`) | Confirmed — cheap, index-covered `count()` |
| PIPE-01: status badge | CONTEXT.md implies success/failure-style badges; live latest-run `status` is `"quarantined"` — a value not covered by any status-badge precedent in this repo (only "open/closed/completed/..." for issues) | **New finding** — status is a free-form string with at least `running/success/partial/failed/quarantined` observed across scripts + live data; badge must not assume a 2-state enum |
| ISSUE-01: 4 honest buckets, click drills to project list including `ok`/`zero_issues` | Latest `AccIssueFetchRun` (`cmq5hrdy70000q0z4cztsfjwu`, finished 2026-06-08): `error=596, zero_issues=437, ok=119` (of `projectsTotal=1152`); every `AccIssueProjectFetchResult` row already carries `projectName` (no join needed) | Confirmed — and worth surfacing in the plan: `error` is the LARGEST bucket, a genuinely notable workshop moment ("which projects can't we see into?" per CONTEXT.md's `<specifics>`) |
| ENG-01: recency bands + explicit Never bucket, verified against a real project | `AccProjectMember.lastSignIn` is NULL for all 14,566 rows across every project — the Never bucket isn't just present, it's the ONLY populated bucket | **Blocking finding** — see dedicated section below |

## ENG-01 Critical Finding — `AccProjectMember.lastSignIn` Is Dead Data

**What was verified (live, read-only, this pass):**

```sql
-- AccProjectMember: 14,566 total rows, 14,566 NULL lastSignIn (100%)
SELECT COUNT(*) FROM "AccProjectMember";                            -- 14566
SELECT COUNT(*) FROM "AccProjectMember" WHERE "lastSignIn" IS NULL; -- 14566

-- AccDcProjectUser (the other per-project lastSignIn field): also 100% NULL
SELECT COUNT(*) FROM "AccDcProjectUser";                            -- 22835
SELECT COUNT(*) FROM "AccDcProjectUser" WHERE "lastSignIn" IS NULL; -- 22835

-- AccDcUser (account-level, DC snapshot): the ONLY table with real data
SELECT COUNT(*) FROM "AccDcUser";                                   -- 3870
SELECT COUNT(*) FROM "AccDcUser" WHERE "lastSignIn" IS NULL;        -- 2616 (1,254 non-null = 32.4%)
```

**Why this matters:** REQUIREMENTS.md's ENG-01 text and CONTEXT.md's locked decisions both
cite `AccProjectMember.lastSignIn` as the source. Every `AccProjectMember` row in this
account's live-API sync has a null sign-in timestamp — this is not a partial-coverage gap
(like the DC 550/1,153 split), it is total. `AccDcProjectUser.lastSignIn` (the DC-extracted
per-project analog) is equally dead. The only column in the schema that actually carries
sign-in timestamps is `AccDcUser.lastSignIn` — an **account-level** (not per-project) field.

**Existing precedent for the correct fix (verified, HIGH confidence):**
- `scripts/sync-acc-users.ts:1-6` — header comment: "refreshes the AccMemberCache from ACC
  HQ v1, which is the only path that populates `companyRole`, `lastSignIn`, and
  `isAccountAdmin`" — writes into `AccMemberCache` (a per-email JSON blob, `id/email/data
  Json/syncedAt`), a THIRD location, not directly queryable by SQL `WHERE` without
  unpacking JSON. Not recommended as the ENG-01 source (opaque JSON, no direct SQL
  aggregate).
- `lib/acc/dcUserAssembly.ts:306` — `lastSignIn: u.lastSignIn ?? null` resolves the
  top-level `BulkAccUser.lastSignIn` from `AccDcUser.lastSignIn` (`u` = the joined
  `AccDcUser` row). This is the account-level source already trusted elsewhere.
- `lib/acc/activeUserTiers.ts` — `bucketActiveUserTier(lastSignIn, now)` buckets exactly
  this resolved value into `7d/30d/90d/>90d/Never`, defensively treating `null`/`undefined`/
  unparseable strings as `"Never"`. Used by `/users`' `ActiveUserTiersWidget` (DASH-02).
- `scripts/scratch/p6-enriched-field-coverage.cjs:207-217` — the P6 "cold" risk-flag
  calculation already uses `u."lastSignIn"` (the `AccDcUser` alias) as "account lastSignIn"
  for exactly this dormancy concept, confirming this is the account's own established
  choice when `AccProjectMember`/`AccDcProjectUser` per-instance sign-in is unusable.

**Options for the planner (pick one, record the choice in PLAN.md — do not silently swap):**

1. **Option A — build literally as specified.** Read `AccProjectMember.lastSignIn`,
   bucket per CONTEXT.md's bands. Result: an honest chart showing 100% "Never signed in"
   for every project, 0 in every other band. Technically satisfies all 5 phase success
   criteria (the Never bucket is real, verifiable against any project, not silently
   dropped). Cheapest, zero data-authority deviation, but the panel has no real
   distribution to show and undercuts the "who has gone quiet" workshop story CONTEXT.md's
   interaction design assumes. Still arguably a legitimate, honest finding in its own
   right ("the live ACC API sync never captures sign-in timestamps for this account") worth
   a caption, consistent with PROJECT.md's under-covered-data-labeled convention.
2. **Option B (recommended) — source from `AccDcUser.lastSignIn`, scoped per-project via
   `AccDcProjectUser`.** Join `AccDcProjectUser` (has `projectId` + `userId`) to
   `AccDcUser` (`id` = `userId`, has the real `lastSignIn`) to get project-scoped rows
   with real recency data (1,254 members with a real timestamp, 2,616 without, out of
   3,870 DC-known users). This is a genuine, already-precedented pattern (`dcUserAssembly.ts`)
   and produces a real, non-degenerate distribution across the 4 dated bands + Never. Cost:
   scopes the panel to the ~550 DC-covered projects (not the full 1,153 live-API set) —
   needs an explicit "DC-covered projects only" caption, mirroring `dcCoverageView.ts`'s
   existing convention (`loadDcCoverage()` — covered ≈ 550 / total ≈ 1,153). This is a
   data-authority change from the literal REQUIREMENTS.md citation and should be called
   out explicitly in PLAN.md as a deviation with rationale, not silently substituted.
3. **Option C — ship both.** A small honest note ("live-API sign-in data is not captured for
   this account; showing Data-Connector-derived sign-in instead, N of M DC-covered projects")
   plus the Option B chart. Most transparent, marginal extra copy-writing cost over Option B.

This researcher's recommendation is **Option B or C** — Option A technically passes every
success criterion but ships a panel that cannot show what CONTEXT.md's interaction design
(drill rows sorted "most-dormant first", a visually distinguished-but-minority Never bucket)
assumes exists. If the planner or a quick discuss-phase amendment prefers to stay strictly
spec-literal (Option A), that is a legitimate, defensible choice too — just make it a
recorded decision, not an unexamined default.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| echarts | 6.1.0 (installed) | `bar` series for PERM-01/ENG-01, `pie` (donut) for ISSUE-01 | Already used repo-wide; no new series type needed — `bar` and `pie` are both proven in this exact route (`ActivityByRolePieChart.tsx`, `template-mty/components/PermissionAccessChart.tsx`) |
| echarts-for-react | 3.0.6 (installed) | React wrapper | Wrapped by the canonical `components/ui/EChart.tsx` |
| `@/components/ui/EChart` | in-repo | Theme-aware canonical chart wrapper (`resolvedTheme` via `next-themes`, `mergeEChartsTheme`) | **Do not** import the legacy `app/(dashboard)/access-analysis/components/EChart.tsx` — its own header comment marks it superseded; every current pie/donut/bar chart in this route already imports the canonical one |

No new npm dependencies for any of the 4 panels.

### Supporting (already in repo, reuse verbatim)
| Helper | File | Use |
|--------|------|-----|
| `buildProjectNameMap` / `resolveProjectName` | `lib/server/folderActivityView.ts:31-57` | PERM-01's per-project drill labels (merges `AccProject` authoritative over `AccDcProject`) |
| `formatRelativeTime` / `formatAbsolute` | `app/(dashboard)/access-analysis/relativeTime.ts` | PIPE-01's "started/ended" timestamps + staleness chip (same helper `CoordinationByProject.tsx` uses for "Extracted N ago") |
| `bucketActiveUserTier` (pattern, not literal reuse) | `lib/acc/activeUserTiers.ts` | ENG-01's null-defensive bucketing pattern — the exact band boundaries differ (CONTEXT.md wants <30d/30–90d/90–365d/>365d/Never vs. this file's 7d/30d/90d/>90d/Never), so write a new bucketing function mirroring this one's defensive null/parse-failure handling, not a literal import |
| `buildRoleColorMap` | `app/(dashboard)/access-analysis/roleColors.ts` | PERM-01's per-role bar colors — reuse instead of inventing a new palette |
| `TIER_COLORS` | `app/(dashboard)/access-analysis/folderTerrain.ts` | Already imported by `template-mty/components/PermissionAccessChart.tsx` for a similar tier-colored bar chart — one more available palette source if role colors read poorly against bytes-length bars |

**Installation:** none — zero new packages.

## Architecture Patterns

### Recommended file additions (mirrors the proven registration pattern exactly)

```
lib/server/
  permissionFootprintView.ts       # PERM-01 loader (NEW)
  ingestFreshnessView.ts           # PIPE-01 loader (NEW)
  issueFetchCoverageView.ts        # ISSUE-01 loader (NEW) — see Open Question re: extending
                                    #   coordinationByProjectView.ts instead
  signInRecencyView.ts             # ENG-01 loader (NEW) — pending Option A/B/C decision
  permissionFootprintView.test.ts  # sibling test, pure-assembly-only (no DB)
  ingestFreshnessView.test.ts
  issueFetchCoverageView.test.ts
  signInRecencyView.test.ts

app/(dashboard)/access-analysis/
  permissionFootprintCounts.ts     # pure transform + formatBytes()
  ingestFreshnessCounts.ts         # pure transform (staleness calc)
  issueFetchCoverageCounts.ts      # pure transform
  signInRecencyCounts.ts           # pure transform + bucket fn
  __tests__/permissionFootprintCounts.test.ts
  __tests__/ingestFreshnessCounts.test.ts
  __tests__/issueFetchCoverageCounts.test.ts
  __tests__/signInRecencyCounts.test.ts
  components/PermissionFootprintChart.tsx
  components/IngestFreshnessPanel.tsx
  components/IssueFetchCoverageDonut.tsx
  components/DormantSignInChart.tsx        # naming: Claude's discretion; avoid clashing with existing "dormantActivity.ts" (a DIFFERENT dormancy concept — zero-activity, not sign-in-recency)
  __tests__/PermissionFootprintChart.test.tsx   # component-level, follow existing *PieChart.test.tsx style
  __tests__/IngestFreshnessPanel.test.tsx
  __tests__/IssueFetchCoverageDonut.test.tsx
  __tests__/DormantSignInChart.test.tsx
```

**Verified test-location convention** (two different conventions in this repo — don't mix
them up):
- `lib/server/*View.ts` loaders → **sibling** `lib/server/<name>View.test.ts` testing ONLY
  a pure, exported assembly function (e.g. `buildCoverage` in `projectCoverageView.ts`,
  `assembleDcCoverage` in `dcCoverageView.ts`) with fabricated arrays — **never hits the
  real DB**, per `lib/server/projectCoverageView.test.ts` (read in full this pass).
- `app/(dashboard)/access-analysis/*.ts` pure transforms AND `components/*.tsx` → tests
  live in the single shared `app/(dashboard)/access-analysis/__tests__/` directory (verified:
  `__tests__/roleCounts.test.ts`, `__tests__/dormantActivity.test.ts`,
  `__tests__/RolesPieChart.test.tsx` all sit in this one folder, not beside their source
  files).

### `mainCharts.tsx` integration (exact, current 8-entry `Promise.all`)

```ts
// app/(dashboard)/access-analysis/mainCharts.tsx:30-40 (verified current state)
const [view, moduleRows, activityActorRows, coordinationData, coverage,
       terrainProjects, timeline, dcCoverage] = await Promise.all([
  loadInstanceView(), loadModuleActivity(), loadActivityByActor(),
  loadCoordinationByProject(), loadProjectCoverage(), loadTerrainProjects(),
  loadActivityTimeline(), loadDcCoverage(),
]);
```

**Recommended consolidation (success criterion 5's "consolidated per data domain" instruction):**
- **ISSUE-01 → fold into the existing `loadCoordinationByProject()` call**, not a new
  top-level `Promise.all` entry. `coordinationByProjectView.ts:33-36` already does
  `db.accIssueFetchRun.findFirst({ orderBy: { startedAt: "desc" }, ... })` for its
  footnote — the SAME latest run the coverage donut needs. Extend
  `CoordinationByProjectData` with an additive `issueCoverage: { status: string; count:
  number; projects: {projectId,projectName,issueCount}[] }[]` field computed inside the
  same function (one more `db.accIssueProjectFetchResult.groupBy` + one `findMany` for the
  drill rows, both cheap per the live counts above — 3,458 total rows across all runs,
  a handful for one run). This keeps `mainCharts.tsx`'s entry count at 8 (unchanged) for
  ISSUE-01. Alternative (if the planner prefers a cleaner boundary): a standalone
  `issueFetchCoverageView.ts` is also fully workable — ARCHITECTURE.md flagged this as an
  explicit phase-level design call either way; this research recommends the extend-in-place
  option given the exact same latest-run row is already being read.
- **PERM-01, PIPE-01, ENG-01 → three new top-level entries** (8 → 11). Each reads a
  genuinely distinct table/domain with no natural merge partner among the other three.
  11 entries is still comfortably under Pitfall 4's "~12 entries" unbounded-growth warning
  threshold (`PITFALLS.md` Pitfall 4) — no consolidation forcing needed beyond the
  ISSUE-01/coordination merge above. Spot-check `/access-analysis` load time before/after
  per success criterion 5 (no formal perf test exists for this — eyeball via dev server
  timing or `console.time` around `MainCharts()`, consistent with the milestone research's
  documented practice).

### `AccessAnalysisCharts.tsx` integration (exact insertion points, per CONTEXT.md ordering)

Current verified structure (`components/AccessAnalysisCharts.tsx:249-521`): StatStrip → coverage
header → ProjectPicker → FilterBanner/idle-tip → Activity-over-time (full-width) → Terrain
(collapsed) → Folder-Activity-by-Role (collapsed) → 2-col donut grid (Role distribution,
Users by company, Activity by role, Activity by company, Activity by module) → Model
Coordination (full-width) → drawers/sheets.

1. **Dormant users (ENG-01)** — new panel immediately after "Role distribution" inside (or
   directly following) the 2-col grid, matching CONTEXT.md's "near Role distribution"
   placement. Since it's a vertical bar chart (not a donut), consider `lg:col-span-2`
   full-width like the "Activity by module" panel, or its own row — Claude's discretion,
   note in the plan.
2. **Permission footprint (PERM-01)** — new panel after the role-related charts, before
   Model Coordination. A natural full-width slot right before the Model Coordination
   `<Reveal>` block (`AccessAnalysisCharts.tsx:500`).
3. **Issue-fetch coverage donut (ISSUE-01)** — directly above Model Coordination
   (`AccessAnalysisCharts.tsx:501`), inside the SAME `<Reveal>` or immediately preceding it,
   so it visually frames the section per CONTEXT.md's "coverage precedes metric".
4. **Ingest freshness (PIPE-01)** — new compact strip at the very bottom, after the Model
   Coordination block and before the drawers/sheets (`AccessAnalysisCharts.tsx:517`).

**Filtering wiring (no `applySliceFilters`/`SliceFilters` extension needed):** all three
project-keyed panels (PERM-01, ENG-01, ISSUE-01) should call
`filterRowsBySelection(rows, selected)` (`app/(dashboard)/access-analysis/projectFilter.ts:54-59`)
— the SAME "receive the project-picker filter, don't drive the shared cross-filter bus"
pattern `moduleSummary` already uses (`AccessAnalysisCharts.tsx:184-187`, deliberately opting
out of `applySliceFilters` since `ModuleActivityRow` has no `roles`/`company`). None of the 4
requirements in this phase are described as needing to filter the EXISTING role/company
donuts — CONTEXT.md's "same onSliceClick/activeSlice convention" note for ENG-01 most plausibly
means "reuse this prop-naming/highlight-and-drill pattern for the new chart's OWN local state"
(mirroring `RolesPieChart.tsx`'s local `drill`/`setDrill` state, `NoActivityBars.tsx`'s local
`open`/`setOpen` state), not "push a new `recency` dimension into the shared `SliceFilters`
object". Extending `applySliceFilters` is a real, scoped-but-nonzero cost
(`ARCHITECTURE.md` "Verified cross-filter bus" section) that nothing in CONTEXT.md's locked
decisions or Claude's-Discretion list asks for — recommend NOT extending it in this phase; flag
as an Open Question below for the planner to confirm.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Project name resolution for a project-scoped drill | A new `nameById` map merge | `buildProjectNameMap`/`resolveProjectName` (`lib/server/folderActivityView.ts:31-57`) | Every existing loader in this codebase already merges `AccProject` (authoritative, 1,153) over `AccDcProject` (550-subset) the same way — a new merge risks a subtly different precedence |
| "N time ago" / absolute-timestamp formatting for PIPE-01 | A new date formatter or a `date-fns` `formatDistanceToNow` call | `formatRelativeTime`/`formatAbsolute` (`app/(dashboard)/access-analysis/relativeTime.ts`) | Deterministic (`now` is an explicit param — unit-testable), already the exact style `CoordinationByProject.tsx`'s "Extracted N ago" chip uses |
| Per-role bar colors for PERM-01 | A new hardcoded hex palette | `buildRoleColorMap` (`app/(dashboard)/access-analysis/roleColors.ts`) | Keeps a role's color consistent with how it already reads in the Role-distribution donut and Folder-Activity-by-Role bars elsewhere on the same page |
| Human-readable byte formatting ("42.3 GB") | Ad-hoc `toFixed` math inlined in the chart component | **New, genuinely missing helper** — `formatBytes()` in the new `permissionFootprintCounts.ts` | Verified: no `formatBytes`/`prettyBytes`/`humanBytes` helper exists anywhere in this repo today (grepped `app/`, `lib/`) — this is a legitimate new addition, not a hand-roll of something that already exists. Keep it pure + unit tested in the co-located `__tests__/` file |
| Sign-in recency bucketing for ENG-01 | Literal reuse of `bucketActiveUserTier` | A NEW function with the same null-defensive shape but CONTEXT.md's band boundaries (<30d/30–90d/90–365d/>365d/Never, not 7d/30d/90d/>90d/Never) | `activeUserTiers.ts`'s bands don't match CONTEXT.md's locked bands — don't force-fit; write a sibling function following its defensive-parsing pattern instead |

**Key insight:** every loader/formatting need in this phase except `formatBytes()` already
has a proven, working analog somewhere in this codebase. The one genuinely new piece of logic
is bytes-formatting — keep it small, pure, and tested; everything else is composition of
existing verified helpers.

## Common Pitfalls

(Full milestone-level pitfall catalog is in `.planning/research/PITFALLS.md` — this section
narrows to the 5 pitfalls that apply directly to this phase's 4 requirements, plus the new
ENG-01 finding from this pass.)

### Pitfall 1 (NEW this pass): `AccProjectMember.lastSignIn` renders a degenerate chart if used as literally cited
**What goes wrong:** Building ENG-01 exactly as CONTEXT.md/REQUIREMENTS.md specify it produces
a chart with 100% of members in "Never signed in" and 0 in every dated band — every project
has zero sign-in telemetry in this dataset.
**How to avoid:** See the dedicated ENG-01 section above — pick Option A/B/C explicitly and
record the choice in PLAN.md.
**Warning signs:** A dev-time spot check of ANY project's dormant-users chart shows a single
full-height "Never" bar and nothing else — this is not a bug in the chart code, it's the
literal data state.

### Pitfall 2 (repo-wide, PITFALLS.md #3): `AccFolderPermissionSummary.totalBytes` is `BigInt`
**What goes wrong:** Passing a Prisma row with `totalBytes: BigInt` straight into RSC props
(or `JSON.stringify`) throws `TypeError: Do not know how to serialize a BigInt`. `tsc --noEmit`
does NOT catch this — it's a runtime serialization failure.
**How to avoid:** `Number(r.totalBytes)` inside `permissionFootprintView.ts`, never in the
client component. Safe here: max observed `totalBytes` in this dataset is ~2.96×10^12 bytes
(2,963,471,918,056 for the top role by bytes, live-queried this pass) — well within JS's
2^53 safe-integer range, so `Number()` conversion loses no precision at this scale.
**How to verify:** Live page load of `/access-analysis` after wiring the panel (not just
`tsc`) — confirmed no serialization error in the server log, per success criterion 1.

### Pitfall 3 (repo-wide, PITFALLS.md #2): `AccDcIngestRun.rowsByModule` is a confirmed always-zero field
**What goes wrong:** Reading `rowsByModule` for PIPE-01's throughput number renders a
permanent 0.
**How to avoid:** `db.accActivity.count({ where: { ingestRunId: run.id } })` — verified this
pass: latest run has exactly 1,086 matching `AccActivity` rows (a real, non-zero number).
Use `AccDcIngestRun` only for `status`/`startedAt`/`endedAt`/`projectsProcessed`.

### Pitfall 4 (NEW this pass): `AccDcIngestRun.status` is not a fixed 2-3-value enum
**What goes wrong:** A status badge coded for `success`/`failed` only will render an
unstyled/missing badge for the latest live run, whose `status` is `"quarantined"` (verified,
live-queried this pass — `AccDcIngestRun` row `cmr3gct8z0000t8z4gmo79kqe`, started
2026-07-02T18:00:03Z).
**How to avoid:** Grep confirms scripts set at least `running`/`success`/`partial`/`failed`
across different ingest scripts (`dc-ingest-where-i-admin.cjs:512`), and the live DB shows
`quarantined` as well. Treat `status` as an open string: map known values to a color, and
give any unrecognized value a neutral/muted "unknown status" badge rather than crashing or
rendering blank. `VERIFY:` the full enum — no single script/constant centrally defines it.

### Pitfall 5 (repo-wide, PITFALLS.md Integration Gotchas): `AccIssueFetchRun.status` can be `"running"`
**What goes wrong:** Treating the latest fetch run as always `done`/`failed` mis-labels an
in-progress extraction as complete, or a `finishedAt: null` row as an error.
**How to avoid:** The live latest run this pass IS `status: "done"` with a real `finishedAt`,
but the loader must still branch on `status === "running"` (or `finishedAt == null`) and
show an honest "extraction in progress" state rather than assuming the `AccIssueProjectFetchResult`
rows for that run are final.

### Pitfall 6 (repo-wide, PITFALLS.md #4): `mainCharts.tsx`'s `Promise.all` fan-out
**What goes wrong:** Naively adding 4 independent top-level entries pushes the fan-out from
8 to 12, right at the documented warning threshold.
**How to avoid:** Fold ISSUE-01 into the existing `loadCoordinationByProject()` call (see
Architecture Patterns above) to land at 11, not 12. Spot-check load time before/after per
success criterion 5.

## Code Examples

### PERM-01 loader (verified pattern, modeled on `dcCoverageView.ts` + `projectCoverageView.ts`)

```ts
// lib/server/permissionFootprintView.ts
import "server-only";
import { db } from "@/server/db";
import { buildProjectNameMap, resolveProjectName } from "./folderActivityView";

export interface PermissionFootprintRow {
  projectId: string;
  projectName: string;
  roleId: string;
  roleName: string;
  folderCount: number;
  totalBytes: number; // BigInt -> Number here, never on the client (Pitfall 2)
}

let cache: { at: number; rows: PermissionFootprintRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function loadPermissionFootprint(force = false): Promise<PermissionFootprintRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [summaryRows, projects, dcProjects, roles] = await Promise.all([
    db.accFolderPermissionSummary.findMany({
      select: { projectId: true, roleId: true, folderCount: true, totalBytes: true },
    }),
    db.accProject.findMany({ select: { id: true, name: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
    db.accRole.findMany({ select: { id: true, name: true } }),
  ]);

  const rows = assemblePermissionFootprint(summaryRows, projects, dcProjects, roles);
  cache = { at: Date.now(), rows };
  return rows;
}

/** Pure assembly — exported for the sibling .test.ts (no DB). */
export function assemblePermissionFootprint(
  summaryRows: ReadonlyArray<{ projectId: string; roleId: string; folderCount: number; totalBytes: bigint }>,
  projects: ReadonlyArray<{ id: string; name: string }>,
  dcProjects: ReadonlyArray<{ id: string; name: string }>,
  roles: ReadonlyArray<{ id: string; name: string }>,
): PermissionFootprintRow[] {
  const nameById = buildProjectNameMap(projects, dcProjects);
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  return summaryRows.map((r) => ({
    projectId: r.projectId,
    projectName: resolveProjectName(nameById, r.projectId),
    roleId: r.roleId,
    roleName: roleNameById.get(r.roleId) ?? "Unknown role",
    folderCount: r.folderCount,
    totalBytes: Number(r.totalBytes),
  }));
}
```

### `formatBytes` — the one genuinely new helper (co-locate in `permissionFootprintCounts.ts`)

```ts
// app/(dashboard)/access-analysis/permissionFootprintCounts.ts
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
```

### PERM-01 bar chart (verified pattern — near-direct analog of `template-mty/components/PermissionAccessChart.tsx`, already a horizontal role/tier bar chart in this codebase)

```tsx
// app/(dashboard)/access-analysis/components/PermissionFootprintChart.tsx (sketch)
"use client";
import { EChart } from "@/components/ui/EChart";
// ... follows PermissionAccessChart.tsx's exact xAxis:{type:"value"}/yAxis:{type:"category"}
// horizontal-bar shape, formatBytes() in the label formatter and tooltip, onEvents={{click}}
// wired to local drill state (see RolesPieChart.tsx's toggleDrill pattern) — NOT
// onSliceClick/toggleSliceFilter (no applySliceFilters extension needed, see Architecture
// Patterns above).
```

### PIPE-01 loader (two-query loader, still one `mainCharts.tsx` entry)

```ts
// lib/server/ingestFreshnessView.ts
import "server-only";
import { db } from "@/server/db";

export interface IngestFreshness {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  projectsProcessed: number;
  activityRowCount: number; // from AccActivity, NEVER rowsByModule (Pitfall 3)
}

export async function loadIngestFreshness(): Promise<IngestFreshness | null> {
  const run = await db.accDcIngestRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, endedAt: true, status: true, projectsProcessed: true },
  });
  if (!run) return null;

  const activityRowCount = await db.accActivity.count({ where: { ingestRunId: run.id } });

  return {
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt?.toISOString() ?? null,
    status: run.status,
    projectsProcessed: run.projectsProcessed,
    activityRowCount,
  };
}
```

### ISSUE-01 — extend `coordinationByProjectView.ts` in place (recommended consolidation)

```ts
// lib/server/coordinationByProjectView.ts — additive change (verified current shape at lines 21-56)
// Add alongside the existing db.accIssueFetchRun.findFirst(...) call:
const statusGroups = await db.accIssueProjectFetchResult.groupBy({
  by: ["status"],
  where: { runId: run?.id },
  _count: { id: true },
});
const coverageDrillRows = await db.accIssueProjectFetchResult.findMany({
  where: { runId: run?.id },
  select: { projectId: true, projectName: true, status: true, issueCount: true },
});
// ...fold into CoordinationByProjectData as an additive `issueCoverage` field.
```

### ENG-01 — Option B sketch (per-project recency via `AccDcUser` joined through `AccDcProjectUser`)

```ts
// lib/server/signInRecencyView.ts (if Option B is chosen)
const rows = await db.accDcProjectUser.findMany({
  where: { projectId: { not: "" } },
  select: {
    projectId: true,
    user: true, // NOT a real Prisma relation today — AccDcProjectUser has no FK to
                // AccDcUser (verified: "No FKs, DC wins on conflict" per schema comments).
                // Must instead findMany both tables and join by `userId === AccDcUser.id`
                // in the assembly function, same pattern dcUserAssembly.ts already uses.
  },
});
// See lib/acc/dcUserAssembly.ts:109-118 for the exact Map-based join pattern to mirror
// (membershipDates keyed by `${userId}::${projectId}`).
```

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (verified `vitest.config.ts`: `environment: 'node'`, `globals: true`, `setupFiles: ['./vitest.setup.ts']`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run app/\(dashboard\)/access-analysis/__tests__/<name>.test.ts` (or the `lib/server/<name>View.test.ts` sibling path) |
| Full suite command | `npm test` (verified `package.json`: `"test": "vitest run --exclude \"**/tests/e2e/**\""`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| PERM-01 | `assemblePermissionFootprint` converts BigInt→Number, resolves role/project names, `?? "Unknown role"` fallback | unit | `npx vitest run lib/server/permissionFootprintView.test.ts` | ❌ Wave 0 |
| PERM-01 | `formatBytes` renders "42.3 GB"-style strings across B/KB/MB/GB/TB boundaries | unit | `npx vitest run "app/(dashboard)/access-analysis/__tests__/permissionFootprintCounts.test.ts"` | ❌ Wave 0 |
| PIPE-01 | Loader returns `null` when no `AccDcIngestRun` exists (empty-DB edge case); `activityRowCount` sourced from a fabricated `AccActivity` count, not `rowsByModule` | unit | `npx vitest run lib/server/ingestFreshnessView.test.ts` | ❌ Wave 0 |
| PIPE-01 | Staleness-badge threshold (~36h) crosses correctly at the boundary | unit | `npx vitest run "app/(dashboard)/access-analysis/__tests__/ingestFreshnessCounts.test.ts"` | ❌ Wave 0 |
| ISSUE-01 | All 4 status buckets present even when one bucket is 0 for the fabricated run; drill rows include `ok`/`zero_issues` | unit | `npx vitest run "app/(dashboard)/access-analysis/__tests__/issueFetchCoverageCounts.test.ts"` | ❌ Wave 0 |
| ISSUE-01 | Loader handles `status: "running"` (no `finishedAt`) without treating partial results as final | unit | `npx vitest run lib/server/issueFetchCoverageView.test.ts` (or the extended `coordinationByProjectView.test.ts` if consolidated) | ❌ Wave 0 (or extend existing) |
| ENG-01 | Recency bucketing places a `null` value into "Never signed in", never drops it; bucket boundaries match CONTEXT.md's bands exactly (<30d/30–90d/90–365d/>365d) | unit | `npx vitest run "app/(dashboard)/access-analysis/__tests__/signInRecencyCounts.test.ts"` | ❌ Wave 0 |
| ENG-01 | Live verification against a real never-signed-in project (success criterion 4) | manual/smoke | Live page load of `/access-analysis`, pick `de245cf4-30a9-422c-ad74-6f8c886605ef` (CDMX MELI PLATAH — 276 never-signed-in members, largest sample found this pass) or any project, confirm the Never bucket renders | N/A — manual UAT step, record in VERIFICATION.md |
| All 4 | BigInt/serialization crash check (success criterion 1 explicitly: `tsc` won't catch this) | manual/smoke | Live page load of `/access-analysis`, check server log for no `BigInt` serialization error | N/A — manual UAT step |
| All 4 | `mainCharts.tsx` fan-out review + load-time spot-check (success criterion 5) | manual | Compare `/access-analysis` load time before/after via dev server timing | N/A — manual UAT step |

### Sampling Rate
- **Per task commit:** the relevant single-file `npx vitest run <path>` command from the table above.
- **Per wave merge:** `npm test` (full suite — must stay green, and existing TEST-01/02/03
  characterization tests must remain byte-identical since this phase does not touch
  `folderPermQuery.ts`/`acc-hot-cache.ts` directly, but `AccFolderPermissionSummary` IS a
  Ph18/19-owned table — read-only access here, no risk to those pins).
- **Phase gate:** Full suite green + the 3 manual/smoke steps above (BigInt live-load check,
  never-signed-in live-load check, load-time spot-check) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `lib/server/permissionFootprintView.test.ts` — covers PERM-01 (pure assembly only, no DB)
- [ ] `app/(dashboard)/access-analysis/__tests__/permissionFootprintCounts.test.ts` — covers PERM-01 `formatBytes` + summarization
- [ ] `lib/server/ingestFreshnessView.test.ts` — covers PIPE-01
- [ ] `app/(dashboard)/access-analysis/__tests__/ingestFreshnessCounts.test.ts` — covers PIPE-01 staleness calc
- [ ] `lib/server/issueFetchCoverageView.test.ts` (or extended `coordinationByProjectView.test.ts`) — covers ISSUE-01
- [ ] `app/(dashboard)/access-analysis/__tests__/issueFetchCoverageCounts.test.ts` — covers ISSUE-01
- [ ] `lib/server/signInRecencyView.test.ts` — covers ENG-01 (contingent on the Option A/B/C decision)
- [ ] `app/(dashboard)/access-analysis/__tests__/signInRecencyCounts.test.ts` — covers ENG-01 bucketing
- [ ] No new test framework/config install needed — Vitest is already fully wired (`vitest.config.ts`, `vitest.setup.ts`, `npm test`).

## Open Questions

1. **ENG-01 data source: Option A (literal `AccProjectMember.lastSignIn`, degenerate-but-honest)
   vs. Option B (`AccDcUser.lastSignIn` via `AccDcProjectUser`, real distribution, narrower
   DC-only project coverage) vs. Option C (ship both with a caption)?**
   - What we know: A is spec-literal but produces a single-bucket chart; B/C are
     precedented elsewhere in this codebase (`dcUserAssembly.ts`, `activeUserTiers.ts`) and
     produce a real distribution but change the data authority and narrow coverage to
     ~550 DC-covered projects.
   - What's unclear: whether the owner would rather see the "your live-API sync never
     captured sign-in dates" finding (Option A, itself a genuine insight) or a real
     dormant/active split scoped to DC coverage (Option B/C).
   - Recommendation: default to **Option C** (ship the real distribution, honestly caption
     the narrower DC-only project scope) unless the plan-check/verifier flags a stronger
     preference for staying spec-literal — record whichever choice is made explicitly in
     PLAN.md's task list, not as an implicit substitution.

2. **ISSUE-01: extend `coordinationByProjectView.ts`'s `CoordinationByProjectData` in place,
   or a standalone `issueFetchCoverageView.ts`?**
   - What we know: extending in place reuses the exact same latest-run row already being
     fetched, keeps `mainCharts.tsx`'s entry count at 8, and both `AccIssueFetchRun` reads
     stay in one file.
   - What's unclear: whether a future phase (21/22, the issue funnel + type resolution)
     will want its OWN dedicated `lib/server/issueAnalyticsView.ts` anyway, in which case
     ISSUE-01 extending `coordinationByProjectView.ts` now might need re-extraction later.
   - Recommendation: extend in place for Phase 20 (smaller diff, matches success criterion
     5's consolidation instruction); Phase 21/22 can factor out a shared issue-analytics
     module later if the funnel/type work makes `coordinationByProjectView.ts` unwieldy —
     that's a Phase 21/22 concern, not a Phase 20 blocker.

3. **Does ENG-01's "same onSliceClick/activeSlice convention as Activity by role" mean local
   component state (recommended) or an actual extension of the shared `SliceFilters`
   cross-filter bus?**
   - What we know: CONTEXT.md's "Cross-filter scope" section only describes these 3 panels
     RECEIVING the project-picker filter, never DRIVING a new shared dimension; extending
     `applySliceFilters` is real, nonzero, unrequested work.
   - What's unclear: whether "same convention" was meant literally (wire into `sliceFilters`)
     or just "reuse this prop-naming pattern locally".
   - Recommendation: local state only (see Architecture Patterns section) — flag as a
     1-question check with the plan-checker/verifier if ambiguity remains after planning.

## Sources

### Primary (HIGH confidence)
- `prisma/schema.prisma` lines 437-902 — every model/field cited above read directly this pass
  (`AccProjectMember`, `AccFolderPermissionSummary`, `AccActivity`, `AccDcIngestRun`,
  `AccIssue`, `AccIssueFetchRun`, `AccIssueProjectFetchResult`, `AccDcUser`,
  `AccDcProjectUser`, `AccMemberCache`, `AccRole`)
- Live read-only Postgres queries run this pass (via a temporary script mirroring
  `scripts/count-acc-data.cjs`'s env-parsing pattern, deleted after use — never printed the
  connection string): `AccProjectMember` (14,566 rows, 100% null `lastSignIn`), `AccDcUser`
  (3,870 rows, 1,254 non-null `lastSignIn`), `AccDcProjectUser` (22,835 rows, 100% null
  `lastSignIn`), `AccFolderPermissionSummary` (22,082 rows, 107 distinct roleIds, 904
  distinct projectIds, 0 unmatched against `AccRole`'s 155 rows), `AccDcIngestRun` latest
  row (`status: "quarantined"`, 1,086 matching `AccActivity` rows via `ingestRunId`,
  687,170 `AccActivity` rows with `ingestRunId IS NULL`), `AccIssueFetchRun` latest row
  (`status: "done"`, `error=596/zero_issues=437/ok=119` of `projectsTotal=1152`)
- `app/(dashboard)/access-analysis/mainCharts.tsx`, `components/AccessAnalysisCharts.tsx`,
  `page.tsx`, `projectFilter.ts`, `roleCounts.ts`, `dormantActivity.ts`, `roleColors.ts`,
  `relativeTime.ts`, `components/PeopleDrillList.tsx`, `components/FilterBanner.tsx`,
  `components/RolesPieChart.tsx`, `components/ActivityTimelineChart.tsx`,
  `components/CoordinationByProject.tsx`, `components/NoActivityBars.tsx`,
  `components/EChart.tsx` — all read in full this pass
- `components/ui/EChart.tsx`, `components/ui/DrillSheet.tsx`, `components/ui/stat-tile.tsx` — read in full
- `lib/server/dcCoverageView.ts`, `projectCoverageView.ts` (+ `.test.ts`),
  `coordinationByProjectView.ts`, `folderActivityView.ts` — read in full
- `app/(dashboard)/template-mty/components/PermissionAccessChart.tsx` — read in full (direct
  horizontal-bar analog for PERM-01)
- `lib/acc/activeUserTiers.ts`, `lib/acc/dcUserAssembly.ts`, `lib/acc/userEngagement.ts`,
  `scripts/sync-acc-users.ts` (header), `scripts/scratch/p6-enriched-field-coverage.cjs` —
  read this pass to ground the ENG-01 critical finding
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`,
  `.planning/research/SUMMARY.md` — milestone-level research (2026-07-02), narrowed and
  cross-checked against live data for this phase
- `.planning/phases/20-foundation-wins-engagement-panels/20-CONTEXT.md`,
  `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md`,
  `.claude/skills/lecg-dashboard/SKILL.md`, `./CLAUDE.md` — all read this pass

### Secondary (MEDIUM confidence)
- None — every claim in this document traces to a repo file, a live DB query run this pass,
  or a milestone-level research artifact that itself cites repo evidence.

### Tertiary (LOW confidence)
- The full enum of `AccDcIngestRun.status` values (Pitfall 4) — `VERIFY:` no single
  constant/type centrally defines it; observed values are `running`/`success`/`partial`/
  `failed` (from script greps) plus `quarantined` (from the live latest row) — treat as an
  open string, not an exhaustive enum, until a phase explicitly enumerates it.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, every chart type already proven in this exact route or `/template-mty`
- Architecture (PERM-01/PIPE-01/ISSUE-01): HIGH — every file/line citation verified directly against source this pass, plus live DB confirmation of row counts and join integrity
- Architecture (ENG-01): HIGH confidence in the FINDING (100% null, verified live), MEDIUM on which of Option A/B/C the planner should pick — that is a product decision, not a research gap
- Pitfalls: HIGH — every pitfall cites a verified file/line or a live query result from this pass

**Research date:** 2026-07-02
**Valid until:** Data-shape findings (row counts, null rates) are stable per PROJECT.md's
"Data Extraction — Verified 2026-06-23" baseline, unchanged since; re-verify only if a new
ingest run or schema migration lands before this phase executes. File/line citations are
valid until the next commit touches those files — re-grep before executing if significant
time has passed since 2026-07-02.

---
*Research for: Phase 20 - Foundation Wins & Engagement Panels (v2.3 New Graphs)*
*Researched: 2026-07-02*

## Dashboard self-check

- **Context:** Loaded `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`,
  `20-CONTEXT.md`, `.claude/skills/lecg-dashboard/SKILL.md`, `./CLAUDE.md`,
  `.planning/research/{ARCHITECTURE,PITFALLS,SUMMARY}.md`. `.planning/codebase/*.md` and
  `.tools/repo-map/architecture-summary.md` were NOT read this pass — the milestone-level
  `.planning/research/ARCHITECTURE.md` (2026-07-02, same-day) already supersedes them for
  this specific phase's file-boundary claims; no import-graph/refactor question arose that
  would need the repo-map artifacts.
- **Scope:** `/access-analysis` only (confirmed — no `/template-mty` panel in this phase,
  per CONTEXT.md). `/users/spatial-graph` and `app/(dashboard)/users/access-analysis/` (a
  DIFFERENT, unrelated route family) were not touched or read for implementation guidance.
- **Evidence:** Every model/field/loader/component claim traces to `prisma/schema.prisma`,
  a file read in full, or a live read-only DB query run this pass (script deleted after use,
  connection string never printed/logged).
- **Constraints applied:** zinc theme + `@/components/ui/EChart` (not the legacy wrapper);
  no new WebGL; BigInt server-side conversion; `rowsByModule` ban; honest 4-bucket issue
  coverage; null-`lastSignIn` bucket never dropped; project-name resolution via
  `AccProject`-over-`AccDcProject` precedence; no new npm dependencies.
- **Gates:** Full gate sequence deferred to the planner/executor (`npx tsc --noEmit`,
  `npm test`, live page-load checks) — this document specifies exactly which gates apply
  per requirement in the Validation Architecture section above.
- **VERIFY:** (1) Which ENG-01 option (A/B/C) the planner selects — a recorded product
  decision, not a research gap. (2) Full enum of `AccDcIngestRun.status` values beyond the
  5 observed this pass. (3) Whether ISSUE-01 extends `coordinationByProjectView.ts` in
  place or gets a standalone loader — either is workable, flagged as a phase-level call.
