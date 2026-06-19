# LECG Dashboard — Workshop-Grade UI/UX Overhaul

## What This Is

A premium UI/UX overhaul of four pages in the existing LECG BIM management dashboard — `/users`, `/access-analysis`, `/template-mty`, and `/forma-proposal`. The goal is to transform how the data *looks, feels, and responds* so it can be presented to all users in live workshops: fast, visually premium (depth, not flat), tactile, and explorable in real time — without overwhelming motion. The underlying data and stack stay the same; the presentation layer is reimagined.

## Core Value

When these pages are presented to all users in a workshop, the data makes people lean in — fast, tactile, visually premium, and explorable live. If everything else fails, this must: the data has to *feel* alive and impressive on screen, not flat or cramped.

## Requirements

### Validated

<!-- Inferred from existing code (brownfield). These pages already exist and function. -->

- ✓ `/users` directory — search/field-scoped filters, window-virtualized roster (grid/list), person detail modal, file-activity columns, activity audit panel — existing
- ✓ `/access-analysis` — KPI strip, office-grouped project picker, role/company/activity/module donuts, activity timeline, folder-permission terrain, model-coordination panel, click-to-drill people lists — existing
- ✓ `/template-mty` — members table, role distribution pies, folder-access-by-tier chart, ACC module-access chart, folder terrain, role-similarity graph — existing
- ✓ `/forma-proposal` — role-permission draft editor (permissions + hierarchy modes), tier assignment, JSON/CSV export, local draft persistence — existing
- ✓ Tech foundation — Next.js 16 App Router + React 19, tRPC + Prisma/PostgreSQL, ECharts, Tailwind/shadcn, light+dark theming — existing

<!-- Shipped & validated in v2.0 (Workshop-Grade UI/UX Overhaul), owner-approved on the projector 2026-06-19 -->

- ✓ **Speed** — skeletons + progressive/tiered load across all 4 pages; each tRPC endpoint fetched once; no perf regression — v2.0 (PERF-01..05)
- ✓ **Visual depth** — premium 2.5D look (glass, soft shadows, gradients, layered cards); donuts no longer flat, both themes — v2.0 (VIS-01, VIS-02, ACC-01)
- ✓ **3D hero accents** — selective real-3D confined to `/users` header + `/forma-proposal` background, off all data surfaces — v2.0 (VIS-06, FRM-02)
- ✓ **Interactivity** — clickable rows/chart segments → shared slide-in panel; `/access-analysis` client-side cross-filtering with zero new queries — v2.0 (INT-01..05)
- ✓ **De-bloat & layout** — 2,474-line `/users` monolith decomposed to a 314-line shell behind a golden-path test — v2.0 (USR-01)
- ✓ **`/users` redesign** — premium virtualized `DataTable` (pinned name, frosted sticky header, sortable, density toggle, row-click/expand) — v2.0 (USR-02, FND-05)
- ✓ **Cohesive look-and-feel** — one shared design language (tokens, `PremiumSurface`, themed `EChart`, motion facade, `DrillSheet`) across all 4 pages; light + dark first-class — v2.0 (FND-01..04, THM-01)
- ✓ **Tasteful motion** — staggered reveal under a hard budget; drill motion ≤200ms, fires only on mount/drill — v2.0 (VIS-03, VIS-05)
- ✓ **New per-page analytics** — gated to the existing Prisma DB; under-covered sources labeled in the UI — v2.0 (NA-01)

### Active

<!-- Next milestone — define with /gsd:new-milestone. -->

v2.0 shipped all in-scope requirements. No active milestone in flight. Candidate seeds carried forward (see ROADMAP.md → v-next):

- [ ] **FRM-V2-01** — Forma role-permission diff view (needs a new `template.getBaseline(roleId)` tRPC query)
- [ ] **ACC-V2-01** — Project-grouped persistent accordion in the `/access-analysis` project picker
- [ ] **NA-V2-01** — Additional new per-page analytics beyond the gated set
- [ ] **`/users` data freshness** — auto-refresh without a manual browser reload (pre-existing app-wide caching trade-off)

### Out of Scope

