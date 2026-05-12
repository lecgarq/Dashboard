# Technology Stack

**Analysis Date:** 2026-05-12

## Languages

**Primary:**
- TypeScript 6.0.3 - Full codebase (server and client)
- JavaScript/JSX - React components and Next.js
- Python - Development utilities (dev stack, LOD engine, migrations)

**Secondary:**
- CommonJS - Legacy scripts (postgres-local.js, start-router.cjs, migrate-lod-data.cjs)

## Runtime

**Environment:**
- Node.js 22+ (strict minimum per `package.json` engines)
- Next.js 16.2.6 (full-stack framework)

**Package Manager:**
- npm (default, version 10+)
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Next.js 16.2.6 - Full-stack React framework with API routes
- React 19.2.6 - UI library
- React DOM 19.2.6 - DOM rendering

**State & Data:**
- @tanstack/react-query 5.100.10 - Client data fetching & caching
- @trpc/client 11.17.0 - Type-safe RPC client
- @trpc/react-query 11.17.0 - React Query adapter for tRPC
- @trpc/server 11.17.0 - Type-safe RPC server

**Database & ORM:**
- Prisma 7.8.0 - ORM with schema migrations
- @prisma/client 7.8.0 - Generated client
- @prisma/adapter-pg 7.8.0 - PostgreSQL connection pooling via PrismaPg
- pg 8.20.0 - Native PostgreSQL driver

**Authentication:**
- next-auth 5.0.0-beta.31 - OAuth & credential-based auth
- @auth/prisma-adapter 2.11.2 - NextAuth + Prisma integration
- bcryptjs 3.0.3 - Password hashing

**Real-time Collaboration:**
- yjs 13.6.30 - CRDT library for collaborative editing
- @hocuspocus/server 4.0.0 - WebSocket server for Yjs sync
- @hocuspocus/provider 4.0.0 - Client provider
- @hocuspocus/extension-database 4.0.0 - Yjs persistence via database
- @hocuspocus/extension-logger 4.0.0 - Hocuspocus logging
- ws 8.20.0 - WebSocket implementation

**Rich Text Editing:**
- @tiptap/react 3.23.1 - React editor component
- @tiptap/starter-kit 3.23.1 - Default extensions bundle
- @tiptap/core 3.23.1 - Core editor logic
- @tiptap/extension-collaboration 3.23.1 - Yjs collaboration
- @tiptap/extension-collaboration-caret 3.23.1 - Remote cursor awareness
- @tiptap/extension-* (11 other extensions) - Link, image, list, table, underline, etc.
- @tiptap/y-tiptap 3.0.3 - Yjs binding for tiptap
- tiptap-extension-resize-image 1.4.0 - Custom image resizing

**Visualization & Graphs:**
- @cosmos.gl/graph 3.0.0-beta.9 - WebGL 3D graph visualization with force simulation
- three 0.184.0 - 3D graphics (underlying cosmos.gl dependency)
- d3-force 3.0.0 - Force-directed layout algorithm
- d3-hierarchy 3.1.2 - Hierarchical layout
- d3-scale 4.0.2 - Scale functions
- d3-scale-chromatic 3.1.0 - Color scales
- d3-time 3.1.0 - Time handling
- d3-time-format 4.1.0 - Time formatting
- @xyflow/react 12.10.2 - Interactive graph/diagram editor

**Data Visualization:**
- @nivo/bar 0.99.0 - Bar charts
- @nivo/core 0.99.0 - Nivo core
- @nivo/pie 0.99.0 - Pie charts
- echarts 6.0.0 - Complex interactive charts
- echarts-for-react 3.0.6 - React wrapper for ECharts

**File Handling:**
- xlsx 0.20.3 - Excel file parsing and generation (via CDN)
- csv-parse 6.2.1 - CSV parsing
- unzipper 0.12.3 - ZIP extraction
- react-pdf 10.4.1 - PDF rendering in React

**UI & Styling:**
- Tailwind CSS 4.3.0 - Utility-first CSS framework
- tailwindcss-postcss 4.3.0 - PostCSS support
- class-variance-authority 0.7.1 - Component variant management
- clsx 2.1.1 - Conditional className utility
- radix-ui 1.4.3 - Headless UI components
- lucide-react 1.14.0 - Icon library
- framer-motion 12.38.0 - Animation library
- sonner 2.0.7 - Toast notifications
- next-themes 0.4.6 - Theme switching (light/dark)
- tw-animate-css 1.4.0 - Additional Tailwind animations

