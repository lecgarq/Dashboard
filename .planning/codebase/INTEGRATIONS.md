# External Integrations

**Analysis Date:** 2026-06-23

---

## Autodesk Platform Services (APS / ACC)

**2-Leg OAuth (server-to-server):**
- SDK: `@aps_sdk/authentication ^1.0.1`
- Token helper: `lib/acc/apsAuth.ts`
- Auth env vars: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`
- Scope granted: `openid data:read data:create viewables:read user:read account:read`
- Hub context: `APS_HUB_ID`, `ACC_ACCOUNT_ID`, `APS_USER_EMAIL`, `APS_PROJECT_NAME`
- Refresh token rotation: APS v2 tokens are SINGLE-USE; any script that refreshes must persist the new token immediately or breaks dashboard login. Re-login via `scripts/aps-login.cjs`.

**3-Leg OAuth (user-delegated):**
- Provider: `server/auth.ts` custom Autodesk provider using NextAuth credentials flow
- Stored in: `Account` Prisma model (`refresh_token`, `access_token`, `expires_at`)
- Scope: `openid data:read data:create viewables:read user:read account:read`

**ACC Members / Projects API (live feed):**
- Router: `server/routers/acc-members.ts` (`accMembers` tRPC namespace)
- Prisma models sourced: `AccProjectMember`, `AccRole`, `AccMemberCache`, `AccHubRoleCache`
- Sync script: `scripts/sync-acc-users.ts` (TypeScript), cron wrapper `scripts/sync-acc-users-cron.ps1`

**ACC Issues API:**
- Router: `server/routers/acc-*.ts` (VERIFY: exact router filename for issues)
- Backfill script: `scripts/acc-issues-backfill.cjs`
- Prisma models: `AccIssue`, `AccIssueFetchRun`, `AccIssueProjectFetchResult`
- Grant scripts: `scripts/acc-grant-model-coordination.cjs`, `scripts/acc-grant-project-admin.cjs`

**APS Object Storage (OSS):**
- SDK: `@aps_sdk/oss ^1.3.3`
- Used for model upload/management workflows

**APS Model Derivative:**
- SDK: `@aps_sdk/model-derivative ^1.2.1`
- Model Coordination clash retrieval; Model Coordination container = `projectId`

---

## ACC Data Connector (DC)

**Purpose:** Bulk CSV export of ACC project activity and access data. Quota: ~25 requests/UTC-day per user. 403 = project-scoped admin; Account Admin required to unlock full project universe.

**Authorization:**
- Requires 3-leg user-context token (2-leg permanently blocked for DC)
- Access limited to projects where `luis` is project-scoped admin: 428/1,152 active projects extractable; 724 locked (403)
- Env vars: `APS_CLIENT_ID`, `APS_CLIENT_SECRET` (same APS app)
- Feature flag: `DC_PRIORITY_BACKFILL` — priority ordering mode
- Feature flag: `DC_RESUME` — resume a failed ingest batch after 429 quota hit
- Pool config: `PG_POOL_MAX` (default 10 dev / 5 prod)

**Ingest pipeline:**
- Entry: `scripts/dc-daily-ingest.cjs` (primary daily job, wraps `lib/acc/dcIngest.ts`)
- Cron wrappers: `scripts/dc-daily-cron.ps1`, `scripts/dc-daily-ingest.ps1`
- Bisect-on-403: `lib/acc/dcBisect.ts` — salvages good projects from 403-failed batches; flag `DC_403_BISECT`
- Priority backfill: `lib/acc/dcBackfillPriority.ts`, `lib/acc/dcProgressiveBackfill.ts`
- CSV parsing: `lib/acc/dcActivityCsvIngest.ts`, `lib/acc/dcAdminCsvIngest.ts`
- CSV schema: 46 files per-module (`activities_<mod>_activities.csv`) + 15+ admin CSVs per 2-yr backfill
- Quota tracking: `lib/acc/dcQuota.ts`
- Prisma models written: `AccDataConnectorJob`, `AccDcIngestRun`, `AccDcBackfillProgress`, `AccDcProject`, `AccDcProjectUser`, `AccDcProjectRole`, `AccDcProjectProduct`, `AccDcProjectService`, `AccDcProjectCompany`, `AccDcUser`, `AccDcRole`, `AccDcAccount`, `AccDcAccountService`, `AccDcBusinessUnit`, `AccDcCompany`, `AccDcProjectUserRole`, `AccDcProjectUserProduct`, `AccDcProjectUserService`, `AccDcProjectUserCompany`
- Known gap: `AccDcRole` permanently empty (DC never sends `admin_roles.csv`); role names sourced from live `AccRole` via `mergeRoleNames`
- Known gap: `AccDcIngestRun.rowsByModule` always 0 (telemetry skipped); measure from `AccActivity` directly

**Role-name fallback (`AccDcRole` → `AccRole`):**

The DC snapshot architecture intended `AccDcRole` as the authoritative role-name table,
populated from `admin_roles.csv`. In production, Autodesk never delivers that file, so
`AccDcRole` is permanently empty. Without a fallback every `AccDcProjectUserRole`
assignment resolves to an unknown name and is silently dropped in the downstream join —
causing role counts to display as 0 on `/access-analysis`.

The fix lives in `lib/server/accessInstanceView.ts`. The exported `mergeRoleNames`
function accepts two sources and returns a single `Map<id, name>`:

1. All `AccRole` rows (live APS account-roles API, synced by `scripts/sync-acc-users.ts`)
   are loaded into the map first.
2. All `AccDcRole` rows are applied on top — **DC wins on conflict**, by design, matching
   the general snapshot-takes-precedence architecture.

Both models use the same APS role ID as the primary key (`AccRole.id` / `AccDcRole.id`),
so the merge is a direct id-keyed overlay.

`loadInstanceView()` (same file) queries both tables in parallel via `Promise.all`,
calls `mergeRoleNames`, then passes the merged list to `buildInstanceView`. Any
`AccDcProjectUserRole` entry whose `roleId` is absent from the merged map is silently
skipped (`if (!name) continue`) — no error, no placeholder. This silent-drop is tested
in `lib/server/accessInstanceView.test.ts` ("drops an assignment when no name source has
the roleId") to prevent the bug from regressing without visibility.

**Conflict behavior when DC supplies a name:** If `AccDcRole` is ever populated (i.e.,
Autodesk resumes delivering `admin_roles.csv`), the DC name will override the `AccRole`
name for any shared role id. `AccRole` then acts as the fallback baseline only.

**Downstream label requirement:** Role names shown on `/access-analysis` currently come
from `AccRole` (live APS sync), not from the DC extraction window. This inverts the
usual DC-snapshot authority for role data: the "live" source is the ground truth until
DC delivers `admin_roles.csv`. Downstream views that present role-derived metrics should
note that role names reflect the live APS state, not the DC snapshot date.

**Folder crawl:**
- Script: `scripts/folder-crawl-cron.cjs` (cron job)
- Dry-run: `scripts/dry-run-folder-crawl.cjs`
- Prisma models: `AccFolder`, `AccFolderPermission`
- Verified: 111,308 folders / 3.49TB crawled (FOLD-04 gate passed)
- 6 folder attrs (size, version, last-updated, updated-by, added-by, description) are available in crawl response

**ACC Activity (DC-extracted):**
- Prisma model: `AccActivity` — 4.55M rows as of phase 8 completion; 623K rows in AccActivity grouped query
- Taxonomy classifier: `app/(dashboard)/users/access-analysis/accTaxonomy.ts` + `accTaxonomyActions.generated.ts`
- Module overrides: `app/(dashboard)/access-analysis/moduleOverrides.ts` — shared with diagnostic scripts (dependency-cruiser warns: move to `lib/`)
- Activity attribution: `lib/acc/activityAttribution.ts`
- Role name fix: `lib/acc/activityActorClassification.ts`

---

## ACC Data Store (ACCDS) — Free Web-Session Crawl

**Purpose:** Alternative activity source from `acc.autodesk.com` user session (no DC quota). ~12-month history floor. Member-accessible (admin NOT required).

**Base URL:** `https://developer.api.autodesk.com/accds/v0/projects`

