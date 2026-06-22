# Pitfalls Research

**Domain:** Adding heavy interconnection/pivot/calendar charts to an existing ECharts data dashboard + re-running quota-limited ACC Data Connector extraction (v3.0 milestone)
**Researched:** 2026-06-22
**Confidence:** HIGH — all pitfalls grounded in verified repo files (PROJECT.md, CONCERNS.md, CONVENTIONS.md, ARCHITECTURE.md) and prior LECG Dashboard incident history (MEMORY.md post-mortems)

---

## Critical Pitfalls

### Pitfall 1: ECharts Instance Leak — Charts Not Disposed on Unmount

**What goes wrong:**
New heavy chart types (Sankey, calendar heatmap, chord diagram, treemap) are added as React components that call `echarts.init()` but never call `dispose()` on unmount. On `/access-analysis`, where 14+ panels already exist and more are being added, accumulated canvas instances consume memory until the browser tab becomes unresponsive or crashes — especially on a full re-render triggered by the cross-filter `FilterBanner` or section navigation.

**Why it happens:**
ECharts creates a stateful canvas-backed instance. If `useEffect` cleanup is missing, React re-mounts (e.g., due to key changes, Suspense fallback → resolve, or parent re-render) silently leak the old instance. The existing codebase already has 148 large-`useEffect` matches (CONCERNS.md); new chart components added without review join this footprint.

**How to avoid:**
- Every `echarts.init()` call must have a paired `echarts.dispose(instance)` in the `useEffect` cleanup function.
- Use the `EChart` wrapper established in v2.0 for every new chart — it already manages lifecycle. Do not reach around it to create raw instances.
- After adding new chart panels, run the Playwright UAT canvas-count check: if canvas count grows beyond the v2.0 baseline, a leak has been introduced.
- Run `npm run repo-map:check` after adding chart panels; new `react-use-effect` AST matches are flagged for review.

**Warning signs:**
- Browser tab memory climbs from ~200 MB to 800 MB+ during a session without a page reload.
- Switching section tabs causes a flicker or blank followed by a newly-painted chart (double-init without dispose).
- `echarts.getInstanceByDom()` returns an instance on a DOM node that was supposedly freshly mounted.

**Phase to address:**
Every phase that adds Sankey, chord, calendar heatmap, or treemap panels (Activity Depth and Interconnections phases). Enforce the `EChart` wrapper rule in the phase plan before any chart component is written.

---

### Pitfall 2: Sankey / Chord Cardinality Explosion — Node-Count Blowup

**What goes wrong:**
The Sankey (Company→Role→Module) and chord (firm collaboration, role co-occurrence) charts are built naively by streaming all unique values from the DB. With 428 projects, ~3,367 users, 77 roles, and multiple modules, an uncapped cross-join produces hundreds of nodes and thousands of links. ECharts Sankey degrades to an unreadable hairball at >40–50 nodes; the chord diagram becomes a solid disc. The chart fails to convey anything useful and may freeze on a projector-connected laptop.

**Why it happens:**
Developers fetch distinct combinations from Prisma and pass them directly to ECharts series data without aggregation caps. The data volume for ACC — 16,942 user×project instances, 428 projects — is large enough that even a single GROUP BY still produces hundreds of top-level nodes.

**How to avoid:**
- Cap Sankey input: top-N companies by member count (e.g., top 12), top-N roles by assignment frequency, top-N modules by activity. Expose the cap as a UI control.
- Aggregate before render: group the long tail into an "Other" node at the Prisma query level (`LIMIT` + a remainder bucket), not in JavaScript after the fetch.
- For chord/matrix, restrict to role co-occurrence only (roles × roles = 77×77 = 5,929 cells — still dense; cap to active roles with >10 members).
- Write a unit test on the aggregation helper asserting it returns ≤N nodes for adversarial inputs (all 3,367 users × 77 roles) before the chart is wired.

**Warning signs:**
- Sankey series `data` array length > 60 at any zoom level.
- Chord matrix edges > 500 before capping is applied.
- ECharts emits a silent render timeout or the browser tab goes unresponsive on chart mount.

**Phase to address:**
Interconnections phase — the aggregation cap and "Other" bucket must be specified in the phase plan, not discovered at render time.

---

### Pitfall 3: Pivot Explorer Cardinality Blowup — Folder × Role × User OOM

**What goes wrong:**
The scenario explorer allows any measure×dimension(×dimension) pick. A user selects `Folder × Role` or `Folder × User`: `AccFolderPermission` has been shown to produce ~5M rows when fully joined (v2.0 OOM post-mortem: "bulkUsers loaded ~5M AccFolderPermission rows → 77s+OOM"). An uncapped pivot query against this table will OOM the Node process or time out, killing the dashboard.

