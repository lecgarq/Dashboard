# Pitfalls Research

**Domain:** Adding ~9 new ECharts analytics panels to an existing internal BIM/VDC
dashboard (`/access-analysis` + `/template-mty`) — Next.js 16 App Router + tRPC +
Prisma over local PostgreSQL, live workshop demos on `:3000`.
**Researched:** 2026-07-02
**Confidence:** HIGH (repo-grounded — every pitfall below cites a verified file/model/line;
no external ecosystem research was needed because these are integration pitfalls specific
to this codebase, not generic ECharts/Next.js gotchas)

## Critical Pitfalls

### Pitfall 1: Client-side or unindexed aggregation reopens the 77s-OOM regression

**What goes wrong:**
A new loader for `AccActivityAccds` (~4.55M rows, per `PROJECT.md`/memory) or the
~2.58M-row `AccActivity` DC-backfill table does a `findMany()` and reduces/groups in
Node instead of pushing the `GROUP BY` into SQL. This is exactly the failure mode
`lib/server/acc-hot-cache.ts`'s `includePermissionSummary` branch hit before it was
rewritten as a SQL aggregate (CONCERNS.md §1.1, §8.1) — and the `includePermissionContexts`
raw-scan branch still exists behind a hard guard (`ACC_ALLOW_RAW_PERMISSION_SCAN=1`,
throws by default) specifically because re-opening this path is a known, named risk.

**Why it happens:**
The existing `Promise.all` pattern in `mainCharts.tsx` makes it look easy to "just add
another loader" — but the loaders that are fast today (`loadModuleActivity`,
`loadCoordinationByProject`, etc.) are fast *because* they already push `groupBy`/`SUM`
into Postgres (verified: `lib/server/coordinationByProjectView.ts:27`
`db.accIssue.groupBy(...)`). A new activity-verb/object-type breakdown or a folder
storage treemap over `AccFolder.fileCount`/`totalSizeBytes` is tempting to prototype
with `findMany()` + `.reduce()` because that's how you'd write it against a small table.

**How to avoid:**
Every new `lib/server/<name>View.ts` loader for `AccActivityAccds`, `AccActivity`, or
`AccFolder` must use `db.$queryRaw`/`groupBy` with the aggregation happening in Postgres,
returning row counts bounded by the actual cardinality (e.g., ≤ n_verbs × n_projects, not
raw activity rows). Model the new test on the existing TEST-01 pattern (`npm test` guard
asserting aggregate output ≤ `n_roles × n_projects`).

**Warning signs:**
- A new `lib/server/*View.ts` file contains `.findMany(` on `AccActivityAccds` or
  `AccActivity` without a `where` that bounds it to a single project, or without a
  raw SQL `GROUP BY`.
- Local dev load time for `/access-analysis` visibly increases (`Promise.all` in
  `mainCharts.tsx` is only as fast as its slowest entry).
- No new Vitest test asserts a row-count upper bound for the new aggregate.

**Phase to address:**
Foundation/data-loader phase (first phase that adds any loader touching
`AccActivityAccds`/`AccActivity`) — add the aggregate-bound test in the same phase as
the loader, not as a follow-up.

---

### Pitfall 2: Ingest-freshness panel measures `AccDcIngestRun.rowsByModule` and lies

**What goes wrong:**
`AccDcIngestRun.rowsByModule` is a `Json` column (verified `prisma/schema.prisma:820`)
that is a known, permanent zero per project memory
("`project_rowsbymodule_telemetry_disconnect`" — "AccDcIngestRun.rowsByModule always 0").
A freshness/throughput panel built by reading this field directly will render a chart
that always shows 0 rows ingested, which is worse than no panel at all on a live demo.

**Why it happens:**
The field exists on the exact model (`AccDcIngestRun`) the ROADMAP.md seed names as the
data authority for this panel, so it looks like the obvious source — but the ingest
pipeline never actually populates it correctly.

