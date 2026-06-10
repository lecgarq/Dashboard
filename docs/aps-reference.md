# APS (Autodesk Platform Services) Reference — Permanent Replacement for `APS_DOCS/`

> Generated 2026-06-10. This document fully replaces the local `APS_DOCS/` folder
> (~22 MB, 2,419 files of scraped APS documentation) so the folder can be archived
> outside the repo. It captures every APS endpoint this repo actually calls, the
> auth model, the gotchas learned in production, and an index of what the archive
> contained. Canonical upstream docs: https://aps.autodesk.com/developer/documentation

---

## VERDICT: `APS_DOCS/` is safe to archive outside the repo

- **Nothing imports or reads `APS_DOCS/` at runtime.** A full-repo grep for `APS_DOCS`
  (excluding `node_modules`, `.next*`, and the folder itself) finds only:
  - `lib/acc/ingestActivityZip.ts:56` — a **comment** citing
    `APS_DOCS/HOW TO/HOW_TO_Extract_Activity_Logs.md` as the provenance of CSV column names.
    No file I/O.
  - Prose references in `implementation_plan.md`, `.planning/codebase/STRUCTURE.md`,
    and archived planning docs under `docs/archive/planning/2026-05-18/` — historical
    citations only.
- No `readFile`/`readdir`/`require`/`import` anywhere targets the folder.
- `scripts/scrape-data-management-api.mjs` is the scraper that *produced* part of the
  archive (it writes to a `DATA MANAGEMENT API/` dir relative to cwd); it never reads it
  and is a one-off tool.
- The folder is pure reference material for humans/agents. Everything the repo depends on
  is captured below. **Archive it externally; do not keep it in the repo.**

---

## 1. Overview — which APS APIs this dashboard uses, and where

| APS API | Base path | Used by (file pointers) | Purpose in this repo |
|---|---|---|---|
| **Authentication v2** (OAuth) | `/authentication/v2` | `server/auth.ts:72-89` (NextAuth provider), `lib/server/aps-oauth.ts:19`, `lib/server/aps-user-token.ts:9`, `lib/acc/dcProjectDiscovery.ts:52` (2-leg), `scripts/aps-login.cjs`, `scripts/introspect-autodesk-token.cjs` | Dashboard login + 3-leg token lifecycle for all DC/admin calls; 2-leg for read-only admin sweeps |
| **Data Connector v1** | `/data-connector/v1` | `lib/acc/dcIngest.ts:110` (daily orchestrator), `scripts/dc-daily-ingest.cjs`, `scripts/dc-extract-id-list.cjs`, `scripts/dc-ingest-where-i-admin.cjs`, `scripts/deep-sync*.cjs`, `scripts/dc-*.cjs`, `scripts/scratch/*.cjs` | Bulk CSV extraction of activities + admin snapshot (the core data pipeline: 428 projects, 16,942 user-project instances) |
| **ACC Admin v1** | `/construction/admin/v1` | `lib/server/acc-admin.ts:8`, `lib/acc/quick-sync-extraction.ts:39`, `lib/acc/dcProjectDiscovery.ts:49`, `scripts/acc-grant-project-admin.cjs`, `scripts/acc-grant-model-coordination.cjs` | Project list, per-project users/roles/products, admin grants |
| **BIM 360 HQ v1/v2** (legacy admin) | `/hq/v1`, `/hq/v2` | `lib/server/acc-admin.ts:6` (v1 users), `lib/acc/quick-sync-extraction.ts:158` (v2 industry_roles), `scripts/acc-grant-project-admin.cjs` (v2 users/import) | Account-level user directory (email→id, role, last_sign_in), industry roles, BIM360-platform project user import |
| **Data Management v1** | `/project/v1`, `/data/v1` | `lib/acc/folderCrawl.ts:117,139`, `lib/server/integrations/aps.ts:77-142`, `server/routers/aps-search.ts:141,261,315`, `scripts/get-aps-hub-id.mjs` | Hub/project discovery, BFS folder crawl, folder search for Revit models |
| **BIM 360 Document Management v1** | `/bim360/docs/v1` | `lib/acc/folderCrawl.ts:164` | Per-folder role/user permission matrix (6M-row AccFolderPermission table) |
| **ACC Issues v1** | `/construction/issues/v1` | `lib/acc/issueListQuery.ts:18`, `scripts/acc-issues-backfill.cjs`, `scripts/issue-custom-fields.cjs` | Two-pass issues extraction (14,233 issues → AccIssue) |
| **Model Coordination (Model Set) v3** | `/bim360/modelset/v3` | `scripts/acc-issues-validate-clashes.cjs:38`, `scripts/mc-reopen-closed-clashes.cjs:131`, `scripts/mc-list-assigned.cjs`, `scripts/mc-reactivate-assigned.cjs` | List model sets per project (container) |
| **Clash v3** | `/bim360/clash/v3` | `scripts/acc-issues-validate-clashes.cjs:52`, `scripts/mc-reopen-closed-clashes.cjs:149,160` | Clash-validated MC issue classification; reopen closed clash groups |
| **Viewer v7 (JS, CDN)** | `/modelderivative/v2/viewers/7.*/` | `components/families/BimViewer.tsx:95,100` | 3D model display (script+CSS from CDN; token via `trpc.search.getApsToken`) |
| **Model Derivative REST** | `/modelderivative/v2/designdata` | **NOT used** (no `designdata` calls anywhere) | — |
| **OSS** | `/oss/v2` | **NOT called directly** (DC signed download URLs happen to be OSS signedresources; fetched bare) | — |
| **Webhooks API** | `/webhooks/v1` | **NOT used** (no webhook code in repo) | — |
| **Design Automation, Manufacturing Data Model, ACC Cost/Assets/RFIs/etc.** | — | **NOT used** | — |

