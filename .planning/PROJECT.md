# LECG Dashboard

## What This Is

An internal BIM/AEC dashboard for LECG that surfaces Autodesk Construction Cloud (ACC) activity, file/folder access, user roles, and project health for the LECG team. It runs locally on Luis's PC (via Windows Task Scheduler) and is the operational lens his team uses to understand who is doing what across ACC projects.

The current focus of this initialization is the **Access Analysis spatial graph** — a multi-dimensional visualization of users × projects that has to feel right (physics, positioning, clustering, filtering, search, lasso, 2D↔3D) — not patched.

## Core Value

**The Access Analysis spatial graph reveals how people relate to projects through real math on real data — not vibes, not patches.**

If the spatial graph isn't polished, intuitive, and grounded in the ingested DC parameters, the whole dashboard loses its differentiating insight.

## Requirements

### Validated

<!-- Inferred from .planning/codebase/ — these already work and are relied upon. -->

- ✓ **Next.js App Router app** with tRPC API surface across ~25 domain routers — existing
- ✓ **Prisma + local Postgres 18** data layer with `trust` auth on localhost — existing (migrated 2026-05-18)
- ✓ **NextAuth authentication** (Google + Autodesk providers) — existing
- ✓ **Autodesk APS / Data Connector ingest pipeline** (3-leg user-context auth, per-module CSV format) — existing, with active hardening
- ✓ **ACC activity / folders / members / sync tRPC routers** feeding the dashboard — existing
- ✓ **User directory route** (`app/(dashboard)/users/`) with sortable table + filters — existing
- ✓ **Access Analysis route shell** (`app/(dashboard)/users/access-analysis/`) — shell stays, internals get rebuilt this phase
- ✓ **Vitest test infrastructure** with ~50 co-located test files — existing
- ✓ **Windows Task Scheduler scheduled jobs** for daily DC ingest (`scripts/dc-daily-cron.ps1`) — existing
- ✓ **Electron desktop wrapper** for the dashboard — existing
- ✓ **DuckDB-WASM client-side analytics** (warmup, copy-duckdb-wasm postinstall) — existing

### Active

<!-- The slice this initialization is committing to. All hypotheses until shipped. -->

**Access Analysis spatial graph (target: demo-ready by 2026-05-19 19:00 local):**

- [ ] Polished node positioning with smooth animations (no jitter, no flash, no popping)
- [ ] Dimension sliders with continuous-blend math: 0 = organic/diffuse, 100 = fully clustered
- [ ] Multiple sliders compose mathematically (not one regime at a time) — interactions visibly correct
- [ ] All DC-extracted parameters (activity counts, last sign-in, file ops, folder roles, permission tiers) wired into the positioning math
- [ ] Real-time filtering (no full re-layout flicker)
- [ ] Real-time search (highlight + focus, position preserved)
- [ ] Lasso tool → generates pie chart breakdown of the selected subset
- [ ] Seamless 2D spatial ↔ 3D orbit switching (same node identities, position continuity)
- [ ] Engine selection done via deliberate research — Cosmograph is the incumbent but **not** assumed

**Follow-up (after spatial graph lands):**

- [ ] Graph pies — pie-chart widgets across the dashboard tabs (next milestone slice)

### Out of Scope

<!-- Explicit boundaries with reasoning to prevent re-adding. -->

- **Manual sync UI** (Sync All button, Refresh, stale-cache banner) — sync is automatic via Task Scheduler; manual UI was intentionally removed (feedback memory)
- **Similarity edges as visible graph edges** — similarity is positional/clustering only; must NEVER render as visible edges or nodes (feedback memory)
- **Cloud deployment / Railway** — trial expired 2026-05-13; dashboard runs on Luis's PC. No re-platforming this milestone
- **More patches on the existing Access Analysis internals** — the whole point of starting over is to stop patching. Internals get rewritten, not band-aided
- **New tRPC routers / new ingest paths** for this slice — existing data surface is enough
- **Mobile / responsive design** — desktop demo target
- **Multi-tenant or external user access** — single-host, single-operator tool

## Context

**Current branch:** `feat/access-analysis-redesign` (rebase target: `deploy`)

**Why now:**
- The spatial graph has accumulated too many patches; physics, positions, and clusters all feel wrong simultaneously. Each fix breaks something else.
- Local dev (local Postgres + Task Scheduler) is now stable enough to iterate fast without Railway round-trips.
- A planned team demo at 19:00 today (2026-05-19) is the forcing function for clean foundations.

**Codebase context:**
- The Access Analysis route shell stays (`app/(dashboard)/users/access-analysis/`). Internals (graph engine, physics, semantic seeds, math layer) get fully rewritten.
- Earlier redesign attempts left partial scaffolding: DuckDB→Mosaic→frozen-Cosmos pattern (memory `cosmograph_mosaic_redesign` 2026-05-13). Engine choice is **open again** per the user's research mandate.
- Topology shifted to one-node-per-(user, project) on 2026-05-13, superseding the earlier collapsed-user model. That stays.
- APS Data Connector has its own ongoing hardening work (Phase 09 drift recovery — bugs A/B/C/D). That is **adjacent**, not part of this slice — but the graph consumes its output, so output schema stability matters.

**Known gotchas that already cost time (must respect):**
- Cosmos.gl v3 `getSimulationAlpha()` returns `1 - progress` — inverted from d3 alpha. Easy to break dim/highlight animations.
- DC daily quota is ~25 req/UTC-day per user — irrelevant to graph layer but a constraint on the data behind it.
- The user×project instance topology dramatically increases node count vs. collapsed users — engine selection must handle that scale.

## Constraints

- **Deadline:** Demo-ready by **2026-05-19 19:00 local** — ~6 hours from initialization
- **Tech stack:** Must stay on Next.js + tRPC + Prisma + local Postgres (no platform changes)
- **Deployment:** Localhost only via Windows Task Scheduler — no cloud, no Railway, no Docker for the dashboard
- **No more patches:** The Access Analysis internals get rewritten; band-aids on the existing graph are forbidden
- **Engine choice:** Open. Research must compare Cosmograph against alternatives (e.g. sigma.js, three.js + d3-force-3d, deck.gl, react-force-graph, native WebGL, hybrid 2D/3D approaches) before defaulting to incumbent
- **Topology fixed:** One node per (user, project). No collapsing back to one-node-per-user
- **Similarity rule:** Similarity dims drive positioning/clustering only — never visible edges/nodes
- **Single-host scale:** One operator, one machine — no multi-user concurrency design
- **Test bar:** Vitest co-located unit tests for math layer (slider interactions, parameter→position mapping); E2E manual

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep `app/(dashboard)/users/access-analysis/` route shell; rewrite internals only | Stable entry point + URL; clean slate where it hurts | — Pending |
| Engine choice deferred to research phase | User explicitly called out Cosmograph-bias risk | — Pending |
| One node per (user, project) topology | Already validated direction (2026-05-13) | — Pending (carry forward) |
| Sliders compose mathematically (not modal) | Continuous blend 0→100 across multiple dimensions is the core UX bet | — Pending |
| Graph pies deferred until spatial graph lands | Sequencing — physics/positioning is the bigger unknown | — Pending |
| Local-only deployment (no Railway revival) | Trial expired, local stack works | ✓ Good |

---
*Last updated: 2026-05-19 after initialization*