**Why it happens:**
The pivot engine generates a GROUP BY from the chosen dimension pair without a row-limit guard. Developers assume Prisma aggregation is safe at any cardinality because it runs server-side.

**How to avoid:**
- Any pivot query involving `AccFolderPermission` or `AccActivity` must use SQL `GROUP BY` + `HAVING COUNT(*) > threshold` + `LIMIT` at the Prisma/raw-query level — not in JS post-processing.
- Enforce a "max groups" guard in the tRPC router for pivot queries: if the cartesian product of the two selected dimensions exceeds a safe ceiling (e.g., 2,000 cells), return a warning and the top-N aggregated rows.
- Folder dimension specifically: never enumerate all leaf folders; group by folder tier (L1/L2) for cross-folder pivots.
- The v2.0 fix (GROUP-BY aggregate: 5M → 21k rows, 77s → 9s, `PG_POOL_MAX=32`) is the reference pattern. Apply it to all new pivot backends.

**Warning signs:**
- tRPC procedure response time > 5s for any pivot combo.
- Node heap approaches 8 GB (current `--max-old-space-size` ceiling from the v2.0 OOM fix).
- The page freezes when `Folder` is selected as either dimension in the pivot explorer.

**Phase to address:**
Scenario Explorer phase — the row-limit guard must be part of the tRPC procedure spec before the pivot engine is built.

---

### Pitfall 4: Coverage-Honesty Omission — 428/1,152 Unlabeled

**What goes wrong:**
New analytics panels (calendar heatmap, activity depth, folder reach, Sankey) are rendered without any indicator that they represent 428 of 1,152 hub projects (~37% coverage). Non-technical executives see "Company Activity Heatmap" and infer it covers the entire hub. This directly contradicts the owner constraint ("coverage-honest") and breaks trust when an audience member asks why their project is missing.

**Why it happens:**
Developers add the panel data correctly but treat the coverage label as a "nice to have" or polish-pass item. In a live workshop, the absence of this label is a credibility failure.

**How to avoid:**
- Every new analytics panel that draws from `AccActivity`, `AccFolderPermission`, or `AccDc*` tables must include a coverage indicator inline: "Based on 428 of 1,152 projects (admin-accessible)" — not only in a tooltip.
- Reuse the v2.0 `FilterBanner` or create a dedicated `CoverageHonesty` strip component; do not invent ad-hoc disclaimers per panel.
- Add a unit test asserting that each panel's data-fetching hook/tRPC call returns a `coverageNote` field, and that the component renders it.
- The phase plan for each data panel must include "coverage label" as an explicit acceptance criterion.

**Warning signs:**
- A PR adds a new analytics panel without a `coverageNote` string being rendered.
- The Prisma query uses `AccActivity` or `AccFolderPermission` but the component has no coverage text.

**Phase to address:**
All data panel phases. The `CoverageHonesty` pattern should be established in Phase 1 (DC re-extraction) as a reusable UI atom so all downstream phases import it without reinventing it.

---

### Pitfall 5: Attribution Gap Invisibility — UnresolvedAttribution Silently Excluded

**What goes wrong:**
`AccActivity` rows with failed author attribution (3–20% of rows, per milestone context) are silently excluded from activity charts. Calendar heatmaps, behavior-mix charts, and hottest-files panels show lower-than-actual activity counts with no indication of the gap. BIM managers who know the real activity level notice the discrepancy and lose confidence in the data.

**Why it happens:**
The `WHERE` clause filters out `UnresolvedAttribution` rows cleanly; the resulting totals look plausible. There is no downstream assertion that the excluded percentage is disclosed.

**How to avoid:**
- Every activity-derived chart must include an "Attribution quality" strip showing: total rows fetched, rows with resolved attribution, rows excluded.
- At the tRPC router level, return `{ data, attributionQuality: { resolved: N, unresolved: M } }` so the UI always has the denominator.
- Do not merge `UnresolvedAttribution` rows into an "Unknown" bucket that inflates the total — keep them as a disclosed exclusion.

**Warning signs:**
- A tRPC procedure returns activity data but has no `attributionQuality` field.
- Activity totals appear suspiciously round or match a perfect 100%.
- No `UnresolvedAttribution` count is visible anywhere on the `/access-analysis` activity section.

**Phase to address:**
Activity Depth phase. The `attributionQuality` return shape must be defined in the tRPC router spec before any activity chart component is built.

---

### Pitfall 6: Instance-vs-User Double Counting

**What goes wrong:**
`AccFolderPermission` and `AccDc*` tables are instance-level (user×project tuples). If a pivot shows "unique users with folder access" and the query counts rows rather than `DISTINCT userEmail`, a user with access to 200 projects appears 200 times. The "total people with access" KPI looks inflated by an order of magnitude.