**Auth:** Playwright-scraped browser session cookies from `acc.autodesk.com`; refreshed via `lib/acc/accdsToken.ts`

**Login / Session:**
- Login script: `scripts/accds-login.cjs`
- Token module: `lib/acc/accdsToken.ts` — reads Playwright `storageState` JSON; builds `Cookie:` header; throws `SessionExpiredError` when cookies invalid
- Session file path: read from env/config (VERIFY: exact env var; not found in surface scan)

**Ingest:**
- Script: `scripts/accds-activity-ingest.cjs`
- Domain module: `lib/acc/accdsActivity.ts` — paginated fetch with 30-day window splits
- Map: `lib/acc/accdsActivityMap.ts` — maps raw ACCDS rows to `AccActivityAccds` Prisma model
- Prisma model: `AccActivityAccds`
- Verified coverage: 956 projects / 4.55M rows (4.1× expansion from 231 base); per-project loop via `scratch/accds-fullcrawl.sh`
- Diagnostic: `scripts/diag-accds-recency.cjs`, `scripts/verify-accds-merge.cjs`

**Downstream label requirement:** ACCDS has ~12-month history floor; downstream date-range views must label this limitation.

---

## Google Workspace APIs

**SDK:** `googleapis ^171.4.0` — server-only; declared in `next.config.ts` `serverExternalPackages`

