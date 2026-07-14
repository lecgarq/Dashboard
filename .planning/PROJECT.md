# LECG Dashboard

## What This Is

Internal LECG Dashboard for ACC / Forma / MTY / LOD visibility and live workshop
demos. Next.js 16 (App Router) + React 19, tRPC + Prisma over local PostgreSQL,
ECharts on a zinc dark theme. Workshop surface is four pages: `/users`,
`/access-analysis`, `/template-mty`, `/forma-proposal`.

## Core Value

Truthful, fast-to-read analytics over the **fully extracted ACC dataset** — every
metric on the workshop pages must be derivable from the local Prisma DB and honest
about its coverage.

## Current State

**Shipped:** v2.3 New Graphs — closed 2026-07-14 (6 phases, 28 plans; Phases 20, 20.1,
21, 21.1, 22, 23). Added 8 new truthful charts to `/access-analysis` from
existing-but-unvisualized Prisma data (issue-fetch coverage, issue timeline/status/type,
permission footprint by role, dormant users by sign-in recency, ingest freshness), plus
two inserted UAT-follow-up phases (20.1's 6-tab IA redesign + panel-semantic pivots, 21.1's
provisioned-modules chart + service-first activity attribution fix). All 8 v2.3
requirements complete (ISSUE-01–05, PERM-01, ENG-01, PIPE-01); Phase 23 closed the
milestone with a full graph-by-graph owner sign-off — the live 23-panel `/access-analysis`
surface (across all 6 tabs) plus `/users` received a blanket verbatim owner **"approved"**
on a freshly rebuilt `:3000` (zero findings raised); the full automated gate sweep
(tsc/test/TEST-01-03/WebGL-scope-fence/spatial-graph-scope-fence/repo-map check) is proven
green with re-runnable evidence in `23-VERIFICATION.md`. Milestone archived to
`.planning/milestones/v2.3-ROADMAP.md`/`v2.3-REQUIREMENTS.md`, logged in
`.planning/MILESTONES.md`.

**Prior:** v2.2 Structural Refactors — functionally complete 2026-07-02 (5 phases,
9 plans; Phases 15–19). Executed the deferred structural refactors safely behind v2.1's
characterization tests, with **zero change to what the workshop pages show**: REF-02
(shared `lib/server/folderPermQuery.ts` extraction, consumed by `/template-mty` +
`/access-analysis`), REF-01 (split all three access-analysis monoliths —
`folderTerrain.ts`, `FolderPermissionTerrain.tsx`, `HybridAnalyticsSurface.tsx` — into
data-hook / transform / thin-view modules, each ≤ ~400 lines), and REF-03 (materialised
`AccFolderPermissionSummary` projection + consumer switch off the live raw scan + hard-guard
of the ~6M-row `includePermissionContexts` path + ingest-cron refresh). All 8 v2.2
requirements complete; every phase goal-verified (Phase 19: gsd-verifier 10/10); owner
visual parity on `/access-analysis` + `/template-mty` approved after a fresh `:3000` rebuild.
Tagged `v2.2` (local, consistent with `v1.0`/`v2.0`/`v2.1`).

**Close method:** tag + PROJECT/STATE evolution with requirements kept in place. Completed
phase directories and duplicate milestone archives are intentionally omitted from the working
tree; tags and git history are the authoritative detailed record. Deploy = rebuild on `:3000`
(not a branch merge); v2.3's final phase (23) rebuilt `:3000` and captured the owner's
graph-by-graph sign-off before closing.

**Current focus:** v2.4 Spatial Graph Dimensions — opened 2026-07-14. See "Current
Milestone" below. This milestone **explicitly re-scopes `/users/spatial-graph`**, which has
been Out of Scope since v2.1, at the owner's direct request.

## Current Milestone: v2.4 Spatial Graph Dimensions

**Goal:** Make every access-analysis dimension selectable on the spatial graph, and make
selecting one actually restructure the graph — by unlocking dimension machinery that is
already built, computed on every page load, and currently discarded.

**Owner's ask (verbatim, 2026-07-14):** *"Improve the spatial graph, add all the access
analysis themes that we did — I want to see those dimensions in the spatial graph."*

**Why this is an unlock, not a build** (verified 2026-07-14 from source):

- `featureSnapshot.ts:127-235` already enriches all ~16,942 user×project nodes with ~14
  dimensions (company, permission strength, folder breadth, accessible bytes, activity
  recency, activity volume, sign-in recency, membership tenure, risk score,
  internal/external, admin/member, dominant activity mix, permission tier, module
  signature) — **none are selectable.**
