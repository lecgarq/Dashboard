# Technology Stack

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-02 — pins re-verified against `package.json`; deploy-gate note updated

---

## Languages

**Primary:**
- TypeScript 6.x (`^6.0.3`) — all application code under `app/`, `components/`, `lib/`, `server/`, and most `scripts/`
- Python 3.x — `services/lod-engine/server.py` (FastAPI image/LOD service) and `scripts/run_dev_stack.py`

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
- React `19.2.6` — UI component library
- tRPC `^11.17.0` (`@trpc/server`, `@trpc/client`, `@trpc/react-query`) — type-safe API boundary; routers at `server/routers/`; composed by `server/routers/root.ts`
- NextAuth `^5.0.0-beta.31` (`next-auth`) — session auth; providers in `server/auth.ts`; edge config in `auth.config.ts`
- Prisma `^7.8.0` + `@prisma/adapter-pg ^7.8.0` — ORM with PostgreSQL driver adapter; schema at `prisma/schema.prisma`; client at `server/db.ts`

**Testing:**
- Vitest `^4.1.6` — unit and integration tests (`npm run test`, excludes `**/tests/e2e/**`)
- Playwright `^1.59.1` — E2E tests (`npm run test:e2e`); targets `:3100` via `NEXT_DIST_DIR` isolation; cookie-auth minted for ACC graph tests
- `@testing-library/react ^16.3.2` — React component test helpers
- `fast-check ^3.23.2` — property-based testing used in some lib/acc modules

**Build / Dev:**
- Webpack (via `next build --webpack` and `next dev --webpack`) — explicit webpack flag (not Turbopack) due to DuckDB WASM alias requirements
- Tailwind CSS `^4.3.0` + `@tailwindcss/postcss ^4.3.0` — utility-first styling; dark zinc theme (`#09090B` background)
- shadcn `^4.7.0` (devDependency generator) + `radix-ui ^1.4.3` — accessible UI primitives
- ESLint `^10.3.0` + `eslint-config-next ^16.2.6` — linting (`npm run lint`)
- `patch-package ^8.0.1` — applied in `postinstall` hook
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
- `superjson ^2.2.6` — tRPC serialization of Date/BigInt types
- `next-themes ^0.4.6` — theme provider for zinc dark/light toggle

**3D / Graph (spatial-graph — explicitly in-scope):**
- `three ^0.184.0` — Three.js; used in `GraphCanvas3D.tsx` via InstancedMesh + OrbitControls (NOT via R3F)
- `@cosmos.gl/graph 3.0.0-beta.9` — GPU physics simulation for 2D layout in `AccessAnalysisShell.tsx`; NOTE: cosmos.gl v3 progress value is INVERTED (`1 - progress = alpha`)
- `d3-force-3d ^3.0.6` — 3D force simulation driving `physicsLayer.ts` PHYSICS BUS; note TWO-BUS ARCHITECTURE (physics bus vs mask bus — see `physicsLayer.ts`)
- `d3-force ^3.0.0` — 2D force helpers
- `d3-hierarchy ^3.1.2` — tree layout for `/forma-proposal` hierarchy view
- `@duckdb/duckdb-wasm ^1.33.1-dev45.0` — in-browser DuckDB for `duckdbClient.browser.ts`; WASM alias wired in `next.config.ts` (`@duckdb/duckdb-wasm$` → `duckdb-browser.mjs`; node stub in `lib/client/emptyDuckDbNode.ts`)
- `@uwdata/mosaic-core ^0.25.0` + `@uwdata/mosaic-sql ^0.25.0` + `@uwdata/vgplot ^0.25.0` — Mosaic cross-filter bridge between DuckDB and canvas in `CosmosCanvasClient.ts`
- `apache-arrow ^17.0.0` — Arrow table format used by Mosaic/DuckDB pipeline
- `@react-three/fiber ^9.6.1` — React Three Fiber; scoped to R3F accent surfaces ONLY: `/users` header and `/forma-proposal` background (`FormaParticleAccent.tsx`); NOT on data surfaces

**Collaboration:**
- `@hocuspocus/server ^4.0.0` + `@hocuspocus/extension-database ^4.0.0` + `@hocuspocus/extension-logger ^4.0.0` — Yjs CRDT server; started by `scripts/start-local.ps1` on `ws://localhost:4444`; logs to `logs/yjs.log`
- `@hocuspocus/provider ^4.0.0` — client Yjs provider
- `yjs ^13.6.30` + `y-protocols ^1.0.7` — CRDT document model
- `@tiptap/react ^3.23.1` + full Tiptap extension suite — rich-text wiki editor
- `ws ^8.20.0` — WebSocket transport for Yjs server

**Autodesk / ACC:**
- `@aps_sdk/authentication ^1.0.1` — APS OAuth 2-leg token acquisition
- `@aps_sdk/model-derivative ^1.2.1` — model derivative / viewer APIs
- `@aps_sdk/oss ^1.3.3` — Object Storage Service (bucket/file access)