Hub/account constants: the ACC **account id** is the Data Management **hub id minus the
`b.` prefix**. Same rule for project ids: Data Management endpoints (`/project/v1`,
`/data/v1`) need the `b.`-prefixed form; ACC Admin, BIM 360 Docs permissions, Issues,
Model Coordination, and Data Connector need the **bare UUID** (see
`lib/acc/folderCrawl.ts:441` and `lib/acc/quick-sync-extraction.ts`).

---

## 2. Authentication

### 2.1 Endpoints

| Method | Endpoint | Use |
|---|---|---|
| `GET` | `https://developer.api.autodesk.com/authentication/v2/authorize` | 3-leg browser redirect (`server/auth.ts:74`, `scripts/aps-login.cjs:62`) |
| `POST` | `https://developer.api.autodesk.com/authentication/v2/token` | All grants: `client_credentials` (2-leg), `authorization_code` (3-leg exchange), `refresh_token` |
| `POST` | `https://developer.api.autodesk.com/authentication/v2/introspect` | Token inspection (`scripts/introspect-autodesk-token.cjs`) |
| `GET` | `/authentication/v2/users/@me` (a.k.a. USERINFO) | Resolve Autodesk user id (`sub`) from a 3-leg token |
| `GET` | `/authentication/v2/keys`, `/.well-known/openid-configuration`, `/logout`, `POST /revoke` | Available; not used here |

Token endpoint auth method: `client_secret_post` (client_id + client_secret in the form
body — see `server/auth.ts:89`).

### 2.2 Scopes used by this repo

- **Dashboard login + all 3-leg work** (`server/auth.ts:27`, `lib/server/aps-oauth.ts:22`,
  `lib/server/aps-user-token.ts:12`):
  `openid data:read data:create viewables:read user:read account:read`
  - `data:create` is REQUIRED for `POST /data-connector/v1/.../requests`.
- **2-leg sweeps** (`lib/acc/dcProjectDiscovery.ts:144`): `account:read data:read`
- **Clash reopen** (`scripts/aps-login.cjs`): dashboard scopes **plus `data:write`**
  (needed for `clashes:reopen`).
- Full APS scope catalog (for reference): `data:read|write|create|search`,
  `bucket:create|read|update|delete`, `code:all`, `account:read|write`,
  `user:read|write`, `viewables:read`, `openid`.

### 2.3 Two-legged vs three-legged — what works here (hard-won)

- **2-leg (client_credentials)**: works for ACC Admin v1 / HQ v1+v2 reads and user
  grants (with `User-Id` / `x-user-id` headers to act on behalf of a user). It is
  **permanently blocked for Data Connector** on this account — DC requires *user
  context* (3-leg or SSA). Memory: `project_data_connector_declined.md` (2026-05-12).
- **3-leg (authorization_code)**: the dashboard's Autodesk login persists
  `access_token` / `refresh_token` / `expires_at` / `scope` on the NextAuth `Account`
  row (provider `"autodesk"`). All DC extraction and clash work runs as
  `luis.cortes@hermosillo.com` (env `DC_USER_EMAIL` / `APS_USER_EMAIL`).
- **NextAuth provider config gotcha**: `issuer` must be exactly
  `https://developer.api.autodesk.com` (`server/auth.ts:72`) or the OIDC id_token
  validation fails (fixed during the local-Postgres migration, 2026-05-18).
- **SSA (Secure Service Accounts)**: documented APS alternative for headless DC auth —
  classified as 3-leg because it preserves user context. Not implemented here.

### 2.4 Refresh-token single-use rotation (CRITICAL gotcha)

