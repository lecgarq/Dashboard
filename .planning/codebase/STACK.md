# Technology Stack

**Analysis Date:** 2026-05-19

## Languages

**Primary:**
- JavaScript/TypeScript ES2017+ - Full application (frontend, backend, scripts)
- Python 3.x - LOD (Level of Detail) engine and development orchestration

**Secondary:**
- SQL/PostgreSQL dialect - Database queries via Prisma
- WASM (WebAssembly) - DuckDB browser runtime (`@duckdb/duckdb-wasm`)

## Runtime

**Environment:**
- Node.js >= 22 (enforced in `package.json` engines)

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core:**
- Next.js 16.2.6 - Full-stack React framework (app router, API routes, middleware)
- React 19.2.6 - Component library
- TypeScript 6.0.3 - Type safety

**Database & ORM:**
- Prisma 7.8.0 - ORM with migrations
- PostgreSQL 18 - Primary database (local development, production via Railway/localhost)
- @prisma/adapter-pg 7.8.0 - Connection pooling and edge adaptime support

**Authentication:**
- NextAuth 5.0.0-beta.31 - Session management and OAuth delegation
- @auth/prisma-adapter 2.11.2 - Prisma + NextAuth integration

**API Layer:**
- tRPC 11.17.0 (@trpc/client, @trpc/server, @trpc/react-query) - End-to-end type-safe API
- Server Actions (Next.js experimental) - Form submissions and mutations

**Real-Time Collaboration:**
- Yjs 13.6.30 - Conflict-free replicated data type for shared editing
- @hocuspocus/server 4.0.0 - WebSocket collaboration server
- @hocuspocus/extension-database 4.0.0 - Persistent Yjs document storage
- @hocuspocus/extension-logger 4.0.0 - Server logging
- Tiptap 3.23.1 (core + React + extensions) - Rich-text collaborative editor

**Data Visualization & Analytics:**
- @cosmos.gl/graph 3.0.0-beta.9 - 3D force-directed graph rendering
- @uwdata/mosaic-core 0.25.0 - Interactive query coordinator
- @uwdata/mosaic-sql 0.25.0 - SQL query generation
- @uwdata/vgplot 0.25.0 - Declarative grammar for visualizations
- @duckdb/duckdb-wasm 1.33.1-dev45.0 - In-browser SQL analytics (self-hosted bundles)
- d3 modules (d3-force, d3-scale, d3-scale-chromatic, d3-time, d3-time-format, d3-hierarchy) 3.x - Data manipulation and scales
- ECharts 6.0.0 + echarts-for-react 3.0.6 - Business chart library
- Nivo 0.99.0 (@nivo/bar, @nivo/pie, @nivo/stream, @nivo/core) - Data visualization
- Three.js 0.184.0 - 3D graphics (used with Cosmos)
- Framer Motion 12.38.0 - Animation library

**UI & Styling:**
- Tailwind CSS 4.3.0 - Utility-first CSS
- Radix UI 1.4.3 - Accessible component primitives
- Shadcn/ui 4.7.0 - Pre-built Tailwind + Radix components
- Lucide React 1.14.0 - Icon library
- Sonner 2.0.7 - Toast notifications
- clsx 2.1.1 - Conditional className builder
- tailwind-merge 3.6.0 - Tailwind conflict resolution

**Data Handling & Formats:**
- Apache Arrow 17.0.0 - Columnar data format (for Mosaic/DuckDB results)
- csv-parse 6.2.1 - CSV parsing
- XLSX 0.20.3 - Excel workbook reading/writing
- react-pdf 10.4.1 - PDF viewer component
- Unzipper 0.12.3 - ZIP file extraction (for bulk exports)

**Form & Validation:**
- Zod 4.4.3 - Runtime schema validation

**Network & Real-Time:**
- ws 8.20.0 - WebSocket client library (Yjs, Hocuspocus)
- @tanstack/react-query 5.100.10 - Server state management
- SuperJSON 2.2.6 - Extended JSON serialization (for tRPC, complex types)

**File Uploading:**
- UploadThing 7.7.4 + @uploadthing/react 7.3.3 - Managed file upload service