**Auth modes:**
- OAuth (user-delegated): `lib/google/oauth.ts`, `lib/google/oauth-connect.ts`
- Service Account: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

**Per-service env vars and modules:**

| Service | Env Vars | Module | tRPC Router |
|---------|----------|--------|-------------|
| Gmail | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `lib/google/chat.ts` | `server/routers/gmail.ts` → `gmail` |
| Google Chat | `GOOGLE_CHAT_CLIENT_ID`, `GOOGLE_CHAT_CLIENT_SECRET` | `lib/google/chat.ts` | `server/routers/chat.ts` → `chat` |
| Google Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `lib/google/calendar.ts` | `server/routers/calendar.ts` → `calendar` |
| Google Directory | `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY` | `lib/google/directory.ts` | (via users router) |
| Google Drive | `GOOGLE_DRIVE_FOLDER_ID`, service account | `lib/google/drive.ts` | (file upload/wiki media) |
| Google Sheets | `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_BLACKLIST_RANGE`, service account | `lib/google/sheets.ts` | (approved email / blacklist lookup) |

**Chat panel:** `components/dashboard/MailPanel.tsx` (43KB — monolith combining Gmail inbox + Chat + Calendar surface)

---

## NextAuth / Authentication

**Package:** `next-auth ^5.0.0-beta.31` + `@auth/prisma-adapter ^2.11.2`

**Auth file split:**
- Edge config (middleware): `auth.config.ts` — route protection, public routes list
- Server config + providers: `server/auth.ts` — Google provider, Google Chat provider, Autodesk provider, Credentials provider (bcrypt), admin email helpers
- Middleware: `middleware.ts` (VERIFY: file exists at root)

**Providers configured in `server/auth.ts`:**
1. `GoogleProvider` — standard Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
2. `GoogleProvider` (Chat scopes) — separate OAuth client (`GOOGLE_CHAT_CLIENT_ID`, `GOOGLE_CHAT_CLIENT_SECRET`)
3. Autodesk custom provider — 3-leg APS OAuth
4. `CredentialsProvider` — email/password with bcrypt

**Session storage:** `Session` and `Account` Prisma models via `PrismaAdapter`

**Access control env vars:**
- `AUTH_SECRET` / `NEXTAUTH_SECRET` — JWT signing
- `AUTH_URL` / `NEXTAUTH_URL` — canonical origin
- `NEXTAUTH_URL_INTERNAL` — internal Next.js callback URL

**Admin email helpers:** `lib/auth-env.ts` — `getCanonicalAdminEmail()`, `getPrimaryAdminEmail()`, `isPrimaryAdminEmail()`

**Approved email list:** Google Sheets (`GOOGLE_SHEETS_ID`) via `lib/google/sheets.ts` → `isEmailApproved()`; `ApprovedEmail` Prisma model mirrors approved list

---

## Local PostgreSQL

**Version:** PostgreSQL 18 (local install; trust auth on localhost)

**Connection:**
- Env vars: `DATABASE_URL` (pooled/primary), `DIRECT_URL` (session/direct; preferred in production)
- Client: `server/db.ts` — `PrismaClient` with `PrismaPg` adapter from `@prisma/adapter-pg`
- Pool config: `PG_POOL_MAX` (default 10 dev / 5 prod), `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`
- `keepAlive: true` / `keepAliveInitialDelayMillis: 30000` — prevents NAT/idle-drop

**Local management:**
- Start/stop: `npm run db:start` / `npm run db:stop` / `npm run db:status` → `scripts/postgres-local.js`
- Task Scheduler: `LECG Postgres Local` task starts Postgres at user logon
- Migrations: `prisma migrate dev` (dev) / `prisma migrate deploy` (prod; called by `start-local.ps1`)
- Schema: `prisma/schema.prisma`; migrations under `prisma/migrations/`
- Raw migrations: `prisma/migrations-raw/` (for ALTER TABLE patches outside Prisma migrate)

