# Technology Stack

**Analysis Date:** 2026-06-19

**Primary Sources:**
- Fresh repo-map run: `.tools/repo-map/manifest.json` generated at `2026-06-19T22:30:32.287Z`
- Architecture digest: `.tools/repo-map/architecture-summary.md`
- Project manifest: `package.json`
- Build/test configs: `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`

## Languages

**Primary:**
- TypeScript - Main application, server routers, domain logic, tests, and scripts.
- TSX - Next.js App Router pages and React components under `app/` and `components/`.

**Secondary:**
- JavaScript/CJS/MJS - Runtime scripts, Electron entry point, config glue, and GSD/repo-map tooling.
- Python - LOD/image processing service under `services/lod-engine/`.
- SQL/Prisma schema - PostgreSQL schema, migrations, and generated ORM model definitions under `prisma/`.

## Runtime

**Environment:**
- Node.js `>=22` - Required by `package.json` and used for Next.js, tRPC, scripts, Prisma, repo-map, and Electron.
- Browser runtime - React 19 client surfaces, canvas/WebGL visualizations, DuckDB WASM, charts, and collaboration UI.
- Python 3.x - Required for `services/lod-engine/server.py` and `services/lod-engine/img_pipeline/`.

**Package Manager:**
- npm - Primary package manager.
- Lockfile: `package-lock.json` present.

## Frameworks

**Core:**
- Next.js `^16.2.6` - App Router web application and API routes.
- React `19.2.6` / React DOM `19.2.6` - UI runtime.
- tRPC `^11.17.0` - Typed API boundary through `server/trpc.ts`, `server/routers/root.ts`, and `app/api/trpc/[trpc]/route.ts`.
- Prisma `^7.8.0` with `@prisma/adapter-pg` - PostgreSQL ORM and adapter-based DB access.
- NextAuth `5.0.0-beta.31` - Authentication and route authorization.

**UI/Data Visualization:**
- Radix UI/shadcn components - Local UI primitives in `components/ui/`.
- TanStack React Query/Table/Virtual - Server state, table primitives, and virtualized lists.
- ECharts and `echarts-for-react` - Dashboard charts.
- `@cosmos.gl/graph`, `three`, `@react-three/fiber`, `d3-*`, `@uwdata/vgplot`, and Mosaic packages - Access-analysis graphing, layout, and analytics surfaces.
- TipTap, Yjs, and Hocuspocus - Collaborative editing and wiki-style rich text.

**Testing and Verification:**
- Vitest `^4.1.6` - Unit/component test runner.
- Playwright `^1.59.1` - E2E and UAT verification.
- TypeScript compiler `^6.0.3` - `npx tsc --noEmit` is a required engineering gate.
- repo-map toolchain - `repomix`, `dependency-cruiser`, and `@ast-grep/cli` driven by `scripts/repo-map/generate.cjs`.

**Build/Dev:**
- Next webpack build path - `next dev --webpack`, `next build --webpack`, and isolated `NEXT_DIST_DIR` builds.
- Tailwind CSS 4 via `@tailwindcss/postcss`.
- Electron `^42.1.0` for desktop entry point `electron/main.cjs`.
- Prisma ERD generation through `prisma-erd-generator`.

## Key Dependencies

**Critical:**
- `@prisma/client` / `@prisma/adapter-pg` - Database access through `server/db.ts`.
- `@trpc/server`, `@trpc/client`, `@trpc/react-query` - Typed API layer.
- `next-auth` and `@auth/prisma-adapter` - Auth/session persistence.
- `googleapis` - Gmail, Calendar, Drive, and service-account integrations.
- `@aps_sdk/authentication`, `@aps_sdk/model-derivative`, `@aps_sdk/oss` - Autodesk Platform Services integrations.
- `@duckdb/duckdb-wasm` and `apache-arrow` - Browser-side analytics/data processing in access-analysis.
- `uploadthing` / `@uploadthing/react` - File upload/media integration.
- `openai` - AI generation API integration.
- `@upstash/redis` / `ws` - Cache/realtime support where configured.

**Infrastructure and Tooling:**
- `dependency-cruiser` - Dependency graph and boundary rule reports.
- `repomix` - LLM-friendly source snapshots in `.tools/repo-map/`.
- `@ast-grep/cli` - Structural code scans for fetch/useEffect/router/Prisma patterns.
- `knip` - Unused-code/dependency analysis.
- `patch-package` - Local package patches under `patches/`.

## Configuration

**Environment:**
- Example file: `.env.example`.
- Required categories include auth (`AUTH_SECRET`, `NEXTAUTH_SECRET`), database (`DATABASE_URL`, `DIRECT_URL`), Google, Autodesk/APS, UploadThing, OpenAI, Resend, Redis/Upstash, and feature flags.
- Do not document or copy values from `.env`; only env var names belong in docs.

**Build and Runtime Config:**
- `next.config.ts` - Next config, DuckDB browser aliases, server external packages, allowed server-action origins, and package import optimization.
- `tsconfig.json` - Strict TypeScript with `@/*` path alias to repo root and broad project include.
- `eslint.config.mjs` - Ignore-focused ESLint config for generated/build/cache directories.
- `prisma.config.ts` and `prisma/schema.prisma` - Prisma configuration and schema.
- `proxy.ts`, `auth.config.ts`, `server/auth.ts` - Auth/routing guard surface.

## Platform Requirements

**Development:**
- Node.js 22 or newer.
- npm install with `postinstall` running Prisma generate, patch-package, and DuckDB WASM copy.
- PostgreSQL available through `DATABASE_URL` or `DIRECT_URL`.
- Python available for the LOD service when working in `services/lod-engine/`.
- Optional local DB helpers: `npm run db:start`, `npm run db:stop`, `npm run db:status`.

**Production/Runtime:**
- Next.js server/runtime with PostgreSQL.
- `server/db.ts` prefers `DIRECT_URL` in production when present and uses pool sizing env vars (`PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`).
- Image remotes are constrained in `next.config.ts` to UploadThing, UTFS, and Google profile image hosts.
- Local production start is wrapped by `scripts/start-router.cjs` and `scripts/start-production.cjs`.

## Codebase Map Tooling

**Refresh:**
```powershell
npm run repo-map:check
```

**Outputs:**
- `.tools/repo-map/manifest.json`
- `.tools/repo-map/architecture-summary.md`
- `.tools/repo-map/dependency-cruiser.json`
- `.tools/repo-map/dependency-graph.mmd`
- `.tools/repo-map/ast-grep-report.json`
- `.tools/repo-map/repomix/*.xml`

---

*Stack analysis: 2026-06-19*
*Update after major dependency, runtime, or deployment changes.*