APS v2 **refresh tokens are single-use**. Every `grant_type=refresh_token` call returns
a NEW refresh_token and invalidates the old one. Any script that refreshes the stored
token **must persist the rotation back to the DB** (`refresh_token: json.refresh_token
?? old`, see `lib/server/aps-oauth.ts:102-111`), otherwise the dashboard login breaks
(this happened 2026-06-01; recovery = re-login via `scripts/aps-login.cjs`).
Both token helpers also skip the refresh entirely while the access token still has
>5 min of life (`REFRESH_BUFFER_SEC = 300`).

Token lifetimes: access token `expires_in` ≈ 3600 s; refresh token long-lived until used
or revoked.

### 2.5 Re-login recipe (when refresh chain is broken)

`node --env-file=.env scripts/aps-login.cjs` — spins a localhost PKCE (S256)
authorization-code flow on the registered callback
(`http://localhost:6263/api/auth/callback/autodesk` by default; the dashboard's
registered callback is `http://localhost:3000/api/auth/callback/autodesk` — port 3000
must be free if reusing it). Persists the new token set onto the Account row.

### 2.6 Rate limits

General APS rate limiting returns `429 Too Many Requests` with `Retry-After` (seconds)
header and body `{"developerMessage":"Quota limit exceeded."}`. The repo's standard
handling is `fetchWithRetry` (`lib/server/acc-admin.ts:56`): honor `Retry-After`, else
exponential backoff, max 4 attempts. Data Connector has its own much harsher daily quota
(§3.4).

---

## 3. Data Connector API (`/data-connector/v1`) — the core pipeline

All endpoints: **user context required (3-leg/SSA)**. `accountId` = hub id without `b.`.

### 3.1 Endpoints used

| Method | Endpoint | Scope | Used in |
|---|---|---|---|
| `POST` | `/accounts/:accountId/requests` | `data:create` | `dcIngest.ts dcSubmit()` (~line 220), every `dc-*.cjs` script |
| `GET` | `/accounts/:accountId/requests` | `data:read` | `verify-data-connector.cjs`, `probe-data-connector-3leg.cjs` |
| `GET` | `/accounts/:accountId/requests/:requestId/jobs` | `data:read` | poll loop (`dcIngest.ts` ~283) |
| `GET` | `/accounts/:accountId/jobs/:jobId/data-listing` | `data:read` | list extract files (`dcIngest.ts` ~338) |
| `GET` | `/accounts/:accountId/jobs/:jobId/data/:name` | `data:read` | per-file **signed URL** (`dcIngest.ts` ~364) |
| (also documented, unused) | `GET/PATCH/DELETE /requests/:id`, `GET /jobs`, `GET /jobs/:jobId`, `DELETE /jobs/:jobId` | | |

### 3.2 `POST /requests` body (as this repo sends it, `dcIngest.ts:206-215`)

```json
{
  "description": "…",
  "scheduleInterval": "ONE_TIME",
  "effectiveFrom": "<now ISO>",
  "serviceGroups": ["activities", "admin"],
  "dateRange": "CUSTOM",
  "startDate": "<ISO>",
  "endDate": "<ISO>",
  "projectIdList": ["<uuid>", "…"]
}
```

Key request-field facts (preserved from the spec):

- `serviceGroups` — standard groups: `all, activities, admin, assets, checklists, cost,
  dailylogs, forms, iq, issues, locations, markups, meetingminutes, photos,
  relationships, reviews, rfis, schedule, sheets, submittals, submittalsacc,
  transmittals`. Delta (beta, CDC prefix): `cdcadmin, cdccost, cdcissues, cdclocations,
  cdcrfis, cdcschedule, cdcsubmittalsacc, cdcsheets, cdcmeetingminutes,
  cdctransmittals`. `admin` includes both project and hub admin.
- `projectIdList` — **max 50 project IDs** per request. **Required for project-admin
  users** (our case: luis is project-scoped admin, not Account Admin). Optional for
  Executive Overview users (omit → hub-wide).
- `dateRange` — `TODAY | YESTERDAY | PAST_7_DAYS | MONTH_TO_DATE | LAST_MONTH | CUSTOM`
  (CUSTOM requires both `startDate` and `endDate`). Applies to activities + CDC groups.
- Activities data replication can be delayed **up to 20 minutes** — don't extract right
  up to "now".
- If only one of startDate/endDate given, it's used for both. Over-long ranges silently
  fall back to the schema's default range.
- `scheduleInterval`: `ONE_TIME | DAY | WEEK | MONTH | YEAR` (+`reoccuringInterval`
  multiplier, `effectiveTo` required for recurring). We only use `ONE_TIME`.
- `callbackUrl` (optional) — DC POSTs
  `{accountId, requestId, jobId, state:"complete", success:true|false}` on job end.
