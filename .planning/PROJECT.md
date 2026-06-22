# LECG Dashboard

## What This Is

A premium UI/UX overhaul of four pages in the existing LECG BIM management dashboard — `/users`, `/access-analysis`, `/template-mty`, and `/forma-proposal`. The goal is to transform how the data *looks, feels, and responds* so it can be presented to all users in live workshops: fast, visually premium (depth, not flat), tactile, and explorable in real time — without overwhelming motion. The underlying data and stack stay the same; the presentation layer is reimagined.

## Core Value

When these pages are presented to all users in a workshop, the data makes people lean in — fast, tactile, visually premium, and explorable live. If everything else fails, this must: the data has to *feel* alive and impressive on screen, not flat or cramped.

## Current Milestone: v3.0 — Access Analysis: Hub Story & Scenario Explorer

**Goal:** Turn `/access-analysis` from a flat panel scroll into a navigable, sectioned story of "the situation of the hub" — powered by freshly re-extracted data and a flexible scenario explorer that pivots ACC data across any dimension pair (activity×folder, role×users, company×module…). **Additive** (every existing panel preserved), **descriptive** (no synthetic risk scores — the owner judges risk), **coverage-honest** (428/1,152 labeled), fast, and clickable.

**Target features:**
- Activity re-extraction for all admin-accessible projects via the FREE ACCDS web-session crawler (`accds-activity-ingest.cjs`, no DC quota) so the exercise is current — a dedicated first phase.
- Sectioned hub narrative: themed sections (Overview → People & Roles → Activity → Folders → Coordination → Interconnections) + sticky in-page nav + hub-wide default landing + honest coverage indicator.
- Scenario explorer (centerpiece): a **measure × dimension (× dimension)** picker that auto-renders the right chart (bar/donut/tree/heatmap/sankey), clickable + drillable, **plus saved named presets** for the common pairs.
- Activity depth: calendar heatmap, behavior-mix over time (view/upload/edit/delete), hottest files/models, attribution-quality honesty strip.
- Factual folder reach & exposure: internal vs external access, who-can-reach-which-folder, dormant-access-as-fact, storage/data-reach. No scores.
- Hygiene facts + interconnections: surface the already-computed junk/duplicate/outlier role *facts* (no severity grade) + Sankey (Company→Role→Module) + chord/matrix (firm collaboration, role co-occurrence).

**Audience:** non-technical executives/project directors (need the situation of the hub at a glance) + BIM/VDC managers (validate role matrices, find coordination bottlenecks). Luis presents live.

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

<!-- Milestone v3.0 — Access Analysis: Hub Story & Scenario Explorer. REQ-IDs in REQUIREMENTS.md. -->

Additive to the existing `/access-analysis`; descriptive (no synthetic risk scores); coverage-honest (428/1,152).

- [ ] **Data currency** — re-extract activity current via the FREE ACCDS web-session crawler (no DC quota) for all admin-accessible projects
- [ ] **Sectioned hub narrative** — themed sections + sticky nav + hub-wide default landing; preserves all 14 existing panels (extends **ACC-V2-01** grouped picker)
- [ ] **Scenario explorer** — flexible measure×dimension(×dimension) pivot → auto chart type, clickable/drillable, + saved presets
- [ ] **Activity depth** — calendar heatmap, behavior-mix over time, hottest files/models, attribution-quality honesty
- [ ] **Folder reach & exposure (factual)** — internal/external access, who-reaches-what, dormant-access facts, storage/data-reach
- [ ] **Hygiene facts + interconnections** — surface computed junk/duplicate/outlier role facts (no scores) + Sankey/chord (**NA-V2-01**)

Deferred (not this milestone): **FRM-V2-01** Forma role-permission diff view; **`/users` data freshness** auto-refresh.

### Out of Scope