**Why it happens:**
Prisma `count()` without `distinct` on a table with instance-level rows is a natural mistake. The distinction between instance-level and user-level cardinality is not obvious from schema names alone.

**How to avoid:**
- For any "people count" or "user count" metric, always use `COUNT(DISTINCT userEmail)` or Prisma's `distinct` aggregation option.
- Label metrics explicitly: "428 project-access records" vs. "3,367 distinct users."
- Write a unit test for each aggregation helper asserting that a fixture with one user and 5 projects returns count=1 for people and count=5 for access records.
- Code-review gate: any new `count()` call on `AccFolderPermission` or `AccDc*` tables must be reviewed for distinct-user intent.

**Warning signs:**
- A "users with folder access" KPI > 10,000 (the hub has ~3,367 distinct users per v2.0 data).
- A panel shows "16,942 people" rather than "16,942 user×project instances."

**Phase to address:**
All phases with people-count metrics. Establish a shared `countDistinctUsers()` helper in `lib/acc/` during Phase 1 so all later phases import it.

---

### Pitfall 7: Empty AccDcRole — Role Names Sourced from Wrong Table

**What goes wrong:**
A new panel queries `AccDcRole` for role names (e.g., for the Sankey Company→Role→Module chart) and returns empty data or role IDs without display labels. `AccDcRole` is permanently empty — Autodesk never delivered `admin_roles.csv` to the Data Connector. Role names come from the live `AccRole` table via `mergeRoleNames()` (the v2.0 fix). New code that skips this and queries `AccDcRole` directly silently produces no data.

**Why it happens:**
The table name `AccDcRole` sounds like the authoritative DC role table. A developer unfamiliar with the v2.0 fix uses it directly. The query succeeds (zero rows, no error), and the chart renders empty.

**How to avoid:**
- Add a `/* AccDcRole is always empty — use AccRole + mergeRoleNames() */` comment to the Prisma model and to any router file that touches roles.
- The `mergeRoleNames()` function is the single point of role-name resolution; no new code queries `AccDcRole.name` directly.
- Add a unit test asserting that any role-name aggregation returns non-empty results when `AccRole` has data and `AccDcRole` is empty (fixture test).

**Warning signs:**
- A chart or panel with `role` as a dimension renders with zero items or shows role IDs (e.g., "role_abc123") instead of display names.
- A Prisma query references `AccDcRole` for `.name` or `.displayName` in new code.

**Phase to address:**
Any phase adding role-dimension charts (Interconnections, Scenario Explorer). The phase plan must explicitly state: "role names come from AccRole via mergeRoleNames() — do not query AccDcRole."

---

### Pitfall 8: Shifting Module Taxonomy — New Ingest Overwrites Existing Classifications

**What goes wrong:**
After re-extracting all-time data (Phase 1), the `moduleOverrides.ts` taxonomy is applied to freshly ingested `AccActivity` rows. If the ingest pipeline encounters new action strings not in the existing catalog (~204 entries across `dimensionCatalog.structural` and `moduleOverrides.ts`), they are silently bucketed as `Unmapped/Other`. Charts showing module distribution quietly change between pre- and post-extraction without any alert.

**Why it happens:**
The taxonomy catalog was built from one historical slice of activity data. All-time historical data may include action strings from project types, modules, or time periods not previously seen.

**How to avoid:**
- After each DC re-extraction run, execute `scripts/diag-activity-types.cjs` (which already imports `moduleOverrides.ts`) and check for new `Unmapped` action strings before declaring extraction complete.
- Gate the "extraction complete" milestone condition on: zero new Unmapped actions OR new actions are deliberately added to the catalog.
- If new actions appear, update `moduleOverrides.ts` before data-dependent view phases begin.

**Warning signs:**
- `Unmapped` or `Other` category in activity charts grows beyond the pre-extraction baseline percentage.
- `scripts/diag-activity-types.cjs` output shows new action strings not present in the existing catalog.

**Phase to address:**
DC Re-extraction phase — taxonomy validation is an explicit acceptance criterion before that phase is marked complete.

---

### Pitfall 9: Prescriptive Risk Framing — UI Implying a Verdict

**What goes wrong:**
A panel labels data with words like "High Risk," "Exposed," "Critical," or uses red color for certain folder-access patterns without the owner's explicit request. The owner specifically rejected synthetic risk scores: "i dont care about risk scores… i would make it myself." A red "High Risk" label in a live workshop creates anxiety and misrepresents the descriptive intent.

**Why it happens:**
Developers default to traffic-light (red/yellow/green) color semantics for access data because it is a familiar convention. Folder exposure, dormant access, and role co-occurrence charts look like "risk indicators" by default.

