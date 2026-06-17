# External Integrations

**Analysis Date:** 2026-06-17

## APIs & External Services

**Autodesk APS (Architecture, Engineering & Construction Cloud):**
- APS Authentication - Three-legged OAuth for user-context authorization
  - SDK: `@aps_sdk/authentication` 1.0.1
  - Auth file: `server/auth.ts` (Autodesk provider at lines 69-105)
  - Env vars: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`
  - Scopes: `openid data:read data:create viewables:read user:read account:read`
  - Token endpoints: `https://developer.api.autodesk.com/authentication/v2/*`
  - Usage: `lib/server/integrations/aps.ts`, `lib/acc/dcIngest.ts`

- APS Model Derivative - 3D model translation to SVF2
  - SDK: `@aps_sdk/model-derivative` 1.2.1
  - File: `lib/server/integrations/aps.ts` (lines 49-73)
  - Methods: `translateToSvf2()`, `getManifest()`
  - Used for BIM model processing

- APS Object Storage (OSS) - Bucket upload/download
  - SDK: `@aps_sdk/oss` 1.3.3
  - File: `lib/server/integrations/aps.ts` (lines 26-47)
  - Bucket key: `bim_dashboard_families_[CLIENT_ID_PREFIX]`
  - Method: `uploadToAps()`

- APS Data Connector - Access Analysis data extraction
  - Requires 3-legged user-context auth (Data Connector mandates)
  - Used for ACC project/folder/permission data retrieval
  - Implementation: `lib/acc/dcIngest.ts`

**Google Workspace APIs:**
- Google OAuth - Primary auth provider
  - SDK: `googleapis` 171.4.0
  - Auth config: `server/auth.ts` (GoogleProvider, lines 38-50)
  - Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - Scopes: openid, email, profile, calendar, chat, directory, drive, mail
  - Client: `lib/server/google-service-auth.ts` → `buildPrimaryGoogleOAuthClient()`

- Google Chat OAuth - Separate OAuth flow for Chat integrations
  - Env vars: `GOOGLE_CHAT_CLIENT_ID`, `GOOGLE_CHAT_CLIENT_SECRET`
  - Falls back to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` if not configured
  - Scopes defined in `lib/google/oauth.ts` (lines 18-25)
  - Auth: `server/auth.ts` (lines 51-67)

- Gmail - Email access and message retrieval
  - API: `gmail()` from googleapis
  - File: `lib/server/user-gmail.ts`, `lib/google/gmail.ts`
  - Scope: `https://mail.google.com/`
  - Usage: Chat module, email sync

- Google Calendar - Event retrieval and sync
  - API: `calendar()` from googleapis
  - File: `lib/google/calendar.ts`
  - Scope: `https://www.googleapis.com/auth/calendar`

- Google Drive - File access and listing
  - API: `drive()` from googleapis
  - File: `lib/google/drive.ts`, `lib/server/wiki-media-drive.ts`
  - Scope: `https://www.googleapis.com/auth/drive`
  - Used for wiki media and family document storage

- Google Directory - User/group management
  - API: `admin()` from googleapis
  - File: `lib/google/directory.ts`
  - Scope: `https://www.googleapis.com/auth/directory.readonly`

- Google Sheets - Approval list and user management
  - API: `sheets()` from googleapis
  - File: `lib/google/sheets.ts`
  - Usage: Email approval workflow, admin notifications

- Google Forms - Form data collection
  - API: `forms()` from googleapis
  - File: `lib/google/forms.ts`

- Google Chat - Messaging and space integration
  - API: `chat()` from googleapis
  - File: `lib/google/chat.ts`
  - Scopes: memberships.readonly, messages, spaces.readonly

## Data Storage

