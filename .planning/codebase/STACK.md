# Technology Stack

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-16 — pins re-verified against `package.json` after the full dependency refresh (commit `0bfe0962`, 2026-07-14): cosmos.gl 3.3.0, three 0.185, googleapis 173, csv-parse 7, fast-check 4, electron 43, Tiptap 3.27; `ws`/`y-protocols` no longer direct deps; Task Scheduler task name corrected to `LECG Dashboard Local`
**Refreshed:** 2026-07-20 — post v2.5 "Living Graph" close (phases 29–33, close commit `04d26799`): no `package.json` dependency changes since 2026-07-16 (all pins re-checked, still exact); added the Python PaCMAP embedding pipeline (then `scripts/compute_instance_embeddings.py`) and the shared SSR-hydration fix (`lib/server/hydrationState.ts`). Working tree carries the in-flight access-analysis redesign (branch `feat/access-analysis-redesign`, uncommitted) — no stack/dependency impact, mostly `app/(dashboard)/access-analysis` + `/users` component churn and legacy-file deletions.
**Refreshed:** 2026-07-22 — post v2.7 "Activity Universe" close (commits through `c998db1e`): no `package.json` dependency changes since `0bfe0962` (2026-07-14; re-verified via `git log -- package.json`). Instance-embedding pipeline RETIRED (`c28cb962` — `scripts/compute_instance_embeddings.py`, `scripts/build-instance-features.ts`, and the `AccInstanceEmbedding` model are gone); replaced by the activity-event embedding pipeline (`scripts/compute_activity_embeddings.py` → `AccActivityEmbedding` → `scripts/build-activity-universe-payload.ts` binary artifact, ~4.9M events / ~149.7MB served by `app/api/activity-universe/payload/route.ts`). `patches/@cosmos.gl+graph+3.3.0.patch` grew to 4 LECG hunks (see patch-package entry).
**Refreshed:** 2026-07-23 — activity-universe 2D/3D pass (commits `1c346714`..`7d1420b9`) plus uncommitted working-tree WIP. `package.json` STILL unmodified since `0bfe0962` (re-verified: `git log 956408d1..HEAD -- package.json` and `git diff -- package.json` are both empty) — every pin below stands. Three genuinely new things: (1) `scripts/compute_activity_embeddings.py` gained `--components {2,3}` (plus `--single-fit`), writing a TRUE 3D PaCMAP sidecar into an `AccActivityEmbedding3D` table it creates itself in raw SQL (NOT in `prisma/schema.prisma` — model count still 65); (2) `scripts/build-activity-universe-payload.ts` emits two new payload columns, `positions3` (u16-quantized via the new `lib/acc/positions3Quant.ts`) and `weekId` (UNCOMMITTED WIP, derived via the new `lib/acc/activityWeeks.ts`); (3) `three` is now imported by a DATA surface — `app/(dashboard)/users/access-analysis/activity/ActivityUniverse3D.tsx` — under the owner-approved 2D/3D universe toggle. Served artifact grew to 196,196,404 bytes (196.2 MB) / 4,904,886 rows.

---

## Languages

**Primary:**
- TypeScript 6.x (`^6.0.3`) — all application code under `app/`, `components/`, `lib/`, `server/`, and most `scripts/`
- Python 3.x — `services/lod-engine/server.py` (FastAPI image/LOD service), `scripts/run_dev_stack.py`, and `scripts/compute_activity_embeddings.py` (v2.7 Ph38 EMB-07 activity-universe embedding pipeline: reads the UNIFIED activity corpus straight from PostgreSQL via `psycopg` (`DIRECT_URL`/`DATABASE_URL`), hashed one-hot author+event features joined from the `.embedding/activity-author-attributes.json` sidecar, full-fit PaCMAP 2D projection with `random_state=42` + determinism double-run + trustworthiness gate, then TRUNCATE+COPY into `AccActivityEmbedding`; deps `numpy`, `pacmap`, `scikit-learn` (trustworthiness), `psycopg`, optional `psutil` (RSS cap); unit tests in `scripts/test_compute_activity_embeddings.py`; spike lineage `scripts/spike_activity_embedding_estimate.py`). Since 2026-07-23 (`ae195f00`) the same script also runs a 3D sidecar mode: `--components 3` re-fits PaCMAP with `n_components=3` over the SAME corpus/features/seed and COPYs `(id, x, y, z, embeddingRunId)` into `AccActivityEmbedding3D`, a table the script `CREATE TABLE IF NOT EXISTS`-es itself in raw SQL (deliberately not `prisma db push` — that drops the expression indexes on the activity tables). 3D mode writes its own gate file `.embedding/activity-embedding-gate-3d.json` and NEVER touches the canonical 2D table or `activity-universe-dicts.json`. A companion `--single-fit` flag skips the fit#2 determinism proof and says so in the log. The former per-instance pipeline (`scripts/compute_instance_embeddings.py` + `scripts/build-instance-features.ts`) was RETIRED in v2.7 Ph39 (commit `c28cb962`) — do not cite it.

