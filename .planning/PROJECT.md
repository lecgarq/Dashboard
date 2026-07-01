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

**Shipped:** v2.1 Concerns Hardening — closed 2026-07-01 (6 phases, 14 plans;
Phases 09–14). Closed the `.planning/codebase/CONCERNS.md` debt map: DB/config
hardening (`roleId` index, ssl fossil removed, heap/pool docs, raw-scan guardrail),
layering & boundary fixes (Prisma-out-of-Server-Action, classifier extraction,
lib→app / app→server audits), data-truthfulness labels on the workshop pages,
integration-health observability, type-safety & lean-payload guards, and
characterization tests that make the deferred monolith/query refactors safe. All
20 v2.1 requirements complete + verified. Tagged `v2.1` (local).

**Close method:** "safe logical close" — tag + PROJECT/STATE evolution with
requirements kept in place. Full archival (MILESTONES.md / RETROSPECTIVE.md /
`milestones/v2.1-*`) was intentionally deferred because `.planning/` is mid-migration
(see Context). Deploy = rebuild on `:3000` (not a branch merge); a full-tree rebuild
for this milestone was deferred (test+comment-only final phase, branch carries
unrelated WIP).

**Current focus:** Planning the next milestone. Prime candidates: the deferred
structural refactors — now safe behind v2.1 characterization tests — and a dedicated
spatial-graph milestone.

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

### Active

<!-- Candidate seeds for the next milestone — not yet scoped. Detail in REQUIREMENTS.md Future section. -->

- [ ] **REF-01** — split the three access-analysis monoliths
  (`FolderPermissionTerrain.tsx`, `folderTerrain.ts`, `HybridAnalyticsSurface.tsx`)
  into data-hook / transform / thin-view modules; now safe behind the v2.1
  characterization tests (TEST-02).
- [ ] **REF-02** — extract `lib/server/folderPermQuery.ts` (shared
  `AccFolderPermission` join used by `/template-mty` + `/access-analysis`); pinned by
  the v2.1 shared-query contract test (TEST-03).
- [ ] **REF-03** — materialise an `AccFolderPermissionSummary` projection to retire
  the raw 5M-row permission scan path.
- [ ] **SVC-01** — `service`-override classification refinement (reconcile Build vs
  Model Coordination for ~966 clash-issue rows); needs design approval.
- [ ] **Spatial-graph milestone** — the deferred `/users/spatial-graph` concerns
  (CONCERNS.md §3 + §8.2/8.3): DuckDB warm-up, cosmos.gl reheat, 176-action catalog
  lazy-load, lasso e2e flake, hydration-prefetch test, physics/e2e test splits.
- [ ] **DC-01 / DC-02** (external/data-blocked) — unlock the 724 DC-403 projects via
  APS Account Admin provisioning; wire per-project roles/modules once the DC CSV
  `activity_in_module` / `total_activity` join lands.

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
- Known local test debt: 2 pre-existing failing tests in
  `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx` are
  uncommitted branch WIP unrelated to v2.1 — a full `npm test` is not 100% green until
  that WIP is resolved.

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

---
*Last updated: 2026-07-01 after v2.1 milestone close (safe logical close; `.planning/` migration + full archival pending)*