**Text & Date Utilities:**
- date-fns 4.1.0 - Date formatting and manipulation

**Algorithms & Utilities:**
- p-limit 7.3.0 - Concurrency control (batch parallel operations)
- class-variance-authority 0.7.1 - Component variant management
- bcryptjs 3.0.3 - Password hashing
- stream-json 2.1.0 - Streaming JSON parsing (for large datasets)

**Testing:**
- Vitest 4.1.6 - Unit test runner (Vite-based, .test.ts files)
- @testing-library/react 16.3.2 - React component testing utilities
- JSDOM 29.1.1 - DOM emulation for Node.js
- Playwright 1.59.1 - E2E browser testing

**Build & Dev Tools:**
- Next.js build system (Webpack under the hood per next.config.ts)
- Tailwind CSS PostCSS 4.3.0 - CSS processing
- Sass 1.99.0 - SCSS support
- ESLint 10.3.0 - Linting
- Knip 6.12.2 - Dead code analysis
- tsx 4.21.0 - TypeScript execution (for Node.js scripts)
- patch-package 8.0.1 - Runtime patching of dependencies
- vite 8.0.12 - Build tool (for design system or preview)

**Mobile & Desktop:**
- Electron 42.1.0 - Desktop app shell
- @dnd-kit (core, sortable, utilities) 6.3+ - Drag-and-drop library
- @xyflow/react 12.10.2 - Node-based graph editor

**Google Workspace Integration:**
- googleapis 171.4.0 - Google APIs (Sheets, Drive, Gmail, Chat, Calendar, Directory)
- @google-cloud/local-auth - Local OAuth flow for Google service account
- google-auth-library - Token refresh and JWT validation

**AI/LLM:**
- OpenAI 6.37.0 - Chat completions API (for Revit family descriptions and analysis)

**Caching & Sessions:**
- @upstash/redis 1.38.0 - Serverless Redis client (APS search caching)

## Configuration

**Environment:**
- `.env` file required (see `.env.example`)
- Key env vars:
  - Database: `DATABASE_URL`, `DIRECT_URL` (PostgreSQL connection strings)
  - Auth: `NEXTAUTH_SECRET`, `AUTH_SECRET`, `BETTER_AUTH_SECRET`
  - Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_SHEETS_ID`
  - Google Service Account: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`
  - APS/Autodesk: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_CALLBACK_URL`, `APS_SCOPES`
  - OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`
  - UploadThing: `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID`, `UPLOADTHING_TOKEN`
  - Resend (email): `RESEND_API_KEY`, `RESEND_EMAIL`
  - Redis: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - Feature flags: `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS` (Phase redesign toggle)

**Build Configuration:**
- `next.config.ts` - Webpack aliases for DuckDB, bundle timeouts, server action origin allowlists
- `tsconfig.json` - TS compiler options, path aliases (`@/*` → root)
- `vitest.config.ts` - Unit test config
- `eslint.config.mjs` - Linting rules
- `postcss.config.mjs` - CSS processing pipeline

**Database Pooling:**
- Configurable via env: `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`
- Default: prod (max=5, idle=120s), dev (max=10, idle=10s)

## Platform Requirements

**Development:**
- Node.js >= 22
- Python 3.x (for `scripts/run_dev_stack.py`, LOD engine)
- PostgreSQL 18 (local install under `.local/postgresql18/`)
- npm package manager
- Recommended: VSCode with TypeScript support

**Production:**
- Node.js >= 22
- PostgreSQL 18 (hosted or containerized)
- Autodesk Platform Services (APS) credentials (OAuth 3-leg)
- Google Cloud credentials (OAuth 2-leg + service account)
- Upstash Redis (optional, for caching)
- UploadThing credentials (file storage)
- OpenAI API key (optional, for AI features)
- Resend or Gmail (email delivery)

**Deployment Target:**
- Railway (retired as of 2026-05-13, trial expired)
- Local development: Node.js server on Windows Task Scheduler (luis's PC, port 3000)
- Docker support (Dockerfile, Dockerfile.yjs for Hocuspocus server)

---

*Stack analysis: 2026-05-19*