**Drag & Drop:**
- @dnd-kit/core 6.3.1 - Headless drag-drop library
- @dnd-kit/sortable 10.0.0 - Sortable preset
- @dnd-kit/utilities 3.2.2 - DND Kit utilities

**Virtualization:**
- @tanstack/react-virtual 3.13.24 - Virtual scrolling for large lists

**File Upload:**
- uploadthing 7.7.4 - File upload service
- @uploadthing/react 7.3.3 - React component integration

**Utilities & Serialization:**
- superjson 2.2.6 - JSON serialization with extra types
- zod 4.4.3 - Schema validation & TypeScript inference
- date-fns 4.1.0 - Date utilities
- p-limit 7.3.0 - Promise concurrency limiting

**External API SDKs:**
- @aps_sdk/authentication 1.0.1 - Autodesk APS authentication
- @aps_sdk/model-derivative 1.2.1 - APS model viewer & translation
- @aps_sdk/oss 1.3.3 - APS Object Storage Service (file uploads)
- googleapis 171.4.0 - Google APIs (Gmail, Sheets, Drive, Calendar, Forms, Chat)
- openai 6.37.0 - OpenAI API for generative descriptions
- playwright 1.59.1 - Browser automation (testing/scraping)

**Server Utilities:**
- server-only 0.0.1 - Marks modules as server-only to prevent client bundling
- tsx 4.21.0 - TypeScript execution for Node.js

**Caching & Messaging:**
- @upstash/redis 1.38.0 - Redis client for Upstash platform

## Testing

**Test Framework:**
- vitest 4.1.6 - Vite-based test runner (faster than Jest)
- jsdom 29.1.1 - DOM environment for testing
- @testing-library/react 16.3.2 - React component testing utilities
- vite 8.0.12 - Build tool used by vitest

## Build & Dev Tools

**Build System:**
- Next.js built-in webpack 5 (configured in `next.config.ts`)

**Development Servers:**
- next dev --webpack - Development server with hot reload
- python scripts/run_dev_stack.py - Local dev stack orchestration (postgres, yjs, next)

**Package Management Tools:**
- patch-package 8.0.1 - Apply patches to node_modules (used in postinstall)
- knip 6.12.2 - Unused file/export detector
- @ngrok/ngrok 1.7.0 - Secure tunneling for local dev

**Linting & Formatting:**
- eslint 10.3.0 - JavaScript linting
- eslint-config-next 16.2.6 - Next.js ESLint config
- sass 1.99.0 - SCSS support
- @tailwindcss/postcss 4.3.0 - PostCSS Tailwind plugin
- postcss 8.5.14 - CSS transformation (with overrides in package.json)

**Type Checking:**
- TypeScript 6.0.3 - TypeScript compiler

## Configuration

**Environment:**
- `.env` file present - Contains API keys and database URLs
- `texti.env` - Additional test environment setup
- Configuration read at runtime via `process.env.*`

**Build Configuration:**
- `tsconfig.json` - TypeScript configuration (ES2017 target, strict mode)
- `eslint.config.mjs` - Flat config format (ignores .next, node_modules, etc.)
- `vitest.config.ts` - Test environment: node, globals enabled
- `vitest.setup.ts` - Global test setup file
- `postcss.config.mjs` - PostCSS with Tailwind
- `components.json` - shadcn UI configuration
- `next.config.ts` - Next.js webpack, image, and server configuration
- `prisma.config.ts` - Optional Prisma config wrapper

**Docker:**
- `Dockerfile` - Multi-stage build using Node 22-bookworm-slim
- `Dockerfile.yjs` - Separate container for Yjs server
- `.dockerignore` - Excludes unnecessary files from image

**Database:**
- PostgreSQL (adapter via @prisma/adapter-pg)
- Prisma schema: `prisma/schema.prisma`
- Migrations: auto-tracked in `prisma/migrations/`

## Platform Requirements

**Development:**
- Node.js >= 22
- PostgreSQL (local via `db:start` or remote via DATABASE_URL)
- Python 3.x (for development scripts)
- Optional: ngrok for tunneling

**Production:**
- Node.js 22
- PostgreSQL (Railway or self-hosted)
- Upstash Redis (for caching)
- Autodesk APS (for BIM model access)
- Google APIs (OAuth, Sheets, Gmail, Drive, Calendar, Forms, Chat)
- OpenAI API (for generative descriptions)
- Uploadthing (for file hosting)
- Docker capable environment (Railway or any OCI-compliant runtime)

**Deployment:**
- Railway.app (primary) - Dockerfile deployed via git push
- Environment variables managed per environment

---

*Stack analysis: 2026-05-12*
