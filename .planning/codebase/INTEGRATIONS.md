# External Integrations

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-16 — unified activity source (`lib/server/unifiedActivitySource.ts`, accds-primary + DC-backfill merge) documented; DC admin-snapshot weekly refresh + `DC_SKIP_ADMIN_SNAPSHOT` added; ACCDS session env vars resolved; Task Scheduler task name corrected to `LECG Dashboard Local`; several stale VERIFY items closed
**Refreshed:** 2026-07-20 — post v2.5 close: unified-activity consumer list corrected (per-panel views do the merge in raw SQL, not via imports); DC env flag names corrected (`RESERVE` → `DC_FAIRNESS_RESERVE`, added `DC_PROGRESSIVE_SLICE_DAYS` + `DC_BACKFILL_CUTOFF_DATE`); Electron pin corrected to `^43.1.0`; dead `KV_REST_API_*` aliases removed; Redis usage resolved; `NEXT_PUBLIC_ACC_3D_GRAPH` flag added
**Refreshed:** 2026-07-22 — post v2.7 "Activity Universe" close (commits through `c998db1e`): activity-universe embedding artifact + payload route documented; nightly instance-embedding step removed from the DC daily ingest description (retired `c28cb962`); `NEXT_PUBLIC_*` flag list re-grepped at HEAD (`NEXT_PUBLIC_ACC_GPU_2D`, `NEXT_PUBLIC_ACC_JS_SNAPSHOT`, `NEXT_PUBLIC_ACC_SIM_WEB` retired with the old instance graph; `NEXT_PUBLIC_ACC_SCALE_SPIKE` added); `ACC_ACTIVITY_TEST_FIXTURE` server flag added

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
- No dedicated issues router; `AccIssue` data is read via `lib/server/issueFunnelView.ts`, `lib/server/coordinationByProjectView.ts`, and `lib/server/projectClashView.ts` (consumed from existing routers)
- Backfill scripts: `scripts/acc-issues-backfill.cjs`, `scripts/acc-issue-types-backfill.cjs`, `scripts/acc-issues-validate-clashes.cjs`
- Prisma models: `AccIssue`, `AccIssueFetchRun`, `AccIssueProjectFetchResult`, `AccIssueType` (added via raw migration `prisma/migrations-raw/2026-07-10-acc-issue-type.sql`)
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
- Access limited to projects where `luis` is project-scoped admin. Historical framing was "428/1,152 extractable; 724 locked (403)"; the v2.1 Ph11 data-truthfulness pass rejected that headline (coverage had grown to roughly ~550/1,153). VERIFY the current covered-project count from `AccDcBackfillProgress` before citing a figure in UI or docs.
- Env vars: `APS_CLIENT_ID`, `APS_CLIENT_SECRET` (same APS app)
- Feature flag: `DC_PRIORITY_BACKFILL` — priority ordering mode
- Feature flag: `DC_403_BISECT` — bisect-on-403 salvage mode
- Feature flag: `DC_SKIP_ADMIN_SNAPSHOT` — daily ingest skips the admin snapshot rebuild (the daily MTY-allowlisted extract covers too few projects and trips the `dcAnomalyChecks` user-drop guard; the full-universe weekly refresh owns admin snapshots instead)
- Feature flag: `DC_RESUME` — resume pending/running rows only (lives in `scripts/dc-ingest-where-i-admin.cjs`, not the daily ingest)
- Feature flag: `DC_FAIRNESS_RESERVE` — per-run fairness reserve slot count when priority backfill is on (default ~20% of remaining safe budget; `lib/acc/dcIngest.ts`)
- Feature flag: `DC_PROGRESSIVE_SLICE_DAYS` — override the default 30-day progressive extraction window (`lib/acc/dcProgressiveBackfill.ts`)
- Feature flag: `DC_BACKFILL_CUTOFF_DATE` — YYYY-MM-DD extraction ceiling for manual history mode (`lib/acc/dcIngest.ts`)
- Pool config: `PG_POOL_MAX` (default 10 dev / 5 prod)

