# Roadmap: LECG Dashboard

## Milestones

- ✅ **v1.0 — ACC Users Graph + Access Analysis Dashboard** — 6 phases (shipped 2026-05-08, tag `v1.0`)
- ✅ **v2.0 — Workshop-Grade UI/UX Overhaul** — Phases 1–7 (shipped 2026-06-19, tag `v2.0`)
- 📋 **v3.0 — Access Analysis: Hub Story & Scenario Explorer** — Phases 8–14 (in progress, started 2026-06-22)

## Phases

<details>
<summary>✅ v2.0 Workshop-Grade UI/UX Overhaul (Phases 1–7) — SHIPPED 2026-06-19</summary>

Premium UI/UX overhaul of `/users`, `/access-analysis`, `/template-mty`, `/forma-proposal` — fast, visually premium (2.5D depth), tactile, explorable live. Foundation-first; projector UAT as the acceptance gate. Full detail: [`milestones/v2.0-ROADMAP.md`](milestones/v2.0-ROADMAP.md).

- [x] Phase 1: Shared Design Foundation (6/6 plans) — completed 2026-06-17
- [x] Phase 2: /users Decomposition (6/6 plans) — completed 2026-06-18
- [x] Phase 3: DataTable Primitive (2/2 plans) — completed 2026-06-18
- [x] Phase 4: /users Table & Polish (4/4 plans + 3 gap-closure) — completed 2026-06-18
- [x] Phase 5: /access-analysis Depth & Cross-Filtering (5/5 plans) — completed 2026-06-19
- [x] Phase 6: /template-mty & /forma-proposal Polish (5/5 plans) — completed 2026-06-19
- [x] Phase 7: Pre-Workshop UAT (2/2 plans) — completed 2026-06-19

</details>

<details>
<summary>✅ v1.0 ACC Users Graph + Access Analysis Dashboard (6 phases) — SHIPPED 2026-05-08</summary>

Production ACC user-access platform — GPU graph (25,559-node hub), filter pipeline with hide-on-filter, single-page Access Analysis dashboard. Archived before the v2.0 GSD re-init; full record lives in the `v1.0` git tag history.

</details>

### 📋 v3.0 Access Analysis: Hub Story & Scenario Explorer (Phases 8–14)

Turn `/access-analysis` from a flat panel scroll into a navigable, sectioned hub story with a flexible scenario explorer. Additive (every existing panel preserved), descriptive (no synthetic risk scores), coverage-honest (428/1,152 labeled). Data currency gate first; scenario explorer is the centerpiece.

**Execution order:** {8 ‖ 9} → 10 → 11 → {12 ‖ 13} → 14
**Parallelization:** Phase 8 and Phase 9 are parallel-safe (no shared files). Phases 12 and 13 are parallel-safe after Phase 11. Phase 8 is a hard data gate for Phases 12–14.

- [x] **Phase 8: Activity Re-Extraction (free ACCDS crawler)** - Bring activity current via the free, no-quota ACC web-session crawler for all admin-accessible projects (hard data gate) ✓ 2026-06-23 (231→956 projects, 4.55M rows)
- [ ] **Phase 9: Structural Prerequisites** - Migrate moduleOverrides to lib/acc, add coverage atom and distinct-user helper
- [ ] **Phase 10: Sectioned Hub Narrative** - Sticky section nav, SectionBlock wrappers, hub-wide coverage header
- [ ] **Phase 11: Scenario Explorer Core** - Measure × dimension pivot engine, auto chart-type, 7 named presets, DrillSheet
- [ ] **Phase 12: Activity Depth & Hygiene Facts** - Calendar heatmap, behavior-mix, hottest files, attribution honesty, hygiene table
- [ ] **Phase 13: Folder Reach & Exposure** - Internal/external access breakdown, who-reaches-what, dormant facts, storage treemap
- [ ] **Phase 14: Interconnections (Sankey)** - Company → Role → Module Sankey with drill-to-people

## Phase Details