**Secondary:**
- JavaScript (`.cjs`, `.mjs`, `.js`) — operational scripts in `scripts/` that run as Node CJS outside Next.js bundler

---

## Runtime

**Environment:**
- Node.js `>=22` (enforced in `package.json` `"engines"` field)

**Package Manager:**
- npm (lockfile: `package-lock.json` — present, committed)

---

## Frameworks

**Core:**
- Next.js `^16.2.6` (App Router, webpack build mode) — all UI routing and SSR. Build command: `next build --webpack`
- React `19.2.7` — UI component library
- tRPC `^11.17.0` (`@trpc/server`, `@trpc/client`, `@trpc/react-query`) — type-safe API boundary; routers at `server/routers/`; composed by `server/routers/root.ts`
- NextAuth `^5.0.0-beta.31` (`next-auth`) — session auth; providers in `server/auth.ts`; edge config in `auth.config.ts`
- Prisma `^7.8.0` + `@prisma/adapter-pg ^7.8.0` — ORM with PostgreSQL driver adapter; schema at `prisma/schema.prisma`; client at `server/db.ts`

**Testing:**
- Vitest `^4.1.6` — unit and integration tests (`npm run test`, excludes `**/tests/e2e/**`)
- Playwright `^1.59.1` — E2E tests (`npm run test:e2e`); targets `:3100` via `NEXT_DIST_DIR` isolation; cookie-auth minted for ACC graph tests
- `@testing-library/react ^16.3.2` — React component test helpers
- `fast-check ^4.9.0` — property-based testing used in some lib/acc modules

**Build / Dev:**
- Webpack (via `next build --webpack` and `next dev --webpack`) — explicit webpack flag (not Turbopack) due to DuckDB WASM alias requirements
- Tailwind CSS `^4.3.0` + `@tailwindcss/postcss ^4.3.0` — utility-first styling; dark zinc theme (`#09090B` background)
- shadcn `^4.7.0` (devDependency generator) + `radix-ui ^1.4.3` — accessible UI primitives
- ESLint `^10.3.0` + `eslint-config-next ^16.2.6` — linting (`npm run lint`)
- `patch-package ^8.0.1` — applied in `postinstall` hook. Two patches live in `patches/`: `server-only+0.0.1.patch` and `@cosmos.gl+graph+3.3.0.patch`. The cosmos.gl patch carries FOUR LECG hunks (all tagged `[LECG patch]` in the diff): (1) `GraphData.update()` memoization — per-frame `render()` calls with identical input arrays skip the adjacency/degree/color/size rebuilds; (2) GLSL position-clamp removal — the `clamp(pointPosition, 0, spaceSize)` lines are commented out so positions run unclamped; (3) same-count `setPointPositions` upload skip — a position upload with an unchanged point count no longer re-flags colors/sizes/shapes/links/cluster/force GPU state; (4) `powerPreference: "high-performance"` on device creation — dual-GPU machines otherwise lottery onto the iGPU (1–20fps vs 55–70fps). These hunks MUST survive any dependency refresh: re-diff and re-roll the patch after every cosmos.gl (or lockfile-subtree) bump, then verify `patch-package` applies cleanly in `postinstall`.
- `repomix ^1.14.1` — source digest generation for `scripts/repo-map/`
- `dependency-cruiser ^17.4.3` — import graph and boundary enforcement (`npm run repo-map:check`)
- `knip ^6.12.2` — unused exports/files detection (`npm run knip`)

---

## Key Dependencies