**Ingest pipeline:**
- Entry: `scripts/dc-daily-ingest.cjs` (primary daily job, wraps `lib/acc/dcIngest.ts`)
- Cron wrappers: `scripts/dc-daily-cron.ps1`, `scripts/dc-daily-ingest.ps1`
- Bisect-on-403: `lib/acc/dcBisect.ts` — salvages good projects from 403-failed batches; flag `DC_403_BISECT`
- Priority backfill: `lib/acc/dcBackfillPriority.ts`, `lib/acc/dcProgressiveBackfill.ts`
- CSV parsing: `lib/acc/dcActivityCsvIngest.ts`, `lib/acc/dcAdminCsvIngest.ts`
- CSV schema: 46 files per-module (`activities_<mod>_activities.csv`) + 15+ admin CSVs per 2-yr backfill
- Quota tracking: `lib/acc/dcQuota.ts`
- Admin snapshot refresh: `scripts/dc-admin-snapshot-refresh.cjs` (+ `.ps1` wrapper) — full-universe DC admin extract run weekly; exists because the daily ingest only extracts MTY-allowlisted projects (~183 of ~527 admin projects), whose partial admin CSVs would otherwise be quarantined by the anomaly guard
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
- Script: `scripts/folder-crawl-cron.cjs` (cron job); recovery helper `scripts/folder-perms-recover.cjs` (the old `dry-run-folder-crawl.cjs` is gone from `scripts/`)
- Prisma models: `AccFolder`, `AccFolderPermission`
- Verified: 111,308 folders / 3.49TB crawled (FOLD-04 gate passed)
- 6 folder attrs (size, version, last-updated, updated-by, added-by, description) are available in crawl response

**AccFolderPermissionSummary projection (REF-03):**
- WHAT: a materialised projection of the `includePermissionSummary` GROUP BY aggregate —
  per `(projectId, roleId)`: `folderCount`, `totalBytes`, `permTypes` (model
  `prisma/schema.prisma`, built by `scripts/backfill-folder-perm-summary.cjs`, reconciled
  by `scripts/verify-folder-perm-summary.cjs`). Entirely server-side: `TRUNCATE` +
  `INSERT...SELECT...GROUP BY`, never a Node-side row scan of the ~6M-row
  `AccFolderPermission` table.
- CONSUMER: `lib/server/acc-hot-cache.ts` `includePermissionSummary` path reads it
  (PROJ-02), feeding the per-project permission dims (`permissionStrength`,
  `folderBreadth`, `accessibleDataBytes`, `permMixedProfile`, `fullController`) on
  `/access-analysis`; the runtime hot-cache adds <=10min (sliding-TTL ceiling <=1h) on top.