**How to avoid:**
Measure "rows ingested" by querying `AccActivity` directly
(`db.accActivity.count({ where: { ingestRunId, ... } })` — `ingestRunId` is a real,
indexed FK-like column on `AccActivity`, verified `prisma/schema.prisma:573,582`) or by
diffing `AccActivity` counts bracketed by `AccDcIngestRun.startedAt`/`endedAt`. Use
`AccDcIngestRun` only for `status`, `startedAt/endedAt`, `quotaUsed`,
`projectsProcessed` — fields that are actually populated.

**Warning signs:**
- Any new chart reads `rowsByModule` and renders a non-zero value in a screenshot/demo
  without first confirming it against a live `AccActivity` count for the same run.
- The panel shows a flat zero line across all historical ingest runs.

**Phase to address:**
The phase that builds the ingest-freshness/throughput panel specifically — verify the
row-count field against `AccActivity` before wiring the chart, not after.

---

### Pitfall 3: `AccFolderPermissionSummary.totalBytes` is a `BigInt` — serializing it to a client chart crashes or silently truncates

**What goes wrong:**
`AccFolderPermissionSummary.totalBytes` is declared `BigInt` (verified
`prisma/schema.prisma:554`). Passing a Prisma row containing a `BigInt` field straight
into a Server Component's props (or `JSON.stringify`-ing it anywhere in the RSC →
client boundary) throws `TypeError: Do not know how to serialize a BigInt` — this
project has already hit an adjacent BigInt trap during Ph19
("`0n`/`2048n` BigInt literals break ES2017 target → use `BigInt()`", per project
memory), so the codebase's TS target is already known to be BigInt-fragile.

**Why it happens:**
`AccFolderPermissionSummary` is explicitly called out in ROADMAP.md as "materialized
... but never charted" for the permission-footprint-by-role panel — it is the correct
data authority, but the `totalBytes` field must be converted (`Number(totalBytes)` for
values that fit safely, or a formatted string) at the loader boundary before it ever
reaches a `"use client"` component or gets embedded in RSC JSON.

**How to avoid:**
Convert `BigInt` → `Number` (or a pre-formatted bytes string) inside the
`lib/server/<name>View.ts` loader, never in the client component. Add a unit test on
the pure transform asserting the output type is `number`/`string`, not `bigint`.

**Warning signs:**
- `npx tsc --noEmit` passes (TypeScript doesn't catch this — it's a runtime
  serialization failure) but the page throws a 500 or a hydration error mentioning
  `BigInt` when the permission-footprint panel is added.
- A `console.error` about serializing `BigInt` appears in the dev server log after
  wiring the new panel.

**Phase to address:**
The phase that builds the permission-footprint-by-role panel (the only new-graph seed
that reads `AccFolderPermissionSummary`).

---

### Pitfall 4: `mainCharts.tsx`'s `Promise.all` fan-out grows unbounded and breaches the documented heap/pool budget

**What goes wrong:**
`app/(dashboard)/access-analysis/mainCharts.tsx` already runs **8 concurrent**
server-side loaders in one `Promise.all` (verified: `loadInstanceView`,
`loadModuleActivity`, `loadActivityByActor`, `loadCoordinationByProject`,
`loadProjectCoverage`, `loadTerrainProjects`, `loadActivityTimeline`,
`loadDcCoverage`) plus terrain/folder-activity loaders fired separately. Adding 9 more
loaders (one per new-graph seed) without consolidation pushes a single page load past
15+ concurrent Postgres queries. `PG_POOL_MAX=32` and `NODE_OPTIONS=--max-old-space-size=8192`
were tuned for the *current* load pattern (CONCERNS.md §1.4/§1.5); this is a documented,
previously-fixed OOM-adjacent concern, not a hypothetical one.

**Why it happens:**
The registration pattern in ROADMAP.md ("add to the `Promise.all` in `mainCharts.tsx`")
is correct for one or two panels but doesn't itself cap concurrency — nothing stops nine
sequential additions from turning one `Promise.all` into an unmanageable fan-out.