**Databases:**
- PostgreSQL 18+
  - Connection: `DATABASE_URL` (pooled) or `DIRECT_URL` (direct)
  - Client: Prisma + PrismaPg adapter (`server/db.ts`)
  - Schema: `prisma/schema.prisma`
  - Models: User, Account, Session, Project, ACC models (AccActivity, AccFolder, AccRole, etc.), Wiki models (ClashWiki, SimWiki), etc.
  - Pool config: `PG_POOL_MAX` (default 5 prod, 10 dev), `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`
  - Local instance: `.local/postgresql18/`, managed by `scripts/postgres-local.js`

**File Storage:**
- Uploadthing - Managed file upload service
  - Token: `UPLOADTHING_TOKEN` (env var)
  - Route: `app/api/uploadthing/route.ts`
  - React client: `@uploadthing/react` 7.3.3
  - Used for family file uploads

- Google Drive - Secondary file storage for wiki media
  - OAuth integration via Google Drive API
  - Route: `app/api/wiki-media/route.ts`, `app/api/wiki-media/[id]/route.ts`

**In-Memory / Analytical:**
- DuckDB-WASM - Browser-side analytical database
  - Library: `@duckdb/duckdb-wasm` 1.33.1-dev45.0
  - Used for access analysis charts and data aggregation
  - Client-side columnar queries on bulk user/activity data

- Mosaic - Data-driven visualization queries
  - Libraries: `@uwdata/mosaic-core`, `@uwdata/mosaic-sql`, `@uwdata/vgplot` (0.25.0)
  - Integration: Access Analysis visual components

**Caching:**
- Upstash Redis (optional)
  - Client: `@upstash/redis` 1.38.0
  - Connection: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - File: `lib/redis.ts`
  - Returns `null` if not configured; graceful degradation

## Authentication & Identity

**Auth Provider:**
- NextAuth 5.0.0-beta.31 - Multi-provider authentication
  - Config: `auth.config.ts`, `server/auth.ts`
  - Providers: Google, Google Chat (separate), Autodesk APS, Credentials (username/password)
  - Adapter: `@auth/prisma-adapter` (Prisma-backed sessions/accounts)
  - Tables: User, Account, Session, VerificationToken

**Auth Methods:**
1. **Google OAuth** - Primary federated auth
   - Client: `@auth/prisma-adapter`
   - Tokens persisted in Account table

2. **Autodesk APS OAuth** - 3-legged user-context auth
   - Issuer: `https://developer.api.autodesk.com`
   - Token URL: `https://developer.api.autodesk.com/authentication/v2/token`
   - Profile mapping: `profile()` callback in `server/auth.ts` (lines 91-104)
   - Persistent account linking enabled

3. **Credentials Provider** - Local username/password
   - File: `server/auth.ts` (lines 106-141)
   - Password hashing: bcryptjs 3.0.3
   - Canonical admin email mapping via `getCanonicalAdminEmail()` in `lib/auth-env.ts`

**Session Management:**
- NextAuth session tokens stored in Session table
- Session callbacks in auth.config.ts (callbacks.authorized)
- Public routes: /login, /register, /forgot-password, /reset-password, /unauthorized
- Protected routes require auth; unauthorized returns 401

**Admin/Role System:**
- User.role field: VIEWER, EDITOR, ADMIN
- Admin email configuration: `ADMIN_EMAIL`, `ADMIN_EMAIL_ALIAS` (env)
- Primary admin: `luis.cortes@hermosillo.com` (default, overridable)
- Role-based procedures: `protectedProcedure`, `editorProcedure`, `adminProcedure` in `server/trpc.ts`

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry/DataDog/Rollbar configured

**Logs:**
- File-based: `lib/server/logger.ts` (custom logger implementation)
- Console: Development mode logs "error", "warn"; production logs "error" only
- Prisma logs: Only errors in production (via `prisma.log` config in `server/db.ts`)

**Telemetry:**
- Custom event tracking: `lib/events/user.ts` (user-related events)
- Ingest telemetry: `AccDcIngestRun.rowsByModule` (tracks extraction metrics)

## CI/CD & Deployment

