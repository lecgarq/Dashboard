# Repo Architecture

> Top-level structure of the LECG Dashboard. A Next.js 16 (App Router) + tRPC + Prisma/Postgres app with a
> WebGL graph feature (cosmos.gl + three.js) and a DuckDB-WASM analytics layer.
> See [index](./index.md) · [data-pipeline](./data-pipeline.md) · [access-analysis-graph](./access-analysis-graph.md).

## Stack (from `package.json`)

- **Framework:** Next.js `^16` (App Router, `--webpack`), React `19.2`.
- **API:** tRPC `^11` (`server/trpc.ts`, routers under `server/routers/`).
- **DB:** Prisma `^7.8` + Postgres (`@prisma/adapter-pg`); local PG via `npm run db:start`.
- **Graph:** `@cosmos.gl/graph` (2D), `three` (3D), `d3-force` / `d3-force-3d`.
- **Analytics:** DuckDB-WASM (`@duckdb/duckdb-wasm`), Mosaic (`@uwdata/mosaic-*`, `@sqlrooms/*`), apache-arrow.
- **Auth:** NextAuth `^5` beta (`auth.config.ts`, `server/auth.ts`).
- **Tests:** Vitest `^4` (+ fast-check), Playwright `^1.59`.
- **Desktop:** Electron (`electron/`). Realtime: Yjs / Hocuspocus.

## Top-level folders

| Path | What it is | Touch policy |
|------|-----------|--------------|
| `app/` | Next.js App Router routes, pages, API handlers. Route groups like `(dashboard)`. | App code — only with a task mandate. |
| `server/` | tRPC backend: `routers/`, `actions/`, `trpc.ts`, `auth.ts`, `db.ts`. | Backend — mandate required. |
| `lib/` | Shared libraries. `lib/acc/` (ACC domain logic), `lib/server/` (server-only helpers), `lib/client/`, `lib/core/`, `lib/colors/`, `lib/google/`, etc. | Mixed; `lib/acc` is heavily tested domain logic. |
| `components/` | Shared React components (non-feature-specific). | App code. |
| `hooks/` | Shared React hooks. | App code. |
| `prisma/` | `schema.prisma` (DB models), migrations, `prisma.config.ts`. | Schema changes are high-impact; plan first. |
| `services/` | Out-of-process services (e.g. `lod-engine` Python). | Service code. |
| `scripts/` | Node/Python operational scripts (DC ingest, postgres-local, dev stack, `scratch/` discovery). | Read-only discovery is safe; ingest scripts are operational. |
| `tests/` | `tests/e2e/` Playwright specs. (Unit tests live beside source as `*.test.ts`.) | Test map only for docs work. |
| `playwright/`, `playwright-report/`, `test-results/` | Playwright runtime + generated reports. | **Generated** — do not hand-edit. |
| `docs/` | Documentation. `docs/superpowers/` is the active workflow/spec/plan/research/codebase-map home; `docs/archive/` holds retired GSD planning. | Docs — this package lives here. |
| `electron/` | Electron desktop shell. | App code. |
| `adapters/` | Integration adapters (has its own `CLAUDE.md`). | Mandate required. |
| `public/`, `patches/`, `types/` | Static assets, patch-package patches, ambient types. | Patches/types are infra. |
| `node_modules/`, `.next/`, `tsconfig.tsbuildinfo` | Installed deps / build output / TS cache. | **Generated** — never edit or stage. |

## `app/` structure (the graph feature)