### Phase 8: Activity Re-Extraction (free ACCDS web-session crawler)
**Goal**: All admin-accessible projects have current activity data (through today) before any data-dependent view is built — via the FREE, no-DC-quota ACCDS web-session crawler (`scripts/accds-activity-ingest.cjs`, session bootstrapped by `scripts/accds-login.cjs`). This is NOT the Data Connector API path; there is no ~25/day quota, no 403-bisect, and no APS refresh-token rotation. Auth is the logged-in ACC web session (`scratch/acc-session.json`, password-equivalent, gitignored).
**Depends on**: Nothing (runs in parallel with Phase 9)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. `scripts/accds-activity-ingest.cjs` has crawled every admin-accessible project (the distinct `AccActivity.projectId` set, ≈428) with `ACCDS_MONTHS_BACK` set wide enough to cover the needed history through today; `AccActivityAccds` holds rows for the full admin project set. (VERIFY at plan time whether ACCDS exposes full history or caps the trailing window.)
  2. The crawl completes with NO DC quota (session-cookie auth) and resumes the un-crawled remainder via `ACCDS_RESUME=1`; a `SessionExpiredError` is recovered by re-running `scripts/accds-login.cjs`.
  3. `node scripts/diag-accds-recency.cjs` confirms the latest `AccActivityAccds.createdAt` is current (≈ today) across the admin project set.
  4. `node scripts/verify-accds-merge.cjs` (and/or `diag-accds-vs-dc.cjs`) confirms the fresh ACCDS data reconciles with existing `AccActivity` coverage with no silent gaps.
**Plans**: 3 plans — ✓ ALL COMPLETE 2026-06-23
- [x] 08-01-PLAN.md — Pre-flight + membership spike: bootstrap session, enumerate full membership, test accds/v0 on a member-only project; decides crawl source (full-membership vs admin-428) → **PASS: full-membership** (member-only accds/v0 returns activity, no permission change)
- [x] 08-02-PLAN.md — Full ACCDS activity crawl + resume/expiry recovery + per-project gap repair; coverage+presence gate and DC reconciliation (report-not-block) → 1,153 crawled, 956 with activity, 4.55M rows, merge PASS
- [x] 08-03-PLAN.md — 2-legged APS folder crawl (FOLD-04 enabler): populate AccFolder.totalSizeBytes; OOM-safe folder coverage gate (parallel, independent) → 111,308 folders sized (~3.49TB)
**Verification gates**: `npx tsc --noEmit` = 0; stop Task Scheduler build before `npm run build`; `SELECT COUNT(DISTINCT "projectId"), MAX("createdAt") FROM "AccActivityAccds"` shows the full admin project set current through today
**Result (2026-06-23)**: `AccActivityAccds` = 4,554,785 rows / 956 distinct projects / latest 2026-06-23 / earliest 2025-06-17. **Coverage source EXPANDED 234 admin → 1,153 full membership (956 with activity)** with zero permission change and no DC quota — the spike proved `accds/v0` is member-accessible, mooting the deferred Account-Admin grant for *reading* activity. **HISTORY FLOOR: `accds/v0` returns only a trailing ~12 months** regardless of the requested window — Phases 12–14 date views must be labeled accordingly. DC reconciliation PASS (DC backfill preserves pre-floor rows; unified 4,597,370). Independent verifier 4/4. FOLD-04 (treemap) + ACTD-03 (hottest files) gates both satisfied.
**Note**: A DC `AccActivity` refresh (the quota-bound CSV path) remains OPTIONAL and is only needed if the legacy DC-sourced panels must also be made current — decided at plan time, not assumed here.

---

### Phase 9: Structural Prerequisites
**Goal**: Shared helpers and a clean module boundary are in place so every downstream phase can import the activity taxonomy and use people-count and coverage primitives without boundary violations
**Depends on**: Nothing (runs in parallel with Phase 8)
**Requirements**: PREP-01, PREP-02, PREP-03
**Success Criteria** (what must be TRUE):
  1. `lib/acc/moduleOverrides.ts` exists at the new path; all import sites updated; `npm run repo-map:check` shows dependency-cruiser boundary warnings reduced from 6 to 2
  2. A `CoverageHonesty` UI component renders "Based on N of M projects" inline in any panel that receives it as a prop
  3. A `countDistinctUsers()` helper in `lib/acc/` returns a deduplicated user count from instance rows; unit tests confirm it never double-counts
**Plans**: TBD
**Verification gates**: `npx tsc --noEmit` = 0; `npm run repo-map:check` passes; no remaining import of the old `app/(dashboard)/access-analysis/moduleOverrides.ts` path (verify with `rg "access-analysis/moduleOverrides"`)

---

