# External Integrations

**Analysis Date:** 2026-05-19

## APIs & External Services

**Autodesk Platform Services (APS / Forge):**
- OAuth 2.0 (3-legged user context only; 2-legged permanently blocked for Data Connector)
  - SDK: `@aps_sdk/authentication`, `@aps_sdk/model-derivative`, `@aps_sdk/oss`
  - Auth env vars: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_CALLBACK_URL`, `APS_SCOPES`
  - Servers: `server/auth.ts` (OAuth provider), `lib/server/aps-oauth.ts`, `lib/server/aps-user-token.ts` (token refresh)
  - Routers: `server/routers/aps-search.ts`, `server/routers/acc-activity.ts`, `server/routers/acc-members.ts`, `server/routers/acc-folders.ts`, `server/routers/acc-sync.ts`
  - Uses: Data Management (hubs, projects, folders, items/files), Model Derivative (translations, metadata extraction), OSS (file uploads)

**APS Data Connector API:**
- Endpoint: `POST /data-connector/v1/accounts/{aid}/requests`
- Schema: 46 CSV files per module per 2+ year backfill (legacy single-file for YESTERDAY only)
- Client: `lib/acc/dcIngest.ts` (Wave-2 orchestrator), `scripts/dc-daily-ingest.cjs` (cron entry)
- Quota: ~25 requests/UTC-day per user; kill switch via `.dc-ingest.disabled` file
- Resume flag: `DC_RESUME=1` env var (retry after 429 HTTP)

**Autodesk Authentication API:**
- Endpoint: `https://developer.api.autodesk.com/authentication/v2`
- User info: `https://api.userprofile.autodesk.com/userinfo` (OIDC)
- Scopes: `openid data:read data:create viewables:read user:read account:read`

**Model Derivative (for 3D viewing):**
- Translation endpoint for SVF2 (viewer-ready format)
- Extracted via `@aps_sdk/model-derivative`

**Google Workspace APIs:**
- OAuth 2.0 (2-legged service account + 3-legged user consent)
  - Auth env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - Service account: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`
  
**Google Sheets:**
- Purpose: User allowlist, pending request queue
- Env vars: `GOOGLE_SHEETS_ID`, `GOOGLE_DRIVE_FOLDER_ID`
- Client: `lib/google/sheets.ts`
- Endpoints: List, read, append workflows via googleapis
- Functions: `isEmailApproved()`, `enqueuePendingUser()` (user onboarding gate)

**Google Drive:**
- Purpose: Managed storage for exports and bulk data
- Client: `lib/google/drive.ts`
- Integrates with UploadThing for managed upload routing

**Google Chat:**
- OAuth scope: `chat` (chat API integration)
- Separate provider in auth: `id: "google-chat", name: "Google Chat"`
- Server: `server/auth.ts` (GoogleProvider variant)

**Google Gmail:**
- Purpose: Email composition, user message retrieval
- Client: `lib/server/user-gmail.ts`
- Router: `server/routers/gmail.ts` (listRecentMessages, sendMessage)
- Per-user OAuth refresh via Prisma Account table

**Google Calendar:**
- Client: `lib/google/calendar.ts`
- Purpose: Event sync (if integrated in future phases)

**Google Directory (Admin SDK):**
- Client: `lib/google/directory.ts`
- Purpose: User/organization info queries

**Google Forms:**
- Client: `lib/google/forms.ts`
- Purpose: Data collection (if integrated)

## Data Storage

**Databases:**
- **PostgreSQL 18 (Primary)**
  - Connection: `DATABASE_URL` (pooled) + `DIRECT_URL` (direct/session)
  - Pooling: PgBouncer-style via `@prisma/adapter-pg` (Prisma native adapter)
  - Dev: Local instance at `.local/postgresql18/data` (via `scripts/postgres-local.js`)
  - Prod: Hosted instance (formerly Railway, now local on luis's PC via Task Scheduler)
  - ORM: Prisma 7.8.0 (`server/db.ts` singleton pattern)
  - Schema: `prisma/schema.prisma` (Users, Accounts, Sessions, Auth tokens, UserModuleAccess, PendingRequests, PasswordResetTokens, Tasks, project-scoped models)

**Browser Storage (Analytics):**
- **DuckDB-Wasm** (`@duckdb/duckdb-wasm`)
  - Runtime: Runs in browser Worker thread (self-hosted WASM bundles in `/public/duckdb-wasm/`)
  - Client: `app/(dashboard)/users/access-analysis/duckdbClient.ts`
  - Use: In-memory SQL analytics for access patterns, user similarity clustering, graph statistics
  - Mosaic integration: `app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.tsx` (DuckDB as Mosaic connector)

**File Storage:**
- **UploadThing (Managed CDN)**
  - Service: Uploadthing.com
  - Auth: `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID`, `UPLOADTHING_TOKEN`
  - Use: User-initiated file uploads (exports, bulk imports)
  - Components: `@uploadthing/react`
  - Endpoint: `app/api/uploadthing/core.ts`
  - Image patterns: Remote patterns include `utfs.io`, `uploadthing.com`

- **Google Drive**
  - Service: Google Drive API (via service account + user consent)
  - Use: Long-term storage for bulk exports, APS Data Connector CSV results
  - Client: `lib/google/drive.ts`
  - Integration: `lib/server/wiki-media-drive.ts` (collaborative doc attachments)

- **Local Filesystem** (dev/server-only)
  - Cache: `.next/`, `.local/` directories
  - DuckDB WASM: `/public/duckdb-wasm/` (self-hosted bundles, copied by `scripts/copy-duckdb-wasm.cjs`)

**Caching:**
- **Upstash Redis (Serverless)**
  - Service: Upstash.com REST API
  - Auth: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - Client: `lib/redis.ts` (optional; null if unconfigured)
  - Use: APS search cache (project/folder metadata), short-lived KV pairs
  - TTL: 24 hours (APS search results), per `server/routers/aps-search.ts`
  - Type: Hash sets (hgetall, hset) + index sets (sadd, smembers) for selective invalidation

## Authentication & Identity

**Auth Provider:**
- NextAuth 5.0 (beta) + Prisma adapter + custom providers

**OAuth Providers:**
- **Google (Primary user auth)**
  - Provider: GoogleProvider
  - Scopes: `email`, `profile`, `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/calendar.readonly`, `https://www.googleapis.com/auth/admin.directory.user.readonly`
  - Offline: `access_type: "offline"` + refresh token storage

