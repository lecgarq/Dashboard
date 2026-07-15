---
name: lecg-map-codebase
description: Map or refresh the LECG Dashboard codebase into .planning/codebase/ documents using parallel explorer agents plus the repo-map toolchain and codebase-memory graph. Use whenever Luis asks to map the codebase, refresh codebase docs, re-map after big changes, says the codebase docs are stale, or before a milestone/refactor that needs current architecture knowledge — even if he doesn't say "map" explicitly.
---

# lecg-map-codebase

Produce or refresh the seven `.planning/codebase/` documents: `STACK.md`,
`INTEGRATIONS.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`,
`TESTING.md`, `CONCERNS.md`.

Read `../lecg-dashboard/references/lecg-workflow-conventions.md` first.

## Why this shape

The Dashboard already has two machine-generated structural sources that generic
mappers lack. Use them as input so the mapper agents *interpret* rather than
re-derive structure — that's what keeps a full map cheap:

- `.tools/repo-map/architecture-summary.md` + `dependency-cruiser.json`
  (refresh with `npm run repo-map` if stale — check via
  `node scripts/repo-map/check.cjs`)
- codebase-memory graph: `mcp__codebase-memory__get_architecture` /
  `search_graph` (project `C-LECG-Dashboard`)

## Process

1. **Scope check.** If `.planning/codebase/` exists, diff its doc dates against
   recent significant commits. Offer: refresh all, refresh a focus area
   (tech / arch / quality / concerns), or targeted update of one doc. A single
   stale doc does not justify a full 4-agent remap.
2. **Refresh structural inputs** if `node scripts/repo-map/check.cjs` reports
   drift: `npm run repo-map`.
3. **Spawn mapper agents in one message** (Explore or general-purpose), each
   writing its docs directly to `.planning/codebase/` and returning only a
   confirmation + line counts:
   - tech → `STACK.md`, `INTEGRATIONS.md` (package.json, prisma/schema.prisma,
     services/lod-engine, external APIs: APS/ACC, Data Connector, accds)
   - arch → `ARCHITECTURE.md`, `STRUCTURE.md` (seed with
     `.tools/repo-map/architecture-summary.md`; real roots: `app/`,
     `components/`, `lib/`, `server/routers/`, `prisma/`, `scripts/`)
   - quality → `CONVENTIONS.md`, `TESTING.md` (vitest patterns, e2e on :3100,
     zinc theme conventions, PremiumSurface/DrillSheet/EChart primitives)
   - concerns → `CONCERNS.md` (boundary risks: route-owned shared logic under
     `app/(dashboard)/users/access-analysis/`, ACC/DC coupling, large modules)

   Each agent prompt must include: exact output paths, "update in place —
   preserve still-true content, correct stale claims", the no-invented-paths
   evidence rule, and "do not read `.env*` or secret-bearing files".
4. **Verify after subagents.** `git status --short` — confirm only the intended
   docs changed (subagents overreach). Check all 7 docs exist and none
   collapsed to a stub.
5. **Commit by explicit path**: `git add .planning/codebase/*.md` then
   `docs(codebase): refresh codebase map (<focus>)`.
6. **Route.** Suggest the natural next step: `/lecg-new-milestone` if between
   milestones, `/lecg-phase` if a phase is waiting.

## Traps

- Never index codebase-memory with `--mode full` (crashes on this tree).
- `app/(dashboard)/access-analysis` ≠ `app/(dashboard)/users/access-analysis`
  — the charts page and the spatial-graph shell. Mappers conflate them; the
  docs must not.