### Phase 10: Sectioned Hub Narrative
**Goal**: A visitor to `/access-analysis` can orient immediately — knowing which hub they are viewing, how much of it is covered, and how to jump to any analytical section — without any existing panel being removed or altered
**Depends on**: Phase 9 (coverage atom must exist before sections use it)
**Requirements**: HUB-01, HUB-02, HUB-03, HUB-04
**Success Criteria** (what must be TRUE):
  1. Clicking a section nav item (Overview, People & Roles, Activity, Folders, Coordination, Interconnections) scrolls the page to that section and highlights the active nav item
  2. All 14 existing panels are visible in their respective sections with no behavioral change; only layout wrapping is added
  3. The page header states "Across 428 admin-accessible projects (of 1,152 total)" as plaintext fact on load
  4. Each activity-derived section (Activity, Folders, Interconnections) displays an inline coverage badge sourced from `CoverageHonesty`
**Plans**: TBD
**Verification gates**: `npx tsc --noEmit` = 0; `rg -i "risk|danger|critical|exposed|suspicious"` = zero hits in new code; visual check: sticky nav stays visible during scroll; `position: sticky` inside the scroll container (not `body`)
**UI hint**: yes

---

### Phase 11: Scenario Explorer Core
**Goal**: A presenter can pivot the hub's ACC data across any measure-and-dimension pairing in seconds, see the right chart automatically, drill into people behind any segment, and jump to the seven most useful named scenarios with one click
**Depends on**: Phase 9 (moduleOverrides migration required for pivot engine import), Phase 10 (section slot must exist)
**Requirements**: SCEN-01, SCEN-02, SCEN-03, SCEN-04, SCEN-05, SCEN-06
**Success Criteria** (what must be TRUE):
  1. Selecting a measure (activity count, member count, role count, issue count) and a grouping dimension renders a chart within the Scenario Explorer section without a page reload
  2. The explorer auto-selects bar, donut, heatmap, or Sankey based on the pairing — no chart-type dropdown is visible to the user
  3. Clicking any chart segment opens the shared DrillSheet showing the underlying people list
  4. Clicking a named preset (Activity×Folder, Activity×Role, Activity×Module, Role×Users, and three others) pre-fills the pickers and renders the result immediately
  5. Every activity-derived result shows "Based on 428 of 1,152 projects" inline; pivots with > 2,000 cartesian cells show a warning and a top-N result instead of failing
  6. Adding an optional second grouping dimension (when both dimensions have ≤ 30 categories) renders a cross-tab heatmap
**Plans**: TBD
**Verification gates**: `npx tsc --noEmit` = 0; adversarial unit test: pivot with > 2,000 groups asserts result length ≤ cap + "Other" bucket present; Sankey node count ≤ 50; `rg -i "risk|danger|exposed|high.risk"` = zero in new files; all pivot queries use server action, not a new tRPC procedure; `EChart.tsx` wrapper used for every chart (no raw `echarts.init()`)
**UI hint**: yes

---

### Phase 12: Activity Depth & Hygiene Facts
**Goal**: A presenter can see when and how the hub's activity happened — across time, by behavior type, and by hottest objects — and can surface factual role-hygiene findings, all with honest attribution labeling
**Depends on**: Phase 8 (current data required for meaningful heatmap and behavior-mix), Phase 10 (Activity section slot)
**Requirements**: ACTD-01, ACTD-02, ACTD-03, ACTD-04, HYG-01
**Success Criteria** (what must be TRUE):
  1. A calendar heatmap shows activity intensity by day for the full available date range; days with zero activity are visually distinct from missing data
  2. A stacked time-series shows the behavior mix (view / upload / edit / delete) over time; a footnote reads "Model Coordination attribution may include Build activity"
  3. The most-acted-on files/models panel is rendered when `AccActivityAccds` row count > 0 post-extraction; when count = 0 the panel shows a labeled "No ACCDS data available after re-extraction" state (not hidden)
  4. Every activity panel shows resolved vs unresolved attribution share as a factual count strip
  5. A sortable DataTable shows role-hygiene findings (empty roles, duplicate pairs, outlier module combinations) with no severity column, no color coding for "bad", and no risk verdict
**Plans**: TBD
**Verification gates**: `npx tsc --noEmit` = 0; `SELECT COUNT(*) FROM "AccActivityAccds"` run after Phase 8 to gate ACTD-03; calendar `visualMap` + `calendar` colors wired manually (not via `mergeEChartsTheme`); `rg -i "high.risk|severity|exposed|suspicious"` = zero in new files; `EChart.tsx` wrapper used for all new charts
**UI hint**: yes

---

