# Phase 20: Foundation Wins & Engagement Panels - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Four new low-risk analytics panels land on `/access-analysis`, all sourced from
existing/materialized Prisma data with zero shared-query risk:

1. **PERM-01** — permission reach by role (folder count + human-readable bytes) from
   `AccFolderPermissionSummary` (22,082 rows, cron-refreshed since Ph18/19).
2. **PIPE-01** — compact, visually secondary ingest-freshness panel (latest
   `AccDcIngestRun` + live `AccActivity` throughput).
3. **ISSUE-01** — issue-fetch coverage donut (`ok` / `zero_issues` / `forbidden` /
   `error` from `AccIssueProjectFetchResult.status`).
4. **ENG-01** — dormant users bucketed by `AccProjectMember.lastSignIn` recency bands
   with an explicit "Never signed in" bucket.

Out of scope: the issue funnel charts (Phase 21), issue-type resolution (Phase 22),
panel-count curation across the whole page (Phase 23), any new data source, any new
npm dependency, `/users/spatial-graph`.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 20 entry — goal, 5 success criteria, requirement mapping
  (ISSUE-01/PERM-01/ENG-01/PIPE-01), UI hint yes.
- `.planning/REQUIREMENTS.md` — exact requirement text incl. TRUTH convention
  (coverage precedes metric), no-polling constraint, null-bucket rule, rowsByModule ban.
- `.planning/STATE.md` — verified counts (22,082 summary rows; 4-bucket status set),
  v2.3 guardrails (BigInt server-side conversion, server-side aggregates only,
  `Promise.all` fan-out review), Ph19 decision that the summary table is the exact
  source for PERM-01 (zero raw ~6M-row table touch).
- `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` — current page
  flow verified: Activity over time → Role distribution → Users by company → Activity
  by role → Activity by company → Activity by module → Model Coordination section;
  existing `SectionHeader`, drill ("Click a role to see who did the work"), and
  title/subtitle conventions.
- `app/(dashboard)/access-analysis/mainCharts.tsx` — exists; owns the `Promise.all`
  loader fan-out (8 entries pre-v2.3) named in success criterion 5.
- VERIFY: `AccFolderPermissionSummary` is keyed per (project, role) such that a
  per-project drill for a clicked role is a direct query on the summary table —
  confirm the model's columns in `prisma/schema.prisma` before planning the drill.
- VERIFY: `AccIssueProjectFetchResult` rows carry a project identifier joinable to a
  human-readable project name for the coverage drill list.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Zinc dark theme; all four panels render via `@/components/ui/EChart` with
  theme-resolved colors; existing ChartPanel/SectionHeader/title+subtitle conventions.
- All aggregates server-side (SQL/`groupBy`), never `findMany` + JS reduce
  (TEST-01 OOM-guard class).
- `totalBytes` BigInt → Number/formatted string inside the server loader, before the
  RSC→client boundary; verified by a live page load, not just `tsc`.
- Never read `AccDcIngestRun.rowsByModule` (always-zero); throughput comes from live
  `AccActivity` counts grouped by `ingestRunId`.
- Coverage donut shows all 4 honest buckets; no bucket hidden or merged.
- Ingest panel is a static per-page-load read; no polling.
- `mainCharts.tsx` fan-out consolidated per data domain (not 4 independent top-level
  additions); `/access-analysis` load time spot-checked before/after.
- No new WebGL; `/users/spatial-graph` untouched; explicit-path commits only.

</defaults>

<decisions>
## Implementation Decisions

### Page placement & ordering — domain-grouped insertion
- Each panel joins its natural neighborhood in the existing flow:
  - **Dormant users** near Role distribution (people/engagement neighborhood).
  - **Permission footprint** after the role charts (access domain).
  - **Issue-fetch coverage donut** directly above the Model Coordination section, so
    coverage precedes the issue metrics beside/below it and Phase 21's funnel lands
    under it.
  - **Ingest freshness** as a compact secondary strip at the very bottom of the page.
- No new appended "v2.3 section"; the page keeps reading as themes, which also
  pre-positions Phase 23's grouping review.

### Permission footprint chart form
- Horizontal bars, one per role, sorted by total bytes descending; bar length = bytes
  with human-readable axis/labels (e.g. "42.3 GB"); folder count as a secondary
  label/tooltip per bar.
- **Top ~10 roles + "Other" rollup** (exact N is Claude's discretion around 10, chosen
  for comfortable panel height).
- **Clicking a role drills to its per-project breakdown** — a drill list of that
  role's projects with folder count + bytes each, sourced straight from
  `AccFolderPermissionSummary` (no raw-table touch).