**How to avoid:**
Batch new loaders logically (e.g., issue-related loaders share one combined
`lib/server/issueAnalyticsView.ts` doing multiple `groupBy`s in one module rather than
9 separate top-level `Promise.all` entries) and re-measure page load time after each
wave. Treat "page load time regression" as a phase gate, not an afterthought — spot-check
with `console.time`/server logs before and after each wave of panels.

**Warning signs:**
- `mainCharts.tsx`'s `Promise.all` array grows past ~12 entries.
- Local `/access-analysis` load time visibly increases wave-over-wave during
  development (no formal perf test exists for this today — this must be eyeballed or a
  lightweight timing assertion added).

**Phase to address:**
Every panel-adding phase should re-check `mainCharts.tsx`'s total loader count; a
dedicated "wave 2" phase (once ~5+ new loaders exist) should explicitly measure and, if
needed, consolidate loaders before adding more.

---

### Pitfall 5: Reusing the stale "428/1,152 DC-extractable" coverage figure instead of the corrected ~550/1,153

**What goes wrong:**
The milestone brief and CONCERNS.md §5.2 both cite "428/1152 DC-extractable, 724
LOCKED (403)" as the historical figure — but `PROJECT.md` (Ph11 TRUTH-01) explicitly
records that this framing was **rejected by the owner** as the headline number, and the
current, correct source is `lib/server/dcCoverageView.ts`, which computes "covered ≈ 550
— AccDcProject rows" against "total ≈ 1,153 — AccProject rows" (verified,
`lib/server/dcCoverageView.ts:8-9`). A new issue-fetch coverage donut or provisioned-vs-active
panel that hardcodes "428 of 1,152" (copied from the seed list or old docs) ships a
number the project already corrected once.

**Why it happens:**
The ROADMAP.md seed table and CONCERNS.md §5.2 both still contain the old figure in
prose (with a `VERIFY:` flag already attached in CONCERNS.md), so a new-graph author
skimming those files for "the coverage number" can easily grab the wrong one.

**How to avoid:**
Any new coverage-labeling chart must call `loadDcCoverage()` (or an equivalent
`lib/server/dcCoverageView.ts`-style live query) for its number — never a number typed
into a component or a doc. Treat every coverage/freshness caption as **computed**, per
the Ph11 precedent (`dataFloor`, coverage header line).

**Warning signs:**
- A hardcoded percentage or fraction (e.g., `"428 of 1,152"`, `"63% locked"`) appears as
  a string literal in a new chart component instead of a prop threaded from a server
  loader.

**Phase to address:**
The issue-fetch coverage donut and provisioned-vs-active module coverage panels
specifically — both must source their numbers from a live query, following the
`loadDcCoverage()` precedent.

---

### Pitfall 6: New activity/verb loaders reintroduce the deferred `/users/spatial-graph`-coupled `lib→app` edges

**What goes wrong:**
CONCERNS.md's BND-03 resolution explicitly lists 5 `lib→app` edges as
**deferred, spatial-graph-coupled, out of scope** — including
`lib/acc/activityClassification.ts → app/.../accTaxonomy.ts` and
`→ app/.../accNormalize.ts` (both under `/users/access-analysis`, the spatial-graph
route family). The "Activity verb / object-type breakdown" new-graph seed reads
`AccActivityAccds.activityVerb`/`objectType`/`serviceGroup` — fields adjacent to the
same classification logic these deferred edges touch. Reaching for
`activityClassification.ts`'s helpers (or worse, importing directly from
`accTaxonomy.ts`/`accNormalize.ts` under `/users/access-analysis`) to build the new
`/access-analysis` chart re-couples the two route families the project has deliberately
kept apart.

**Why it happens:**
`activityClassification.ts` already has the verb/module classification logic the new
panel needs conceptually, and it's tempting to import a taxonomy helper that "already
exists" without checking which module it actually resolves to.