**How to avoid:**
- Color encodes category or quantity, never severity. Red must not mean "bad" or "dangerous." Use the zinc/chart-color token palette with semantic neutrality.
- Labels state facts only: "External access" not "Exposed"; "Dormant access (>90 days)" not "Risk: dormant"; "Role outlier" not "Suspicious role."
- The phase plan for each panel must include a "label review" checklist item: does any label imply a verdict? If yes, rewrite it as a fact.
- Code-review gate: any string containing "risk," "danger," "critical," "alert," "exposed," "threat," or "suspicious" in a UI-rendered label must be flagged for review.

**Warning signs:**
- Color scale uses red for highest values on folder-access or dormant-access charts.
- A component renders text containing "High Risk," "Exposed," or severity grades.
- Tooltip copy says "This role is dangerous" rather than "This role has N overlapping permissions."

**Phase to address:**
All phases. Establish a "descriptive label vocabulary" in the phase 1 plan and reference it in every subsequent phase's acceptance criteria.

---

### Pitfall 10: DC Quota Exhaustion — Re-extraction Stalls Mid-Run

**What goes wrong:**
The ACC Data Connector quota is ~25 requests/UTC-day per user. A full re-extraction of 428 projects requires multiple days. If the extraction script does not checkpoint progress and resume cleanly, a quota-hit (429 response) mid-run produces a mixed-vintage dataset: some projects freshly extracted, others still stale. Panels that depend on "freshly extracted" data show misleading before/after comparisons.

**Why it happens:**
The extraction script is run without a resume checkpoint, or `DC_RESUME=1` is not set when resuming. This exact failure was documented 2026-05-13: "DC daily quota hit. Use DC_RESUME=1 to retry after 429."

**How to avoid:**
- The re-extraction phase plan must include: (1) verify `DC_RESUME=1` is armed before each day's run, (2) log extracted project IDs to a durable checkpoint file, (3) set `DC_PRIORITY_BACKFILL=1` and `SAFE_BUDGET=20` (leaving headroom for bisect retries).
- Do not mark the DC Re-extraction phase complete until a completeness query confirms all 428 target project IDs have at least one `AccActivity` row with an `extractedAt` timestamp from the current run.

**Warning signs:**
- Extraction log shows HTTP 429 with no subsequent resume.
- `AccActivity` row count does not grow between day 1 and day 2 of extraction.
- Project IDs in the checkpoint file are absent from the `AccActivity` table after the run.

**Phase to address:**
Phase 1: DC Re-extraction — must be the first phase and must gate all data-dependent view phases.

---

### Pitfall 11: APS Refresh Token Breakage — Single-Use Token Not Persisted

**What goes wrong:**
The DC extraction script calls the APS API, which returns a new refresh token on each token refresh (v2 single-use rotation). If the script does not persist the new token back to the DB immediately, the old token is invalidated. The next dashboard login fails with an auth error. This broke the live dashboard on 2026-06-01 and required manual recovery via `scripts/aps-login.cjs`.

**Why it happens:**
A script refreshes the APS token to make a DC API call but does not write the new `refreshToken` back to the database. Any subsequent request — by the script or by a user logging in — uses the invalidated old token and gets a 401.

**How to avoid:**
- Every script that calls `lib/acc/` APS token-refresh helpers must use the helper that both refreshes AND persists the new token atomically.
- Add a post-run assertion: after the DC extraction script completes, verify the token in the DB is newer than the token at the start of the run (compare `updatedAt` timestamp).
- Never call APS token endpoints outside the single canonical helper.
- Recovery reference: `scripts/aps-login.cjs` re-authenticates; document this in the phase runbook.

**Warning signs:**
- Dashboard login returns a 401 or session error immediately after a DC extraction run.
- The extraction script logs a 401/403 on the second API call of the run (token was rotated by the first call but not persisted).

**Phase to address:**
Phase 1: DC Re-extraction — the token-persistence requirement must be an explicit step in the script runbook, not assumed.

---

### Pitfall 12: 403-Cascade Contamination — Locked Projects Abandoning Good Batches

**What goes wrong:**
428 of 1,152 projects are admin-extractable; the other 724 return 403. If the extraction script does not cleanly separate the 403 set from genuine extraction failures, a batch containing a single 403-returning project may abort early, leaving good projects in the batch un-extracted and consuming the day's quota budget on overhead retries.

**Why it happens:**
The bisect logic (`DC_403_BISECT`) was added in v2.0 but requires the flag to be armed. Without it, the default batch strategy aborts on 403. The 724 locked projects are permanently locked (needs Account Admin provisioning) but look like transient errors to a script without the denylist.