- `groupByDimensions.ts:10` and `nodeColors.ts:62` are both hardcoded to
  `["role","project","user"]`. Two arrays of three strings are the whole aperture.
- `dimensionCatalog.ts` builds a **208-dimension catalog** (9 structural + 176 generated
  ACC action verbs + 4 folder-reach + 19 greyed) and `CatalogSliderSidebar.tsx` renders it —
  but only behind `NEXT_PUBLIC_ACC_3D_GRAPH=1`, which is set nowhere. The flag wrongly
  couples the slider wall to the (also-parked) 3D graph.
- `AccessAnalysisShell.tsx:575-579` computes `buildCatalogTargets` + `buildCatalogWeights`
  (the force anchors that let a dimension physically restructure the graph) on every load,
  then the live path **returns early at `:611-632`** and builds a static layer from
  precomputed `AccInstanceEmbedding` coordinates instead. It is dead compute.

**Target features:**

- Widen Group-by / Color-by / filter from 3 options to the full node-dimension set
- Render the catalog slider wall, decoupled from the dead 3D flag
- Revive the force-anchor engine so a dimension restructures the graph organically
- Close the deferred spatial-graph perf debt (CONCERNS.md §3.1–3.4)

**Explicitly deferred to v2.5** (Tier 3, needs new data plumbing): issue status / type /
coordination on the graph (requires an `AccIssue.createdBy` → `AccDcUser` id bridge with an
unmeasured resolution rate), and a temporal scrubber for activity/issues over time.

## Shipped Milestone: v2.3 New Graphs — ✅ SHIPPED 2026-07-14

**Goal:** Add new truthful charts to `/access-analysis` and `/template-mty` from
existing-but-unvisualized Prisma data, following the established panel registration
pattern — no new data sources, no new WebGL, honest coverage labels throughout.

**Target features delivered** (REQ-level detail in `REQUIREMENTS.md`, archived to
`.planning/milestones/v2.3-REQUIREMENTS.md`):

- AccIssue funnel — issues over time / by status / by type (full issue set, not
  just the coordination-classified subset)
- Permission footprint by role — `AccFolderPermissionSummary` (materialized in
  Ph18, never charted): folder-count / bytes reach per role
- Ingest freshness / throughput panel — `AccDcIngestRun` (measure rows from
  `AccActivity` directly; `rowsByModule` telemetry is a known zero)
- Issue-fetch coverage donut — `AccIssueFetchRun` honest-coverage labeling
- Dormant users by `lastSignIn` recency — `AccProjectMember.lastSignIn`