**How to avoid:**
Build the activity verb/object-type breakdown loader directly off raw
`AccActivityAccds` columns (`activityVerb`, `objectType`, `serviceGroup` — no
classification needed, these are already the raw dimensions) rather than routing
through `activityClassification.ts`'s module-donut classifier. If classification is
genuinely needed, extract only the pure function into `lib/acc/` — do not import from
anything under `app/(dashboard)/users/access-analysis/`.

**Warning signs:**
- `node scripts/repo-map/check.cjs` (or `npm run repo-map:check`) shows the `lib→app`
  edge count rising above 21 (the documented Phase-10 post-state) with a new edge
  rooted in the new chart's loader.
- A new import statement in `lib/server/` or `lib/acc/` references anything under
  `app/(dashboard)/users/access-analysis/`.

**Phase to address:**
The activity verb/object-type breakdown phase — run `npm run repo-map:check` as an
explicit gate before considering that phase done.

---

### Pitfall 7: Panel overload dilutes the workshop story — `/access-analysis` already renders 15 panel surfaces

**What goes wrong:**
`app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` already
instantiates **15** `PremiumSurface`-wrapped panels (verified count). The ROADMAP.md
seed list proposes 9 more chart ideas for the same two pages. Shipping all 9
unconditionally turns a curated workshop narrative into an undifferentiated wall of
charts — the opposite of "credible demos, fast comprehension" (per project skill's
Senior Contributor Defaults).

**Why it happens:**
Each seed is individually well-justified (real, unvisualized data), so there's no
single moment where "should we ship all 9 at once" gets asked — the registration
pattern makes each addition mechanically easy, which hides the cumulative UX cost.

**How to avoid:**
Curate: group the 9 seeds by user question, not by data-model convenience (e.g.,
combine "activity verb/object breakdown" and "provisioned-vs-active module coverage"
under one expandable section rather than two always-visible top-level panels).
Consider collapsible/accordion sections for the newer panels rather than flat
always-rendered `PremiumSurface`s. Cap the count that renders above-the-fold; put
lower-priority panels behind a "More analytics" expand.

**Warning signs:**
- Total panel count on `/access-analysis` exceeds ~20 without any grouping/expand
  mechanism.
- Owner feedback during a workshop dry run says "too much on this page" or scrolls past
  charts without engaging.

**Phase to address:**
A dedicated final "workshop curation" phase (after all new panels are built) that
explicitly reviews panel count, grouping, and above-the-fold priority — do not treat
curation as automatic once all loaders/charts are wired.

---

### Pitfall 8: New consumers of `folderPermQuery.ts`/`acc-hot-cache.ts` silently break the byte-identical golden-master tests (TEST-01/02/03)

**What goes wrong:**
v2.1/v2.2 shipped exactly for the purpose of making `folderPermQuery.ts`,
`acc-hot-cache.ts`, and the terrain views safe to extend — but they are guarded by
characterization tests that assert **byte-identical** output
(`templateFolderTerrain.sharedQuery.test.ts`, `folderPermissionTerrainView.test.ts`,
the TEST-01 OOM-guard suite). A new permission-tier × folder-depth heatmap (seed #8,
explicitly meant to reuse `loadFolderPermRows` from `folderPermQuery.ts`) or a
permission-footprint-by-role panel that touches `acc-hot-cache.ts`'s
`includePermissionSummary` branch can change output shape in a way that breaks these
pins without the change being "wrong" for the new chart's purpose — the pins exist to
catch exactly this kind of silent shape drift.

**Why it happens:**
The shared query/cache modules are correctly reused (that's the whole point of
`folderPermQuery.ts`), but adding a new consumer that needs slightly different columns
or grouping can tempt an edit to the shared function's *existing* return shape instead
of adding a new, additive query variant.