### Phase 13: Folder Reach & Exposure
**Goal**: A presenter can show factually — without any risk verdict — which external companies can reach internal folders, which permissions are dormant, and how storage is distributed across the folder tree
**Depends on**: Phase 9 (countDistinctUsers helper), Phase 10 (Folders section slot)
**Requirements**: FOLD-01, FOLD-02, FOLD-03, FOLD-04
**Success Criteria** (what must be TRUE):
  1. A panel shows internal vs external access composition as a factual count/percentage breakdown — labels read "External access" not "Exposed"
  2. A grouped view shows which external companies hold permissions on which folder tiers (L1/L2); every people-count in this view uses `countDistinctUsers()` to avoid double-counting instance rows
  3. A dormant-access panel shows folder permissions held by users with last sign-in > 90 days, labeled "Dormant access (> 90 days)" — not "Risk" or "Inactive Threat"
  4. A folder storage treemap renders when `AccFolder.totalSizeBytes` IS NOT NULL for at least one row after re-extraction; when no size data exists the panel shows "Folder size data not available from crawl" inline
**Plans**: TBD
**Verification gates**: `npx tsc --noEmit` = 0; all `AccFolderPermission` queries use `GROUP BY` + `LIMIT` at the Prisma/raw query level; query response time < 5s verified manually; `SELECT COUNT(*) FILTER (WHERE "totalSizeBytes" IS NOT NULL) FROM "AccFolder"` run after Phase 8 to gate treemap; `rg -i "risk|danger|exposed|suspicious"` = zero in new files; `EChart.tsx` wrapper for treemap
**UI hint**: yes

---

### Phase 14: Interconnections (Sankey)
**Goal**: A presenter can show the full Company → Role → Module access flow as a Sankey diagram with capped cardinality, readable labels, and drill-to-people on any link — as the workshop finale panel
**Depends on**: Phase 8 (current data for meaningful link weights), Phase 10 (Interconnections section slot), Phase 9 (shared helpers)
**Requirements**: LINK-01
**Success Criteria** (what must be TRUE):
  1. A Sankey diagram renders the Company → Role → Module flow with top-10 companies, top-15 roles, all modules (≤ 10); companies and roles beyond the cap are merged into an "Other" bucket
  2. Role names in the Sankey come from `AccRole` via `mergeRoleNames()` — not from `AccDcRole` (which is permanently empty)
  3. Clicking any link between nodes opens the DrillSheet with the people behind that specific flow segment
  4. The Sankey label `fontSize` is at minimum 11px; `lineStyle.color` uses `'source'` for the ribbon gradient; `layoutIterations` is between 8 and 16
**Plans**: TBD
**Verification gates**: `npx tsc --noEmit` = 0; unit test asserts `buildSankeyLinks()` returns ≤ 50 nodes and ≤ 200 links on adversarial input; `rg "AccDcRole"` = zero references in the new Sankey view files; `EChart.tsx` wrapper used; `rg -i "risk|exposed|suspicious"` = zero in new files
**UI hint**: yes

---

## Progress

**Execution order (v3.0):** {8 ‖ 9} → 10 → 11 → {12 ‖ 13} → 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Shared Design Foundation | v2.0 | 6/6 | Complete | 2026-06-17 |
| 2. /users Decomposition | v2.0 | 6/6 | Complete | 2026-06-18 |
| 3. DataTable Primitive | v2.0 | 2/2 | Complete | 2026-06-18 |
| 4. /users Table & Polish | v2.0 | 4/4 (+3) | Complete | 2026-06-18 |
| 5. /access-analysis Depth & Cross-Filtering | v2.0 | 5/5 | Complete | 2026-06-19 |
| 6. /template-mty & /forma-proposal Polish | v2.0 | 5/5 | Complete | 2026-06-19 |
| 7. Pre-Workshop UAT | v2.0 | 2/2 | Complete | 2026-06-19 |
| 8. DC Re-Extraction | v3.0 | 0/? | Not started | - |
| 9. Structural Prerequisites | v3.0 | 0/? | Not started | - |
| 10. Sectioned Hub Narrative | v3.0 | 0/? | Not started | - |
| 11. Scenario Explorer Core | v3.0 | 0/? | Not started | - |
| 12. Activity Depth & Hygiene Facts | v3.0 | 0/? | Not started | - |
| 13. Folder Reach & Exposure | v3.0 | 0/? | Not started | - |
| 14. Interconnections (Sankey) | v3.0 | 0/? | Not started | - |