- `sendEmail` (default true), `projectStatus`: `all (default) | archived | active`.
- Response `201 Created` → body has `id` (the requestId) + echo of all fields.

### 3.3 Job lifecycle + download

1. `GET /requests/:requestId/jobs` → array (possibly under `data` or bare) of
   `{ id, status, … }`. Job status values: **`running` / `success` / `failed`** in the
   jobs listing; the `GET /jobs/:jobId` detail spec enumerates
   `Failed, Running, Succeeded, Archived` plus a `completionStatus`. Poll with backoff
   (repo: 30 s interval, 1 h timeout per slice).
2. `GET /jobs/:jobId/data-listing` → `[{ name, createdAt, size }]` per extract file.
3. `GET /jobs/:jobId/data/:name` → JSON containing a **signed URL** (key may be `url`,
   `signedUrl`, or `downloadUrl` — repo accepts all three, `dcIngest.ts:369-377`).
4. Fetch the signed URL with a **bare GET — NO Authorization header** (signed S3/OSS
   URL; adding auth breaks it). This is "Pitfall 1" in the orchestrator.

Status codes (same table on all DC endpoints): `200/201` success, `400` bad params,
`401` invalid token, `403` no permission, `404` not found, `429` rate/quota, `500`,
`503`.

### 3.4 The daily quota (~25 requests/UTC-day per user)

- Empirically hit 2026-05-13: APS allows roughly **25 Data Connector requests per
  user per UTC day**; further `POST /requests` returns `429`.
- Repo constants: `lib/acc/dcQuota.ts` — `DAILY_QUOTA_CAP = 25`,
  `DAILY_SAFE_REQUEST_BUDGET = 20` (leave headroom). Quota resets at UTC midnight
  (`nextDailyQuotaReset`). On 429 the run finalizes as `quota-paused` and the next
  daily run resumes; `DC_RESUME=1` retries the same day after reset.
- Priority mode (`DC_PRIORITY_BACKFILL=1`, reserve 4 of 20 for starved projects) only
  reorders slices; it doesn't change quota.

### 3.5 CSV schema variants (2026-05-15 discovery)

- **Per-module format** (what multi-day/backfill extracts return): 46 files per request
  for the activities group, named `activities_<module>_activities.csv` — strict regex
  `^activities_([a-z_]+)_activities\.csv$/i` (`lib/acc/dcActivityCsvIngest.ts:45`;
  rejects `activities_<mod>_changes.csv` audit siblings and `submittals_target_*.csv`).
  Known modules (`KNOWN_MODULES`): `docs, issues, submittals, rfis, sheets, admin,
  cost, assets, bridge`. Unknown module names are surfaced to
  `AccDcIngestRun.unknownModulesSeen`, never silently ingested.
- **Admin snapshot CSVs** (15+ files per extract) — allowlist ingested
  (`lib/acc/dcAdminCsvIngest.ts:309`): `admin_users.csv, admin_companies.csv,
  admin_projects.csv, admin_accounts.csv, admin_business_units.csv, admin_roles.csv,
  admin_project_users.csv, admin_project_user_roles.csv,
  admin_project_user_products.csv, admin_project_user_companies.csv,
  admin_project_user_services.csv, admin_project_roles.csv,
  admin_project_products.csv, admin_project_companies.csv,
  admin_project_services.csv, admin_account_services.csv`.
  **Note:** `admin_roles.csv` is never actually delivered by DC for this hub →
  `AccDcRole` is permanently empty; role names come from live `AccRole` instead
  (mergeRoleNames fix, 2026-06-01).
- **Legacy single-ZIP format** (`project_activities.csv`, `admin_activities.csv`,
  `users.csv`, `projects.csv` in one ZIP with a single `downloadUrl` on the job):
  only returned for `dateRange: YESTERDAY`-style small extracts. Handled by the older
  `lib/acc/ingestActivityZip.ts`. Activity CSV column mapping (from the scraped HOW TO):
  Date→`created_at`, Product/Tool→`service`/`tool`, Activity type→`action`,
  Member→`user_id`, details→`details`/`description`. Ingest is defensive about
  snake_case vs camelCase drift (`user_id|userId|actor_id|actorId|created_by`).
- Column-name drift between extracts is real (Bug D, 2026-05-18) — mappers accept
  aliases like `account_id|bim360_account_id`, `project_id|bim360_project_id`.

### 3.6 403 / LOCKED semantics

- `POST /requests` returns **403 for the whole batch** if ANY project in
  `projectIdList` is one the user can't extract (the requesting user must be project
  admin on every listed project). Repo salvage: `DC_403_BISECT=1` enables
  `bisectOnForbidden` (`lib/acc/dcBisect.ts`) to binary-search the good subset.
