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

### Active

<!-- This milestone. Hypotheses until shipped and validated in a workshop. -->

- [ ] **Speed** — all 4 pages load fast and respond instantly (skeletons / progressive load); no perf regressions
- [ ] **Visual depth** — premium "2.5D" look (glass, soft shadows, gradients, layered cards); charts that don't look flat
- [ ] **3D hero accents** — one or two selective WebGL/3D "wow" moments for the workshop, used sparingly
- [ ] **Interactivity** — clickable rows, fields, and chart segments with drill-downs across all 4 pages
- [ ] **De-bloat & layout** — eliminate overlapping/cramped elements; split the `/users` 2,474-line monolith
- [ ] **`/users` redesign** — rebuild the virtualized list into a premium, clickable data-table
- [ ] **Cohesive look-and-feel** — one design language across the 4 pages; light + dark both first-class
- [ ] **Tasteful motion** — transitions guide the eye, never overwhelm
- [ ] **New per-page analytics** — propose new views/metrics where they strengthen the data story, strictly derivable from the existing Prisma DB

### Out of Scope

- `/users/spatial-graph` — separate future project; needs full dedicated attention
- New data pipelines or external integrations — the existing Prisma DB is the source of truth
- Changes to the underlying data model / Prisma schema (beyond read-only query additions)
- End-user engagement/retention features — this is a *presentation/workshop showcase*, not an engagement product (only Luis runs the dev env; users watch the data, they don't drive the app)

## Context

- **Brownfield, mature codebase.** Full codebase map lives in `.planning/codebase/` (ARCHITECTURE, STACK, STRUCTURE, CONVENTIONS, TESTING, CONCERNS, INTEGRATIONS), refreshed 2026-06-17.
- **Audience model.** Luis is the sole developer and presenter; he runs these pages in live workshops for all users. Success = the audience *sees* the data and stays engaged during the session — not user self-service engagement metrics.
- **Design references** (the *feel*, not the content): [landonorris.com](https://landonorris.com/), [igloo.inc](https://www.igloo.inc/), [orano.group innovation slider](https://www.orano.group/experience/innovation/en/slider) — dark, cinematic, depth-rich, motion-guided experiences. None are analytics tools; the brief is to translate that premium experience feeling onto interactive pies, donuts, and tables.
- **Current page weights** (from the map): `/users` is a 2,474-line `UsersDirectoryClient` monolith with 6+ heavy tRPC queries (~7–15MB) and no real table; `/access-analysis` runs 7 parallel RSC loaders (~20MB) but is the cleanest layout; `/template-mty` is the lightest/most focused; `/forma-proposal` is a local-draft editor with a 315-line `HierarchyView` spike.
- **Theming history** (memory): existing dark palette is **zinc, not slate** (`#09090B` bg, no blue cast); a dark-mode plan and `DARK_MODE.md` conventions already exist. Page roots must own scroll (`h-full overflow-y-auto`) and use semantic CSS-var tokens; ECharts must read `resolvedTheme` for canvas colors.

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
| Premium 2.5D depth + *selective* 3D hero accents (not full WebGL on data pages) | Honors the "not flat" + "not overwhelming" + speed tension; the real-3D experience is reserved for the carved-out spatial-graph project | — Pending |
| Light + dark both first-class and equally refined | Workshops may run on either; daily use varies; refs are dark but the app already ships both | — Pending |
| Mix treatment per page (`/users` redesign; others polish + depth + new views) | Matches each page's current state — `/users` is a monolith, the others are already clean | — Pending |
| New analytics bounded strictly to the existing Prisma DB | DB is the source of truth; prevents the "new analytics" scope from ballooning into data engineering | — Pending |
| `/users/spatial-graph` deferred to its own project | It needs full dedicated attention (real 3D); excluding it keeps this milestone focused | — Pending |

---
*Last updated: 2026-06-17 after initialization*