- **Autodesk (3-legged APS OAuth)**
  - Provider: Custom OpenID Connect (OIDC)
  - Config: `server/auth.ts` (id: "autodesk")
  - Authorization URL: `https://developer.api.autodesk.com/authentication/v2/authorize`
  - Token URL: `https://developer.api.autodesk.com/authentication/v2/token`
  - Userinfo: `https://api.userprofile.autodesk.com/userinfo`
  - Scopes: `openid data:read data:create viewables:read user:read account:read`
  - Verification: PKCE + state (public client safety)

- **Google Chat** (Secondary)
  - Provider: GoogleProvider variant (different clientId)
  - Id: `google-chat`
  - Name: "Google Chat"

- **Credentials (Local/Admin)**
  - Provider: CredentialsProvider
  - Flow: Username/Email + password (bcrypt hashed)
  - Lookup: `server/auth.ts` (find by email or username, bcrypt.compare)
  - Use: Admin bypass login during development

**Session Management:**
- Adapter: PrismaAdapter (User, Account, Session, VerificationToken tables)
- Session table: `Session` model (`sessionToken`, `userId`, `expires`)
- Token rotation: Refresh tokens persist in `Account.refresh_token`
- Expiry: Configurable per provider; auto-refresh on demand

**Authorization:**
- Role-based: User.role (default "VIEWER", set per user in Prisma)
- Module access: UserModuleAccess table (userId × module matrix)
- Admin gate: `isPrimaryAdminEmail()` check in `server/auth.ts`
- Email whitelist: ApprovedEmail table + Google Sheets cross-check

**Approval Workflow:**
- Pending users stored in `PendingRequest` table
- Google Sheets approval list: `GOOGLE_SHEETS_ID`
- Onboarding: `enqueuePendingUser()` → email notification → admin approval → `ApprovedEmail` upsert

## Monitoring & Observability

**Error Tracking:**
- None deployed (no Sentry, DataDog, etc.)
- Local logging via `lib/server/logger.ts` (file-based, development mode)

**Logs:**
- Server logs: `logs/yjs.log`, `logs/yjs.err.log` (Hocuspocus/Yjs server)
- Next.js logs: Console only (Vercel-style streaming)
- Prisma logs: Configured in `server/db.ts` (`["error", "warn"]` in dev, `["error"]` in prod)

**Event Emission:**
- Custom event emitters: `lib/events/clash.ts`, `lib/events/user.ts`, `lib/events/trello.ts`
- Pattern: EventEmitter with `.on()` / `.off()` handlers (used in clash-updates SSE)

## CI/CD & Deployment

**Hosting:**
- **Former:** Railway.app (trial expired 2026-05-13)
- **Current:** Local Node.js on luis's PC
  - Task Scheduler entry: "LECG Postgres Local"
  - Port: 3000
  - Persistence: Manual sync + git push

**CI Pipeline:**
- None automated (no GitHub Actions)
- Pre-commit hooks: Handled by `patch-package` (dependency patches applied on npm install)

**Build Process:**
- `npm run build` → `next build --webpack`
- Optimization: Unused code warnings via `knip`
- Bundle analysis: Post-install script `scripts/copy-duckdb-wasm.cjs` (WASM asset copy)