- Account reality (2026-05-29): only **428 of 1152 active projects** are
  DC-extractable; 724 are LOCKED (403) because luis is project-scoped admin, not
  Account Admin. Unlocking requires an Account Admin grant — cannot self-grant.
- Prerequisite for ANY DC access: the APS app must be added as a **Custom Integration**
  in ACC Account Admin settings, and the authorizing user needs **Account Admin or
  Executive Overview** (or per-project admin + `projectIdList`).

---

## 4. ACC Admin (`/construction/admin/v1`) and BIM 360 HQ (`/hq/v1`, `/hq/v2`)

2-leg or 3-leg both accepted on these. Two response conventions — do not mix the
fetchers (`lib/server/acc-admin.ts:115-118`):
- **ACC Admin v1** returns `{ pagination: { totalResults, limit, offset }, results: [...] }`.
- **HQ v1/v2** returns a **bare JSON array** (paginate with `limit`/`offset` until a
  short page).

### 4.1 Endpoints used

| Method | Endpoint | Used in | Notes |
|---|---|---|---|
| `GET` | `/construction/admin/v1/accounts/:accountId/projects?limit=100&offset=N` | `quick-sync-extraction.ts:67` | All projects; trust pagination loop, `totalResults` drifts on freshly-deleted projects |
| `GET` | `/construction/admin/v1/projects/:projectId` | `verify-data-connector.cjs` probes | Project detail |
| `GET` | `/construction/admin/v1/projects/:projectId/users?limit=200&offset=N[&fields=…]` | `quick-sync-extraction.ts:361` | Per-project member roster (roles, products, accessLevels). **ACC project templates reject the `?fields=` query** — retry without it |
| `GET` | `/construction/admin/v1/accounts/:accountId/users/:userId/projects` | `acc-admin.ts:256`, `dcProjectDiscovery.ts:81` | Projects for one user; `accessLevels.projectAdmin` boolean = project admin |
| `GET` | `/construction/admin/v1/accounts/:accountId/users/:userId/roles?filter[status]=active` | `acc-admin.ts:304` | Role names + `projectIds[]` per role |
| `GET` | `/construction/admin/v1/accounts/:accountId/users/:userId/products` | `acc-admin.ts:345` | Product keys (`docs`, `build`, `projectAdministration`, …) + `projectIds[]` |
| `POST` | `/construction/admin/v1/projects/:projectId/users` (+ header `User-Id: <autodeskId>`) | `acc-grant-project-admin.cjs:66`, `acc-grant-model-coordination.cjs` | Add/grant member on ACC-platform project. Body: `{email, products:[{key, access:"administrator"|"member"}], suppressAdministrativeEmails}`. `201` created, `409` already exists, `400` w/ "ACC" text → it's a BIM360-platform project (fall back to HQ v2 import) |
| `GET` | `/hq/v1/accounts/:accountId/users?limit=100&offset=N` | `acc-admin.ts:153,199` | Whole account directory. **No server-side email filter** — paginate and match client-side. Key fields verified: `id, email, name, status, role ("account_admin"\|"account_user"\|"project_admin"), company_name, created_at, job_title, last_sign_in` |
| `GET` | `/hq/v1/accounts/:accountId/users/search?email=…&limit=5` | `acc-grant-project-admin.cjs:56` | Email search (HQ v1 flavor) — returns array |
| `GET` | `/hq/v2/accounts/:accountId/industry_roles` | `quick-sync-extraction.ts:177` | Account-level industry roles (bare array) |
| `GET` | `/hq/v2/accounts/:accountId/projects/:projectId/industry_roles` | `quick-sync-extraction.ts:429` | Per-project roles (bare array) |
| `POST` | `/hq/v2/accounts/:accountId/projects/:projectId/users/import` (+ header `x-user-id: <bim360Id>`) | `acc-grant-project-admin.cjs:71` | BIM360-platform grant. Body: `[{email, services:{project_administration:{access_level:"admin"}, document_management:{access_level:"admin"}}, industry_roles:[]}]`. Success = `failure===0 && success>=1`; failure code `2000` = "User already exists in project" |

### 4.2 Semantics worth remembering

- HQ v1 `role` field is the **account-admin flag** (`account_admin`), distinct from
  per-project `accessLevels.projectAdmin` from ACC Admin v1.
- HQ v1 `created_at` ≈ "ACC member added on" (record creation); `last_sign_in` = last
  activity; both ISO 8601.
- `429` handling: `Retry-After` header honored, exponential backoff fallback
  (`fetchWithRetry`).
- `403` on admin endpoints → "Account Admin privileges required / app not provisioned
  as Custom Integration" (`acc-admin.ts:87-92`).

---