**Deferred from the original 9-candidate seed pool** (still open, see "Future
Requirements" carried into the v2.4 Seed Pool below): activity verb/object-type breakdown,
folder storage treemap, permission tier × folder-depth heatmap, provisioned-vs-active
module coverage.

## Shipped Milestone: v2.2 Structural Refactors — ✅ SHIPPED 2026-07-02

**Goal:** Restructure the access-analysis hot paths behind v2.1's golden-master tests —
split the three monoliths, centralise the shared `AccFolderPermission` query, and retire
the raw ~5M-row permission scan with a materialised summary — with **zero change to what
the workshop pages show**.

**Target features** (REQ-level detail in `REQUIREMENTS.md`):

- **REF-02** — extract `lib/server/folderPermQuery.ts` owning the base
  `AccFolderPermission` join; `/template-mty` (`templateFolderTerrain.ts`) and
  `/access-analysis` (`folderPermissionTerrainView.ts`) import it. Pinned by TEST-03
  (`templateFolderTerrain.sharedQuery.test.ts`).
- **REF-01** — split `folderTerrain.ts` (1,096), `FolderPermissionTerrain.tsx` (1,044),
  and `HybridAnalyticsSurface.tsx` (1,328) into data-hook / transform / thin-view. The
  `HybridAnalyticsSurface` pin is thin (fallback-only) — widen its characterization net
  before splitting. Pinned by TEST-02 (`folderPermissionTerrainView.test.ts`).
- **REF-03** — materialise `AccFolderPermissionSummary` (Prisma model + migration +
  backfill + refresh) and retire the `includePermissionContexts` raw-scan branch in
  `lib/server/acc-hot-cache.ts`; reconcile the projection against the live aggregate
  first. Guarded by TEST-01 (OOM regression).

**Guardrail:** behavior-preserving. Every split/extraction keeps its characterization
test byte-identical; REF-03 proves projection-vs-live parity before the raw path is
retired. No workshop-visible change; `/users/spatial-graph` stays untouched.

## Requirements

### Validated

<!-- Shipped and confirmed. -->

- ✓ **All ACC data extracted and verified** — 2026-06-23 against the live local DB
  (full census + evidence in `.planning/STATE.md`).
- ✓ **Database & config hardening** (DB-01–DB-04) — v2.1
- ✓ **Layering & boundary fixes** (BND-01–BND-04) — v2.1
- ✓ **Data-truthfulness labels** (TRUTH-01–TRUTH-04) — v2.1
- ✓ **Integration health & observability** (OBS-01–OBS-03) — v2.1
- ✓ **Type-safety & lean-payload guards** (TYPE-01, TYPE-02) — v2.1
- ✓ **Test coverage & characterization** (TEST-01, TEST-02, TEST-03) — v2.1
- ✓ **Shared query extraction** (REF-02 / QUERY-01) — v2.2 (`lib/server/folderPermQuery.ts` owns the base `AccFolderPermission` join; TEST-03 byte-identical)
- ✓ **Access-analysis monolith splits** (REF-01 / SPLIT-01–04) — v2.2 (all 3 monoliths → data-hook / transform / thin-view, each ≤ ~400 lines; TEST-02 byte-identical)
- ✓ **AccFolderPermissionSummary projection + raw-scan retirement + refresh** (REF-03 / PROJ-01–03) — v2.2 (projection reconciled 0-mismatch; summary consumer switched; raw scan hard-guarded; ingest-cron refresh, ≤1-cycle staleness)
- ✓ **New graphs for /access-analysis** (ISSUE-01–05, PERM-01, ENG-01, PIPE-01) — v2.3
  (8/8 requirements; 23-panel surface owner-approved on `:3000` 2026-07-14)

### Active

<!-- v2.2 (REF-01/REF-02/REF-03) shipped → moved to Validated. v2.3 New Graphs shipped → moved to Validated (2026-07-14). The spatial-graph seed is now the ACTIVE v2.4 milestone (2026-07-14). SVC-01, DC-01/02 remain deferred candidates. -->

- [ ] **v2.4 Spatial Graph Dimensions** (ACTIVE — see "Current Milestone" above) — expose the
  ~14 already-computed node dimensions in Group-by/Color-by/filter, render the 208-dim
  catalog slider wall (decoupled from the dead `NEXT_PUBLIC_ACC_3D_GRAPH` flag), revive the
  discarded force-anchor layout engine, and close the deferred `/users/spatial-graph`
  perf concerns (CONCERNS.md §3.1–3.4: DuckDB warm-up on the critical path, cosmos.gl
  reheat fragility, 176-action catalog eager load, lasso e2e flake).
- [ ] **SVC-01** — `service`-override classification refinement (reconcile Build vs
  Model Coordination for ~966 clash-issue rows); needs design approval.
- [ ] **DC-01 / DC-02** (external/data-blocked) — unlock the 724 DC-403 projects via
  APS Account Admin provisioning; wire per-project roles/modules once the DC CSV
  `activity_in_module` / `total_activity` join lands.
- [ ] **Per-folder terrain projection** (seed from v2.2 Phase 19) — the
  `AccFolderPermissionSummary` projection is a per-`(projectId,roleId)` rollup, so the
  terrain views (which need per-folder tier) correctly stayed on `folderPermQuery.ts`'s
  raw `$queryRaw`. A separate per-folder materialised projection could retire that scan
  too — a distinct model + backfill, only if terrain read cost becomes a concern.

### Out of Scope

- ~~`/users/spatial-graph` rework~~ — **RE-SCOPED IN 2026-07-14 by explicit owner request.**
  This boundary held from v2.1 through v2.3 exactly as written ("out of scope unless
  explicitly re-scoped"); v2.4 is that re-scope. The surface is now IN scope. Note that
  `/users/spatial-graph` and `/users/access-analysis` render the **same UI**
  (`spatial-graph/page.tsx:6,17` → `AccessAnalysisShellClient`).
- **Issue dimensions on the graph** (issue status / type / coordination) — deferred to v2.5.
  `AccIssue.createdBy` is an ACC user GUID with no bridge to `AccDcUser` and an unmeasured
  resolution rate; wiring it blind would produce a mostly-empty dimension.
- **Temporal scrubber on the graph** (activity/issues by month) — deferred to v2.5. Time is
  not a node attribute; it needs a new interaction concept, not a dimension slot.
- New WebGL on **data** surfaces — confined to approved `/users` header and
  `/forma-proposal` background accents. **Unchanged by v2.4:** the spatial graph is not a
  data surface and already runs cosmos.gl/WebGL; reviving its force engine adds no new
  WebGL to `/access-analysis`, `/template-mty`, or `/forma-proposal`.
- New analytics not derivable from the Prisma DB — under-covered sources are
  labeled, not hidden. **v2.4 adds no new data source** — every dimension it exposes is
  already computed today.

## Context

- **v2.1 shipped 2026-07-01**, tagged `v2.1` (local-only, consistent with `v1.0`/`v2.0`).
  Prior history (v2.0 milestone + Phases 01–08, incl. the Phase 8 activity
  re-extraction) is preserved in tags and git history.
- **Planning retention is deliberate.** The working tree keeps current PROJECT, STATE,
  REQUIREMENTS, ROADMAP, research/codebase context, and active-milestone phase artifacts.
  Completed milestone phase directories and duplicate archives are read from tags or git
  history when needed.
- Data extraction used a free ACCDS member-accessible web-session crawl (no Data
  Connector quota) plus a folder crawl; census in `.planning/STATE.md`.
- **v2.2 shipped 2026-07-02**, tagged `v2.2` (local). The 2 pre-existing
  `FolderPermissionTerrain.test.tsx` failures were root-caused and fixed during v2.2
  Phase 16 (folder-label over-pruning + a `<polygon>`→`<path>` polygon-count miscount,
  both tracing to `d2d990bf`); `npm test` is now green (2256 passed / 1 skipped, 302 files).
  The branch `feat/access-analysis-redesign` still carries other pre-existing unrelated WIP
  (uncommitted `app/...` / repo-map changes) and the `.planning/` migration deletions — left
  untouched throughout v2.2; all v2.2 commits were made by explicit path.
- **v2.3 shipped 2026-07-14** (New Graphs, 6 phases/28 plans, 8/8 requirements). Closed via
  the same tag-consistent retention model: `.planning/milestones/v2.3-ROADMAP.md` +
  `v2.3-REQUIREMENTS.md` archived, `.planning/MILESTONES.md` gained a v2.3 entry (v2.0/v1.0
  history preserved), STATE/ROADMAP/PROJECT evolved in place. Two urgent phases were inserted
  mid-milestone (20.1 IA redesign, 21.1 Overview-tab UAT follow-ups) — the 20.1/21.1 pattern
  is why v2.3 grew from a planned 4 phases to 6; Phase 23 explicitly avoided repeating it (no
  Phase 23.1). Milestone closed on a full deliberate `:3000` rebuild + graph-by-graph owner
  sign-off pass — the first milestone in this branch's history to get one, rather than
  per-phase spot checks.

## Constraints

- **Tech stack**: Node >=22, Next.js 16 App Router, React 19, tRPC, Prisma, local
  PostgreSQL — analytics source of truth is the Prisma DB.
- **UI**: zinc dark theme (`#09090B`, no blue cast), semantic CSS-variable theming,
  ECharts must resolve theme colors; motion budget <=200ms.
- **Gates**: `npx tsc --noEmit` before any `next build`/rebuild; deploy = rebuild +
  Task Scheduler restart on `:3000` (not a git branch merge).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Reset `.planning/` to a data-extraction-confirmed baseline | Owner wanted a clean history showing only "data extracted + verified" | ✓ Good — baseline held through all of v2.1 |
| Keep upgraded `config.json` (runtime/claude, agent_skills, build/test commands) | Recent intentional GSD config upgrade | ✓ Good |
| v2.1 milestone = close CONCERNS.md (not a feature release) | All 22 mapped concerns deserve a disposition; debt-closure protects the live workshop | ✓ Good — 20/20 requirements shipped + verified |
| Exclude `/users/spatial-graph` concerns (§3, §8.2/8.3) from v2.1 | Honors the standing out-of-scope boundary; lowest risk to the interactive graph | ✓ Good — boundary held; no spatial-graph churn in the diff |
| Defer monolith splits (§2.3) + `folderPermQuery` extraction (§6.1); ship characterization tests first | Low-risk delivery on a live demo dashboard; splits are safe only behind tests | ✓ Good — REF-01/REF-02 now safe behind TEST-02/TEST-03 |
| Skip domain research for v2.1 | Debt-closure against already-specified guardrails — no new ecosystem to research | ✓ Good — no rework needed |
| Close v2.1 via tag + evolve; keep requirements in place and detailed artifacts in git history | Avoid duplicate planning archives in the working tree while retaining recoverable evidence | ✓ Good — retention policy finalized during repository cleanup |
| v2.2 = full structural-refactor scope (REF-01 all 3 monoliths + REF-02 + REF-03 DB projection) | The characterization tests shipped in v2.1 exist precisely to make these safe; owner chose the widest slice incl. the summary projection | ✓ Good — all 8 requirements shipped behavior-preserving; every phase goal-verified; workshop pages unchanged |
| v2.2 keeps `REQUIREMENTS.md` in place (v2.1 + v2.2 record preserved in Validated + git history) | Keeps current requirements readable without duplicating completed phase directories | ✓ Good — same retention model repeated for v2.2 |
| REF-03 terrain scoped OUT of the projection switch (Phase 19) | `AccFolderPermissionSummary` is a per-`(projectId,roleId)` rollup; terrain needs per-folder tier, which the rollup lacks — forcing it would lose granularity + break TEST-02. Only the summary aggregate matches the projection shape | ✓ Good — terrain stayed on `folderPermQuery.ts`, TEST-02 byte-identical; per-folder projection seeded for later |
| Hard-guard (not delete) the `includePermissionContexts` raw scan | Preserves the WS2 edge-feed / per-folder-ACL capability behind an explicit `ACC_ALLOW_RAW_PERMISSION_SCAN=1` env escape hatch; throws by default so the ~6M-row OOM window can't silently re-open | ✓ Good — no prod caller enables it; TEST-01 strengthened |
| Refresh via reusing the backfill script verbatim in the ingest cron | `execSync('node scripts/backfill-folder-perm-summary.cjs')` (non-fatal, server-side) makes the cron and standalone backfill the SAME code path — zero SQL duplication, no drift; bounded ≤1 ingest cycle | ✓ Good — reconciliation PASS post-refresh; staleness documented in INTEGRATIONS.md |
| Rebuild `:3000` (owner-consented) to verify v2.2 parity, unlike v2.1 | The final phase was a server-side data-source swap → a rebuild is required to see it; owner explicitly approved stopping `:3000` (build 500s a live app per deploy-sequence) | ✓ Good — real owner visual sign-off on `/access-analysis` + `/template-mty` (unlike Phase 17's test-basis-only) |
| Milestone-close gate = graph-by-graph owner sign-off across the FULL 4-page workshop, not just the new panels | Phase 23 (mandatory curation gate, no new requirements) exists precisely to catch a wrong number in a pre-v2.3 panel before the milestone ships | ✓ Good — blanket verbatim "approved" on all 23 `/access-analysis` panels + `/users`, zero findings; `IssueTypeChart` (the one panel with zero prior UAT) covered |
| Keep v2.3 tight — no Phase 23.1 despite the 20.1/21.1 inserted-phase precedent | The 20.1/21.1 pattern already stretched v2.3 from 4 to 6 phases; the owner review's zero-finding outcome meant nothing needed a follow-up insertion | ✓ Good — milestone closed cleanly, no urgent-phase insertion needed |
| **v2.4 re-scopes `/users/spatial-graph`** (standing Out-of-Scope boundary since v2.1) | Direct owner request 2026-07-14. The boundary was always written as "unless explicitly re-scoped" and seeded as a dedicated future milestone — this is that milestone, not scope creep | — Pending |
| **v2.4 = unlock + revive, NOT build** | Source audit (2026-07-14) proved ~14 node dimensions are already computed every load and discarded, the 208-dim catalog + its slider sidebar are already written, and the force-anchor engine is already computed then thrown away at `AccessAnalysisShell.tsx:611`. The milestone's value is in the aperture, not new machinery | — Pending |
| **Revive the force-anchor layout engine** (dimensions restructure the graph) rather than keeping the static embedding map | Owner chose it over the lower-risk "recolor/regroup only" option. A dimension that can't move the graph isn't really a graph dimension — and the anchors are already computed. Accepted risk: touches cosmos.gl reheat, the known-fragile area (CONCERNS.md §3.2) | — Pending |
| **Tier 3 (issue dims + temporal scrubber) explicitly deferred to v2.5** | `AccIssue.createdBy` → `AccDcUser` has no id bridge and an unmeasured resolution rate; shipping it blind risks a mostly-empty dimension that lies. Time is not a node attribute | — Pending |
| **Perf debt (CONCERNS.md §3.1–3.4) folded into v2.4, not deferred again** | Exposing 189 sliders makes the eager 176-action catalog init a real first-paint cost on a live-demo page, not a theoretical one. The debt becomes load-bearing precisely because of this milestone | — Pending |

---
*Last updated: 2026-07-14 — opened milestone **v2.4 Spatial Graph Dimensions** (see "Current Milestone" above). This milestone explicitly re-scopes `/users/spatial-graph`, Out of Scope since v2.1, at direct owner request. Prior: closed v2.3 New Graphs (8/8 requirements shipped).*