**Critical (runtime):**
- `echarts ^6.1.0` + `echarts-for-react ^3.0.6` — all dashboard charts; colors must resolve from active theme via `useTheme`
- `@tanstack/react-query ^5.100.14` — client-side data fetching and cache; staleTime 5–10 min, `refetchOnWindowFocus:false`
- `@tanstack/react-table ^8.21.3` — DataTable primitives across workshop pages
- `@tanstack/react-virtual ^3.13.24` — virtual list rendering
- `framer-motion ^12.40.0` — animation primitives; motion budget ≤200ms for drill interactions
- `zustand ^5.0.14` — lightweight client state (access-analysis filter state, Mosaic selections)
- `zod ^4.4.3` — input validation on tRPC procedures and form boundaries
- `superjson ^2.2.6` — tRPC serialization of Date/BigInt types; ALSO the shared SSR-hydration boundary fix `lib/server/hydrationState.ts` (`deserializeHydrationState`, v2.5 Ph33 PERF-05): `createServerSideHelpers().dehydrate()` returns a superjson-wrapped `{json,meta}` object that App Router `<HydrationBoundary>` cannot hydrate — must deserialize first or every prefetched query silently refetches; consumed by `app/(dashboard)/layout.tsx`, `users/page.tsx`, `users/spatial-graph/page.tsx`
- `next-themes ^0.4.6` — theme provider for zinc dark/light toggle

**3D / Graph (spatial-graph — explicitly in-scope):**
- `three ^0.185.1` — Three.js; direct importers at HEAD: `app/(dashboard)/users/access-analysis/PersonGraph3D.tsx` (3D physics graph, behind `NEXT_PUBLIC_ACC_3D_GRAPH`), `app/(dashboard)/users/access-analysis/activity/ActivityUniverse3D.tsx` (NEW 2026-07-23, `77e55c05`/`ae195f00` — raw `THREE.Points` + `ShaderMaterial` point cloud, `THREE.LineSegments` author links, and `three/examples/jsm/controls/OrbitControls.js`; NOT React Three Fiber), plus the R3F accent surfaces `HeaderParticleAccent.tsx` and `FormaParticleAccent.tsx` (the former `GraphCanvas3D.tsx` no longer exists). NOTE the boundary nuance: `ActivityUniverse3D` puts WebGL on a data surface, which the repo rule otherwise forbids — it exists because the owner explicitly widened scope to a 2D/3D universe toggle; treat it as the approved exception, not a precedent for other analytics panels. The group-by morph is GPU-side (`uMix` uniform over `position`/`aTarget` attributes), so no per-frame CPU buffer writes
- `@cosmos.gl/graph 3.3.0` (exact pin; upgraded from `3.0.0-beta.9` in the 2026-07-14 dep refresh) — GPU physics simulation for the 2D graph under `app/(dashboard)/users/access-analysis/` (`AccessAnalysisShellClient.tsx` / `GraphCanvas2D.tsx` — the old `AccessAnalysisShell.tsx` name is gone); patched locally via `patches/@cosmos.gl+graph+3.3.0.patch` (4 LECG hunks — see patch-package entry above; hunks must survive dependency refreshes); NOTE: cosmos.gl v3 progress value is INVERTED (`1 - progress = alpha`) — version-sensitive, re-verify on any further cosmos.gl bump
- `d3-force-3d ^3.0.6` — 3D force simulation driving `physicsLayer.ts` PHYSICS BUS; note TWO-BUS ARCHITECTURE (physics bus vs mask bus — see `physicsLayer.ts`)
- `d3-force ^3.0.0` — 2D force helpers
- `d3-hierarchy ^3.1.2` — tree layout for `/forma-proposal` hierarchy view
- `@duckdb/duckdb-wasm ^1.33.1-dev45.0` — in-browser DuckDB for `app/(dashboard)/users/access-analysis/duckdbClient.ts` (the separate `duckdbClient.browser.ts` file is gone — consolidated; browser behavior tested in `duckdbClient.browser.test.ts`); WASM alias wired in `next.config.ts` (`@duckdb/duckdb-wasm$` → `duckdb-browser.mjs`; node stub in `lib/client/emptyDuckDbNode.ts`)
- `@uwdata/mosaic-core ^0.25.0` + `@uwdata/mosaic-sql ^0.25.0` + `@uwdata/vgplot ^0.25.0` — Mosaic cross-filter bridge between DuckDB and canvas in `CosmosCanvasClient.ts`
- `apache-arrow ^17.0.0` — Arrow table format used by Mosaic/DuckDB pipeline
- `@react-three/fiber ^9.6.1` — React Three Fiber; scoped to R3F accent surfaces ONLY: `/users` header and `/forma-proposal` background (`FormaParticleAccent.tsx`); NOT on data surfaces