- REFRESH + STALENESS BOUND (SC#4): `scripts/dc-daily-ingest.cjs` re-runs
  `scripts/backfill-folder-perm-summary.cjs` as the first step of its success branch,
  non-fatal, after every successful daily ingest — before the person-graph rebuild.
  (The nightly per-instance embedding build that used to follow —
  `build-instance-features.ts` + `compute_instance_embeddings.py` — was RETIRED in
  v2.7 Ph39 (ACT-03) along with the user×project instance graph; the ingest script's
  own comment records this.) Staleness bound: **<=1 daily ingest cycle**.
- CAVEAT (honest): the projection's SOURCE (`AccFolderPermission`) is updated by the
  SEPARATE folder-crawl task (`scripts/folder-crawl-cron.cjs`), not by the DC ingest.
  Folder-permission changes made by a crawl between ingest runs lag until the next
  successful ingest refresh — the bound above is measured from ingest cycles, not crawl
  cycles.
- MANUAL FALLBACK: `node scripts/backfill-folder-perm-summary.cjs` (idempotent) forces an
  immediate rebuild outside the cron cycle.

**ACC Activity (DC-extracted):**
- Prisma model: `AccActivity` — 4.55M rows per the 2026-06-23 data census in `STATE.md` (still cited as current at v2.2 close); 623K rows in AccActivity grouped query
- Taxonomy classifier: `app/(dashboard)/users/access-analysis/accTaxonomy.ts` + `accTaxonomyActions.generated.ts`
- Module overrides: `app/(dashboard)/access-analysis/moduleOverrides.ts` — UI re-export shell; the pure classification logic moved to `lib/acc/activityClassification.ts` in v2.1 Ph10 (BND-02), so diagnostic scripts now import from `lib/` (dependency-cruiser warning resolved)
- Activity attribution: `lib/acc/activityAttribution.ts`
- Role name fix: `lib/acc/activityActorClassification.ts`

**Unified activity source (accds-primary + DC-backfill; SHIPPED, LIVE):**
- Module: `lib/server/unifiedActivitySource.ts` (tested in `lib/server/unifiedActivitySource.test.ts`)
- `mergeActivitySources({ dcRows, accdsRows })` — ACCDS rows are primary; per project, DC (`AccActivity`) rows are kept only when they predate that project's earliest ACCDS row (DC acts as historical backfill before the ~12-month ACCDS window)
- Query helpers: `listUnifiedActivityRows`, `countUnifiedActivityRows`, `groupUnifiedActivityByUserProjectAction`, `groupUnifiedAdminActionsByActor`, `groupUnifiedActivityByRawAction`, `getLastUnifiedActivityByEmail` (same file)
- Direct importers of the helper module: `lib/server/acc-hot-cache.ts`, `lib/server/projectCoverageView.ts`, `server/routers/acc-activity.ts`, `server/routers/acc-members.ts`, `server/routers/users/acc-profile.ts`
- The per-panel view modules (`lib/server/activityByActorView.ts`, `activityRecencyView.ts`, `activityTimelineView.ts`, `moduleActivityView.ts`, `folderActivityView.ts`, `folderActivityByCompanyView.ts`, `workflowToolsView.ts`) implement the SAME accds-primary + DC-backfill policy as raw-SQL `UNION ALL` queries over `AccActivityAccds`/`AccActivity` directly — they do NOT import `unifiedActivitySource.ts` (correcting the 2026-07-16 consumer list)
- EXCEPTION (`lib/server/workflowToolsView.ts`): ACCDS never emits `rfi-`/`submittal-` family verbs, so RFI/submittal rows are taken from `AccActivity` (DC) unconditionally — the naive merge would undercount those workflows ~20×

**Activity-universe embedding artifact (v2.7 Ph38, SHIPPED):**
- Offline pipeline: `scripts/build-activity-author-attributes.ts` (author sidecar + ACT-02 coverage measurement) → `scripts/compute_activity_embeddings.py` (full-fit PaCMAP over the unified corpus read directly from PostgreSQL via `psycopg`; mirrors the `UNIFIED_ACTIVITY_CTE` merge semantics of `lib/server/unifiedActivitySource.ts`, including the two id spaces `"accds:"+accdsActivityId` vs plain `AccActivity.id`; TRUNCATE+COPY into `AccActivityEmbedding`) → `scripts/build-activity-universe-payload.ts` (keyset-paginated stream of `AccActivityEmbedding` into the binary columnar codec `lib/acc/columnarPayload.ts`)
- Artifacts (gitignored, under `.embedding/`): `activity-universe.bin` (~149.7MB, 4,904,886 events verified on disk) + `activity-universe-meta.json` + `activity-universe-dicts.json` + gate/coverage sidecars
- Serving: `app/api/activity-universe/payload/route.ts` — whole-file bytes per request, `ETag = embeddingRunId` (artifact only changes on a manual pipeline rerun; owner decision: NO nightly refit), `?meta=1` returns the JSON meta with the honest author-coverage figures; no session gate (matches other local data routes). Shared path/meta logic: `lib/server/activityUniversePayload.ts`; client hook `app/(dashboard)/users/access-analysis/activity/useActivityUniversePayload.ts`
- Test fixture: `NEXT_PUBLIC_ACC_GRAPH_TEST=1` + `ACC_ACTIVITY_TEST_FIXTURE=1` makes the route serve `lib/server/activityUniverseTestFixture.ts` instead of the real artifact
- TRAP: after any `AccActivityEmbedding` table change, the binary artifact must be rebuilt (`build-activity-universe-payload.ts`) or the route serves stale positions/dicts
- The predecessor per-instance pipeline (`build-instance-features.ts` + `compute_instance_embeddings.py` + `AccInstanceEmbedding`) is fully retired (commit `c28cb962`; drop migration `prisma/migrations-raw/2026-07-21-drop-acc-instance-embedding.sql`)

---

## ACC Data Store (ACCDS) — Free Web-Session Crawl

**Purpose:** Alternative activity source from `acc.autodesk.com` user session (no DC quota). ~12-month history floor. Member-accessible (admin NOT required).

**Base URL:** `https://developer.api.autodesk.com/accds/v0/projects`

**Auth:** Playwright-scraped browser session cookies from `acc.autodesk.com`; refreshed via `lib/acc/accdsToken.ts`

**Login / Session:**
- Login script: `scripts/accds-login.cjs`
- Token module: `lib/acc/accdsToken.ts` — reads Playwright `storageState` JSON; builds `Cookie:` header; throws `SessionExpiredError` when cookies invalid; exports `getSessionHealth()` (`healthy`/`expiring`/`expired`/`missing`, warn threshold `SESSION_WARN_HOURS = 12`)
- Session file path: `ACC_SESSION_PATH` env var, default `scratch/acc-session.json` (`scripts/accds-activity-ingest.cjs`)

**Ingest:**
- Script: `scripts/accds-activity-ingest.cjs`
- Env vars: `ACCDS_PROJECT`, `ACCDS_NAME_LIKE`, `ACCDS_MONTHS_BACK`, `ACCDS_CONCURRENCY`, `ACCDS_PAGE_CONCURRENCY`, `ACCDS_RESUME`
- Domain module: `lib/acc/accdsActivity.ts` — paginated fetch with 30-day window splits
- Map: `lib/acc/accdsActivityMap.ts` — maps raw ACCDS rows to `AccActivityAccds` Prisma model
- Prisma model: `AccActivityAccds`
- Verified coverage: 956 projects / 4.55M rows (4.1× expansion from 231 base); per-project loop via `scratch/accds-fullcrawl.sh`
- Diagnostic: `scripts/verify-accds-merge.cjs`

**Downstream label requirement:** ACCDS has ~12-month history floor; downstream date-range views must label this limitation. Pre-window history comes from the DC backfill via the unified activity source (see "Unified activity source" above).

---

## Google Workspace APIs

**SDK:** `googleapis ^173.0.0` — server-only; declared in `next.config.ts` `serverExternalPackages`

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
- No root `middleware.ts` exists (verified against `git ls-files`); `auth.config.ts` is consumed by `server/auth.ts`, not by an edge middleware file

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
- `AccActivity.service` field carries Autodesk product attribution (~40.7% of rows) — not used by `classifyActivity` (uses `rawAction` only). The two attributions disagree on ~40.7% of rows: Autodesk's `service` attribution is not yet reconciled with the `rawAction`-based module classification used by the Activity-by-module donut on `/access-analysis`. This unreconciled gap is surfaced as a hover/focus-only ⓘ tooltip on that panel (TRUTH-03).
- `AccGraphLayoutCache` — persists cosmos.gl 3D layout positions for cache reuse
- `AccPersonGraphSnapshot` — snapshot model for person graph rebuild scripts

---

## Upstash Redis

**SDK:** `@upstash/redis ^1.38.0`

**Module:** `lib/redis.ts` — lazy-initialized; returns `null` if env vars absent (optional integration)

**Env vars:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

**Usage:** server-side caching in `server/routers/aps-search.ts` and `server/routers/lod.ts` (the only importers of `lib/redis.ts`). The previously listed `KV_REST_API_URL`/`KV_REST_API_TOKEN` Vercel KV aliases no longer appear anywhere in source — removed.

---

## UploadThing

**SDK:** `uploadthing ^7.7.4` + `@uploadthing/react ^7.3.3`

**Module:** `lib/server/uploadthing.ts` — `createUploadthing()` router; auth-gated to `ADMIN` or `EDITOR` role

**Env var:** `UPLOADTHING_TOKEN`

**Image hosting:** `next.config.ts` image `remotePatterns` allows `uploadthing.com` and `utfs.io` hostnames; also `lh3.googleusercontent.com` for Google profile photos

---

## OpenAI

**SDK:** `openai ^6.37.0`

**Env vars:** `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o`)