- `/users/spatial-graph` — separate future project; needs full dedicated attention
- New data pipelines or external integrations — the existing Prisma DB is the source of truth
- Changes to the underlying data model / Prisma schema (beyond read-only query additions)
- End-user engagement/retention features — this is a *presentation/workshop showcase*, not an engagement product (only Luis runs the dev env; users watch the data, they don't drive the app)

## Context

- **Current state (shipped v2.0, 2026-06-19).** The Workshop-Grade UI/UX Overhaul shipped all 28 in-scope requirements across 7 phases (30 plans), owner-approved on the projector. The 4 target pages now share one design language; `/users` was decomposed (2,474 → 314-line shell) and rebuilt on a reusable `DataTable`. ~36k insertions over 3 days (incl. planning re-init). Deploy = local rebuild on :3000 (not merged to `deploy`). Tagged `v2.0` (the `v1.0` tag belongs to the May 2026 ACC Users Graph milestone). Full record: `.planning/MILESTONES.md` + `.planning/milestones/v2.0-*.md`.
- **Brownfield, mature codebase.** Full codebase map lives in `.planning/codebase/` (ARCHITECTURE, STACK, STRUCTURE, CONVENTIONS, TESTING, CONCERNS, INTEGRATIONS) plus `CLEANUP-ROADMAP.md`, refreshed 2026-06-19 from the fresh `.tools/repo-map/` artifacts.
- **Audience model.** Luis is the sole developer and presenter; he runs these pages in live workshops. 
  - *Primary Audience:* Non-technical executives and project directors who need to see risk and ROI immediately (they care about "who has access to what" and "is my project exposed"). 
  - *Secondary Audience:* BIM/VDC Managers who need to validate role matrices and resolve clash bottlenecks.
  - *Success Metric:* The audience *sees* the data and stays engaged during the session — not user self-service engagement metrics.
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

## Future Vision Themes (Ideation Vectors)

When ideating new features or planning milestones, focus on these vectors:
1. **Cross-Company Permission Bleeding (Risk):** Surfacing exactly where external subcontractors have inadvertently gained access to internal parent folders across ACC.
2. **ACC to Forma Parity (Consistency):** Deepening the translation between Forma conceptual roles and hard ACC folder permissions so they can be diffed and synchronized.
3. **Model Coordination Bottlenecks (Speed):** Moving beyond basic clash counts to highlight *who* is blocking resolution and *where* the spatial density of clashes is highest.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Premium 2.5D depth + *selective* 3D hero accents (not full WebGL on data pages) | Honors the "not flat" + "not overwhelming" + speed tension; the real-3D experience is reserved for the carved-out spatial-graph project | ✓ Good — shipped v2.0; real 3D stayed off data pages, GPU < 400MB held |
| Light + dark both first-class and equally refined | Workshops may run on either; daily use varies; refs are dark but the app already ships both | ✓ Good — both themes validated incl. WCAG AA at projector brightness (THM-01) |
| Mix treatment per page (`/users` redesign; others polish + depth + new views) | Matches each page's current state — `/users` is a monolith, the others are already clean | ✓ Good — `/users` fully rebuilt on DataTable; others polished without rewrite |
| New analytics bounded strictly to the existing Prisma DB | DB is the source of truth; prevents the "new analytics" scope from ballooning into data engineering | ✓ Good — NA-01 feasibility gate held; under-covered sources labeled in UI |
| `/users/spatial-graph` deferred to its own project | It needs full dedicated attention (real 3D); excluding it keeps this milestone focused | ✓ Good — boundary held; zero files under `users/access-analysis/` touched |
| Adopt the `scripts/repo-map` toolchain as the standing input for per-phase research & a regression ratchet | Gives planning agents precise structural facts (dep graph for the `/users` split, ast-grep sweeps for the foundation/perf work, `prisma-access` for the NA feasibility gate); `repo-map:check` guards against re-introducing redundant fetches | ✓ Good — used as standing research input + fetch/effect regression ratchet |
| v3.0 is **additive, not a rewrite** of `/access-analysis` | Owner: "do not destroy what we currently have… complete redefinement is [not] a better storytelling." Reorganize + extend the 14 existing panels | — Pending |
| v3.0 analytics are **descriptive, not prescriptive** — no synthetic risk scores/severity grades | Owner: "i dont care about risk scores… i would make it myself." Dashboard states facts; human judges risk | — Pending |
| A "scenario" = a **dimension pair**; build a flexible pivot explorer + saved presets, not bespoke fixed charts | Owner defined scenarios as Activity×Folder, Activity×Role, Role×Users, "so on so on" — combinatorial, so a generic engine + presets covers it | — Pending |
| Re-extract activity via the **free ACCDS web-session crawler** (no DC quota) as a **dedicated first phase**, gated before data-dependent views | Owner confirmed the refresh is free web-session scraping (`accds-activity-ingest.cjs`), NOT the quota-bound Data Connector; it's fast + free and writes `AccActivityAccds` (folder/object events that power the new Activity×Folder + hottest-files views). DC `AccActivity` refresh is optional/secondary | — Pending |

---
*Last updated: 2026-06-22 — milestone v3.0 (Access Analysis: Hub Story & Scenario Explorer) started*