**How to avoid:**
- Arm `DC_403_BISECT=1` for the re-extraction run (verified: this flag exists in `lib/acc/dcIngest.ts`).
- Maintain a denylist of known 403-returning project IDs; skip them in the planning phase of each day's budget allocation so quota is not wasted on retries.
- The completeness check query must use 428 as the denominator, not 1,152.

**Warning signs:**
- Extraction log shows 403 errors followed by early abort rather than bisect-and-continue.
- The completeness query reports ~37% coverage as a "failure" rather than the expected full result.
- `DC_403_BISECT` is absent from `.env` or set to `0` in the current environment.

**Phase to address:**
Phase 1: DC Re-extraction — `DC_403_BISECT=1` and the 428-project denominator must be in the extraction script runbook.

---

### Pitfall 13: ECharts Theme Drift — Hardcoded Colors Bypass the Token System

**What goes wrong:**
New chart components (Sankey, heatmap, treemap) hardcode hex colors or use ECharts default palette instead of resolving colors from the active theme. In dark (zinc) mode, chart labels or axis ticks become invisible. The UAT-critical THM-01 gate fails and the workshop experience breaks.

**Why it happens:**
ECharts does not participate in Tailwind CSS custom properties automatically. Developers copy chart configs from ECharts examples that use hex literals. The v2.0 fix (use `useTheme()` → `resolvedTheme` → resolve CSS variables) is not obvious when adding a new chart type.

**How to avoid:**
- All ECharts options must resolve colors through the theme helper established in v2.0. The `EChart` wrapper should accept a `themeColors` prop computed from `useTheme()` and `getComputedStyle(document.documentElement)` — never from hardcoded hex.
- The phase plan for each chart panel must include "theme-resolved colors" as an acceptance criterion.
- Verify in Playwright UAT: toggle dark/light theme and confirm charts remain readable in both modes.

**Warning signs:**
- A chart looks correct in one theme and washed-out or invisible in the other.
- `rg "#[0-9a-fA-F]{6}" app/(dashboard)/access-analysis/` returns new non-token hex strings in component files.
- ECharts `color` array in a new series option contains raw hex instead of a CSS-var reference.

**Phase to address:**
Every phase that adds chart components. Enforce the theme-resolution rule in the component starting template.

---

### Pitfall 14: Calendar Heatmap Date-Range Mismatch — Appears Sparser Than Reality

**What goes wrong:**
The calendar heatmap for `AccActivity` shows a large chunk of blank days because the date range defaults to the current calendar year but activity data may be concentrated in historical periods, or because the GROUP BY uses `createdAt` (ingest timestamp) rather than the actual activity timestamp from the ACC event. The heatmap looks sparse, executives conclude activity is low, and the dashboard loses credibility.

**Why it happens:**
Two separate issues: (1) the heatmap defaults to the current year without checking the actual date distribution of the data; (2) `AccActivity` rows may have an ingest timestamp distinct from the real activity date. VERIFY: confirm which field holds the actual activity timestamp (may be `createdAt`, `activityAt`, `timestamp`, or similar — check `prisma/schema.prisma`).

**How to avoid:**
- Before building the calendar heatmap component, run a diagnostic query: `SELECT MIN(activityDate), MAX(activityDate), COUNT(*) FROM AccActivity` (VERIFY: exact column name) to understand the actual date range.
- Default the heatmap to the date range that contains at least 80% of activity, not the current calendar year.
- If the activity timestamp and the ingest timestamp are different columns, always use the activity timestamp.
- Add a unit test for the date-aggregation helper using a fixture with activities spread over two years to assert correct bucketing.

**Warning signs:**
- The heatmap renders with >60% blank cells even after a successful DC re-extraction.
- The max-activity day in the heatmap is the day of the extraction run (ingest timestamp leak).
- The heatmap date range starts in 2026 but DC activity data may span 2023–2026.

**Phase to address:**
Activity Depth phase — the diagnostic query must be run and the date field confirmed before the heatmap component is specced.

---

### Pitfall 15: next build Blocked by Test-File Type Errors

**What goes wrong:**
A new chart component or tRPC procedure introduces a TypeScript error in a test file (mismatched fixture type, missing mock type). Because `next build` typechecks the entire tree including test files (no `ignoreBuildErrors` — verified in PROJECT.md), the deploy build fails with a test-file path in the error, which is confusing and blocks the `:3000` restart.

**Why it happens:**
Developers run `npx tsc --noEmit` only on production source, or a concurrent dev session has an open test file with a type error. The prior incident (MEMORY.md: "any tsc error (even a concurrent session's test) BLOCKS the :3000 deploy build") proves this is a real failure mode.