**Usage:** `lib/server/integrations/ai.ts` (streaming chat completions) and `server/routers/lod.ts`

---

## LOD Engine (Python Microservice)

**Language:** Python 3.x with FastAPI `2.0.0`

**Location:** `services/lod-engine/server.py`

**Model:** Google SigLIP (`google/siglip-base-patch16-224` default; override via `LOD_SIGLIP_MODEL_ID`)

**Host/Port:** `127.0.0.1:8091` default (`DEFAULT_PORT = 8091`); port override env var: `LOD_QUERY_ENCODER_PORT`

**Start:** `npm run lod:engine` → `python services/lod-engine/server.py`

**Next.js proxy route:** `app/api/lod-img/[fileId]/route.ts` — proxies image requests to LOD engine

**tRPC router:** `server/routers/lod.ts` → `lod` namespace (also calls OpenAI for query handling)

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

**Package:** `electron ^43.1.0` (devDependency)

**Entrypoint:** `electron/main.cjs`

**Start command:** `npm run desktop`

**Isolation:** Electron code is isolated; no application routes import from `electron/`

---

## Task Scheduler Jobs (Windows)

These run on Luis's Windows PC via Task Scheduler — NOT via CI/CD or cron daemon:

| Task | Script | Trigger | Purpose |
|------|--------|---------|---------|
| `LECG Dashboard Local` | `scripts/start-local.ps1` | At logon | Boot Next.js :3000 + Yjs :4444 (this task name is what the deploy sequence stops/starts) |
| `LECG Postgres Local` | `scripts/postgres-local.js start` | At logon | Start PostgreSQL 18 |
| DC Daily Ingest | `scripts/dc-daily-cron.ps1` → `scripts/dc-daily-ingest.cjs` | Daily (UTC midnight window) | ACC Data Connector ingest; quota ~25 req/UTC-day; runs with `DC_SKIP_ADMIN_SNAPSHOT=1` |
| DC Admin Snapshot Refresh | `scripts/dc-admin-snapshot-refresh.ps1` → `scripts/dc-admin-snapshot-refresh.cjs` | Weekly | Full-universe DC admin snapshot (daily allowlisted extract is too partial for admin tables) |
| Folder Crawl | `scripts/folder-crawl-cron.cjs` | Periodic | ACC folder metadata crawl |
| ACC User Sync | `scripts/sync-acc-users-cron.ps1` → `scripts/sync-acc-users.ts` | Periodic | Sync ACC member cache from live ACC API |