**How to avoid:**
Add new query variants (a new exported function, or an additive parameter with a
default that preserves the existing branch's exact output) rather than editing the
existing `loadFolderPermRows`/`includePermissionSummary` code paths in place. Run
`npm test` after every touch to these files and treat any TEST-01/02/03 diff as a stop
signal, not a test-file update.

**Warning signs:**
- `npm test` fails on `folderPermissionTerrainView.test.ts`,
  `templateFolderTerrain.sharedQuery.test.ts`, or the TEST-01 suite after adding a new
  chart's loader.
- A PR/commit touches `lib/server/folderPermQuery.ts` or
  `lib/server/acc-hot-cache.ts` *and* modifies an existing test's expected values in the
  same commit (should almost never happen together).

**Phase to address:**
The permission-tier × folder-depth heatmap and permission-footprint-by-role phases
specifically — both are the only two seeds that touch these shared, test-pinned
modules.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Prototype a new loader with `findMany()` + client-side `.reduce()` against a small local dev sample | Faster to write, works fine on a filtered/small project | Reopens the exact 4.55M-row OOM class already fixed once (Pitfall 1) | Never for `AccActivityAccds`/`AccActivity`/`AccFolderPermission` — acceptable only for genuinely small tables (e.g., `AccIssueFetchRun`, one row per fetch run) |
| Hardcode a coverage percentage from the ROADMAP.md seed table prose | Ships the panel faster, no new query needed | Ships a number the project already corrected once (Pitfall 5) | Never — always source from a live loader |
| Add a 9th/10th ad-hoc `Promise.all` entry to `mainCharts.tsx` instead of consolidating related loaders | Follows the documented registration pattern literally | Unbounded fan-out growth (Pitfall 4) | Acceptable for the first 1-2 additions; consolidate once 3+ new loaders share a data domain (e.g., all issue-funnel views) |
| Skip the `"server-only"` directive on a new `lib/server/<name>View.ts` loader "because it's obviously server code" | Saves one import line | Silent bundling into a client chunk if a client component ever imports it by mistake — no compile error | Never — every existing `lib/server/*View.ts` loader carries it |
| Inline a pure transform directly inside a new `components/<Name>Chart.tsx` instead of a co-located `*Counts.ts` module with its own test | Fewer files for a "simple" chart | No unit-testable seam; the established registration pattern's `*Counts.ts` + `__tests__/` step gets skipped, and the next refactor has nothing to pin against | Acceptable only for a genuinely trivial 1-line transform; anything with branching (null handling, bucket boundaries) needs its own test |

## Integration Gotchas

Common mistakes when connecting new charts to existing data sources.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `AccDcIngestRun` (ingest-freshness panel) | Reading `rowsByModule` directly (always 0, Pitfall 2) | Count rows from `AccActivity` bounded by `ingestRunId`/`startedAt`/`endedAt`; use `AccDcIngestRun` only for `status`/timing/`quotaUsed` |
| `AccFolderPermissionSummary` (permission-footprint panel) | Passing `totalBytes` (BigInt) straight to a client chart prop (Pitfall 3) | Convert to `Number`/formatted string inside the `lib/server/` loader |
| `dcCoverageView`-style coverage numbers | Hardcoding "428/1,152" from old docs/seeds (Pitfall 5) | Call `loadDcCoverage()` or an equivalent live query; treat the number as computed, never literal |
| `AccIssueFetchRun.status` (issue-fetch coverage donut) | Treating `status` as always one of a fixed enum without handling `"running"` (in-progress run) or a `finishedAt: null` row as a distinct, honestly-labeled state | Bucket `running` separately from `done`/`failed`; a run with `finishedAt: null` is "in progress," not zero/error |
| `AccProjectMember.lastSignIn` (dormant-users chart) | Filtering out or defaulting `null` to epoch/zero, which silently drops or misplaces never-signed-in members | Bucket `lastSignIn: null` explicitly as "Never signed in" — a real, common, honest category (not every invited member has logged in) |
| `AccActivityAccds` (activity verb/object breakdown) | Not repeating the ~12-month floor caption already established for the timeline chart (TRUTH-03 precedent) | Reuse the `dataFloor` pattern from `activityTimelineView.ts`/`ActivityTimelineChart.tsx` rather than inventing a new caveat format |
| `activityClassification.ts` (verb/module logic reuse) | Importing helpers that resolve into the deferred spatial-graph-coupled `accTaxonomy.ts`/`accNormalize.ts` edges (Pitfall 6) | Read raw `AccActivityAccds` columns directly; only pull pure, `lib/acc/`-rooted helpers |

## Performance Traps

Patterns that work in a quick local check but fail under the page's real fan-out.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Client-side aggregation over `AccActivityAccds`/`AccActivity` | Chart works instantly in dev against a filtered project, then the full-account load takes 60-90s or OOMs | SQL `GROUP BY`/`$queryRaw`, aggregate-bound test (Pitfall 1) | At the full ~4.55M-row / ~2.58M-row scale (i.e., immediately in the real workshop demo, not at any "future" scale) |
| Unbounded `Promise.all` growth in `mainCharts.tsx` | Page load time creeps up wave-over-wave; no single loader is slow, but the sum is | Consolidate loaders per data domain; re-measure after each wave (Pitfall 4) | Once concurrent loader count approaches `PG_POOL_MAX=32` under any concurrent access (rare for a single-owner workshop, but heap pressure comes first) |
| `EChart` component `notMerge=true` (default) on charts inside a cross-filter state update | Toggling a `sliceFilters` value causes every chart sharing that re-render path to fully unmount/remount its canvas, not just diff options | Verify which charts actually need `notMerge=false` (diff+animate) vs. full remount; keep remounts scoped to charts whose *data*, not just filter highlight, changed | Becomes visible as jank once 9 more charts share the same `sliceFilters` re-render tree (Pitfall 9 cross-reference below) |
| Folder storage treemap over `AccFolder` (206+ rows per `/template-mty`, more account-wide) | Treemap re-renders the full node set on every hover/zoom interaction | Memoize the treemap's ECharts `option` object; only recompute on real data changes, not on hover state | Noticeable once folder count crosses into the hundreds — already true for `/template-mty`'s 206 folders |

## Security Mistakes

Domain-specific issues beyond general web security (internal tool, low external-attack
surface, but real internal-data-exposure risks).

| Mistake | Risk | Prevention |
|---------|------|------------|
| Reintroducing raw ACC project GUIDs in a new drill-down (e.g., issue funnel's per-project breakdown) | Already fixed once for folder-activity-by-role (TRUTH-01) — regressing to raw GUIDs makes the panel unreadable/leaky-looking in a live demo, not a real security hole but a credibility hole | Merge `AccProject` names in every new project-scoped loader; fall back to `"Unknown project"`, never a bare GUID |
| Embedding a `BigInt`/`Json` Prisma field directly in RSC props without normalizing | Runtime crash (Pitfall 3) rather than a silent leak, but any raw `Json` column (`AccProjectMember.products`, `AccDcIngestRun.diffSummary`) passed through un-normalized risks leaking internal shape/fields into client-visible props | Always map Prisma rows to an explicit, narrow DTO shape in the loader before returning to the component tree |

## UX Pitfalls

Common user experience mistakes specific to adding panels to this dashboard.

| Pitfall | User Impact | Better Approach |
|---------|-------------|------------------|
| Shipping all 9 seeds as flat, always-visible `PremiumSurface` panels (Pitfall 7) | Owner/workshop attendees scroll past a wall of charts; no single panel gets attention | Group by question, use expand/collapse for secondary panels, cap above-the-fold count |
| Adding new `sliceFilters` keys (issue status, tier, recency bucket) to the existing single-object cross-filter state without clarifying combination semantics | Users toggle two filters expecting an intersection but get an unexpected union (or vice versa), or land on a filter combination with zero results and no explanation | Explicitly define AND-across-dimensions/OR-within-dimension semantics (matching the existing `role`/`company` pattern in `AccessAnalysisCharts.tsx`); show an empty-state message when a combination yields zero rows rather than a blank chart |
| Heatmap/treemap using ad-hoc colors instead of `roleColors.ts`/theme-resolved palette | Visual drift from the established zinc/role-color system; heatmap cells may be illegible on `#09090B` if colors aren't chosen for dark-background contrast | Reuse `roleColors.ts` or the `mergeEChartsTheme` palette; test contrast specifically for the darkest zinc background, not just "looks fine in light mode" |
| A degenerate/empty-data project (zero issues, zero folder bytes, `lastSignIn` null for the whole team) renders a broken or blank chart instead of an explicit empty state | Looks like a bug during a live demo on exactly the kind of thin-data project that's common in this dataset (per PROJECT.md: some projects have zero issues) | Every new chart needs an explicit "No data for this view" state, matching the existing empty-state conventions used elsewhere on `/access-analysis` |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Ingest freshness panel:** Often missing the `rowsByModule`→`AccActivity`
      substitution — verify the panel's row counts match a manual
      `db.accActivity.count({ where: { ingestRunId } })` for at least one real run, not
      just that the chart renders.
- [ ] **Permission-footprint-by-role panel:** Often missing `BigInt`→`Number`
      normalization — verify by actually loading the page (not just `tsc --noEmit`,
      which won't catch this) and confirming no serialization error in the server log.
- [ ] **Any new coverage/freshness caption:** Often missing a live data source — verify
      the displayed number changes if you `VERIFY:`-spot-check it against a live query
      (e.g., `loadDcCoverage()`), not copied from ROADMAP.md prose.
- [ ] **Dormant-users / recency chart:** Often missing an explicit "Never signed in"
      bucket for `null` `lastSignIn` — verify by finding a real project with at least
      one never-signed-in member and confirming they appear, correctly bucketed, not
      dropped.
- [ ] **Activity verb/object-type breakdown:** Often missing the ~12-month floor
      caption — verify the same `dataFloor`/`floorByProject` pattern from
      `activityTimelineView.ts` is reused, not a fresh, uncaptioned chart.
- [ ] **Every new panel:** Often missing the golden-master/aggregate-bound test that
      makes the loader safe to touch later — verify a Vitest test exists asserting the
      new loader's output row-count/shape bound, following the TEST-01/TEST-02 pattern.
- [ ] **Every new panel:** Often missing zinc-theme color resolution — verify colors
      come from `roleColors.ts`/`mergeEChartsTheme`, not hardcoded hex values, and check
      the panel specifically in dark mode (the project's default and only demo mode).

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| OOM/slow-load regression from a client-side aggregate (Pitfall 1) | MEDIUM | Rewrite the loader as a SQL `GROUP BY`/`$queryRaw`; add the aggregate-bound Vitest test retroactively; re-verify `/access-analysis` load time before re-shipping |
| BigInt serialization crash shipped (Pitfall 3) | LOW | Add `Number(totalBytes)` (or formatted string) conversion at the loader boundary; redeploy via the standard `:3000` rebuild sequence; no data migration needed |
| Stale coverage number shipped (Pitfall 5) | LOW | Swap the hardcoded literal for a call to `loadDcCoverage()` (or equivalent); this mirrors the exact Ph11 TRUTH-01 correction already done once for the header line |
| Golden-master test broken by a new shared-module consumer (Pitfall 8) | MEDIUM-HIGH | `git diff` the shared module change; extract the new chart's need into an additive query variant instead of editing the pinned function; re-run `npm test` until TEST-01/02/03 are byte-identical again; never edit the test's expected values to "make it pass" |
| Panel overload shipped, workshop feedback is negative (Pitfall 7) | LOW-MEDIUM | Retrofit an expand/collapse wrapper around the lowest-priority 3-4 panels; no data/loader changes needed, purely a presentational grouping change |
| Spatial-graph-coupled edge reintroduced (Pitfall 6) | MEDIUM | Re-point the new loader's import to a `lib/acc/`-rooted pure helper or inline the needed logic; re-run `npm run repo-map:check` to confirm the edge count returns to the documented baseline |

## Pitfall-to-Phase Mapping

How the v2.3 roadmap phases should address these pitfalls. (No phases are numbered yet
in ROADMAP.md for v2.3 — these map to the logical phase groupings implied by the
registration pattern and panel dependencies; the roadmap-building step should assign
real phase numbers.)

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Client-side/unindexed aggregation OOM regression | Every phase adding an `AccActivityAccds`/`AccActivity`/`AccFolder` loader | New Vitest aggregate-bound test passes; `npm test` green; manual load-time spot-check on `/access-analysis` |
| 2. `rowsByModule` telemetry lie | Ingest-freshness/throughput panel phase | Panel's displayed row count matches a manual `AccActivity` count for a real ingest run |
| 3. `BigInt` serialization crash | Permission-footprint-by-role panel phase | Live page load (not just `tsc`) confirms no serialization error; unit test asserts transform output type is `number`/`string` |
| 4. `Promise.all` fan-out growth | Any phase that is the 3rd+ new loader added to `mainCharts.tsx` | Loader count reviewed; consolidation applied if 3+ loaders share a data domain; load-time spot-check |
| 5. Stale DC coverage figure | Issue-fetch coverage donut phase; provisioned-vs-active coverage phase | Coverage number traced to a live loader call, not a literal, in code review |
| 6. Spatial-graph-coupled edge reuse | Activity verb/object-type breakdown phase | `npm run repo-map:check` shows no new `lib→app` edge rooted in the new loader |
| 7. Panel overload / workshop dilution | Final "workshop curation" phase (after all panels built) | Panel count + grouping reviewed against the owner's live-demo flow; expand/collapse applied where needed |
| 8. Golden-master test breakage | Permission-tier × folder-depth heatmap phase; permission-footprint-by-role phase | `npm test` green with TEST-01/02/03 byte-identical; no edits to existing test expected-value blocks |
| 9. Cross-filter combinatorics / null-handling / empty-state gaps | Every panel-adding phase | Manual UAT against at least one degenerate project (zero issues, null `lastSignIn`, thin activity) per new chart |

## Sources

- `C:/LECG/Dashboard/.planning/PROJECT.md` — v2.3 milestone scope, constraints, prior
  Key Decisions (Ph11 TRUTH-01 coverage-number correction, Ph19 BigInt-literal
  deviation)
- `C:/LECG/Dashboard/.planning/ROADMAP.md` — v2.3 Candidates seed table, registration
  pattern, phase history for TEST-01/02/03 and PROJ-01–03
- `C:/LECG/Dashboard/.planning/codebase/CONCERNS.md` — §1.1 raw-scan/OOM history,
  §1.4/§1.5 pool/heap tuning, §2.3 monolith-split history, §5.2 DC coverage figure +
  its own `VERIFY:` flag, §8.1 aggregate-test history, BND-03 deferred `lib→app` edges,
  "New concerns introduced ... by v2.2" (cron-coupled freshness)
- `C:/LECG/Dashboard/prisma/schema.prisma` — `AccProjectMember` (`lastSignIn`),
  `AccFolder`, `AccFolderPermissionSummary` (`totalBytes: BigInt`), `AccActivity`
  (`ingestRunId`), `AccDcIngestRun` (`rowsByModule: Json`), `AccIssue`,
  `AccIssueFetchRun` — read directly, lines cited inline above
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/mainCharts.tsx` — verified current
  8-entry `Promise.all` fan-out
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx`
  — verified 15 existing `PremiumSurface` panel instances; `sliceFilters` cross-filter
  state shape
- `C:/LECG/Dashboard/lib/server/coordinationByProjectView.ts` — verified existing
  `db.accIssue.groupBy` SQL-aggregation precedent
- `C:/LECG/Dashboard/lib/server/dcCoverageView.ts` — verified corrected coverage
  figures (~550 of ~1,153)
- `C:/LECG/Dashboard/components/ui/EChart.tsx` — verified `notMerge`/theme-remount
  behavior
- Project memory (`MEMORY.md` index): `project_rowsbymodule_telemetry_disconnect`
  (AccDcIngestRun.rowsByModule always 0), Ph19 BigInt-literal deviation note

---
*Pitfalls research for: LECG Dashboard v2.3 New Graphs (analytics panel additions)*
*Researched: 2026-07-02*
