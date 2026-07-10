# Phase 22: Issue Type Resolution - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

ISSUE-04: a new **additive** Prisma lookup table populated by a one-time (but re-runnable)
APS issue-types metadata backfill covering the verified 316 type / 515 subtype GUIDs —
no edit to `AccIssue`'s existing columns or any existing issue query. ISSUE-05: an
issues-by-type breakdown chart (top-N + "Other") where every `issueTypeId` resolves to a
human-readable name via the lookup table, or an honest "Unknown type" fallback — never a
raw GUID. ISSUE-04 must land, be committed, and be verified as a separate earlier plan
before ISSUE-05 (the chart) is built. This is the milestone's only phase carrying
external-APS-call + Prisma-migration risk; it stays isolated.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 22 entry — goal, 5 success criteria, ISSUE-04→ISSUE-05
  locked sequencing, dependency on Phase 21 (shipped).
- `.planning/REQUIREMENTS.md` ISSUE-04/ISSUE-05 — 316 type / 515 subtype GUIDs verified
  live 2026-07-02; "Unknown type" fallback requirement; top-N + "other" bucketing.
- `.planning/STATE.md` — Phase 21/21.1 complete; `ProjectsTabPanel.tsx` explicitly left
  room for this chart as a third sibling ("zero redesign needed", 21-04); pgvector
  migrate-choke precedent (raw `ALTER` + `prisma migrate resolve` fallback); guardrails
  (never render a raw GUID, server-side aggregates only, honest coverage labels).
- `prisma/schema.prisma` — `AccIssue` has `issueTypeId String?` / `issueSubtypeId String?`
  (verified this session); `prisma/migrations-raw/` precedent exists for migrate-choke
  avoidance (`AccInstanceEmbedding` comment, schema.prisma ~line 904).
- `scripts/acc-issues-backfill.cjs` — exists (verified this session); the 3-leg-auth
  per-project crawl pattern ISSUE-04's script clones.
- Memory: ~724 projects are 403-locked for this account (`project_dc_access_universe`);
  luis is project-scoped, not Account Admin — per-project issue-types calls will 403 on
  the same universe.
- VERIFY: exact APS issue-types endpoint shape/response fields (types vs subtypes nesting)
  — researcher must confirm against official APS docs and the existing script's auth
  helper before the plan names the endpoint.
- VERIFY: what share of the 316 live type GUIDs actually resolve from accessible
  projects — first measured by the backfill run itself; the chart handles any shortfall
  honestly rather than assuming full coverage.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Chart mounts on the **Projects tab** of `/access-analysis` (`ProjectsTabPanel.tsx`),
  below `IssueStatusChart` — the position Phase 21-04 reserved.
- ECharts via the existing `EChart` component, zinc theme, resolved theme colors; local
  drill state only (no `sliceFilters` cross-filter-bus wiring — grep-verified absent, per
  the 21-03 convention); picker-only filtering via `selected` (never
  `sliceFilteredProjectIds`).
- Backfill script clones `scripts/acc-issues-backfill.cjs` conventions (3-leg auth,
  per-project crawl, console progress, 403/error counters, final summary line).
- Migration path: `prisma migrate dev` first; if it chokes (pgvector precedent), raw
  `ALTER`/SQL under `prisma/migrations-raw/` + `prisma migrate resolve`.
- Server-side aggregation only (`groupBy`/SQL) — never `findMany` + JS reduce at
  `AccIssue` scale.
- Project names in drill rows resolved via `buildProjectNameMap`/`resolveProjectName`
  ("Unknown project" fallback — the established pattern), never a raw project GUID.
- No new npm dependencies, no new WebGL, `/users/spatial-graph` untouched.

</defaults>

<decisions>
## Implementation Decisions

### Chart form & drill behavior
- **Horizontal bars**, top-N ranked + "Other" row (ProvisionedModulesChart pattern) —
  not a donut; long type names read better as bars.
- **Click a type → per-project drill**: ranked list of projects containing issues of
  that type, matching `IssueStatusChart`'s per-status project drill convention.
- **Top-10 + expandable "Other"**: `Other (N types)` expands in place via the same
  `summarize*(rows, topN=rows.length)` re-invocation pattern locked in 20.1-07
  (PermissionLevelChart/FolderActivityByCompanyChart), with a collapse-back link.
- **Full-width third panel** stacked below `IssueStatusChart` — do not touch 21-04's
  shipped 2-panel layout other than appending the sibling.

### Subtype surfacing
- **Backfill-only this phase.** All 515 subtype GUIDs land in the lookup table
  (ISSUE-04 covers both kinds), but the chart and drill stay **type-level** — no subtype
  UI in Phase 22. A future subtype cut becomes cheap because the names are already
  resolved.

### Backfill lifecycle
- **Idempotent, re-runnable script** (upsert by GUID), run **manually** — no cron, no
  Task Scheduler change this phase. When "Unknown type" volume grows over time, the
  answer is "re-run the script."
- **Accessible projects only; 403 gaps labeled honestly.** Crawl what the account can
  reach, dedupe GUIDs across projects; GUIDs that only exist in locked projects stay
  unresolved and render "Unknown type" with the coverage caption stating the live split.
- **Script UX matches `acc-issues-backfill.cjs`**: per-project console progress,
  403/error counters, final summary; safe to Ctrl+C and re-run. **No run-audit table** —
  the lookup table's `updatedAt` is the freshness record.