**DC daily ingest env flags:**
- `DC_PRIORITY_BACKFILL=1` — enable priority ordering (set in `.env`)
- `DC_SKIP_ADMIN_SNAPSHOT=1` — skip the admin snapshot rebuild in the daily run
- `DC_FAIRNESS_RESERVE` — fairness reserve slot count override (the previously documented bare `RESERVE` name does not exist in source; `SAFE_BUDGET` no longer appears outside `scripts/_attic/`)

**Progress monitor (read-only ops UI):**
- `node scripts/progress-monitor.cjs` → `http://localhost:4321` (override with `PORT`) — standalone monitor for DC activity extraction and folder/permission crawl progress

---

## ngrok / Tunnel

**SDK:** `@ngrok/ngrok ^1.7.0` (devDependency)

**Script:** `npm run tunnel` → `node scripts/run-tunnel.js`

**Use:** Expose `:3000` externally for live demos or webhook testing

---

## Trello

**Module:** `lib/trello/client.ts`

**Env vars:** `TRELLO_API_KEY`, `TRELLO_TOKEN`

**tRPC router:** `server/routers/trello.ts` → `trello` namespace

**Components:** `components/trello/` — `CardDialog.tsx` (40KB monolith), `KanbanBoard.tsx`, `CalendarView.tsx`, `ActivitySheet.tsx`, `ArchiveSheet.tsx`

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
- (`GOOGLE_ID`/`GOOGLE_SECRET` legacy aliases: no longer referenced anywhere in source — removed from this reference)
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
- `DC_403_BISECT` — bisect-on-403 salvage mode
- `DC_SKIP_ADMIN_SNAPSHOT` — daily ingest skips admin snapshot rebuild
- `DC_RESUME` — resume pending/running rows only (`scripts/dc-ingest-where-i-admin.cjs`)
- `DC_FAIRNESS_RESERVE` — fairness reserve slots when priority backfill is on
- `DC_PROGRESSIVE_SLICE_DAYS` — progressive extraction window override
- `DC_BACKFILL_CUTOFF_DATE` — manual history-mode extraction ceiling (YYYY-MM-DD)

**ACCDS:**
- `ACC_SESSION_PATH` — Playwright storageState path (default `scratch/acc-session.json`)
- `ACCDS_PROJECT`, `ACCDS_NAME_LIKE` — project scoping for the crawl
- `ACCDS_MONTHS_BACK` — history window
- `ACCDS_CONCURRENCY`, `ACCDS_PAGE_CONCURRENCY` — crawl parallelism
- `ACCDS_RESUME` — resume mode

**Trello:**
- `TRELLO_API_KEY`, `TRELLO_TOKEN`

**OpenAI:**
- `OPENAI_API_KEY`, `OPENAI_MODEL`

**Redis / Cache:**
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis (`KV_REST_API_*` aliases removed — no longer in source)

**UploadThing:**
- `UPLOADTHING_TOKEN`