**Hosting:**
- Production: Historically Railway (trial expired 2026-05-13)
- Current: Local Windows Task Scheduler on Luis's PC via `start-local.ps1`
- Build: `npm run build` → `.next` directory
- Start: `npm start` on :3000 or `next start -H 0.0.0.0 --port 3000`

**Local Dev Stack:**
- Python orchestration: `scripts/run_dev_stack.py`
- Simultaneous services:
  - Next.js dev server (:3000)
  - Hocuspocus collaboration server (:1234, inferred)
  - LOD engine Python service (:8091)
- Command: `npm run dev` or `npm run dev:restart`

**Build Pipeline:**
- Entry: `npm run build` → Next.js build with webpack
- Checks: TypeScript noEmit in tsconfig.json (strict mode)
- Output: `.next` directory
- Build artifacts: `.next-e2e` (isolated e2e env), `.next-dev` (dev), `.next-deploy`, etc.

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL pooled connection
- `DIRECT_URL` - PostgreSQL direct connection (railway/prod fallback)
- `AUTH_SECRET` / `NEXTAUTH_SECRET` - NextAuth secret
- `APS_CLIENT_ID`, `APS_CLIENT_SECRET` - Autodesk APS OAuth
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth
- `OPENAI_API_KEY` - OpenAI LLM
- `UPLOADTHING_TOKEN` - File uploads
- `ADMIN_EMAIL` - Primary admin email

**Optional env vars:**
- `GOOGLE_CHAT_CLIENT_ID`, `GOOGLE_CHAT_CLIENT_SECRET` - Google Chat (falls back to GOOGLE_*)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` - Redis cache
- `NEXTAUTH_URL` / `AUTH_URL` - Auth redirect base
- `ADMIN_EMAIL_ALIAS` - Admin email aliases (comma/newline/semicolon-separated)
- `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS` - DB tuning
- `OPENAI_MODEL` - LLM model selection (default: gpt-4o)
- `LOD_SIGLIP_MODEL_ID` - ML model for LOD engine
- `E2E_PORT`, `E2E_BASE_URL` - Playwright test config
- `NEXT_PUBLIC_*` - Client-side public vars
- `NEXT_DIST_DIR` - Alternative build output (e.g., .next-e2e)
- `DC_*` - Data Connector flags (DC_PRIORITY_BACKFILL, DC_RESUME, DC_403_BISECT, etc.)

**Secrets location:**
- `.env` file (git-ignored) on local machine
- Railway environment (historical)
- Windows Task Scheduler task environment (current prod)

## Webhooks & Callbacks

**Incoming:**
- Uploadthing webhooks - File upload completion callbacks
- NextAuth OAuth provider callbacks - Google, Autodesk token exchange
- Google Drive change notifications (optional, for wiki-media sync)

**Outgoing:**
- None detected - No outbound webhooks observed

## Real-time Collaboration

**WebSocket Server:**
- Hocuspocus 4.0.0 server (`@hocuspocus/server`)
- Connection: Yjs document sync, awareness (cursor/selection state)
- Port: 1234 (inferred, configured in dev stack)
- Database persistence: `@hocuspocus/extension-database`
- Rooms: Wiki collaboration rooms (`wiki-room-${module}-${sectionId}`)
- Token auth: JWT via `api/wiki-collab-token/route.ts` (12-hour max age)

**Client Collaboration:**
- Hocuspocus provider (`@hocuspocus/provider`)
- TipTap + Yjs integration (`@tiptap/y-tiptap`)
- Modules: Clash wiki, Simulation wiki
- Real-time cursor position and selection sharing

## LOD Engine Integration

**Service:**
- Python FastAPI server: `services/lod-engine/server.py`
- Port: 8091 (default)
- Model: SigLIP (`google/siglip-base-patch16-224` by default)
- GPU support: CUDA device selection via `LOD_CUDA_DEVICE_INDEX`
- Route integration: tRPC router for image processing requests

---

*Integration audit: 2026-06-17*
