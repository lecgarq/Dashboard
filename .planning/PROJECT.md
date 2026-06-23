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

## Requirements

### Validated

<!-- Shipped and confirmed. -->

- ✓ **All ACC data extracted and verified** — confirmed 2026-06-23 against the live
  local DB. See `.planning/STATE.md` for the full census and verification evidence.

### Active

<!-- Current scope. Building toward these. Defined when the next milestone starts. -->

- [ ] (Next milestone — define via `/gsd:new-milestone`)

### Out of Scope

- `/users/spatial-graph` rework — out of scope unless explicitly re-scoped.
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

---
*Last updated: 2026-06-23 after planning reset to data-extraction-confirmed baseline*