**Notable schema decisions:**
- Prisma datasource: `provider = "postgresql"` (no `directUrl` in schema — connection handled in `server/db.ts` adapter)
- `AccDcRole` permanently empty — DC never delivers `admin_roles.csv`
- `AccActivity.service` field carries Autodesk product attribution (40.7% of rows) — not used by `classifyActivity` (uses `rawAction` only)
- `AccGraphLayoutCache` — persists cosmos.gl 3D layout positions for cache reuse
- `AccPersonGraphSnapshot` — snapshot model for person graph rebuild scripts

---

## Upstash Redis

**SDK:** `@upstash/redis ^1.38.0`

**Module:** `lib/redis.ts` — lazy-initialized; returns `null` if env vars absent (optional integration)

**Env vars:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

**Also:** `KV_REST_API_URL`, `KV_REST_API_TOKEN` — alternative Vercel KV env var names detected in source (VERIFY: whether both are used or one is legacy)

**Usage:** Rate limiting, caching, or session storage (VERIFY: exact use cases beyond lazy-init)

---

## UploadThing

**SDK:** `uploadthing ^7.7.4` + `@uploadthing/react ^7.3.3`

**Module:** `lib/server/uploadthing.ts` — `createUploadthing()` router; auth-gated to `ADMIN` or `EDITOR` role

**Env var:** `UPLOADTHING_TOKEN`

**Image hosting:** `next.config.ts` image `remotePatterns` allows `uploadthing.com` and `utfs.io` hostnames; also `lh3.googleusercontent.com` for Google profile photos

---

## OpenAI

**SDK:** `openai ^6.37.0`

**Env vars:** `OPENAI_API_KEY`, `OPENAI_MODEL`

**Usage:** Search/AI features (VERIFY: exact tRPC router or route using OpenAI)

---

## LOD Engine (Python Microservice)

**Language:** Python 3.x with FastAPI `2.0.0`

**Location:** `services/lod-engine/server.py`

**Model:** Google SigLIP (`google/siglip-base-patch16-224` default; override via `LOD_SIGLIP_MODEL_ID`)

**Host/Port:** `127.0.0.1:8091` default; `LOD_ENGINE_PORT` env var

**Start:** `npm run lod:engine` → `python services/lod-engine/server.py`

**Next.js proxy route:** `app/api/lod-img/[fileId]/route.ts` — proxies image requests to LOD engine

**tRPC router:** `server/routers/lod.ts` → `lod` namespace

**Data migration:** `npm run lod:migrate` → `scripts/migrate-lod-data.cjs`

**Prisma models:** `LodCategory`, `LodEmbedding`, `LodFamily`, `LodGraphNode`

**Dependencies:** PyTorch, HuggingFace Transformers, `numpy`, `yaml`; `img_pipeline/` subdirectory contains provider implementations

---

## Hocuspocus / Yjs Collaboration Server

**SDK:** `@hocuspocus/server ^4.0.0` + database/logger extensions

**Start:** `npm run yjs:server` → `node scripts/yjs-server.mjs`; also started by `scripts/start-local.ps1` as background process

**Endpoint:** `ws://localhost:4444` (default; overridable via `NEXT_PUBLIC_YJS_WS_URL`)

**DB persistence:** `@hocuspocus/extension-database` — persists Yjs docs to PostgreSQL (`SimWiki`, `ClashWiki` models)

**Client provider:** `@hocuspocus/provider ^4.0.0` in wiki editor components

**Log output:** `logs/yjs.log`

---

## Electron (Optional Desktop Shell)

**Package:** `electron ^42.1.0` (devDependency)

**Entrypoint:** `electron/main.cjs`

**Start command:** `npm run desktop`

**Isolation:** Electron code is isolated; no application routes import from `electron/`

---

## Task Scheduler Jobs (Windows)

These run on Luis's Windows PC via Task Scheduler — NOT via CI/CD or cron daemon:

| Task | Script | Trigger | Purpose |
|------|--------|---------|---------|
| `LECG Dashboard` | `scripts/start-local.ps1` | At logon | Boot Next.js :3000 + Yjs :4444 |
| `LECG Postgres Local` | `scripts/postgres-local.js start` | At logon | Start PostgreSQL 18 |
| DC Daily Ingest | `scripts/dc-daily-cron.ps1` → `scripts/dc-daily-ingest.cjs` | Daily (UTC midnight window) | ACC Data Connector ingest; quota ~25 req/UTC-day |
| Folder Crawl | `scripts/folder-crawl-cron.cjs` | Periodic | ACC folder metadata crawl |
| ACC User Sync | `scripts/sync-acc-users-cron.ps1` → `scripts/sync-acc-users.ts` | Periodic | Sync ACC member cache from live ACC API |