**Google:**
- `googleapis ^171.4.0` — Chat, Gmail, Calendar, Directory, Drive, Sheets; listed as `serverExternalPackages` in `next.config.ts` (not bundled client-side)

**Other Infrastructure:**
- `pg ^8.20.0` — raw `pg` Pool for Prisma adapter; also used directly in some scripts
- `@upstash/redis ^1.38.0` — Upstash Redis REST client; lazy-initialized in `lib/redis.ts`; optional (returns `null` if env vars absent)
- `uploadthing ^7.7.4` + `@uploadthing/react ^7.3.3` — file upload; wired at `lib/server/uploadthing.ts`
- `openai ^6.37.0` — OpenAI API client; used in search/AI features
- `bcryptjs ^3.0.3` — password hashing for credentials auth provider
- `csv-parse ^6.2.1` — CSV parsing for DC ingest pipeline
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

**Electron (dev/optional):**
- `electron ^42.1.0` — desktop packaging; entrypoint `electron/main.cjs`; dev command `npm run desktop`

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
- Config: `eslint.config.mjs` (VERIFY: exact filename; `eslint ^10.3.0` uses flat config format)
- Extends `eslint-config-next`

**Tailwind:**
- Config: `tailwind.config.*` (VERIFY: exact filename; `^4.x` uses CSS-based config)
- PostCSS: `@tailwindcss/postcss ^4.3.0`

**Next.js:**
- Config: `next.config.ts`
- Key settings: webpack mode forced, DuckDB WASM alias, `serverExternalPackages` for Google libs, `optimisticClientCache`, `removeConsole` in production

**Prisma:**
- Schema: `prisma/schema.prisma` (64 models; includes the v2.2 Ph18 `AccFolderPermissionSummary` materialized projection)
- Generator: `prisma-client-js` + `prisma-erd-generator` (ERD → `docs/erd.md`)
- Client generation in `postinstall` hook: `prisma generate && patch-package && node scripts/copy-duckdb-wasm.cjs`
- Note (Ph18 deviation): `prisma migrate dev` chokes on the pgvector extension — the Ph18 projection shipped via a raw SQL migration; long server-side `INSERT .. SELECT` writes need the `$transaction` timeout widened (300s used)

**Vitest:**
- Config: `vitest.config.ts` (excluded from `tsconfig.json`)
- Command: `vitest run --exclude "**/tests/e2e/**"`

**Playwright:**
- Config: `playwright.config.*` (VERIFY: exact path)
- Runs against `:3100` with `NEXT_DIST_DIR=.next-e2e`; uses `NEXT_PUBLIC_ACC_GRAPH_TEST` flag

---

## Build / Deploy

**Local Deploy (primary):**
1. Stop Task Scheduler `LECG Dashboard` task (prevents port conflict — NEVER build while `:3000` is live)
2. `npx tsc --noEmit` — typecheck gate (must pass before build)
3. `npm run build` (`next build --webpack`) — compiles to `.next/`
4. Restart Task Scheduler task → `scripts/start-local.ps1` starts Next.js on `:3000` + Yjs on `:4444`

**Deploy mechanism:** rebuild the working tree's `.next` output; NOT a git merge. The running server reads the current checkout's `.next/`.

**GSD gate split (since v2.1):** the GSD `workflow.build_command` in `.planning/config.json` is `npx tsc --noEmit` **only** — the full `npm run build` + Task Scheduler restart + live route probes belong to `node scripts/gsd-self-gate.cjs --phase <N> --rebuild`, which stops `:3000` first. Do not run `npm run build` from a GSD post-merge step while the server is live.

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
- Python 3.x (for `services/lod-engine/` and `scripts/run_dev_stack.py`)
- PyTorch + HuggingFace Transformers (for LOD engine SigLIP model)
- Local PostgreSQL 18 (trust auth localhost; managed via `scripts/postgres-local.js`)
- Task Scheduler task `LECG Dashboard` (boot on logon)
- Task Scheduler task `LECG Postgres Local` (Postgres boot on logon)

**Production / Serving:**
- Same machine (`localhost:3000`) — no Railway, no remote deployment; `start-local.ps1` IS production
- Yjs collaboration server on `ws://localhost:4444`
- LOD engine on `http://127.0.0.1:8091` (default; `LOD_ENGINE_PORT` env var)

---

*Stack analysis: 2026-06-23 — verified from `package.json`, `tsconfig.json`, `next.config.ts`, `server/db.ts`, `auth.config.ts`, `scripts/start-local.ps1`, `physicsLayer.ts`, `CosmosCanvasClient.ts`, `GraphCanvas3D.tsx`, `services/lod-engine/server.py`, `.tools/repo-map/architecture-summary.md`. Refreshed 2026-07-02: all dependency pins re-checked against `package.json` (one correction: knip ^6.12.2).*