### Lookup table shape
- **One table, kind column**: GUID PK, `name`, `kind` (`"type"` | `"subtype"`), parent
  type GUID for subtypes (nullable). One migration, one upsert path, one resolver.
- **Global GUID→name dedupe** — GUID is the PK, no per-project rows; last-crawled name
  wins. The chart aggregates account-wide, so per-project provenance is unused.

### Coverage honesty display
- **"Unknown type" ranks by count like any real type** — competes for a top-N slot; if
  unknowns are the #2 volume the chart says so (20.1-03 UNKNOWN_COMPANY precedent:
  ranked, not pinned, lossless inside Other when small).
- **Null `issueTypeId` is its own explicit bucket** — never dropped; population totals
  must reconcile with the status donut above.
- **Caption combines both truths**: "N of M type GUIDs resolved to names" (live-computed
  from the lookup table vs distinct `issueTypeId`s) + the existing issue-fetch coverage
  line (`deriveIssueCoverageCaption`) the sibling panels already show. Zero hardcoded
  figures — never bake in "316".
- **Empty/not-run state**: if zero GUIDs resolve (fresh environment, backfill never
  run), replace the all-Unknown wall with an explicit notice — "Type names not yet
  backfilled — run scripts/<script-name>.cjs" — instead of rendering 100% Unknown bars.

### Issue population
- **Match the Phase 21 funnel exactly**: the same full 17,360-row `AccIssue` set
  (no `isCoordination` filter, no `deleted` filter) so all three sibling panels answer
  over the same population and counts reconcile across the tab.

### Data-layer integration
- **Extend `loadIssueFunnel()`** (`lib/server/issueFunnelView.ts`) with a third cut
  (type `groupBy` + lookup-name join) inside its existing `Promise.all` — same 5-min TTL
  cache, same single lazy Projects-tab fetch, zero new action or fetch branch in
  `AccessAnalysisCharts.tsx`. Matches the STATE.md fan-out-consolidation guardrail.

### Owner checkpoint scope
- **One checkpoint at the end of the phase**: ISSUE-04's backfill verifies via script
  output + DB counts (no owner eyes needed); one `:3100` production-preflight owner
  checkpoint after ISSUE-05 wiring, same shape as 21-04/21.1-04. `:3000` untouched
  until the owner asks for a deploy.

### Claude's Discretion
- Exact table/model name, column names, index choices (verified against schema
  conventions at planning time).
- Chart accent color (distinct from the amber timeline + status donut palette), exact
  copy for titles/subtitles/captions (subtitle should state the question the panel
  answers, per the 20.1-07 owner preference), spacing, skeleton behavior.
- Whether the transform lives in a new `issueTypeCounts.ts` or extends
  `issueFunnelCounts.ts` — follow the 21-02 fixed-bucket/honest-overflow file pattern.
- Script name and flag details, provided conventions above hold.

</decisions>

<specifics>
## Specific Ideas

- The three issue panels (timeline, status, type) should read as one coherent stack on
  the Projects tab — same coverage-caption convention, reconciling totals.
- Owner cares that "Other" buckets never dead-end (20.1-07 verbatim feedback) and that
  panel subtitles state the underlying question, not just the mechanics.

</specifics>

<workshop>
## Workshop Impact

- Surface: `/access-analysis` → Projects tab.
- The presenter can answer "what kinds of issues do we actually have?" with real ACC
  type names (e.g. Quality, Safety, Coordination) instead of GUIDs — completing the
  issue story: coverage → volume over time → status → **type**.
- The coverage caption keeps the demo honest about the 403-locked project universe
  without derailing it.

</workshop>

<data_truth>
## Data Truthfulness

- Source: `AccIssue` (17,360 rows; 316 distinct `issueTypeId` / 515 distinct
  `issueSubtypeId`, verified live 2026-07-02) + the new lookup table populated from the
  APS issue-types endpoint over accessible projects only.
- Under-covered and labeled: GUIDs unresolvable from accessible projects render
  "Unknown type" (ranked honestly); null `issueTypeId` gets its own bucket; caption
  states live resolved/total counts; never-backfilled state gets an explicit notice.
- Never chart a hardcoded count; all coverage figures live-computed.

</data_truth>

<deferred>
## Deferred Ideas

- Subtype-level UI (drill or stacked cut) — data will be ready in the lookup table;
  future phase/seed.
- Automated type-metadata refresh (cron piggyback on issue ingestion) — manual re-run
  suffices for now.

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` before any rebuild; `npm test` stays green (2477-passed baseline +
  new lookup/transform/chart tests).
- ISSUE-04 plan verified independently before the ISSUE-05 plan starts: migration
  applied (or raw-SQL + `migrate resolve` fallback documented), backfill run with
  console summary + live DB row counts as evidence, resolved-name spot-check.
- ISSUE-05 verified on a live page load (Projects tab), not just tsc: names render, no
  GUID anywhere, Unknown/null buckets present, Other expands in place, totals reconcile
  with the status donut.
- Owner checkpoint on a `:3100` production-build preflight (isolated dist, `:3000`
  untouched); zinc theme, no new WebGL, `/users/spatial-graph` untouched;
  explicit-path commits with `git diff --cached --name-only` proof.

</verification>

---

*Phase: 22-issue-type-resolution*
*Context gathered: 2026-07-10*