- `/users/spatial-graph` — separate future project; needs full dedicated attention
- New data pipelines or external integrations — the existing Prisma DB is the source of truth
- Changes to the underlying data model / Prisma schema (beyond read-only query additions)
- End-user engagement/retention features — this is a *presentation/workshop showcase*, not an engagement product (only Luis runs the dev env; users watch the data, they don't drive the app)

## Context

- **Current state (shipped v2.0, 2026-06-19).** The Workshop-Grade UI/UX Overhaul shipped all 28 in-scope requirements across 7 phases (30 plans), owner-approved on the projector. The 4 target pages now share one design language; `/users` was decomposed (2,474 → 314-line shell) and rebuilt on a reusable `DataTable`. ~36k insertions over 3 days (incl. planning re-init). Deploy = local rebuild on :3000 (not merged to `deploy`). Tagged `v2.0` (the `v1.0` tag belongs to the May 2026 ACC Users Graph milestone). Full record: `.planning/MILESTONES.md` + `.planning/milestones/v2.0-*.md`.
- **Brownfield, mature codebase.** Full codebase map lives in `.planning/codebase/` (ARCHITECTURE, STACK, STRUCTURE, CONVENTIONS, TESTING, CONCERNS, INTEGRATIONS) plus `CLEANUP-ROADMAP.md`, refreshed 2026-06-19 from the fresh `.tools/repo-map/` artifacts.
- **Audience model.** Luis is the sole developer and presenter; he runs these pages in live workshops for all users. Success = the audience *sees* the data and stays engaged during the session — not user self-service engagement metrics.
- **Design references** (the *feel*, not the content): [landonorris.com](https://landonorris.com/), [igloo.inc](https://www.igloo.inc/), [orano.group innovation slider](https://www.orano.group/experience/innovation/en/slider) — dark, cinematic, depth-rich, motion-guided experiences. None are analytics tools; the brief is to translate that premium experience feeling onto interactive pies, donuts, and tables.
- **Current page weights** (from the map): `/users` is a 2,474-line `UsersDirectoryClient` monolith with 6+ heavy tRPC queries (~7–15MB) and no real table; `/access-analysis` runs 7 parallel RSC loaders (~20MB) but is the cleanest layout; `/template-mty` is the lightest/most focused; `/forma-proposal` is a local-draft editor with a 315-line `HierarchyView` spike.
- **Theming history** (memory): existing dark palette is **zinc, not slate** (`#09090B` bg, no blue cast); a dark-mode plan and `DARK_MODE.md` conventions already exist. Page roots must own scroll (`h-full overflow-y-auto`) and use semantic CSS-var tokens; ECharts must read `resolvedTheme` for canvas colors.
- **Codebase-mapping toolchain** (added 2026-06-17): `scripts/repo-map/` generates an LLM-friendly repo digest + structural reports into `.tools/repo-map/` via `npm run repo-map[:ast | :deps | :repomix | :repomix-zones | :summary]` (backed by `repomix`, `dependency-cruiser`, `@ast-grep/cli`). Current artifacts: `architecture-summary.md`, `repomix-output.xml` + per-zone digests (`repomix/`), `dependency-cruiser.json` / `dependency-graph.mmd`, and ast-grep reports (`fetch-calls`, `prisma-access`, `react-use-effect`, `router-push`). `npm run repo-map:check` ratchets against `.tools/repo-map/baselines/` to flag regressions (new fetch calls / effects). **These are the standing structural input for per-phase research** — phase agents should refresh (`npm run repo-map`) then consult: the dependency graph before the `/users` decomposition (USR-01), the fetch/effect ast-grep reports for the redundant-fetch audit (PERF-03), and `ast-grep-prisma-access.json` for the new-analytics feasibility gate (NA-01).

## Constraints

- **Tech stack**: Stay on Next.js 16 / React 19 / tRPC / Prisma / ECharts / Tailwind+shadcn — no framework change. — Avoids a rewrite; leverages the existing server-driven hybrid architecture.
- **Performance**: The redesign must not regress load or interaction speed; ideally improve *perceived* speed (skeletons, progressive/staggered loading). — Speed is one of the five inseparable axes.
- **Data source**: Any new analytics must be derivable from the existing Prisma schema/data. — DB is the single source of truth; keeps scope shippable, no new pipelines.
- **Build**: `next build` typechecks the *entire* tree including test files (no `ignoreBuildErrors`); any tsc error blocks the `:3000` deploy build. — Run `npx tsc --noEmit` before rebuilding.
- **Deploy**: Production runs via a local Windows Task Scheduler build on `:3000`; deploy = `npm run build` + restart of the current checkout, **not** a git deploy-branch merge. — A rebuild ships the whole working tree.
- **Motion**: Transitions must be tasteful and never overwhelming. — Explicit owner constraint balancing "don't look flat" against "don't overwhelm."

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Premium 2.5D depth + *selective* 3D hero accents (not full WebGL on data pages) | Honors the "not flat" + "not overwhelming" + speed tension; the real-3D experience is reserved for the carved-out spatial-graph project | ✓ Good — shipped v2.0; real 3D stayed off data pages, GPU < 400MB held |
| Light + dark both first-class and equally refined | Workshops may run on either; daily use varies; refs are dark but the app already ships both | ✓ Good — both themes validated incl. WCAG AA at projector brightness (THM-01) |
| Mix treatment per page (`/users` redesign; others polish + depth + new views) | Matches each page's current state — `/users` is a monolith, the others are already clean | ✓ Good — `/users` fully rebuilt on DataTable; others polished without rewrite |
| New analytics bounded strictly to the existing Prisma DB | DB is the source of truth; prevents the "new analytics" scope from ballooning into data engineering | ✓ Good — NA-01 feasibility gate held; under-covered sources labeled in UI |
| `/users/spatial-graph` deferred to its own project | It needs full dedicated attention (real 3D); excluding it keeps this milestone focused | ✓ Good — boundary held; zero files under `users/access-analysis/` touched |
| Adopt the `scripts/repo-map` toolchain as the standing input for per-phase research & a regression ratchet | Gives planning agents precise structural facts (dep graph for the `/users` split, ast-grep sweeps for the foundation/perf work, `prisma-access` for the NA feasibility gate); `repo-map:check` guards against re-introducing redundant fetches | ✓ Good — used as standing research input + fetch/effect regression ratchet |

---
*Last updated: 2026-06-19 after v2.0 milestone (Workshop-Grade UI/UX Overhaul) completion*
