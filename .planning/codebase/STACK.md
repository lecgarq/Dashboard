# Technology Stack

**Analysis Date:** 2026-06-17

## Languages

**Primary:**
- TypeScript 6.0.3 - Full codebase, server and client (ES2017 target)
- JavaScript - Build scripts, configuration files
- Python 3.x - LOD engine service and data pipeline scripts

**Secondary:**
- SQL - Prisma queries, database operations
- JSX/TSX - React component definitions

## Runtime

**Environment:**
- Node.js ≥22 - Primary runtime for Next.js server and scripts
- Python 3.x - LOD engine ML pipeline execution

**Package Manager:**
- npm - Primary package management
- Lockfile: Present (package-lock.json assumed via standard npm workflow)

## Frameworks

**Core:**
- Next.js 16.2.6 - Full-stack React application framework
- React 19.2.6 - UI component library
- React DOM 19.2.6 - DOM rendering

**Backend/Data:**
- Prisma 7.8.0 - ORM and database abstraction layer (`prisma/schema.prisma`)
- tRPC 11.17.0 - Type-safe client-server communication (`server/trpc.ts`, `server/routers/`)
- Superjson 2.2.6 - JSON serialization transformer for tRPC

**Frontend UI:**
- TailwindCSS 4.3.0 - Utility-first CSS framework
- Radix UI 1.4.3 - Unstyled, accessible UI components
- Shadcn/ui 4.7.0 - Component library built on Radix UI
- Framer Motion 12.38.0 - Animation and motion library
- ECharts 6.1.0 - Data visualization library
- Cosmos.gl 3.0.0-beta.9 - 3D graph visualization (spatial-graph)
- Three.js 0.184.0 - 3D graphics library

**Rich Text / Collaboration:**
- TipTap 3.23.1 - Headless rich text editor
- Yjs 13.6.30 - CRDT-based collaborative editing
- Hocuspocus 4.0.0 - WebSocket server for real-time collaboration

**Data Processing:**
- DuckDB-WASM 1.33.1-dev45.0 - In-browser analytical database
- Mosaic 0.25.0 (@uwdata) - Data-driven visualization framework
- Apache Arrow 17.0.0 - Columnar data format
- CSV Parse 6.2.1 - CSV file parsing

**Server/Network:**
- tRPC Server 11.17.0 - RPC handler for `server/routers/`
- Uploadthing 7.7.4 - File upload handling
- WebSocket (ws) 8.20.0 - WebSocket protocol support
- Google APIs 171.4.0 - Gmail, Calendar, Drive, Directory, Forms, Sheets integration
- OpenAI 6.37.0 - AI/LLM integration for family descriptions

**Data/State:**
- TanStack React Query 5.100.14 - Async state management
- Zustand - State management (inferred from memory context)
- Zod 4.4.3 - TypeScript-first schema validation

**Testing:**
- Vitest 4.1.6 - Unit test runner
- Playwright 1.59.1 - E2E browser automation and testing
- @testing-library/react 16.3.2 - React component testing utilities
- jsdom 29.1.1 - DOM environment for Node.js tests
- fast-check 3.23.2 - Property-based testing

**Build/Dev:**
- Webpack - Configured via Next.js (custom aliases for DuckDB)
- PostCSS 8.5.14 (@tailwindcss/postcss 4.3.0) - CSS transformation
- ESLint 10.3.0 - JavaScript linting (eslint-config-next 16.2.6)
- TypeScript 6.0.3 - Type checking and compilation
- tsx 4.21.0 - TypeScript file execution
- Knip 6.12.2 - Unused import detection
- Patch Package 8.0.1 - Node module patching

## Key Dependencies

**Critical:**
- @prisma/client 7.8.0 - Database interaction layer
- @prisma/adapter-pg 7.8.0 - PostgreSQL adapter for connection pooling (PrismaPg)
- next-auth 5.0.0-beta.31 - Authentication framework
- @auth/prisma-adapter 2.11.2 - NextAuth database adapter

**Infrastructure:**
- @aps_sdk/authentication 1.0.1 - Autodesk APS authentication
- @aps_sdk/model-derivative 1.2.1 - Model translation and manifest
- @aps_sdk/oss 1.3.3 - Object storage (bucket upload/download)
- googleapis 171.4.0 - Google Workspace APIs (Gmail, Calendar, Drive, Directory, Sheets, Forms, Chat)
- openai 6.37.0 - OpenAI API for LLM integration

