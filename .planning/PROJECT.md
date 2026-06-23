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

## Current Milestone: v2.1 Concerns Hardening

**Goal:** Close the concerns mapped in `.planning/codebase/CONCERNS.md` — harden the
DB/config layer, repair layering boundaries, surface data-truthfulness labels on the
workshop pages, add integration-health observability, and backfill the highest-value
test, **without** reworking the out-of-scope spatial-graph and without high-risk
monolith splits on the live demo dashboard.

**Scope decisions (2026-06-23):**

- **Spatial-graph excluded** — CONCERNS.md §3 and the large spatial-graph test
  refactors (§8.2, §8.3) honor the `/users/spatial-graph` out-of-scope boundary;
  deferred to a future spatial-graph milestone.
- **Guardrails + labels first** — the 1,000+ line monolith splits (§2.3) and the
  shared `folderPermQuery` extraction (§6.1) are deferred; this milestone ships their
  characterization tests and warning comments so a later split is safe.

**Target categories:**

- Database & config hardening (`roleId` index, ssl fossil, `.env.example` heap/pool docs, raw-scan guardrail)
- Layering & boundary fixes (Prisma-in-Server-Action, scripts→app classification extraction, lib→app / app→server audits)
- Data-truthfulness labels (DC 428/1,152 coverage, ACCDS ~12-mo floor, module-donut service caveat, AccDcRole fallback)
- Integration health & observability (ACCDS session health, AccDcRole-empty warning, stale TODO cleanup)
- Type-safety & lean-payload guards (bulkUsers empty roles/modules, accGraphFilters drift assert)
- Test coverage & characterization (AccFolderPermission aggregate test + monolith/terrain characterization tests)

## Requirements

### Validated

<!-- Shipped and confirmed. -->

- ✓ **All ACC data extracted and verified** — confirmed 2026-06-23 against the live
  local DB. See `.planning/STATE.md` for the full census and verification evidence.

### Active

<!-- Current scope (v2.1 Concerns Hardening). Detail + REQ-IDs in REQUIREMENTS.md. -->

- [ ] **DB** — `roleId` index + migration, remove `ssl` fossil, document `PG_POOL_MAX`/`NODE_OPTIONS`, guard the raw 5M-row permission scan path.
- [ ] **BND** — move direct-Prisma Server Action into a tRPC procedure, extract pure activity classification to `lib/acc`, audit/reduce lib→app and app→server boundary edges.
- [ ] **TRUTH** — label DC 428/1,152 coverage, ACCDS ~12-month data floor, module-donut `service` caveat, and the AccDcRole fallback honestly on the workshop pages.
- [ ] **OBS** — ACCDS session-health check, AccDcRole-empty warning after cache refresh, remove stale `TODO[02.5]` guards.
- [ ] **TYPE** — mark `bulkUsers` lean-payload roles/modules as always-empty, add the `accGraphFilters` union-drift assert.
- [ ] **TEST** — Vitest for the AccFolderPermission GROUP BY aggregate; characterization tests around the access-analysis monoliths and shared terrain query.

### Out of Scope

- `/users/spatial-graph` rework — out of scope unless explicitly re-scoped. For
  v2.1 this defers CONCERNS.md §3.1–3.5 (DuckDB warm-up, cosmos reheat, catalog
  lazy-load, lasso flake, hydration test) and the spatial-graph test refactors
  §8.2/§8.3, plus any lib→app / scripts→app edge fixes that require moving
  spatial-graph modules (`internalDomains.ts`, `graphNodesFromUsers.ts`,
  `instanceFeatureTokens.ts`).
- Monolith splits (§2.3) and `folderPermQuery` extraction (§6.1) — deferred; v2.1
  ships only their characterization tests and warning comments.
- New WebGL on data surfaces — confined to approved `/users` header and
  `/forma-proposal` background accents.
- New analytics not derivable from the Prisma DB — under-covered sources are
  labeled, not hidden.

## Context

- Prior history (v2.0 milestone + Phases 01–08, including the Phase 8 activity
  re-extraction) is preserved in git history and the stale `.planning.backup/`
  snapshot. This baseline intentionally resets `.planning/` to a clean record of
  the confirmed data-extraction state.
- Data extraction used a free ACCDS member-accessible web-session crawl (no Data
  Connector quota) plus a folder crawl; both are reflected in the census below.

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
| Reset `.planning/` to a data-extraction-confirmed baseline | Owner wanted a clean history showing only "data extracted + verified" | — Pending |
| Keep upgraded `config.json` (runtime/claude, agent_skills, build/test commands) | Recent intentional GSD config upgrade | ✓ Good |
| v2.1 milestone = close CONCERNS.md (not a feature release) | All 22 mapped concerns deserve a disposition; debt-closure protects the live workshop | — Pending |
| Exclude `/users/spatial-graph` concerns (§3, §8.2/8.3) from v2.1 | Honors the standing out-of-scope boundary; lowest risk to the interactive graph | — Pending |
| Defer monolith splits (§2.3) + `folderPermQuery` extraction (§6.1); ship characterization tests first | Low-risk delivery on a live demo dashboard; splits are safe only behind tests | — Pending |
| Skip domain research for v2.1 | Debt-closure against already-specified guardrails — no new ecosystem to research | — Pending |

---
*Last updated: 2026-06-23 after starting milestone v2.1 (Concerns Hardening)*