```
app/(dashboard)/users/access-analysis/
  page.tsx                      # server entry: prefetch + hydrate → AccessAnalysisShellClient
  AccessAnalysisShellClient.tsx # client boundary
  AccessAnalysisShell.tsx       # orchestrator: calls accDcGraph.bulkUsers, mounts GraphCanvas
  GraphCanvas.tsx               # 2D/3D dispatcher (both always mounted; CSS-visibility switch)
  GraphCanvas2D.tsx             # cosmos.gl renderer        [renderer — forbidden casual edit]
  GraphCanvas3D.tsx             # three.js renderer         [renderer — forbidden casual edit]
  GraphInteractions.tsx         # hover/click/lasso wiring  [interaction]
  LassoOverlay.tsx              # lasso selection           [forbidden casual edit]
  UserDetailPanel.tsx           # node detail panel         [forbidden casual edit]
  dimensionRegistry.ts          # 9 dimensions (source of truth)
  featureTargets.ts             # dimension → layout target anchors
  SliderContext.tsx / SliderSidebar.tsx / DimensionSlider.tsx  # controls
  mathLayer.ts / physicsLayer.ts / layoutStats.ts / positionsCache.ts  # layout [physics — forbidden]
  nodeColors.ts                 # color modes
  sameUserEdges.ts / linkEmphasis.ts  # edges [forbidden casual edit]
  graphTables.ts                # BulkAccUser[] → Arrow tables (graph_* DuckDB)
  featureSnapshot.ts            # DuckDB query → NodeFeatureSnapshot[]
  interactionTypes.ts           # NodeFeatureSnapshot + interaction types
  duckdbClient.ts               # DuckDB-WASM client
  graphTestBridge.ts            # window.__ACC_GRAPH_TEST__ observation bridge
  ChartPanel/HistogramPanel/DonutPanel/HeatmapPanel/... # analytics charts (Mosaic/vgplot)
  *.test.ts(x), __tests__/      # co-located unit tests
```

## server / lib structure (the data pipeline)

```
server/routers/acc-dc-graph.ts  # bulkUsers tRPC procedure (adminProcedure)
lib/server/acc-hot-cache.ts     # getCachedAccDcBulkUsers — versioned in-memory cache + DB queries
lib/acc/dcUserAssembly.ts       # assembleDcUsers — pure DB rows → BulkAccUser shape
lib/acc/acc-types.ts            # BulkAccUser / BulkAccProject types
lib/acc/activityAggregate.ts    # foldActivityRows (P5-C, T1-owned)
lib/acc/activityCategories.ts   # rawAction → ActivityCategory
lib/server/acc-route-hydration.ts # SSR prefetch of bulkUsers for the page
```
`lib/acc/` also holds the DC ingest pipeline (`dcIngest`, `dcActivityCsvIngest`, `dcAdminCsvIngest`,
`dcQuota`, `dcProjectDiscovery`, …) and analytics (`dashboardAnalytics`, `companyAnalytics`, …) — each with
a co-located `*.test.ts`.

## `docs/superpowers/` structure

```
docs/superpowers/
  workflows/        # durable process docs (undated) + templates/  ← rules of the road
  codebase-map/     # THIS package (undated)                       ← the map
  specs/            # dated design specs  YYYY-MM-DD-<slug>-design.md
  plans/            # dated implementation plans  YYYY-MM-DD-<slug>.md  (checkbox tasks)
  research/         # dated data/research findings  (.md + .json)
```

## Tests structure

- **Unit/integration:** Vitest, co-located `*.test.ts(x)` beside source, plus `__tests__/` dirs.
  Specializations: `*.purity.test.ts` (pure-function invariants), `physicsClustering.test.ts`,
  `*.coverage*.test.ts`.
- **E2E:** `tests/e2e/acc-dc-graph.spec.ts` (Playwright). Config: `playwright.config.ts`.
- See [testing-and-gates.md](./testing-and-gates.md).

## Generated / cache / data areas (do not hand-edit or stage)

- `.next/`, `node_modules/`, `tsconfig.tsbuildinfo` — build output / deps / TS cache.
- `playwright-report/`, `test-results/`, `playwright/.cache` — test artifacts.
- DuckDB `graph_*` tables — built at runtime from Arrow, not files.
- `logs/`, `scratch/`, `*.png` screenshots at repo root — operational/manual artifacts.

## What not to touch casually

- **Renderers / physics / edges / lasso / camera / interaction internals** — `GraphCanvas2D/3D`,
  `physicsLayer`, `mathLayer`, `sameUserEdges`, `linkEmphasis`, `LassoOverlay`, `UserDetailPanel`.
- **Router / nav / routes** — `server/routers/*`, `page.tsx`, route groups.
- **T1's active P5-C files** — see [active-wip-boundaries.md](./active-wip-boundaries.md).
- **`prisma/schema.prisma`** — schema changes ripple through the whole pipeline; plan + data-discovery first.
- **Generated areas** above.
- **Root `CLAUDE.md` / `.claude/skills/`** — do not create without explicit direction (none exist today).