**DC daily ingest env flags:**
- `DC_PRIORITY_BACKFILL=1` — enable priority ordering (set in `.env`)
- `DC_RESUME=1` — resume after 429 quota hit without restart
- `RESERVE=4`, `SAFE_BUDGET=20` — fairness/budget params

---

## ngrok / Tunnel

**SDK:** `@ngrok/ngrok ^1.7.0` (devDependency)

**Script:** `npm run tunnel` → `node scripts/run-tunnel.js`

**Use:** Expose `:3000` externally for live demos or webhook testing

---

## Trello

**Module:** `lib/trello/` (VERIFY: exact integration files)

**tRPC router:** `server/routers/trello.ts` → `trello` namespace

**Component:** `components/trello/CardDialog.tsx` (40KB monolith)

---

## Environment Variable Reference (Keys Only)

**Database:**
- `DATABASE_URL` — primary PostgreSQL connection string (pooled or direct)
- `DIRECT_URL` — session/direct PostgreSQL connection string (preferred in production)
- `PG_POOL_MAX` — connection pool size override
- `PG_IDLE_TIMEOUT_MS` — pool idle timeout override
- `PG_CONNECTION_TIMEOUT_MS` — pool connection timeout override

**Auth:**
- `AUTH_SECRET` / `NEXTAUTH_SECRET` — JWT signing secret
- `AUTH_URL` / `NEXTAUTH_URL` — canonical application origin
- `NEXTAUTH_URL_INTERNAL` — internal callback URL

**Google:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — standard Google OAuth app
- `GOOGLE_CHAT_CLIENT_ID`, `GOOGLE_CHAT_CLIENT_SECRET` — Google Chat OAuth app (separate client)
- `GOOGLE_ID`, `GOOGLE_SECRET` — VERIFY: may be legacy aliases for GOOGLE_CLIENT_ID/SECRET
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — service account for Directory/Drive/Sheets
- `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_BLACKLIST_RANGE` — approved email sheet config
- `GOOGLE_DRIVE_FOLDER_ID` — Drive folder for wiki media

**Autodesk / APS:**
- `APS_CLIENT_ID`, `APS_CLIENT_SECRET` — APS application credentials
- `APS_HUB_ID` — Autodesk Hub (ACC account hub)
- `ACC_ACCOUNT_ID` — ACC account identifier
- `APS_USER_EMAIL` — primary APS user identity
- `APS_PROJECT_NAME` — default project name for scripts
- `APS_CLI_CALLBACK_URL` — OAuth callback for CLI scripts

**Data Connector:**
- `DC_PRIORITY_BACKFILL` — enable priority backfill mode (`1` = on)
- `DC_RESUME` — resume ingest after quota hit

**OpenAI:**
- `OPENAI_API_KEY`, `OPENAI_MODEL`

**Redis / Cache:**
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — Vercel KV aliases (VERIFY: still active)

**UploadThing:**
- `UPLOADTHING_TOKEN`

**Feature Flags (NEXT_PUBLIC_ — client-visible):**
- `NEXT_PUBLIC_ACC_GPU_2D` — enable GPU 2D physics (default on)
- `NEXT_PUBLIC_ACC_GRAPH_TEST` — Playwright E2E test mode for ACC graph
- `NEXT_PUBLIC_ACC_JS_SNAPSHOT` — JS-side snapshot flag
- `NEXT_PUBLIC_ACC_PERSON_GRAPH` — person graph feature flag
- `NEXT_PUBLIC_ACC_SIM_WEB` — similarity web view flag
- `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS` — new ECharts-based access analysis dashboard
- `NEXT_PUBLIC_YJS_WS_URL` — Yjs WebSocket URL override (default `ws://localhost:4444`)

**LOD Engine:**
- `LOD_SIGLIP_MODEL_ID` — HuggingFace model ID override
- `LOD_ENGINE_PORT` (VERIFY: exact name; `DEFAULT_PORT=8091` in `services/lod-engine/server.py`)

**Build / Deploy:**
- `NEXT_DIST_DIR` — alternate `.next` output directory (used for E2E isolation: `.next-e2e`)

---

*Integration audit: 2026-06-23 — verified from `server/auth.ts`, `server/db.ts`, `lib/acc/accdsToken.ts`, `lib/acc/accdsActivity.ts`, `lib/redis.ts`, `lib/server/uploadthing.ts`, `lib/google/` directory listing, `services/lod-engine/server.py`, `scripts/` directory listing, `scripts/start-local.ps1`, `next.config.ts`, `package.json`, env-var grep across all `.ts/.tsx/.cjs/.mjs` sources, `.tools/repo-map/architecture-summary.md`*