**How to avoid:**
- Always run `npx tsc --noEmit` (which covers the entire tree) as the gate before `next build`.
- When adding new chart/pivot types, add corresponding test fixture types at the same time as the implementation.
- The phase plan for every phase must include `npx tsc --noEmit` as a mandatory pre-build gate with zero errors.

**Warning signs:**
- `next build` fails with an error in `*.test.ts` or `*.test.tsx`.
- The TSC error path is under `app/(dashboard)/access-analysis/__tests__/` rather than production source.
- The error only appears in build, not in the `vitest` run (test runner bypasses strict-mode inference on some import paths).

**Phase to address:**
All phases — this is a workflow gate, not a feature pitfall, but must be in every phase's verification checklist.

---

### Pitfall 16: npm run build While :3000 Is Serving — Corrupts .next Cache

**What goes wrong:**
Running `npm run build` while the Task Scheduler task is serving `:3000` from the current `.next` directory corrupts the in-use build artifacts. The running server starts returning 500 errors. Recovery requires stopping the task, clearing `.next`, rebuilding, and restarting — costing 15–20 minutes in a pre-workshop scenario.

**Why it happens:**
The deploy mechanism is not a git-branch merge; it is a local rebuild of the current working tree. The running Next.js server holds `.next` open. A new build writes into the same directory concurrently.

**How to avoid:**
- Always stop the Task Scheduler task before running `npm run build`. The deploy sequence from `references/deploy-sequence.md` must be followed verbatim for any rebuild that ships DC extraction results or new panels.
- The DC re-extraction phase and any subsequent phase that requires a rebuild must include "stop Task Scheduler → tsc → build → restart" as the explicit final step.

**Warning signs:**
- `:3000` returns 500 errors immediately after a build completes.
- `npm run build` log shows "deleting .next" while the server is running.

**Phase to address:**
Phase 1: DC Re-extraction (first rebuild after extraction) and all subsequent phases. The deploy sequence must be in every phase's verification gate.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Adding a chart component directly in the route `page.tsx` without extracting a pure transform | Faster to write | Untestable data logic; grows already-large access-analysis modules (50KB flagged in CONCERNS.md) | Never — extract the transform first |
| Querying `AccFolderPermission` without a LIMIT in a pivot query | Simpler SQL | 5M+ row OOM, identical to the v2.0 incident that caused 77s+crash | Never — LIMIT is mandatory |
| Copying ECharts example configs with hardcoded hex colors | Faster chart setup | THM-01 failure; chart invisible in dark mode at workshop | Never on this surface |
| Adding a new tRPC procedure with `publicProcedure` instead of `protectedProcedure` | Avoids session lookup | Unauthenticated access to ACC analytics data | Never |
| Skipping the coverage label on a new analytics panel | Cleaner UI | Misleads executives; breaks owner's coverage-honest constraint | Never |
| Running `npm run build` during an active `:3000` session | Saves a restart step | Corrupts `.next` cache, causes 500s (MEMORY.md confirmed) | Never — stop task scheduler first |
| Placing a new shared taxonomy helper in `app/(dashboard)/access-analysis/` instead of `lib/acc/` | Colocation convenience | Scripts that need the helper import route-owned app code, adding to the 6 existing dependency-cruiser warnings | Never for anything used outside the UI route |
| Using `count()` on `AccFolderPermission` without `DISTINCT` | Simpler Prisma call | People counts inflated by user×project fan-out | Never for user-count metrics |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| APS / ACC Data Connector | Calling APS token refresh without persisting the new refresh token (v2 single-use rotation) | Use the canonical `lib/acc/` helper that refreshes AND persists atomically; verify `updatedAt` after each run |
| APS / ACC Data Connector | Setting quota budget to 25 without accounting for bisect retries | Real usable quota per day is ~20 after reserving for bisect overhead; use `SAFE_BUDGET=20` |
| APS / ACC Data Connector | Not arming `DC_403_BISECT=1` before a batch run | Always arm the flag; maintain a 403-denylist so locked projects do not consume quota retries |
| APS / ACC Data Connector | Using `fields=` param on ACC Issues API | Corrupts `deleted` field and drops ~3k issues — never use the `fields=` filter (MEMORY.md verified) |
| ECharts | Calling `echarts.init()` outside the shared `EChart` wrapper component | Instance leaks across re-mounts; always use the wrapper |
| ECharts | Passing raw `data` arrays to Sankey/chord without cardinality caps | Chart freezes or becomes unreadable at ACC-scale cardinality |
| Prisma / PostgreSQL | `count()` on instance-level tables (`AccFolderPermission`) without `DISTINCT` | People counts inflated by user×project fan-out |
| Prisma / PostgreSQL | Querying `AccDcRole` for role display names | Table is always empty; use `AccRole` via `mergeRoleNames()` |
| next build | Running `npm run build` with a concurrent dev session or while `:3000` is serving | 500 errors from corrupted `.next` cache; stop the Task Scheduler task first |
| next build | Not running `npx tsc --noEmit` before `npm run build` | Build typechecks test files; a test-file type error blocks deployment |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Uncapped `AccFolderPermission` join in pivot query | Server OOM, 77s+ response, Node process killed | Always use SQL GROUP BY + LIMIT at Prisma level | First pivot query touching folder dimension |
| ECharts Sankey with >50 nodes | Chart renders as hairball; browser tab freezes on projector | Cap at top-N with "Other" bucket before passing to series | Whenever Company×Role×Module is naively joined |
| Calendar heatmap over wrong date range | 60%+ blank days, looks broken | Confirm actual activity date range with diagnostic query before speccing | When date field defaults to ingest timestamp |
| Re-mounting ECharts instances without dispose | Memory creep, tab unresponsive after 20+ min session | Always use `EChart` wrapper with cleanup; audit canvas count in UAT | After adding 3+ new chart panels to a page |
| Pivot engine returning >2,000 cells | UI freezes during cell render, ECharts bar chart becomes unreadable | Enforce max-groups guard in tRPC router | When both dimensions have >45 distinct values |
| DC extraction without checkpointing | Mixed-vintage data, misleading panels | Use `DC_RESUME=1` and checkpoint file; verify completeness before phase sign-off | Day 2+ of multi-day extraction |