## 5. Data Management API (`/project/v1`, `/data/v1`) — folder crawl & search

2-leg or 3-leg. Project/hub IDs **with `b.` prefix** here. JSON:API response format
(`data[]`, `attributes`, `relationships`, `links.next` for pagination).

| Method | Endpoint | Used in | Notes |
|---|---|---|---|
| `GET` | `/project/v1/hubs` | `lib/server/integrations/aps.ts:90`, `scripts/get-aps-hub-id.mjs` | Hub discovery (hub id → strip `b.` for admin/DC) |
| `GET` | `/project/v1/hubs/:hubId/projects/:projectId/topFolders` | `folderCrawl.ts:117`, `integrations/aps.ts:104`, `aps-search.ts:261` | Root folders (Project Files, Plans, …) |
| `GET` | `/data/v1/projects/:projectId/folders/:folderId/contents` | `folderCrawl.ts:139`, `integrations/aps.ts:117` | Folder children. **Deliberately NOT using `filter[type]=folders`** (Slice D, 2026-05-29): the unfiltered response also returns items, giving 6 free folder attributes (size/version/last-updated/updated-by/added-by/description) the crawl now persists |
| `GET` | `/data/v1/projects/:projectId/folders/:folderId` | `aps-search.ts:315` | Single folder metadata (name, parent) |
| `GET` | `/data/v1/projects/:projectId/folders/:folderId/search?filter[…]&page[limit]=100` | `aps-search.ts:141` | Recursive search within folder tree (used to find Revit models; page via `page[limit]`/`page[number]`) |
| `GET` | `/data/v1/projects/:projectId/items/:itemId` | `integrations/aps.ts:142` | Item (file) metadata + tip version / derivative URN |

Folder URNs look like `urn:adsk.wipprod:fs.folder:co.XXXX`. The crawl is BFS with
pLimit concurrency and a time budget; folders are upserted additively (never deleted).

### 5.1 BIM 360 Docs folder permissions (`/bim360/docs/v1`)

`GET https://developer.api.autodesk.com/bim360/docs/v1/projects/:project_id/folders/:folder_id/permissions`
(`folderCrawl.ts:164`)

- Auth: 2-leg or 3-leg (`user context optional`); scope `data:read`; project id
  **without** `b.`; optional `x-user-id` header in 2-leg mode.
- Response: array of subjects:
  `{ subjectId, autodeskId, name, email, userType (PROJECT_ADMIN|PROJECT_MEMBER),
  subjectType (USER|COMPANY|ROLE), subjectStatus (ACTIVE|INACTIVE|PENDING|DISABLED),
  actions[], inheritActions[] }`. Effective permission = union of `actions` +
  `inheritActions`. Project admins: non-inherited on root, inherited elsewhere.
- Status codes: `200, 400, 403, 404, 429, 500`.
- **Actions → UI tier mapping** (BIM 360 Document Management; this is the
  single source of truth mirrored in `lib/acc/permissionMapping.ts`):

| `actions[]` | UI permission level |
|---|---|
| `VIEW, COLLABORATE` | View Only |
| `VIEW, DOWNLOAD, COLLABORATE` | View/Download |
| `PUBLISH` | Upload Only |
| `PUBLISH, VIEW, DOWNLOAD, COLLABORATE` | View/Download + Upload |
| `PUBLISH, VIEW, DOWNLOAD, COLLABORATE, EDIT` | View/Download + Upload + Edit |
| `PUBLISH, VIEW, DOWNLOAD, COLLABORATE, EDIT, CONTROL` | Full Controller (folder admin) |

  Forma Files adds `PUBLISH_MARKUP` between View/Download and Upload tiers. The repo's
  `mapActions()` uses round-down semantics (highest tier fully covered wins; extras →
  `extended=true`; unknown actions warned + discarded).
- Gotcha: some projects return `[]` quietly (FWD-Promociones shape) — the crawl marks
  `partial` + `permissions_empty` and a recovery pass (`folder-perms-recover.cjs`)
  retries. Crawl filters to `subjectType === "ROLE"` entries (user perms out of scope);
  live-sync only covers ~950 projects.

---

## 6. ACC Issues v1 + Model Coordination (clash) — as used

### 6.1 Issues (`/construction/issues/v1`)

`GET https://developer.api.autodesk.com/construction/issues/v1/projects/:projectId/issues?limit=…&offset=…&filter[deleted]=true|false`
(built by `lib/acc/issueListQuery.ts:18`; consumed by `scripts/acc-issues-backfill.cjs`)

- Auth: **user context required**, scope `data:read`. Project id bare UUID.
- The repo runs **two passes per project**: `filter[deleted]=false` then `=true`,
  de-duped by issue id (deleted issues are invisible without the explicit filter).