**Collaboration:**
- `@hocuspocus/server ^4.0.0` + `@hocuspocus/extension-database ^4.0.0` + `@hocuspocus/extension-logger ^4.0.0` — Yjs CRDT server; started by `scripts/start-local.ps1` on `ws://localhost:4444`; logs to `logs/yjs.log`
- `@hocuspocus/provider ^4.0.0` — client Yjs provider
- `yjs ^13.6.30` — CRDT document model (`y-protocols` no longer a direct dependency — transitive via Hocuspocus)
- `@tiptap/react ^3.27.4` + full Tiptap extension suite (all pinned `^3.27.4`; exact-peer deadlock during upgrades — purge the lockfile subtree) — rich-text wiki editor
- WebSocket transport for the Yjs server is transitive via `@hocuspocus/server` (`ws` no longer a direct dependency)

**Autodesk / ACC:**
- `@aps_sdk/authentication ^1.0.1` — APS OAuth 2-leg token acquisition
- `@aps_sdk/model-derivative ^1.2.1` — model derivative / viewer APIs
- `@aps_sdk/oss ^1.3.3` — Object Storage Service (bucket/file access)

**Google:**
- `googleapis ^173.0.0` — Chat, Gmail, Calendar, Directory, Drive, Sheets; listed as `serverExternalPackages` in `next.config.ts` (not bundled client-side)