---

## "Looks Done But Isn't" Checklist

- [ ] **Coverage label:** Every new analytics panel shows "Based on 428 of 1,152 projects" — verify the string is rendered in the component, not just in a comment.
- [ ] **Attribution quality strip:** Every activity-derived chart returns and renders `{ resolved: N, unresolved: M }` — verify the tRPC procedure returns both fields.
- [ ] **ECharts dispose:** Every chart component using `echarts.init()` outside the `EChart` wrapper has a `useEffect` cleanup that calls `dispose()` — verify with canvas-count UAT.
- [ ] **Role names:** Any role-dimension panel shows display names, not IDs — verify by checking that `AccRole` data exists and `mergeRoleNames()` is called.
- [ ] **Distinct user counts:** Any "N users" metric on a panel backed by `AccFolderPermission` uses `DISTINCT userEmail` — verify with a fixture test (1 user × 5 projects = count 1, not 5).
- [ ] **Sankey cardinality:** Sankey series `data` array length ≤ configured cap — verify in a unit test with adversarial input (all 3,367 users × 77 roles).
- [ ] **Theme colors:** Chart renders correctly in both light and dark modes — verify by toggling `resolvedTheme` in the Playwright UAT.
- [ ] **DC extraction completeness:** All 428 target project IDs have `AccActivity` rows with `extractedAt` from the current run — verify with the completeness SQL query before marking Phase 1 done.
- [ ] **APS token persisted:** After a DC extraction run, the APS token `updatedAt` is newer than the run start time — verify with a post-run DB check.
- [ ] **Taxonomy coverage:** `scripts/diag-activity-types.cjs` returns zero new Unmapped actions after re-extraction — verify before data-dependent phases begin.
- [ ] **No prescriptive labels:** No new UI string contains "risk," "danger," "critical," "exposed," or "suspicious" — verify with `rg -i "risk|danger|critical|exposed|suspicious" app/(dashboard)/access-analysis/`.
- [ ] **tsc clean:** `npx tsc --noEmit` exits 0 before any `npm run build` — verify this is the last step in every phase's verification gate.
- [ ] **Task Scheduler stopped:** Task Scheduler task for `:3000` is stopped before `npm run build` is run — verify no 500 errors after restart.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| ECharts instance leak (memory creep) | LOW | Identify leaking component via browser heap snapshot → add `dispose()` in `useEffect` cleanup → run UAT canvas-count check |
| Sankey cardinality blowup (chart freeze) | LOW | Add top-N cap to the tRPC aggregation query → retest with production data |
| AccFolderPermission OOM | MEDIUM | Kill Node process → add `LIMIT` + GROUP BY at query level → restart with `PG_POOL_MAX=32` (v2.0 fix) → verify ~9s response time |
| APS token rotation breakage | MEDIUM | Run `node scripts/aps-login.cjs` to re-authenticate → verify new token in DB → arm token-persist assertion in extraction script |
| DC quota exhaustion (partial extraction) | MEDIUM | Arm `DC_RESUME=1` → wait for UTC midnight quota reset → re-run with `DC_PRIORITY_BACKFILL=1` → check completeness query |
| 403 cascade abandoning good projects | LOW | Set `DC_403_BISECT=1` → re-run the affected day's batch → verify bisect log shows successful extraction for non-403 projects |
| next build blocked by test-file type error | LOW | Run `npx tsc --noEmit` → fix test fixture type → re-run build |
| .next cache corrupted by concurrent build | MEDIUM | Stop Task Scheduler task → delete `.next` → `npm run build` → restart task |
| Coverage label omitted (workshop credibility) | LOW | Add `CoverageHonesty` strip to the panel → rebuild → verify at `:3000` before workshop |
| Taxonomy gap (new Unmapped actions post-extraction) | LOW | Run `scripts/diag-activity-types.cjs` → add new actions to `moduleOverrides.ts` → re-run affected panels |
| Prescriptive label shipped to workshop | LOW | Find string → rewrite as a descriptive fact → rebuild; no data change needed |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| DC quota exhaustion + resume | Phase 1: DC Re-extraction | Completeness SQL: 428 project IDs with current `extractedAt` |
| APS token rotation breakage | Phase 1: DC Re-extraction | Post-run token `updatedAt` check |
| 403 cascade contamination | Phase 1: DC Re-extraction | Bisect log + 428-denominator completeness check |
| Shifting module taxonomy | Phase 1: DC Re-extraction (gate before Phase 2+) | `diag-activity-types.cjs` zero-Unmapped assertion |
| AccFolderPermission OOM / pivot cardinality | Phase: Scenario Explorer | tRPC procedure response < 5s under folder×role query |
| Sankey/chord cardinality blowup | Phase: Interconnections | Unit test: adversarial input returns ≤ cap nodes |
| Coverage-honesty omission | All data panel phases (establish in Phase 1) | Component renders "428 of 1,152" string; unit test asserts field present |
| Attribution gap invisibility | Phase: Activity Depth | tRPC returns `attributionQuality`; component renders it |
| Instance-vs-user double counting | All phases with people counts | Fixture test: 1 user × 5 projects → count = 1 |
| Empty AccDcRole / role name sourcing | Phase: Interconnections + Scenario Explorer | Panel renders display names, not IDs; `mergeRoleNames()` verified in call chain |
| ECharts instance leak + dispose | All chart phases | Playwright canvas-count check after each phase |
| ECharts theme drift | All chart phases | UAT: toggle theme, both modes readable |
| Calendar heatmap date mismatch | Phase: Activity Depth | Diagnostic query confirms date field + range before spec |
| Prescriptive risk labels | All phases | `rg -i "risk|danger|critical"` over new components returns 0 |
| next build test-file type errors | All phases | `npx tsc --noEmit` exits 0 in every phase verification gate |
| npm run build during live :3000 | All rebuild phases | Deploy sequence: stop task → tsc → build → restart |