- Response: `{ pagination, results: [...] }`; each issue includes `id, displayId,
  title, description, status, issueTypeId, issueSubtypeId, deleted, createdBy,
  createdAt, …` (full payload stored as `rawJson` in `AccIssue`).
- `403` per project = no Issues access there (counted, not fatal).
- **CRITICAL gotcha — never use the `fields=` query param on the issues list**: it
  corrupts `deleted` (returns `true` for everything) **and silently drops ~3k issues**.
  Discovered 2026-06-05; comment enshrined at `scripts/acc-issues-backfill.cjs:22`.
- Related endpoints documented in the archive (unused here): `GET/PATCH /issues/:id`,
  `POST /issues`, `GET /issue-types`, `GET /issue-attribute-definitions`,
  `GET /issue-root-cause-categories`, attachments, comments.

### 6.2 Model Coordination model sets (`/bim360/modelset/v3`)

- **`containerId == projectId`** (bare UUID) for ACC projects.
- `GET /bim360/modelset/v3/containers/:containerId/modelsets?…continuationToken…`
  (`acc-issues-validate-clashes.cjs:38`, `mc-reopen-closed-clashes.cjs:131`).
  Auth: user context required, `data:read`. Paginate via continuation token; model set
  ids under `modelSets[].modelSetId` (or `id`).
- Note from the master reference: the MC base is `bim360/modelset/v3` — **not** an
  `acc/` path — even for ACC projects.

### 6.3 Clash (`/bim360/clash/v3`)

| Method | Endpoint | Used for |
|---|---|---|
| `GET` | `/bim360/clash/v3/containers/:cid/modelsets/:msid/clashes/assigned?…` | Issue ids generated from clashes (validates "Model Coordination" classification; recovered 825 Spanish/edited issues the heuristic missed) |
| `GET` | `/bim360/clash/v3/containers/:cid/modelsets/:msid/clashes/closed?…` | List closed clash groups |
| `POST` | `/bim360/clash/v3/containers/:cid/modelsets/:msid/clashes:reopen` | Reopen closed groups. **Hard API limit: max 20 group IDs per call** (`mc-reopen-closed-clashes.cjs:43`). Requires `data:write` scope (the aps-login.cjs extra scope) |

Auth: user context required, `data:read` (reopen needs `data:write`). The archive also
documents test-scoped variants (`/tests/:testId/clashes/...`) and grouped clash
endpoints — unused here.

Classification note (2026-06-05): Autodesk itself cannot separate clash-born issues
from ordinary Build issues in the activity stream — the clash `assigned` endpoint is
the only ground truth (`clashValidated` flag in `AccIssue`).

---

## 7. Model Derivative / OSS / Viewer

- **Model Derivative REST** (`/modelderivative/v2/designdata/...` — job submission,
  manifests, metadata/properties extraction): **not called by this repo.** The archive
  documented it fully (265 files); see §10 + aps.autodesk.com if ever needed.
- **Viewer v7 (JS)**: `components/families/BimViewer.tsx` loads
  `https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js`
  and `style.min.css` from the CDN, initializes `Autodesk.Viewing.GuiViewer3D`, loads
  `"urn:" + urn` via `Autodesk.Viewing.Document.load`. Access token comes from
  `trpc.search.getApsToken` (3-leg token surfaced server-side; viewer needs
  `viewables:read`).
- **OSS** (`/oss/v2`): no direct bucket/object calls. The only OSS touchpoint is that
  DC legacy `downloadUrl`s are `oss/v2/signedresources/...` signed URLs — fetched bare.
- **Webhooks API**: not used anywhere in the repo (no registration, no handlers).

---

## 8. Cross-cutting operational knowledge (repo-proven)

- **Standard error envelope**: APS errors carry `developerMessage` and/or `detail`/
  `title` keys; repo extracts whichever exists (`acc-admin.ts:71-97`).
- **Status-code playbook**: `401` → token expired/rotation broken → reconnect;
  `403` → provisioning (Custom Integration / Account Admin / project membership);
  `429` → `Retry-After` or backoff (DC: stop for the UTC day); `5xx` on DC submit →
  retry ×4 w/ 10/20/40/80 s backoff; `504` on DC submit happens and is retried.
- **ID prefix matrix**:

| API family | Hub/account id | Project id |
|---|---|---|
| Data Management (`project/v1`, `data/v1`) | `b.`-prefixed | `b.`-prefixed |
| ACC Admin / HQ / DC / Issues / MC / Clash / Docs-permissions | bare UUID | bare UUID |

- **Pagination matrix**:

| API | Mechanism |
|---|---|
| ACC Admin v1 | `limit`/`offset` + `{pagination:{totalResults,limit}, results}` (trust short page over totalResults) |
| HQ v1/v2 | `limit`/`offset`, bare array, stop on short page |
| Data Management | JSON:API `page[limit]`/`page[number]`, `links.next` |
| Issues v1 | `limit`/`offset` + `{pagination, results}` |
| Model set / Clash v3 | `continuationToken` query param |
| Data Connector | n/a (request/job model) |

- **DC submit limits**: ≤50 projects per request; ~25 requests/user/UTC-day; activities
  lag ≤20 min; one 403 project poisons the whole batch (bisect to salvage).

---

## 9. What `APS_DOCS/` contained (index of the external archive)

Total: **2,419 files** (~22 MB): 2,401 scraped-JSON endpoint/spec pages, 18 markdown
files. Scraped 2026-05-08 from aps.autodesk.com by `scripts/scrape-data-management-api.mjs`
(and siblings). Each per-API folder has an `_index.json` manifest for programmatic
navigation. Each REST JSON file contains: `_meta.source` (the live docs URL),
`endpointUrl`, `tables` (method/URI, auth context, scopes, params, status codes,
response fields) and `codeExamples` (curl + sample request/response JSON) — i.e. a
faithful flattening of the official docs page.

| Folder | Files | Contents |
|---|---|---|
| `APS_MASTER_REFERENCE.md` (top level) | 1 | Auto-generated master dictionary: decision matrix, per-API endpoint tables, base-URL table, scope list, cross-API workflow recipes. Substantially reproduced in this doc. |
| `APS_REFERENCE/` | 8 | Condensed per-API markdown summaries: `00_INDEX`, `01_AUTHENTICATION_API`, `02_DATA_MANAGEMENT_API`, `03_MODEL_DERIVATIVE_API`, `04_VIEWER_API`, `05_DESIGN_AUTOMATION_API`, `06_BIM360_ACC_API`, `07_MANUFACTURING_DATA_MODEL_API` |
| `HOW TO/` | 9 | **The most repo-relevant part** — custom audit/extraction guides written for this dashboard: Extract_Activity_Logs (DC workflow; §3 supersedes it), Extract_Folder_Role_Permissions (3-API recipe; §5 supersedes), Extract_Project_Members, Extract_Last_Sign_In, Extract_Last_User_File_Activity, Extract_Project_Info, Extract_All_Roles, Extract_All_Files_and_Folders, Extract_Recent_User_Additions |
| `ACC (FORMA) API/` | 519 | ACC v1 unified APIs: REST API specs (Issues, Data Connector requests/jobs/data-listing, Model Coordination modelsets, Clash v3 incl. `clashes:reopen`, Takeoff, Transmittals, Sheets, Submittals, RFIs, Forms, Cost, Assets, Locations, Relationships), `Other/` (changelogs + field guides per product), `Tutorials/` |
| `BIM 360 API/` | 394 | Legacy BIM 360 REST: HQ admin v1/v2 (users, users/search, projects, companies, business units, industry_roles), Document Management (folder permissions GET + batch create/update/delete, custom attributes, naming standards), Issues v1 legacy, Model Coordination, Checklists, plus Tutorials |
| `DATA MANAGEMENT API/` | 764 | Hubs/Projects/Folders/Items/Versions/Commands REST specs, full OSS (buckets, objects, signed S3 upload/download incl. batch + resumable), and complete .NET + TypeScript SDK references for DM and OSS |
| `AUTHENTICATION API/` | 72 | OAuth v2 REST (authorize, token, introspect, revoke, keys, users/@me, OIDC discovery), Developer Guide (app types, **rate-limiting**: "APS Rate Limits and Quotas" — the 429/Retry-After/`developerMessage` shape preserved in §2.6), .NET + TS SDK refs, tutorials |
| `MODEL DERIVATIVE API/` | 265 | Translation jobs, manifests, metadata/properties extraction, signed cookies, thumbnails; Developer Guide incl. rate-limiting; .NET + TS SDKs. Unused by repo |
| `VIEWER API/` | 160 | Viewer v7 JS SDK class reference (GuiViewer3D, Document, extensions catalog), developer guide, interactive examples. Only the init pattern (§7) is used here |
| `DESIGN AUTOMATION API/` | 114 | DA v3 (appbundles/activities/workitems/engines), engine-specific guides (Revit/Inventor/Fusion), rate limits. Unused |
| `MANUFACTURING DATA MODEL API/` | 113 | FDX GraphQL schema (queries/mutations/objects), tutorials. Unused |

If something is missing from this document, look it up in the external archive by the
folder/file names above, or live at
`https://aps.autodesk.com/en/docs/<api>/v1|v2/reference/http/...` — every scraped file's
`_meta.source` pointed at the corresponding live page, and the live docs remain the
canonical source.
