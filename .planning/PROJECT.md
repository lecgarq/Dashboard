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

**Shipped:** v2.2 Structural Refactors — functionally complete 2026-07-02 (5 phases,
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

**Prior:** v2.1 Concerns Hardening — closed 2026-07-01 (6 phases, 14 plans, Phases 09–14;
all 20 requirements verified). Closed the `.planning/codebase/CONCERNS.md` debt map and
shipped the characterization tests (TEST-01/02/03) that made the v2.2 refactors safe.
Tagged `v2.1`.

**Close method:** "safe logical close" — tag + PROJECT/STATE evolution with requirements
kept in place. Full physical archival (MILESTONES.md / RETROSPECTIVE.md / `milestones/v2.x-*`)
remains intentionally deferred while `.planning/` is mid-migration (see Context): v1.0/v2.0
history lives only in git HEAD, so resurrecting the archive directory is a separate migration
task, not part of this close. Deploy = rebuild on `:3000` (not a branch merge); v2.2's final
phase WAS rebuilt on `:3000` (owner-consented) to verify parity.

**Current focus:** planning the next milestone. Deferred candidates carried in Active below:
SVC-01, the `/users/spatial-graph` concerns milestone, and the DC-01/DC-02 external-data unlocks.

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

### Active

<!-- v2.2 (REF-01/REF-02/REF-03) shipped → moved to Validated. SVC-01, spatial-graph, DC-01/02 remain deferred candidates for the next milestone. -->

- [ ] **SVC-01** — `service`-override classification refinement (reconcile Build vs
  Model Coordination for ~966 clash-issue rows); needs design approval.
- [ ] **Spatial-graph milestone** — the deferred `/users/spatial-graph` concerns
  (CONCERNS.md §3 + §8.2/8.3): DuckDB warm-up, cosmos.gl reheat, 176-action catalog
  lazy-load, lasso e2e flake, hydration-prefetch test, physics/e2e test splits.
- [ ] **DC-01 / DC-02** (external/data-blocked) — unlock the 724 DC-403 projects via
  APS Account Admin provisioning; wire per-project roles/modules once the DC CSV
  `activity_in_module` / `total_activity` join lands.
- [ ] **Per-folder terrain projection** (seed from v2.2 Phase 19) — the
  `AccFolderPermissionSummary` projection is a per-`(projectId,roleId)` rollup, so the
  terrain views (which need per-folder tier) correctly stayed on `folderPermQuery.ts`'s
  raw `$queryRaw`. A separate per-folder materialised projection could retire that scan
  too — a distinct model + backfill, only if terrain read cost becomes a concern.

### Out of Scope

- `/users/spatial-graph` rework — out of scope unless explicitly re-scoped (its
  concerns are seeded above as a dedicated future milestone, not folded into
  general work).
- New WebGL on data surfaces — confined to approved `/users` header and
  `/forma-proposal` background accents.
- New analytics not derivable from the Prisma DB — under-covered sources are
  labeled, not hidden.

## Context

- **v2.1 shipped 2026-07-01**, tagged `v2.1` (local-only, consistent with `v1.0`/`v2.0`).
  Prior history (v2.0 milestone + Phases 01–08, incl. the Phase 8 activity
  re-extraction) is preserved in git history and the `.planning.backup/` snapshot.
- **`.planning/` is mid-migration.** `MILESTONES.md`, `RETROSPECTIVE.md`, and the
  `milestones/` archive directory (holding the v1.0 + v2.0 archives) are deleted in the
  working tree (uncommitted) while that history remains in git HEAD. v2.1 was closed
  via a safe logical close to avoid dropping that history; finishing the migration and
  the full v2.1 archival is a pending bookkeeping task.
- Data extraction used a free ACCDS member-accessible web-session crawl (no Data
  Connector quota) plus a folder crawl; census in `.planning/STATE.md`.
- **v2.2 shipped 2026-07-02**, tagged `v2.2` (local). The 2 pre-existing
  `FolderPermissionTerrain.test.tsx` failures were root-caused and fixed during v2.2
  Phase 16 (folder-label over-pruning + a `<polygon>`→`<path>` polygon-count miscount,
  both tracing to `d2d990bf`); `npm test` is now green (2256 passed / 1 skipped, 302 files).
  The branch `feat/access-analysis-redesign` still carries other pre-existing unrelated WIP
  (uncommitted `app/...` / repo-map changes) and the `.planning/` migration deletions — left
  untouched throughout v2.2; all v2.2 commits were made by explicit path.

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
| Close v2.1 via "safe logical close" (tag + evolve; no archival, requirements kept in place) | `.planning/` mid-migration deleted MILESTONES.md + `milestones/` in the working tree; full archival would drop v1.0/v2.0 history that lives only in HEAD | — Pending — finish migration, then archive v2.1 |
| v2.2 = full structural-refactor scope (REF-01 all 3 monoliths + REF-02 + REF-03 DB projection) | The characterization tests shipped in v2.1 exist precisely to make these safe; owner chose the widest slice incl. the summary projection | ✓ Good — all 8 requirements shipped behavior-preserving; every phase goal-verified; workshop pages unchanged |
| v2.2 keeps `REQUIREMENTS.md` in place (v2.1 + v2.2 record preserved in Validated + git HEAD) | Consistent with the deferred-archival close; `milestones/` is still deleted mid-migration so re-creating an archive dir would re-open that history question | ✓ Good — same safe-logical-close repeated for v2.2 |
| REF-03 terrain scoped OUT of the projection switch (Phase 19) | `AccFolderPermissionSummary` is a per-`(projectId,roleId)` rollup; terrain needs per-folder tier, which the rollup lacks — forcing it would lose granularity + break TEST-02. Only the summary aggregate matches the projection shape | ✓ Good — terrain stayed on `folderPermQuery.ts`, TEST-02 byte-identical; per-folder projection seeded for later |
| Hard-guard (not delete) the `includePermissionContexts` raw scan | Preserves the WS2 edge-feed / per-folder-ACL capability behind an explicit `ACC_ALLOW_RAW_PERMISSION_SCAN=1` env escape hatch; throws by default so the ~6M-row OOM window can't silently re-open | ✓ Good — no prod caller enables it; TEST-01 strengthened |
| Refresh via reusing the backfill script verbatim in the ingest cron | `execSync('node scripts/backfill-folder-perm-summary.cjs')` (non-fatal, server-side) makes the cron and standalone backfill the SAME code path — zero SQL duplication, no drift; bounded ≤1 ingest cycle | ✓ Good — reconciliation PASS post-refresh; staleness documented in INTEGRATIONS.md |
| Rebuild `:3000` (owner-consented) to verify v2.2 parity, unlike v2.1 | The final phase was a server-side data-source swap → a rebuild is required to see it; owner explicitly approved stopping `:3000` (build 500s a live app per deploy-sequence) | ✓ Good — real owner visual sign-off on `/access-analysis` + `/template-mty` (unlike Phase 17's test-basis-only) |

---
*Last updated: 2026-07-02 after v2.2 milestone (Structural Refactors) close — REF-01/REF-02/REF-03 shipped, Phases 15–19; safe logical close, tagged `v2.2`.*