**Feature Flags (NEXT_PUBLIC_ — client-visible; re-grepped at HEAD 2026-07-22):**
- `NEXT_PUBLIC_ACC_3D_GRAPH` — 3D physics graph mode (`app/(dashboard)/users/access-analysis/graphModeFlag.ts`)
- `NEXT_PUBLIC_ACC_GRAPH_TEST` — Playwright E2E test mode for ACC graph (also gates the activity-universe payload fixture together with `ACC_ACTIVITY_TEST_FIXTURE`)
- `NEXT_PUBLIC_ACC_PERSON_GRAPH` — person graph feature flag
- `NEXT_PUBLIC_ACC_SCALE_SPIKE` — scale-spike diagnostic surface (`app/(dashboard)/users/scale-spike/`, `app/api/scale-spike/payload/route.ts`)
- `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS` — new ECharts-based access analysis dashboard
- `NEXT_PUBLIC_YJS_WS_URL` — Yjs WebSocket URL override (default `ws://localhost:4444`)
- `NEXT_PUBLIC_LOD_CHECKER_URL` — set by `scripts/patch-env.js` at dev-stack start (points at a `:5173` checker UI); no app-code consumer at HEAD
- Retired with the old instance graph (v2.7 Ph39): `NEXT_PUBLIC_ACC_GPU_2D`, `NEXT_PUBLIC_ACC_JS_SNAPSHOT`, `NEXT_PUBLIC_ACC_SIM_WEB` — no longer referenced anywhere in `app`/`lib`/`components`/`server`/`scripts`

**Activity universe (server-side):**
- `ACC_ACTIVITY_TEST_FIXTURE` — with `NEXT_PUBLIC_ACC_GRAPH_TEST=1`, makes `/api/activity-universe/payload` serve the in-memory test fixture instead of the ~149.7MB artifact

**LOD Engine:**
- `LOD_SIGLIP_MODEL_ID` — HuggingFace model ID override
- `LOD_QUERY_ENCODER_PORT` — port override (`DEFAULT_PORT = 8091` in `services/lod-engine/server.py`); the previously documented `LOD_ENGINE_PORT` name does not exist in source

**Build / Deploy:**
- `NEXT_DIST_DIR` — alternate `.next` output directory (used for E2E isolation: `.next-e2e`)

---

*Integration audit: 2026-06-23 — verified from `server/auth.ts`, `server/db.ts`, `lib/acc/accdsToken.ts`, `lib/acc/accdsActivity.ts`, `lib/redis.ts`, `lib/server/uploadthing.ts`, `lib/google/` directory listing, `services/lod-engine/server.py`, `scripts/` directory listing, `scripts/start-local.ps1`, `next.config.ts`, `package.json`, env-var grep across all `.ts/.tsx/.cjs/.mjs` sources, `.tools/repo-map/architecture-summary.md`. Refreshed 2026-07-02 (post v2.2): `AccFolderPermissionSummary` projection + staleness bound documented (Ph19), DC coverage framing corrected, BND-02 resolution noted. Refreshed 2026-07-16: unified activity source documented from `lib/server/unifiedActivitySource.ts` + `lib/server/workflowToolsView.ts`; DC admin snapshot refresh from `scripts/dc-admin-snapshot-refresh.cjs`; ACCDS env vars from `scripts/accds-activity-ingest.cjs`; Trello/OpenAI/LOD/middleware VERIFY items closed against the tree. Refreshed 2026-07-20 (post v2.5 close, working tree includes the uncommitted `feat/access-analysis-redesign` state): unified-activity consumers re-derived by import grep; DC env flags re-verified from `scripts/dc-daily-ingest.cjs` header + `lib/acc/dcIngest.ts`/`dcProgressiveBackfill.ts`; Redis usage from `lib/redis.ts` importers; `NEXT_PUBLIC_*` flags re-grepped across `app`/`lib`/`components`/`server`. Refreshed 2026-07-22 (post v2.7 close): activity-universe pipeline verified from `scripts/compute_activity_embeddings.py`, `scripts/build-activity-universe-payload.ts`, `scripts/build-activity-author-attributes.ts`, `lib/server/activityUniversePayload.ts`, `app/api/activity-universe/payload/route.ts`; instance-pipeline retirement verified from commit `c28cb962` + `scripts/dc-daily-ingest.cjs` comment; flag list re-grepped at HEAD (working tree carries uncommitted access-analysis-redesign WIP with the same flag set).*