**Other Infrastructure:**
- `pg ^8.20.0` — raw `pg` Pool for Prisma adapter; also used directly in some scripts
- `@upstash/redis ^1.38.0` — Upstash Redis REST client; lazy-initialized in `lib/redis.ts`; optional (returns `null` if env vars absent)
- `uploadthing ^7.7.4` + `@uploadthing/react ^7.3.3` — file upload; wired at `lib/server/uploadthing.ts`
- `openai ^6.37.0` — OpenAI API client; used in search/AI features
- `bcryptjs ^3.0.3` — password hashing for credentials auth provider
- `csv-parse ^7.0.1` — CSV parsing for DC ingest pipeline
- `unzipper ^0.12.3` — ZIP extraction for Data Connector CSV archives
- `xlsx` (SheetJS CDN `0.20.3`) — spreadsheet export (installed from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`)
- `sonner ^2.0.7` — toast notifications
- `lucide-react ^1.14.0` — icon library
- `react-pdf ^10.4.1` — PDF viewer
- `date-fns ^4.1.0` — date utilities
- `p-limit ^7.3.0` — concurrency limiter for DC ingest batch operations
- `d3-scale-chromatic ^3.1.0` — color scales for chart dimension coloring
- `@dnd-kit/core ^6.3.1` + `@dnd-kit/sortable ^10.0.0` — drag-and-drop for form and table reordering
- `class-variance-authority ^0.7.1` + `clsx ^2.1.1` + `tailwind-merge ^3.6.0` — Tailwind class utilities
- `tsx ^4.21.0` — direct TS script execution (e.g. `scripts/sync-acc-users.ts`, `scripts/build-activity-universe-payload.ts`, `scripts/build-activity-author-attributes.ts`)
- `server-only ^0.0.1` — build-time guard against server modules leaking into client bundles
- `playwright ^1.59.1` — also a runtime dependency (ACCDS session login `scripts/accds-login.cjs`), not just the test runner

**Electron (dev/optional):**
- `electron ^43.1.0` — desktop packaging; entrypoint `electron/main.cjs`; dev command `npm run desktop`

**Overrides:**
- `@hono/node-server` pinned to `1.19.14`
- `effect` pinned to `3.21.2`
- `postcss` pinned to `8.5.14`

---

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- `strict: true`, `noImplicitAny: false`, `noEmit: true`, `module: esnext`, `moduleResolution: bundler`
- Path alias: `@/*` → `./*` (repo root)
- `next build` typechecks the ENTIRE tree including test files (no `ignoreBuildErrors`); run `npx tsc --noEmit` before rebuilding

**ESLint:**
- Config: `eslint.config.mjs` (flat config; verified at repo root)
- Extends `eslint-config-next`

**Tailwind:**
- No `tailwind.config.*` file exists — Tailwind `^4.3.0` uses CSS-based configuration
- PostCSS: `@tailwindcss/postcss ^4.3.0`

**Next.js:**
- Config: `next.config.ts`
- Key settings: webpack mode forced, DuckDB WASM alias, `serverExternalPackages` for Google libs, `optimisticClientCache`, `removeConsole` in production

**Prisma:**
- Schema: `prisma/schema.prisma` (65 models; includes the v2.2 Ph18 `AccFolderPermissionSummary` materialized projection, `AccIssueType`, and the v2.7 Ph38 `AccActivityEmbedding` model — one row per unified activity event with PaCMAP `x`/`y` positions and dictionary-coded attribute columns whose labels live in `.embedding/activity-universe-dicts.json`; created via raw-SQL migration + `prisma migrate resolve` because the pgvector shadow DB breaks `migrate dev`. The former `AccInstanceEmbedding` model was DROPPED in v2.7 Ph39 — commit `c28cb962`, raw migration `prisma/migrations-raw/2026-07-21-drop-acc-instance-embedding.sql`)
- TRAP (2026-07-23): `AccActivityEmbedding3D` is a REAL table but NOT a Prisma model — `scripts/compute_activity_embeddings.py --components 3` creates it with raw `CREATE TABLE IF NOT EXISTS` and the payload builder reads it with `$queryRawUnsafe`. `grep '^model '` on `prisma/schema.prisma` therefore still returns 65; do not "fix" the count by adding a model, and do not expect `prisma db push`/`migrate` to know about this table
- Generator: `prisma-client-js` + `prisma-erd-generator` (ERD → `docs/erd.md`)
- Client generation in `postinstall` hook: `prisma generate && patch-package && node scripts/copy-duckdb-wasm.cjs`
- Note (Ph18 deviation): `prisma migrate dev` chokes on the pgvector extension — the Ph18 projection shipped via a raw SQL migration; long server-side `INSERT .. SELECT` writes need the `$transaction` timeout widened (300s used)

**Vitest:**
- Config: `vitest.config.ts` (excluded from `tsconfig.json`)
- Command: `vitest run --exclude "**/tests/e2e/**"`

**Playwright:**
- Config: `playwright.config.ts` (repo root)
- Runs against `:3100` with `NEXT_DIST_DIR=.next-e2e`; uses `NEXT_PUBLIC_ACC_GRAPH_TEST` flag
- Port/base URL overrides: `E2E_PORT` (default `3100`), `E2E_BASE_URL` (default `http://localhost:${E2E_PORT}`)
- ESCAPE HATCH (`55625c91`, 2026-07-23): `reuseExistingServer` is now `Boolean(process.env.E2E_REUSE_SERVER)` instead of hard `false`. The suite's own `next dev --webpack` server on `:3100` currently 500s on every route (the known no-working-dev-server trap), so the working path is: build an isolated prod bundle (`next build --webpack` with `NEXT_DIST_DIR=.next-e2e`), `next start` it, then run the suite with `E2E_REUSE_SERVER=1` + `E2E_BASE_URL` pointed at it
- Activity-universe e2e specs need BOTH `NEXT_PUBLIC_ACC_GRAPH_TEST=1` and `ACC_ACTIVITY_TEST_FIXTURE=1` or the payload route serves the real 196.2 MB artifact (see `tests/e2e/activity-universe-view-toggle.spec.ts`)

---

## Build / Deploy

**Local Deploy (primary):**
1. Stop Task Scheduler `LECG Dashboard Local` task (prevents port conflict — NEVER build while `:3000` is live)
2. `npx tsc --noEmit` — typecheck gate (must pass before build)
3. `npm run build` (`next build --webpack`) — compiles to `.next/`
4. Restart Task Scheduler task → `scripts/start-local.ps1` starts Next.js on `:3000` + Yjs on `:4444`

**Deploy mechanism:** rebuild the working tree's `.next` output; NOT a git merge. The running server reads the current checkout's `.next/`.

**Build gate:** run `npx tsc --noEmit` before the full build. A local deploy
must stop the scheduled task and free `:3000`, run `npm run build`, restart the
task, and probe the changed routes. See the LECG deploy sequence; never build
over the live server.

**Dev stack:**
- `npm run dev` → `python scripts/run_dev_stack.py` — orchestrates Next.js dev + Yjs server
- `npm run dev:next` → `node scripts/patch-env.js && next dev --webpack -H 0.0.0.0 --port 3000`
- `scripts/start-local.ps1` — full local boot: `prisma migrate deploy` → Yjs background → Next.js foreground

**Repo-map toolchain:**
- Generate: `npm run repo-map` → `node scripts/repo-map/generate.cjs`
- Check: `npm run repo-map:check` → generate + `node scripts/repo-map/check.cjs`
- Outputs: `.tools/repo-map/architecture-summary.md`, `.tools/repo-map/dependency-cruiser.json`, `.tools/repo-map/ast-grep-report.json`, `.tools/repo-map/repomix/` zone files

---

## Platform Requirements

**Development:**
- Windows 11 (primary; PowerShell scripts `start-local.ps1`, `dc-daily-cron.ps1`)
- Node.js >=22
- Python 3.x (for `services/lod-engine/`, `scripts/run_dev_stack.py`, `scripts/compute_activity_embeddings.py`)
- PyTorch + HuggingFace Transformers (for LOD engine SigLIP model)
- numpy + pacmap + scikit-learn + psycopg (+ optional psutil) — for the activity-universe embedding pipeline (`scipy` no longer imported anywhere in `scripts/` after the instance-pipeline retirement)
- Local PostgreSQL 18 (trust auth localhost; managed via `scripts/postgres-local.js`)
- Task Scheduler task `LECG Dashboard Local` (boot on logon)
- Task Scheduler task `LECG Postgres Local` (Postgres boot on logon)

**Production / Serving:**
- Same machine (`localhost:3000`) — no Railway, no remote deployment; `start-local.ps1` IS production
- Yjs collaboration server on `ws://localhost:4444`
- LOD engine on `http://127.0.0.1:8091` (default; port override env var is `LOD_QUERY_ENCODER_PORT` in `services/lod-engine/server.py`)

---

*Stack analysis: 2026-06-23 — verified from `package.json`, `tsconfig.json`, `next.config.ts`, `server/db.ts`, `auth.config.ts`, `scripts/start-local.ps1`, `physicsLayer.ts`, `CosmosCanvasClient.ts`, `GraphCanvas3D.tsx`, `services/lod-engine/server.py`, `.tools/repo-map/architecture-summary.md`. Refreshed 2026-07-16: all pins re-checked against `package.json` after the 2026-07-14 dependency refresh (commit `0bfe0962`); config filenames, Prisma model count (65), and Task Scheduler task name verified against the tree. Refreshed 2026-07-20 (post v2.5): pins unchanged; Python pipeline verified from the then-current `scripts/compute_instance_embeddings.py`; hydration fix verified from `lib/server/hydrationState.ts` + its three page consumers; Prisma model count re-verified (65). Refreshed 2026-07-22 (post v2.7 close): pins unchanged since `0bfe0962`; activity pipeline verified from `scripts/compute_activity_embeddings.py`, `scripts/build-activity-universe-payload.ts`, `lib/server/activityUniversePayload.ts`, `app/api/activity-universe/payload/route.ts`, and `prisma/schema.prisma` (`AccActivityEmbedding`; model count still 65); cosmos.gl patch hunks read directly from `patches/@cosmos.gl+graph+3.3.0.patch`; artifact size verified on disk (`.embedding/activity-universe.bin` = 156,957,160 bytes ≈ 149.7MB, meta count 4,904,886 events). Refreshed 2026-07-23: `package.json` re-verified UNCHANGED since `0bfe0962` (empty `git log 956408d1..HEAD -- package.json` and empty `git diff -- package.json`) — no pin edited this pass; `--components 3` / `--single-fit` / `AccActivityEmbedding3D` read from `scripts/compute_activity_embeddings.py`; `positions3` + `weekId` columns and the `TS_JOIN` back to `AccActivity`/`AccActivityAccds` read from `scripts/build-activity-universe-payload.ts` (weekId hunk is UNCOMMITTED working tree); `lib/acc/positions3Quant.ts` and `lib/acc/activityWeeks.ts` read in full (the latter untracked/uncommitted); `three` importer list re-grepped across `app`/`components`/`lib`; Prisma `^model ` count re-counted (65, `AccActivityEmbedding3D` absent by design); Playwright hatch read from `playwright.config.ts`; artifact re-measured on disk (`.embedding/activity-universe.bin` = 196,196,404 bytes ≈ 196.2 MB, meta `count` = 4,904,886).*