**Real-time:**
- @hocuspocus/server 4.0.0 - Collaboration server
- @hocuspocus/provider 4.0.0 - Hocuspocus client provider
- @hocuspocus/extension-database 4.0.0 - Database persistence
- @hocuspocus/extension-logger 4.0.0 - Logging
- yjs 13.6.30 - Shared data structures
- y-protocols 1.0.7 - Protocol support
- @tiptap/y-tiptap 3.0.3 - TipTap + Yjs integration
- ws 8.20.0 - WebSocket implementation

**Storage/Caching:**
- @upstash/redis 1.38.0 - Redis cache client (optional, configured via env)
- pg 8.20.0 - PostgreSQL client (native driver for Prisma fallback)
- unzipper 0.12.3 - ZIP file extraction

**File Upload:**
- @uploadthing/react 7.3.3 - React components for Uploadthing
- uploadthing 7.7.4 - File upload service
- excel-related: xlsx (0.20.3 from CDN sheetjs.com)
- react-pdf 10.4.1 - PDF rendering

**Accessibility/UI:**
- lucide-react 1.14.0 - Icon library
- Radix UI form/dialog/popover components
- sonner 2.0.7 - Toast notifications
- clsx 2.1.1 - Conditional className binding
- tailwind-merge 3.6.0 - Tailwind class merging
- next-themes 0.4.6 - Theme management

**Utilities:**
- date-fns 4.1.0 - Date manipulation
- bcryptjs 3.0.3 - Password hashing
- d3-force 3.0.0 - Force-directed layout
- d3-force-3d 3.0.6 - 3D force simulation
- d3-hierarchy 3.1.2 - Hierarchical layout
- d3-scale-chromatic 3.1.0 - Color scales
- class-variance-authority 0.7.1 - Component variant management
- p-limit 7.3.0 - Promise concurrency limit
- server-only 0.0.1 - Server-only code marker

**ML/Python (LOD Engine):**
- FastAPI - Web framework for LOD engine
- PyTorch - Deep learning framework
- Transformers (HuggingFace) - SigLIP model
- NumPy - Numerical computing
- YAML - Configuration parsing

## Configuration

**Environment:**
- `.env` file (not committed) - Runtime secrets and configuration
- Environment variables required:
  - `DATABASE_URL` or `DIRECT_URL` - PostgreSQL connection string
  - `AUTH_SECRET` / `NEXTAUTH_SECRET` - NextAuth signing secret
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth
  - `GOOGLE_CHAT_CLIENT_ID`, `GOOGLE_CHAT_CLIENT_SECRET` - Google Chat OAuth (optional)
  - `APS_CLIENT_ID`, `APS_CLIENT_SECRET` - Autodesk APS OAuth
  - `OPENAI_API_KEY` - OpenAI API key
  - `UPLOADTHING_TOKEN` - Uploadthing secret
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` - Redis cache (optional)
  - `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS` - Connection pool tuning
  - `ADMIN_EMAIL`, `ADMIN_EMAIL_ALIAS` - Admin identity configuration
  - `AUTH_URL` / `NEXTAUTH_URL` - Authentication URL
  - `NODE_ENV` - Runtime environment (development/production)
  - `NEXT_PUBLIC_*` - Public environment variables (visible to client)

**Build:**
- `next.config.ts` (`C:\LECG\Dashboard\next.config.ts`) - Next.js configuration with webpack customization for DuckDB
- `tsconfig.json` - TypeScript compiler options
- `vitest.config.ts` - Unit test runner configuration
- `playwright.config.ts` - E2E test configuration
- `playwright.verify.config.ts` - Verification test suite
- `postcss.config.mjs` - PostCSS with Tailwind
- `eslint.config.mjs` - ESLint linting rules
- `auth.config.ts` - NextAuth configuration
- `prisma.config.ts` - Prisma configuration

**Database:**
- `prisma/schema.prisma` - Schema definition for Prisma ORM
- PostgreSQL 18+ (via local `.local/postgresql18/` or remote Railway/Supabase)
- Connection pooling via PrismaPg (native PostgreSQL adapter)
- Local postgres instance managed via `scripts/postgres-local.js`

## Platform Requirements

**Development:**
- Node.js ≥22
- Python 3.x (for LOD engine)
- PostgreSQL 18+ (local or remote)
- Git
- Playwright dependencies (Chromium browser)

**Production:**
- Deployment target: Railway (historical, now local Windows Task Scheduler per memory context)
- Node.js ≥22 runtime
- PostgreSQL database
- Redis (optional, for caching)

---

*Stack analysis: 2026-06-17*