**Database Migrations:**
- `npm run db:push` → Prisma schema sync (auto-migration)
- `npm run db:migrate` → Prisma migrate workflow (if needed for schema changes)

## Environment Configuration

**Required env vars:**
- Database: `DATABASE_URL`, `DIRECT_URL`
- Auth secrets: `NEXTAUTH_SECRET`, `AUTH_SECRET`, `BETTER_AUTH_SECRET`
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Google service account: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`
- Google Workspace: `GOOGLE_SHEETS_ID`, `GOOGLE_DRIVE_FOLDER_ID`
- APS: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_CALLBACK_URL`, `APS_SCOPES`
- UploadThing: `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID`, `UPLOADTHING_TOKEN`
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`
- Resend: `RESEND_API_KEY`, `RESEND_EMAIL`
- Redis: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (optional)

**Secrets location:**
- `.env` file (local development, .gitignored)
- Environment variables (production, set via platform/Task Scheduler)
- `.env.example` provided for reference (no secrets, template only)

## Webhooks & Callbacks

**Incoming Webhooks:**

- **APS OAuth Callback:**
  - Endpoint: `POST /api/auth/callback/autodesk`
  - Trigger: User clicks "Sign in with Autodesk"
  - Flow: OAuth code exchange, profile mapping, user creation/update

- **Google OAuth Callback:**
  - Endpoint: `POST /api/auth/callback/google`
  - Trigger: User clicks "Sign in with Google"
  - Flow: OAuth code exchange, email verification, allowlist check

- **Trello Webhook:**
  - Endpoint: `POST /api/events/trello/route.ts`
  - Trigger: External Trello board action
  - Payload: Trello event structure (card move, member add, etc.)

- **Clash Update Stream (SSE):**
  - Endpoint: `GET /api/clash-updates/route.ts`
  - Trigger: Client subscribes to server-sent events
  - Protocol: EventSource (Server-Sent Events)
  - Payload: JSON-encoded ClashEvent objects
  - Heartbeat: 20-second keep-alives

- **User Activity Events (SSE):**
  - Endpoint: `GET /api/events/users/route.ts`
  - Trigger: User activity changes (login, module access, etc.)
  - Protocol: EventSource

- **Simulation Updates:**
  - Endpoint: `GET /api/sim-updates/route.ts`
  - Trigger: LOD engine publishes simulation results
  - Protocol: EventSource or polling

**Outgoing Webhooks:**
- None configured (no outbound event publishing)

**Collaboration Webhooks (Hocuspocus/Yjs):**
- WebSocket endpoint: `ws://localhost:1234` or configured Hocuspocus port
- Docs synced to PostgreSQL via `@hocuspocus/extension-database`
- Room naming: `wiki-room-clash-<ID>`, `wiki-room-sim-<ID>`

## Scheduled Jobs

**Daily Cron:**
- **APS Data Connector ingest** (`scripts/dc-daily-ingest.cjs`)
  - Trigger: Daily (time TBD, likely UTC midnight)
  - Action: Refresh 3-leg APS user token, fetch new CSV files from Data Connector, parse + upsert to PostgreSQL
  - Error handling: Quota checks (429), kill switch (`.dc-ingest.disabled`), resume flag (`DC_RESUME=1`)
  - Deps: `lib/server/aps-oauth.ts`, `lib/acc/dcIngest.ts` shared logic

**Manual Triggers:**
- `npm run lod:engine` - Start Level-of-Detail Python engine (`services/lod-engine/server.py`)
- `npm run yjs:server` - Start Hocuspocus collaboration server (`scripts/yjs-server.mjs`)

## Third-Party Services Summary

| Service | Purpose | Env Var(s) | Optional? |
|---------|---------|-----------|-----------|
| **Autodesk APS** | 3D models, project data, activity logs | APS_CLIENT_ID, SECRET, CALLBACK_URL | No |
| **Google OAuth** | User authentication | GOOGLE_CLIENT_ID, SECRET | No |
| **Google Sheets** | User allowlist, pending queue | GOOGLE_SHEETS_ID | No |
| **Google Drive** | File storage, exports | GOOGLE_DRIVE_FOLDER_ID | No |
| **Google Gmail** | Email retrieval, user messages | (via OAuth scope) | Yes |
| **UploadThing** | Managed file upload CDN | UPLOADTHING_SECRET, TOKEN | No |
| **Upstash Redis** | Search caching, session KV | UPSTASH_REDIS_REST_URL, TOKEN | Yes |
| **OpenAI** | Family descriptions, analysis | OPENAI_API_KEY | Yes |
| **Resend** | Password reset emails | RESEND_API_KEY, EMAIL | Yes (Gmail fallback) |
| **PostgreSQL** | Primary database | DATABASE_URL, DIRECT_URL | No |
| **DuckDB-Wasm** | Browser analytics | (self-hosted, no external) | No |

---

*Integration audit: 2026-05-19*