### Dormant users interaction
- Vertical bar per recency band, ordered <30d / 30–90d / 90–365d / >365d / Never
  signed in; the "Never signed in" bar visually distinguished (muted/hatched — exact
  treatment Claude's discretion).
- Clicking a band opens the existing drill list (same `onSliceClick`/`activeSlice`
  convention as Activity by role).
- **Drill rows: user name, company, exact last sign-in date ("Never" for the null
  bucket), sorted most-dormant first** (oldest lastSignIn at top; Never bucket rows
  are inherently uniform).

### Issue-fetch coverage donut interaction
- **Clicking any bucket drills to the list of projects in that bucket** — including
  `ok` and `zero_issues`, not just problem buckets (consistent click behavior across
  the whole chart).

### Ingest freshness look
- Single slim row of small stat tiles: last run started/ended, status badge, duration,
  projects processed, and throughput as "N activity rows this run" (live from
  `AccActivity` by `ingestRunId`). No chart, no run history.
- Muted styling so it reads as ops metadata, not an analytics headline.
- Stale-run flag: amber badge when the latest run is old (threshold ~36h — exact value
  Claude's discretion, aligned with the ≤1-ingest-cycle staleness doc from Ph19).

### Cross-filter scope
- **Permission footprint, dormant users, and issue coverage all obey the FilterBanner
  project selection** (their sources are project-keyed).
- **Ingest freshness stays account-global** with an explicit "account-wide" caption.

### Claude's Discretion
- Exact top-N cutoff (around 10), exact stale threshold (around 36h), exact tile copy,
  spacing, empty-state wording, "Never signed in" visual treatment, loading skeletons,
  and how the 4 loaders consolidate into the `mainCharts.tsx` fan-out — all within the
  Dashboard defaults above.

</decisions>

<specifics>
## Specific Ideas

- Trust-precedes-metric framing is deliberate: the coverage donut is positioned so a
  workshop viewer sees "how much can we see into?" before any issue number — and
  Phase 21 builds directly beneath it.
- Every interactive panel keeps the page's established "click to see who/which"
  convention; no panel should be the odd non-interactive one among its neighbors.
- "Which projects can't we see into?" (forbidden bucket drill) is an expected live
  demo moment.

</specifics>

<workshop>
## Workshop Impact

- Surface: `/access-analysis` only (no `/template-mty` panel in this phase).
- The presenter gains four new credible stories: which roles reach the most data,
  who has gone quiet (and who never showed up), how trustworthy the issue data is
  per project, and — quietly, at the bottom — whether the pipeline is fresh.
- Page flow stays theme-grouped rather than growing a bolted-on section, keeping the
  demo narrative coherent ahead of Phase 23's curation pass.

</workshop>

<data_truth>
## Data Truthfulness

- PERM-01: `AccFolderPermissionSummary` (materialized, 22,082 rows, cron-refreshed;
  ≤1-ingest-cycle staleness) — zero touch of the raw ~6M-row `AccFolderPermission`.
- PIPE-01: `AccDcIngestRun` (latest run) + `AccActivity` grouped by `ingestRunId`;
  `rowsByModule` is banned (confirmed always-zero). Panel carries an "account-wide"
  caption.
- ISSUE-01: latest `AccIssueFetchRun`/`AccIssueProjectFetchResult`; all four status
  buckets shown honestly — `forbidden`/`error` are labeled, never hidden.
- ENG-01: `AccProjectMember.lastSignIn`; `null` renders as an explicit "Never signed
  in" bucket, verified against at least one real project containing such a member.
- No new data sources; no hardcoded coverage figures anywhere.

</data_truth>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Milestone-level deferrals — treemap,
tier×depth heatmap, verb breakdown, module coverage — are already recorded in
`REQUIREMENTS.md` Future Requirements.)

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` before any rebuild.
- **Live page load of `/access-analysis`** to verify the BigInt conversion (success
  criterion 1 explicitly notes `tsc` won't catch serialization errors).
- Null-`lastSignIn` bucket verified against a real project with a never-signed-in
  member.
- `mainCharts.tsx` fan-out reviewed for the +4 loaders (consolidated per data domain);
  `/access-analysis` load time spot-checked before/after.
- Existing characterization tests (TEST-01/02/03) stay green/byte-identical; targeted
  Vitest for new server loaders where existing patterns support it.
- Dashboard guardrails: zinc theme preserved, theme-resolved ECharts colors, no new
  WebGL on data surfaces, `/users/spatial-graph` untouched, explicit-path commits.

</verification>

---

*Phase: 20-foundation-wins-engagement-panels*
*Context gathered: 2026-07-02*