---

## Sources

- `.planning/PROJECT.md` (v3.0 milestone context, constraints, key decisions) — [VERIFIED]
- `.planning/codebase/CONCERNS.md` (large modules, ACC/DC coupling, dependency warnings, 148 useEffect matches) — [VERIFIED]
- `.planning/codebase/CONVENTIONS.md` (theme, boundary, ESLint, AST-grep baselines, boundary rules) — [VERIFIED]
- `.planning/codebase/ARCHITECTURE.md` (layer boundaries, data flow, entry points) — [VERIFIED]
- MEMORY.md post-mortem: AccFolderPermission 5M-row OOM + fix (GROUP-BY, 77s→9s, `PG_POOL_MAX=32`) — [VERIFIED]
- MEMORY.md post-mortem: APS refresh token rotation breakage + `aps-login.cjs` recovery (2026-06-01) — [VERIFIED]
- MEMORY.md: `AccDcRole` always empty; `mergeRoleNames()` v2.0 fix — [VERIFIED]
- MEMORY.md: DC quota ~25 req/UTC-day; `DC_RESUME=1`; `DC_403_BISECT`; `DC_PRIORITY_BACKFILL=1`; `SAFE_BUDGET=20` — [VERIFIED]
- MEMORY.md: `next build` typechecks test files; `npx tsc --noEmit` before rebuild — [VERIFIED]
- MEMORY.md: `npm run build` under running `:3000` causes 500s — [VERIFIED]
- MEMORY.md: ACC Issues `fields=` param corrupts deleted + drops ~3k issues — [VERIFIED]
- MEMORY.md: ECharts `resolvedTheme` + CSS-var resolution for chart colors (THM-01) — [VERIFIED]
- Milestone context (prompt): 428/1,152 coverage, 3–20% attribution gap, instance-vs-user distinction — [CITED — VERIFY exact attribution-gap percentage against `AccActivity` data after Phase 1 extraction]

---

*Pitfalls research for: /access-analysis v3.0 — heavy viz (Sankey, chord, calendar heatmap, treemap, pivot explorer) + DC re-extraction*
*Researched: 2026-06-22*
