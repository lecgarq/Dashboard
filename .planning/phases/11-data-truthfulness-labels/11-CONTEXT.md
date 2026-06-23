# Phase 11: Data-Truthfulness Labels - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

`/access-analysis` honestly labels its data coverage for the workshop. Four
deliverables, all on the existing page — no new analytics, no data ingestion, no
spatial-graph work:

- **TRUTH-01** — visible Data Connector / activity coverage label.
- **TRUTH-02** — ACCDS ~12-month date floor footnote on the activity timeline,
  sourced from a new `dataFloor` field.
- **TRUTH-03** — module-activity donut caveat (rawAction-based; Autodesk
  `service` attribution not reconciled).
- **TRUTH-04** — document the `AccDcRole`-empty → `AccRole` fallback in
  `INTEGRATIONS.md`.
- **Folded-in (owner-flagged):** repair the raw-project-GUID leak in
  `lib/server/folderActivityView.ts` ("Folder Activity by Role"). Same theme —
  show the truth legibly.

Discussion clarified HOW these surface. New capabilities belong in other phases.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` (Phase 11) and `.planning/REQUIREMENTS.md` (TRUTH-01..04)
  — fixed success criteria and the requirement→concern mapping (CONCERNS §5.2,
  §2.6, §2.5, §2.4).
- `.planning/STATE.md` — verified 2026-06-23 data census (read-only against the
  live local PostgreSQL DB) and the owner-flagged folderActivityView GUID issue
  logged under Blockers/Concerns.
- `.claude/skills/lecg-dashboard/SKILL.md` — zinc theme, source roots, no-new-WebGL
  data-surface rule, `npx tsc --noEmit` gate.
- Surface map (Explore pass, 2026-06-23) established the real components:
  - `app/(dashboard)/access-analysis/components/ActivityCoverageBadge.tsx` —
    existing muted "N / M projects" pill, `text-muted-foreground`,
    `text-[10px]`; already used by timeline/role/company/module charts.
  - `lib/server/activityTimelineView.ts` `loadActivityTimeline()` — **RSC server
    function, NOT a tRPC procedure**; already computes `MIN(createdAt)` per
    project in CTE `astart` (~line 30). Response type `ActivityTimelineRow[]`.
  - `app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx` —
    timeline EChart; subtitle/caption slot available.
  - `app/(dashboard)/access-analysis/components/ModulesPieChart.tsx` — module
    donut; already has a rich `tooltipByName` HTML tooltip system + drill-down.
    `classifyActivity(rawAction)` via `moduleOverrides.ts` →
    `lib/acc/activityClassification.ts`.
  - `lib/server/folderActivityView.ts:51,58` — name map built from `accDcProject`
    only; fallback `?? r.projectId` (raw GUID). Rendered via
    `FolderActivityReveal.tsx` / `FolderActivityByRole.tsx`.
  - `components/ui/PremiumSurface.tsx`, `components/ui/tooltip.tsx` (Radix,
    underused on this page) — repo-native hosts for new labels.
  - `.planning/codebase/INTEGRATIONS.md` — exists; ACCDS section already records
    the "~12-month history floor; downstream views must label this" precedent
    (good template for TRUTH-02/03/04 wording).

- VERIFY: exact coverage integers for the TRUTH-01 label must be drawn from a
  **live DB count at build time** (see Data Truthfulness below), not hard-coded.
- VERIFY: `AccProject.id` aligns with `AccActivityAccds.projectId` for the
  projects missing from `accDcProject` (1-line DB count) before the GUID-merge fix.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Reuse existing patterns only — `ActivityCoverageBadge` styling, `PremiumSurface`,
  `SectionHeader` subtitle, Radix `Tooltip`. No new component families.
- Zinc dark theme; muted captions via `text-muted-foreground` + `text-xs` /
  `text-[10px]`; semantic CSS variables; ECharts resolves theme colors; motion ≤200ms.
- Labels derive from live DB values (coverage array, `MIN(createdAt)`), never
  hard-coded strings.
- TRUTH-04 is a pure doc add in `INTEGRATIONS.md` — Claude's discretion on wording.
- Guardrails: no new WebGL on this data surface; `/users/spatial-graph` untouched;
  `npx tsc --noEmit` before any rebuild.

</defaults>

<decisions>
## Implementation Decisions

### TRUTH-01 — Coverage label (form: restrained header line + existing per-chart badges)
- **Form:** one restrained muted header line under the page title for the
  headline activity coverage, PLUS keep/extend the existing per-chart
  `ActivityCoverageBadge` so DC-metadata-derived panels carry their own coverage.
  No new bordered provenance card.
- **Content (owner correction — see Specific Ideas):** lead with the **free
  ACCDS-crawl activity coverage** (~956 of 1,153 projects), and label
  DC-metadata-derived metrics with their own (~550 of 1,153) coverage. Coverage
  is **metric-specific**, not one blanket number.
- The stale requirement example "Based on 428 of 1,152 projects with Data
  Connector access" is **explicitly rejected as the headline** — 428 was the old
  DC-API-extractable count (724 were 403-locked); the free extractor bypassed
  that wall. Using 428 would understate coverage and be untruthful.
- Exact integers pulled from a live DB count at build time.

### TRUTH-02 — Date floor (form: account-wide caption + per-project hover)
- Add a `dataFloor` field to the `loadActivityTimeline()` RSC response in
  `lib/server/activityTimelineView.ts` (`MIN(createdAt)` from `AccActivityAccds`;
  the CTE already computes per-project min — extend to expose it).
- Account-wide "Data available from [month]" caption under the timeline
  (month-year format, e.g. "Jun 2025" — avoid implying false daily precision).
- Per-project floor shown in the chart hover tooltip.
- Caption respects zinc theme / semantic CSS-variable colors.

### TRUTH-03 — Module-donut caveat (form: info-icon + tooltip, candid, not always-on)
- Small ⓘ info-icon next to the module-donut title; Radix tooltip on hover.
- Tooltip copy: candid — classification is `rawAction`-based and Autodesk's own
  `service` attribution is not yet reconciled. The ~40.7% disagreement figure
  lives in the tooltip and `INTEGRATIONS.md`, **not** as an always-on caption
  (clean at rest, full candor one hover away).

### TRUTH-04 — Role-fallback documentation
- Document the `AccDcRole`-empty → `AccRole` fallback and DC-conflict behavior in
  `.planning/codebase/INTEGRATIONS.md` (under/near the existing DC + ACCDS
  sections). Pure doc; reuse the existing "downstream views must label this"
  phrasing precedent.

### Folded-in scope — Folder-Activity GUID leak (form: merge names, graceful fallback)
- Fix `lib/server/folderActivityView.ts` to also merge names from live
  `AccProject` (1,153 superset), not `accDcProject` (550) alone.
- If a name still cannot be resolved, render "Unknown project" — **never** a raw
  GUID — instead of the `?? r.projectId` fallback.
- Gate on the VERIFY above (`AccProject.id` ↔ `AccActivityAccds.projectId`).

### Claude's Discretion
- Exact label/caption copy, spacing, icon choice, tooltip layout, and date
  formatting helper — as long as they follow Dashboard defaults and reuse the
  existing components above.
- Whether the header coverage line and per-chart badges share a small helper.

</decisions>

<specifics>
## Specific Ideas

- **Owner correction (2026-06-23):** "I've extracted the 1,152 projects with the
  free quota extractor." The coverage label must credit the free ACCDS crawl's
  broad coverage, not the old DC-only 428. This refines REQUIREMENTS TRUTH-01's
  example string — the planner should use the live free-crawl coverage
  (~956/1,153) as the headline and DC metadata coverage (~550) where DC-specific.
- Honesty-vs-noise principle for the whole phase: **honest at a glance, full
  candor on hover.** Labels should be credible "we're transparent" talking points
  for the live demo without making the dashboard read as uncertain.

</specifics>

<workshop>
## Workshop Impact

- Surface: `/access-analysis` (the four-page workshop set is otherwise untouched).
- The presenter can state, and point to, exactly which projects each metric
  covers and from when activity data exists — and the "Folder Activity by Role"
  view stops leaking raw GUIDs — without opening developer tools.

</workshop>

<data_truth>
## Data Truthfulness

Authoritative source = local Prisma DB. Verified census (STATE.md, 2026-06-23):

- `AccProject` (live API): **1,153** — total projects known.
- Distinct projects in `AccActivityAccds` (free ACCDS crawl): **956** — activity
  coverage.
- `AccDcProject` (Data Connector metadata): **550**.
- `428` = historical DC-API-extractable count (superseded by the free crawl).

Labeling rules for this phase:
- Activity-derived metrics → cite the ~956/1,153 free-crawl coverage.
- DC-metadata-derived metrics → cite their own (~550/1,153) coverage.
- Module donut → label rawAction classification + unreconciled `service`.
- Timeline → label the ACCDS ~12-month floor via live `dataFloor`.
- All displayed integers/dates pulled live at build (VERIFY), never hard-coded.

</data_truth>

<deferred>
## Deferred Ideas

- **SVC-01** (REQUIREMENTS Future): the `service`-override classification
  refinement (reconcile Build vs Model Coordination for ~966 clash-issue rows) —
  needs design approval; TRUTH-03 only *labels* the gap, does not fix it.
- **DC-01**: unlocking the 724 DC-403 projects via APS Account Admin — external,
  not this phase.

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` before any rebuild.
- Live DB count to confirm the TRUTH-01 coverage integers and the TRUTH-02
  `dataFloor` value before they appear in the UI.
- Confirm `AccProject.id` ↔ `AccActivityAccds.projectId` alignment before the
  GUID-merge fix.
- Inspect `/access-analysis` for: zinc theme + resolved ECharts colors, the
  header coverage line, timeline floor caption + hover, module ⓘ tooltip, and the
  "Folder Activity by Role" view showing names (or "Unknown project"), never GUIDs.
- Targeted Vitest where an existing pattern supports it (e.g. the `dataFloor`
  aggregation or the name-merge transform).
- Guardrails: no new WebGL on `/access-analysis`; `/users/spatial-graph` untouched.

</verification>

---

*Phase: 11-data-truthfulness-labels*
*Context gathered: 2026-06-23*
