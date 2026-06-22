# Phase 8: Activity Re-Extraction (free ACCDS web-session crawler) — Research

**Researched:** 2026-06-22
**Domain:** Extraction operations — ACCDS session-cookie crawler, APS 2-legged folder crawl, Prisma DB verification
**Confidence:** HIGH (all claims grounded in verified repo source files)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Extraction method (LOCKED):** ACCDS session-cookie crawler ONLY. No DC/APS quota path. Re-login via `node scripts/accds-login.cjs` on `SessionExpiredError`; resume via `ACCDS_RESUME=1`.
- **History depth (LOCKED: max available):** Set `ACCDS_MONTHS_BACK` high enough to cover each project's full lifetime. VERIFY: whether `accds/v0` itself caps `filter[created_at]` at a server-side floor.
- **Project source (LOCKED: spike full membership first):** Spike whether `accds/v0` returns activity for member-only (non-admin) projects before any admin grant. If yes → full membership list becomes the crawler source. If no → fall back to ≈428 admin set.
- **Admin-grant route (LOCKED: do NOT self-elevate):** Granting admin on ~724 projects is a bulk, hard-to-reverse change. Revisit ONLY if spike proves `accds/v0` is admin-gated AND Account Admin signs off + 1-project prototype.
- **Folder data (LOCKED: yes):** Run `scripts/folder-crawl-cron.cjs` (2-legged APS app-credential) to populate `AccFolder.totalSizeBytes` + `AccFolderPermission` for Phase 13 treemap. OOM guard: `AccFolderPermission` queries must use `GROUP BY + LIMIT`.
- **Currency gate (LOCKED: report, don't block):** No strict recency threshold. Take everything available; record actual latest `AccActivityAccds.createdAt`. Use `scripts/diag-accds-recency.cjs` to report, not to fail.
- **Timeline (LOCKED: no hard date):** Run to completion.

### Claude's Discretion

- Exact `ACCDS_MONTHS_BACK` numeric value (pick a safe large value covering oldest project — e.g. 84 for 7 years).
- Concurrency tuning if a run trips rate limits.
- Folder-crawl scheduling relative to activity crawl (independent jobs; either order is fine).
- Which diagnostics to run for reconciliation (`verify-accds-merge.cjs` vs `diag-accds-vs-dc.cjs`) and how to present the summary.

### Deferred Ideas (OUT OF SCOPE)

- Unlock the ~724 member-only projects via Account Admin bulk grant.
- DC `AccActivity` CSV refresh (the quota-bound path).
- Data-authority decision (AccActivityAccds vs AccActivity as the source for Phases 12/14) — deferred to Phase 11/12 plan.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Hub activity re-extracted current through today for all admin-accessible projects via FREE ACCDS session crawler. Writes `AccActivityAccds`. | `scripts/accds-activity-ingest.cjs` + `lib/acc/accdsActivity.ts` — crawler and endpoint fully verified. Project set = `distinct AccActivity.projectId` (≈428). |
| DATA-02 | Crawl resumes un-crawled remainder (`ACCDS_RESUME=1`) and recovers from session-cookie expiry without manual babysitting. | RESUME logic in `accds-activity-ingest.cjs` lines 78–85 skips projects already having accds rows. `SessionExpiredError` throws and halts the run — re-login required. |
| DATA-03 | ACC web session (`scratch/acc-session.json`) is the auth; bootstrapped once; refreshed on `SessionExpiredError`. No APS refresh-token rotation. | `scripts/accds-login.cjs` (Playwright login → storageState). `lib/acc/accdsToken.ts` (`createTokenProvider`) caches and refreshes the bearer from the session cookie. |
| DATA-04 | Recency + reconciliation check confirms `AccActivityAccds` is current across the admin project set before downstream phases proceed. | `scripts/diag-accds-recency.cjs` (count / date range / distinct projects / per-day histogram). `scripts/verify-accds-merge.cjs` (5-assertion reconciliation with DC baseline). |
</phase_requirements>

---

## Summary

Phase 8 is pure extraction operations on an existing, working crawler stack. No new TypeScript product code is written. The phase has one centerpiece: a spike to determine whether the `accds/v0` endpoint returns data for projects where Luis is a member but not admin. If yes, the project source expands from ≈428 (the `AccActivity` admin ceiling) to the full ~1,152 membership set — giving Phase 12/14 coverage over the entire hub with no permission change and no quota spend.

The crawler (`scripts/accds-activity-ingest.cjs`) is well-implemented and well-understood from source: it reads project IDs from `AccActivity`, windows the date range into ≤30-day slices via `splitWindows`, fetches pages in parallel via `crawlProjectActivity`, deduplicates by `activity_id`, and upserts into `AccActivityAccds` with `skipDuplicates`. Resume and expiry recovery are already built in. The only unknowns that must be settled by running the spike are: (1) whether `accds/v0` is member-accessible without admin, and (2) the server-side history floor (if any) for `filter[created_at]`.

The folder crawl (`scripts/folder-crawl-cron.cjs`) is an independent 2-legged APS job that writes `AccFolder.totalSizeBytes` and `AccFolderPermission`. It has no session dependency, no DC quota, and no refresh-token rotation risk. It can run before, after, or in parallel with the activity crawl.

**Primary recommendation:** Plan 3 tasks: (1) session spike on a member-only project, (2) full activity crawl with `ACCDS_MONTHS_BACK` set large, (3) folder crawl. Gate downstream phases on `SELECT COUNT(DISTINCT "projectId"), MAX("createdAt") FROM "AccActivityAccds"` showing the full crawled set.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Activity extraction (ACCDS) | Script / OS process | Database (Prisma upsert) | No app server involved; direct crawl-to-DB |
| Session auth | File system (`scratch/acc-session.json`) | In-process token cache (`createTokenProvider`) | Playwright storageState → cookie header → bearer token |
| Folder crawl auth | APS 2-legged (client_credentials) | In-process token refresh | No session, no user-context, no DC quota |
| Coverage verification | Database (raw SQL) | Diagnostic scripts | `diag-accds-recency.cjs` + `verify-accds-merge.cjs` |
| Progress monitoring | Optional Python process | Database (read-only poll) | `scripts/accds_progress_ui.py` on :4322 |

---

## Standard Stack

No new npm packages needed. Phase 8 is entirely script execution against the existing stack.

### Existing stack used

| Component | Source | Purpose |
|-----------|--------|---------|
| `scripts/accds-activity-ingest.cjs` | `[VERIFIED: repo]` | Main crawler — reads project IDs, pages `accds/v0`, upserts `AccActivityAccds` |
| `scripts/accds-login.cjs` | `[VERIFIED: repo]` | Playwright login → `scratch/acc-session.json` (Playwright `storageState`) |
| `lib/acc/accdsActivity.ts` | `[VERIFIED: repo]` | `splitWindows` (≤30d), `fetchActivityWindow` (retry/backoff), `crawlProjectActivity` (parallel pages) |
| `lib/acc/accdsToken.ts` | `[VERIFIED: repo]` | `loadCookieHeader`, `createTokenProvider` (cached bearer), `SessionExpiredError` |
| `lib/acc/accdsActivityMap.ts` | `[VERIFIED: repo]` | `mapAccdsRow` — maps raw `AccdsActivityRow` → `AccdsActivityInsert` |
| `scripts/diag-accds-recency.cjs` | `[VERIFIED: repo]` | Reports total rows, date range, distinct project count, per-day histogram (last 21d) |
| `scripts/verify-accds-merge.cjs` | `[VERIFIED: repo]` | 5-assertion reconciliation of ACCDS vs DC baseline (partitioned merge model) |
| `scripts/diag-accds-vs-dc.cjs` | `[VERIFIED: repo]` | Parity check: per-project+month ACCDS vs DC row counts and verb breakdown |
| `scripts/folder-crawl-cron.cjs` | `[VERIFIED: repo]` | 2-legged APS folder crawl → `AccFolder` + `AccFolderPermission` |
| `lib/acc/folderCrawl.ts` | `[VERIFIED: repo]` | BFS crawler used by `folder-crawl-cron.cjs`; writes `totalSizeBytes` (Slice D) |
| `scripts/accds_progress_ui.py` | `[VERIFIED: repo]` | Optional: real-time progress dashboard on :4322 (read-only) |
| `scripts/acc-grant-project-admin.cjs` | `[VERIFIED: repo]` | Admin-grant script (only if spike proves admin is required; deferred) |
| `prisma/schema.prisma` → `AccActivityAccds` | `[VERIFIED: repo]` | Target table: `accdsActivityId` (PK), `projectId`, `createdAt`, indexes on `[projectId, createdAt]`, `[userEmail, createdAt]`, `[createdAt]`, `[activityVerb]` |
| `prisma/schema.prisma` → `AccFolder` | `[VERIFIED: repo]` | `totalSizeBytes Float?` (Slice D; nullable until folder crawl reaches folder) |
| `prisma/schema.prisma` → `AccFolderPermission` | `[VERIFIED: repo]` | `folderId`, `roleId`, `actions[]`, `permType`, `syncedAt`; no unique constraint; OOM risk at 5M rows |

### Package Legitimacy Audit

No new packages are installed in this phase. All tooling is already present in `package.json`. Omitting audit table.

---

## Architecture Patterns

### System Architecture Diagram

```
Owner logs in
      │
      ▼
scripts/accds-login.cjs  (Playwright headless-false browser)
      │ writes
      ▼
scratch/acc-session.json  (Playwright storageState — gitignored)
      │ read by
      ▼
lib/acc/accdsToken.ts  → loadCookieHeader → createTokenProvider (bearer cache)
      │ bearer token
      ▼
lib/acc/accdsActivity.ts  → splitWindows (≤30d) → crawlProjectActivity
      │ pages paginated in parallel (PAGE_CONCURRENCY=8)
      ▼
https://developer.api.autodesk.com/accds/v0/projects/{projectId}/data
  ?template=activities&filter[created_at]=a..b&limit=100&offset=N
      │ AccdsActivityRow[] JSON
      ▼
lib/acc/accdsActivityMap.ts  → mapAccdsRow → AccdsActivityInsert
      │
      ▼
prisma.accActivityAccds.createMany({ skipDuplicates: true })
      │
      ▼
AccActivityAccds table (PostgreSQL)
      │
      ├─ scripts/diag-accds-recency.cjs  → reports coverage
      └─ scripts/verify-accds-merge.cjs  → reconciles vs AccActivity
```

Folder crawl (independent job):
```
scripts/folder-crawl-cron.cjs
      │ fetchAutodeskToken() [2-legged client_credentials]
      ▼
APS token (no session, no DC quota)
      │
      ▼
lib/acc/folderCrawl.ts  → extractAndPersistFolders (BFS per project)
      │
      ▼
AccFolder.totalSizeBytes + AccFolderPermission rows
```

---

## Key Research Findings Per Question

### Q1: Member-only spike — project enumeration and test design

**The spike question (VERIFY — resolved at execution time):** Does `accds/v0` return activity data for a project where Luis is a member but NOT a project admin?

**Current project source** `[VERIFIED: repo — scripts/accds-activity-ingest.cjs lines 54–62]`:
```javascript
const rows = await prisma.accActivity.findMany({
  where: { projectId: { not: null } },
  distinct: ['projectId'],
  select: { projectId: true },
});
projectIds = rows.map((r) => r.projectId).filter((p) => p && p.length > 0);
```
This returns ≈428 distinct `projectId` values — the DC-extracted admin set. The 428 ceiling is an artifact of what the Data Connector could reach (Luis is project-scoped admin, not Account Admin), NOT a property of the `accds/v0` endpoint.

**How to enumerate the full membership (~1,152 projects):**
There is no pre-existing script in the repo that lists all of Luis's ACC project memberships from the ACC session or APS 3-leg token. VERIFY: two candidate enumeration paths exist:

1. **APS Data Management API — `GET hubs/:hub_id/projects`** using the 3-leg token from `prisma.account` (the route used by `scripts/get-aps-hub-id.mjs`). This lists ALL projects in the hub where the authenticated user is a member (not just admin). The APS Data Management API paginates with `pageNumber` / `pageLimit` (`[ASSUMED]` — requires verification against APS docs; authoritative source: `https://aps.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-projects-GET/`).

2. **ACC Construction Admin API — `GET /construction/admin/v1/accounts/{accountId}/projects`** — may also enumerate the full project set but requires verifying whether it returns member-only projects or only admin-accessible ones. `[ASSUMED]`

**Spike task structure (planner-ready):**
```
Plan 08-01 (spike):
  Step 1: Enumerate full membership via APS DM API (GET hubs/:hubId/projects, paginated,
          using 3-leg token from DB — same account used by scripts/get-aps-hub-id.mjs).
          Count: expect ~1,152 if full membership is returned.
  Step 2: Take ONE project from the enumerated set that is NOT in the existing 428
          (i.e. NOT in SELECT DISTINCT "projectId" FROM "AccActivity").
  Step 3: Run: ACCDS_PROJECT=<member-only-id> node scripts/accds-activity-ingest.cjs
          Observe: HTTP 200 with activity data → session endpoint is member-accessible.
          HTTP 403 / empty results → admin required.
  Step 4: If accessible → update the project-ID source in Plan 08-02 to use full membership.
          If 403 → fall back to 428 admin set; document in STATE.md.
```

**Admin-grant script** exists at `scripts/acc-grant-project-admin.cjs` `[VERIFIED: repo]` — uses 2-legged APS `account:write` + `User-Id` header. It is NOT used in Phase 8 unless the spike proves admin is required (deferred decision per CONTEXT.md).

---

### Q2: History floor — `ACCDS_MONTHS_BACK` and `filter[created_at]`

**Client-side windowing** `[VERIFIED: repo — lib/acc/accdsActivity.ts lines 12–26]`:
```typescript
export function splitWindows(fromISO: string, toISO: string, maxDays = 30): Array<[string, string]> {
  // splits [from, to] into consecutive ≤30-day windows
  // comment: "accds rejects wider"
}
```
The comment confirms the server rejects windows wider than 30 days. The client creates as many ≤30-day windows as needed. A large `ACCDS_MONTHS_BACK` therefore creates more windows — NOT a client-side cap. For example, `ACCDS_MONTHS_BACK=84` (7 years) creates 84 windows of 30 days each.

**Trailing-window calculation** `[VERIFIED: repo — accds-activity-ingest.cjs lines 49–51]`:
```javascript
const toISO = new Date().toISOString();
const fromISO = new Date(Date.now() - MONTHS_BACK * 30 * 24 * 60 * 60 * 1000).toISOString();
```
`MONTHS_BACK * 30` days, not calendar months. `ACCDS_MONTHS_BACK=84` → 84×30 = 2,520 days back from today (≈ 6.9 years). Recommended value: `84` (covers from ~Jan 2019; oldest known ACC project activity is circa 2019–2020).

**Server-side history floor:** VERIFY at runtime. The `accds/v0` endpoint may return empty `results[]` for windows predating a project's creation or before Autodesk's platform-side activity log retention. The crawler handles this correctly — empty results pages are silently skipped. A run should still complete; it just won't produce rows for windows that predate the project's activity. Label the actual `MIN("createdAt")` from `diag-accds-recency.cjs` as the real history start in any downstream UI.

---

### Q3: Resume and recovery loop

**Full operational sequence** (planner-ready):

```bash
# Bootstrap session (required once, or whenever SessionExpiredError occurs)
node scripts/accds-login.cjs
# → opens browser; Luis logs in with MFA; saves scratch/acc-session.json

# Initial full crawl (ACCDS_MONTHS_BACK large — covers full history)
ACCDS_MONTHS_BACK=84 ACCDS_CONCURRENCY=6 ACCDS_PAGE_CONCURRENCY=8 \
  node scripts/accds-activity-ingest.cjs
# → crawls all project IDs from AccActivity (or expanded set from spike)
# → upserts into AccActivityAccds with skipDuplicates
# → SessionExpiredError halts the run if the session expires mid-crawl

# If SessionExpiredError occurs:
node scripts/accds-login.cjs          # refresh session
ACCDS_MONTHS_BACK=84 ACCDS_RESUME=1 \
  node scripts/accds-activity-ingest.cjs
# → ACCDS_RESUME=1 skips projects that already have ANY accds rows
#   (project-level skip; see lines 78-85 in accds-activity-ingest.cjs)
```

**RESUME skip semantics** `[VERIFIED: repo — accds-activity-ingest.cjs lines 78–85]`:
```javascript
if (RESUME && !ONLY) {
  const done = await prisma.accActivityAccds.findMany({
    distinct: ['projectId'], select: { projectId: true }
  });
  const doneSet = new Set(done.map((r) => r.projectId));
  projectIds = projectIds.filter((id) => !doneSet.has(id));
  console.log(`[accds] resume: skipping ${before - projectIds.length} already-crawled...`);
}
```
Skip granularity is **project-level**: a project is "done" if ANY `AccActivityAccds` row exists for it. This means a project partially crawled before session expiry (e.g. a mid-run crash after 3 of 10 windows) will be **skipped** on resume — creating a gap in that project's history. This is a known limitation. The `diag-accds-recency.cjs` per-day histogram reveals such gaps.

**Gap risk management:** For projects where session expired mid-crawl, the safest recovery is:
- Re-crawl using `ACCDS_PROJECT=<id>` (single-project override, bypasses resume skip) after re-login.
- Or: delete `AccActivityAccds` rows for that specific `projectId` and re-crawl without `ACCDS_RESUME=1`.

**`SessionExpiredError` propagation** `[VERIFIED: repo — accds-activity-ingest.cjs line 125]`:
```javascript
if (e && e.name === 'SessionExpiredError') throw e;
// fatal to the whole run — no other project can succeed
```
On expiry the crawler logs the error and halts. The operator must re-login and resume.

**Single-project smoke test:**
```bash
ACCDS_PROJECT=<any-project-id> node scripts/accds-activity-ingest.cjs
# Crawls exactly one project; useful for spike and post-login validation
```

**Rate limiting** `[VERIFIED: repo — lib/acc/accdsActivity.ts lines 61–69]`:
```typescript
const retryable = res.status === 429 || res.status >= 500;
if (retryable && attempt < maxAttempts - 1) {
  const ra = Number(res.headers.get('retry-after'));
  const waitMs = Number.isFinite(ra) && ra > 0
    ? Math.min(60_000, ra * 1000)
    : Math.min(30_000, 1000 * 2 ** attempt);
  await sleep(waitMs);
```
Up to 4 attempts; `retry-after` header honoured; exponential backoff up to 30s on non-RA responses. If rate limits are persistent, reduce `ACCDS_CONCURRENCY` (default 6) and/or `ACCDS_PAGE_CONCURRENCY` (default 8).

---

### Q4: Verification queries

**Gate query** `[VERIFIED: repo — diag-accds-recency.cjs + ROADMAP.md]`:
```sql
-- Confirms coverage: expect ≈428 (or full membership count if spike passes)
SELECT COUNT(DISTINCT "projectId"), MAX("createdAt") FROM "AccActivityAccds";
```

**Diagnostic commands** `[VERIFIED: repo]`:

```bash
# 1. Primary coverage report — total rows, date range, distinct projects, per-day histogram (last 21d)
node scripts/diag-accds-recency.cjs

# 2. DC reconciliation (confirms partitioned merge is mathematically sound)
node scripts/verify-accds-merge.cjs
# Outputs: PASS/FAIL for 5 assertions (reconciliation, backfill, admin, boundary)

# 3. Per-project parity (verifies one project+month against DC source)
node scripts/diag-accds-vs-dc.cjs <projectId> <YYYY-MM>

# 4. Folder coverage gate (for Phase 13 treemap)
# Run in psql / node script:
SELECT COUNT(*) FILTER (WHERE "totalSizeBytes" IS NOT NULL) FROM "AccFolder";
```

**Coverage-honesty gate** (per CONTEXT.md — report, not block):
`diag-accds-recency.cjs` reports `distinct projects` count. Compare to the target (428 or expanded set). The gate is presence + project count match, NOT a freshness threshold.

---

### Q5: Folder crawl

**Invocation** `[VERIFIED: repo — scripts/folder-crawl-cron.cjs]`:
```bash
# Defaults: folderCrawlStatus IN ['never', 'partial', 'failed'], all active AccProject rows
node scripts/folder-crawl-cron.cjs

# Scope controls (env vars — verified from source lines 52–75):
FOLDER_CRAWL_STATUSES=never,partial,failed   # default
FOLDER_CRAWL_PROJECT_IDS=id1,id2,...          # comma-separated; restricts to these IDs only
FOLDER_CRAWL_LIMIT=10                          # max projects to crawl this run
```

**Auth** `[VERIFIED: repo — folder-crawl-cron.cjs lines 93–117]`:
```javascript
async function fetchAutodeskToken() {
  // Uses APS_CLIENT_ID / APS_CLIENT_SECRET environment vars
  // grant_type: "client_credentials"  — 2-legged, no user session, no DC quota
  // scope: "account:read data:read data:create"
}
```
This is **completely independent** of the ACCDS session. No `scratch/acc-session.json` involved. No APS refresh-token rotation risk. Requires `APS_CLIENT_ID` and `APS_CLIENT_SECRET` in `.env` (these exist — the dashboard uses them for existing folder crawls).

**Project source** `[VERIFIED: repo — folder-crawl-cron.cjs lines 143–155]`:
```javascript
const projects = await prisma.accProject.findMany({
  where: { status: 'active', folderCrawlStatus: { in: crawlStatuses } },
  // ... orderBy name asc
});
```
Source is `AccProject` (not `AccActivity`). `AccProject` is populated from the ACC admin sync. VERIFY: confirm `AccProject` count is approximately 428 before running to ensure the folder crawl covers the same set as the activity crawl.

**`AccFolderPermission` OOM guard** (critical constraint from v2.0 incident — 5M rows, 77s) `[VERIFIED: STATE.md + ROADMAP.md]`:
- Any SQL or Prisma query against `AccFolderPermission` without `GROUP BY + LIMIT` at the query level will OOM. This applies to verification queries in Phase 8 and ALL downstream consumer phases.
- The folder crawl **writes** into `AccFolderPermission` (via `extractAndPersistFolders`) — the write itself is safe (batched upserts). The OOM risk is on **read** queries.
- Safe verification query:
  ```sql
  SELECT COUNT(*) FROM "AccFolderPermission";
  -- or, for downstream use:
  SELECT "folderId", COUNT(*) as role_count
  FROM "AccFolderPermission"
  GROUP BY "folderId"
  LIMIT 1000;
  ```

**`AccFolder.totalSizeBytes`** `[VERIFIED: repo — prisma/schema.prisma line 519]`:
```prisma
totalSizeBytes Float? // sum of tip-version storageSize (Float avoids BigInt JS friction)
```
Nullable — populated when the folder's contents have been crawled (Slice D logic in `folderCrawl.ts`). The Phase 13 treemap renders only when `NOT NULL` count > 0; `diag` gate after folder crawl:
```sql
SELECT COUNT(*) FILTER (WHERE "totalSizeBytes" IS NOT NULL) FROM "AccFolder";
```

**Concurrency** `[VERIFIED: repo — folder-crawl-cron.cjs line 172]`:
```javascript
const limit = pLimit(5); // 5 projects in parallel
```
This is the existing production setting. No change needed unless a specific project is timing out (use `FOLDER_CRAWL_LIMIT=1` to isolate).

**Duration estimate** `[ASSUMED based on comment in folder-crawl-cron.cjs line 9]`: ~48min best / ~4h worst for full hub crawl. Not verified in this session; plan for potentially long-running background job.

---

### Q6: tsc/build gates

**This phase touches NO `.ts` source files.** The crawler, diagnostics, and folder-crawl scripts are all `.cjs` (CommonJS wrappers that load `.ts` helpers via `tsx/cjs`). No Prisma schema changes. No new routes or tRPC procedures.

Therefore:
- `npx tsc --noEmit` runs as a gate but is expected to remain at 0 errors regardless (no `.ts` changed).
- No `npm run build` is needed for Phase 8 — only script executions against the DB.
- The "stop Task Scheduler before `npm run build`" rule does NOT apply to Phase 8 (no build). Running the crawler scripts while `:3000` is live is safe.

**Required env vars for scripts** `[VERIFIED: repo source files]`:
```bash
DATABASE_URL=...     # or DIRECT_URL= (used by all Prisma scripts)
APS_CLIENT_ID=...    # for folder-crawl-cron.cjs (2-legged auth)
APS_CLIENT_SECRET=...  # for folder-crawl-cron.cjs
```
`scratch/acc-session.json` is written by `accds-login.cjs` at runtime (not an env var).

**Optional progress monitor** `[VERIFIED: repo — scripts/accds_progress_ui.py]`:
```bash
python scripts/accds_progress_ui.py
# → http://localhost:4322 — real-time crawl progress dashboard (read-only)
```
Uses `DIRECT_URL` or `DATABASE_URL` from `.env`. Polls `AccActivityAccds` for live row count, insert rate, and per-project breakdown.

---

## Common Pitfalls

### Pitfall 1: Resume-skip leaves partially-crawled projects with gaps

**What goes wrong:** Session expires mid-crawl after 3 of 10 date windows for a project. On re-login + `ACCDS_RESUME=1`, the crawler sees "AccActivityAccds has rows for this project" → skips it entirely. The result is a project with history only from the first 3 windows (e.g. 2023–2024 but not 2019–2022).

**Why it happens:** Resume skip is project-level, not window-level `[VERIFIED: repo lines 78–85]`.

**How to avoid:** After re-login, before resuming, check `diag-accds-recency.cjs` per-day histogram. For any project showing a suspicious gap (e.g. rows for recent months but nothing before 2023), re-crawl that project individually:
```bash
ACCDS_PROJECT=<id> ACCDS_MONTHS_BACK=84 node scripts/accds-activity-ingest.cjs
```
This bypasses resume skip (RESUME is a no-op when ONLY is set).

**Warning signs:** `diag-accds-recency.cjs` per-day histogram shows 0 rows for extended date ranges that should have activity.

---

### Pitfall 2: `SessionExpiredError` is a run-aborting fatal error, not per-project

**What goes wrong:** Session expires after project N is done but before project N+1 starts. ALL remaining projects fail. Only the already-completed projects have data.

**Why it happens:** `[VERIFIED: repo — accds-activity-ingest.cjs line 125]` — `SessionExpiredError` is re-thrown from the project-level catch, which kills the entire `Promise.all` via the `pLimit` queue.

**How to avoid:** Login freshly right before starting a long crawl. The ACC session cookie typically lasts several hours but duration is not guaranteed. For the full 428-project crawl (expected hours), plan for at least one session refresh.

**Recovery:** Re-run `accds-login.cjs`, then `ACCDS_RESUME=1` crawl. Check for partial-crawl gaps (Pitfall 1 above).

---

### Pitfall 3: Running `npm run build` while `:3000` is live

**Applies to this phase:** NO (no build needed). But documented because it is a standing constraint.
If a code change is ever needed alongside Phase 8, `Stop-ScheduledTask -TaskName "LECG Dashboard Local"` before building.

---

### Pitfall 4: `AccFolderPermission` query without GROUP BY + LIMIT OOMs

**What goes wrong:** A diagnostic or ad-hoc query like `SELECT * FROM "AccFolderPermission"` or `prisma.accFolderPermission.findMany()` without pagination loads ~5M rows → Node.js OOM, 77s+ hang.

**Why it happens:** 5M permission rows from v2.0 crawl `[VERIFIED: STATE.md v2.0 incident note]`.

**How to avoid:** Always use aggregated queries:
```sql
SELECT COUNT(*) FROM "AccFolderPermission";
SELECT "folderId", COUNT(*) as role_count FROM "AccFolderPermission" GROUP BY "folderId" LIMIT 1000;
```

---

### Pitfall 5: Spike ONLY confirms HTTP 200, not meaningful row count

**What goes wrong:** `accds/v0` returns 200 with `results: []` (empty array) for a member-only project. This is NOT confirmation of access; it means the endpoint responded but returned no data (could be a project with no activity in the trailing window).

**How to avoid:** The spike plan must verify BOTH: (a) HTTP 200 non-empty `results`, AND (b) `AccActivityAccds` rows inserted > 0. Set `ACCDS_MONTHS_BACK=24` for the spike to increase the probability of finding real rows. If 0 rows after 24 months, try a different member-only project known to have recent activity.

---

### Pitfall 6: Folder crawl's `AccProject` vs activity crawl's `AccActivity` project sources

**What goes wrong:** The folder crawl sources from `AccProject` (active status); the activity crawl sources from `distinct AccActivity.projectId`. If the spike expands the activity crawl to ~1,152 but the folder crawl stays on the ~428 `AccProject` set, the treemap data only covers the admin set.

**How to avoid:** After the spike, check whether `AccProject` is also populated for member-only projects (VERIFY: `SELECT COUNT(*) FROM "AccProject"` — if this shows ~1,152, the folder crawl will follow suit automatically).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date-window pagination | Custom `fromISO/toISO` splitter | `splitWindows()` in `lib/acc/accdsActivity.ts` | Already handles ≤30d limit, boundary row dedup |
| Session token refresh | Inline cookie parsing | `createTokenProvider()` in `lib/acc/accdsToken.ts` | Handles JWT expiry, collapse concurrent refreshes, throws `SessionExpiredError` |
| Rate-limit backoff | Custom retry | `fetchActivityWindow()` — 4 attempts, `retry-after` aware | Edge cases with APS 429 handling already covered |
| Dedup | `seen` Set or manual check | `createMany({ skipDuplicates: true })` via `accdsActivityId` PK | Idempotent upsert at DB level |
| Progress tracking | Custom counter script | `scripts/accds_progress_ui.py` on :4322 | Already exists; real-time polling, insert rate, per-project breakdown |
| Project admin grant | Manual ACC UI | `scripts/acc-grant-project-admin.cjs` | Already built; dry-run mode; rate-limited (DELAY_MS) |

---

## Runtime State Inventory

This phase is NOT a rename or refactor. However, the spike may expand the project-ID source, which is a data-state change.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `AccActivityAccds` table — may have stale/partial rows from previous crawl runs | No wipe needed; `skipDuplicates` is idempotent. Individual project re-crawl if gap found. |
| Stored data | `AccActivity` — source of the ≈428 project IDs for the current crawl source | Read-only reference; no change needed |
| Stored data | `AccProject` — source for folder crawl; expect ~428 active rows | VERIFY count: `SELECT COUNT(*) FROM "AccProject" WHERE status = 'active'` |
| Live service config | `scratch/acc-session.json` — Playwright storageState (gitignored, on-disk only) | Must be freshly written by `accds-login.cjs` before each crawl run |
| OS-registered state | `LECG Dashboard Local` Windows Scheduled Task — runs `:3000`; irrelevant to Phase 8 scripts | No action needed; scripts run independently |
| Secrets/env vars | `APS_CLIENT_ID`, `APS_CLIENT_SECRET` in `.env` (not gitignored) — required by folder crawl | Verify present before running `folder-crawl-cron.cjs` |
| Build artifacts | None — no TS changes, no build step | None |

---

## Validation Architecture

Phase 8 has no automated test additions. It is an operations/extraction phase, not a code-change phase. Verification is via diagnostic queries and the existing scripts.

### Verification sequence for this phase

| Step | Command | Interpretation |
|------|---------|----------------|
| 1. Session valid | `node scripts/diag-accds-recency.cjs` (if rows exist and recency is recent) OR `ACCDS_PROJECT=<known-id> node scripts/accds-activity-ingest.cjs` | Confirms session is active before starting full crawl |
| 2. Spike result | `ACCDS_PROJECT=<member-only-id> ACCDS_MONTHS_BACK=24 node scripts/accds-activity-ingest.cjs` | Check stdout for `inserted=N` with N > 0 |
| 3. Full crawl progress | `python scripts/accds_progress_ui.py` → http://localhost:4322 | Live insert rate; project completion count |
| 4. Coverage check | `node scripts/diag-accds-recency.cjs` | Expect `distinct projects` ≈ 428 (or expanded count) |
| 5. Reconciliation | `node scripts/verify-accds-merge.cjs` | Expect `All merge assertions passed.` |
| 6. Folder gate | `SELECT COUNT(*) FILTER (WHERE "totalSizeBytes" IS NOT NULL) FROM "AccFolder"` | Expect > 0 after folder crawl completes |
| 7. tsc gate | `npx tsc --noEmit` | Must = 0 (no source changes, but required as a standing gate) |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥22 | All `.cjs` scripts | ✓ (verified by existing repo constraints) | ≥22 | — |
| PostgreSQL (local) | Prisma scripts | ✓ (`LECG Postgres Local` Task Scheduler task) | 18 | — |
| Playwright (`chromium`) | `scripts/accds-login.cjs` | VERIFY: run `node -e "require('playwright')"` | — | None — required for session bootstrap |
| Python ≥3 + flask + psycopg | `scripts/accds_progress_ui.py` | VERIFY | — | Skip monitor; crawl still works without it |
| APS_CLIENT_ID + APS_CLIENT_SECRET | `scripts/folder-crawl-cron.cjs` | VERIFY: check `.env` | — | Folder crawl cannot run without credentials |
| Luis's ACC session (MFA) | `scripts/accds-login.cjs` | Requires interactive login | — | None — must be performed by owner |

**Missing dependencies with no fallback:**
- Playwright must be installed (`playwright` package in `package.json` — VERIFY with `npm ls playwright`; it was used in Phase 7 UAT so it should be present).
- Owner must be available for the interactive MFA login step before the crawl starts.

---

## Security Domain

Phase 8 is a script-execution phase, not an app-code change. No new UI, no new tRPC procedures, no new API routes.

- `scratch/acc-session.json` is password-equivalent and gitignored `[VERIFIED: repo — accds-login.cjs comment, line 6]`. Never commit it. Treat it as a credential.
- The bearer token derived from the session cookie is cached in-process only (`createTokenProvider`). It is not written to disk.
- `APS_CLIENT_ID` / `APS_CLIENT_SECRET` are in `.env` (not gitignored). Verify they are not accidentally staged: `git diff --cached --name-only` before any commit.

---

## Open Questions

1. **Does `accds/v0` return data for member-only (non-admin) projects?**
   - What we know: The 428 project ceiling is inherited from DC, not the session endpoint. No negative evidence exists in the codebase.
   - What's unclear: Whether Autodesk's platform-side access check for `accds/v0` uses "member" or "admin" as the gating role.
   - Resolution: Spike task (Plan 08-01). Not resolvable from code alone.

2. **Does `accds/v0` server-side floor `filter[created_at]` at a hard cutoff?**
   - What we know: Client-side uses `MONTHS_BACK * 30` days; the server rejects windows > 30d wide. No evidence in code of a server-side oldest-date limit.
   - What's unclear: Whether Autodesk retains activity logs beyond 1–2 years (typical SaaS retention) and whether `filter[created_at]` returns HTTP 400 or empty results for very old dates.
   - Resolution: Observe during the first few windows of the full crawl. If `fromISO` windows from 2019 return 0 results for all projects, the floor is likely ~2022–2023. Label `MIN("createdAt")` in downstream UI.

3. **What is the full `AccProject` count after the spike?**
   - What we know: `AccProject` is the folder crawl's project source. Expected ~428 (populated from ACC admin sync).
   - What's unclear: Whether `AccProject` also contains member-only projects (i.e. whether the sync that populates it is admin-scoped or membership-scoped).
   - Resolution: `SELECT COUNT(*) FROM "AccProject" WHERE status = 'active'` before running folder crawl.

4. **Is Playwright installed and functional?**
   - What we know: Used in Phase 7 UAT harness. Should be present.
   - Resolution: `npm ls playwright` or `node -e "require('playwright')"`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | APS DM API `GET hubs/:hub_id/projects` returns ALL membership projects (including member-only) when called with Luis's 3-leg token | Q1: Member-only spike | Planner designs wrong enumeration endpoint; spike may fail to find member-only project IDs |
| A2 | `ACCDS_MONTHS_BACK=84` (84×30=2,520 days) covers the oldest ACC project in the hub | Q2: History floor | Oldest project activity predates 2019-Jan; safe to use 120 (10 years) instead |
| A3 | Playwright is present and working (`playwright` package installed from Phase 7 UAT) | Environment Availability | Interactive login step fails; cannot bootstrap session |
| A4 | Folder crawl duration ~48min–4h for full hub (based on comment in folder-crawl-cron.cjs) | Q5: Folder crawl | Job runs longer; plan for overnight scheduling |
| A5 | `AccProject` count ≈ 428 (admin-scoped sync, same boundary as `AccActivity`) | Q5: Folder crawl | Folder crawl covers fewer or more projects than activity crawl; treemap scope differs |

**If this table is empty:** Not applicable — 5 assumed claims documented above.

---

## Sources

### Primary (HIGH confidence — verified from repo source files)
- `scripts/accds-activity-ingest.cjs` — full env knob inventory, project source query, RESUME logic, `SessionExpiredError` propagation, concurrency defaults
- `scripts/accds-login.cjs` — Playwright login, `scratch/acc-session.json` write path
- `lib/acc/accdsActivity.ts` — `splitWindows` (≤30d enforced by API), `fetchActivityWindow` (retry/backoff pattern), `crawlProjectActivity` (parallel page concurrency)
- `lib/acc/accdsToken.ts` — `loadCookieHeader`, `createTokenProvider`, `SessionExpiredError` class, `fetchFreshToken` URL
- `lib/acc/accdsActivityMap.ts` — `AccdsActivityRow` interface fields, `mapAccdsRow` transform
- `scripts/diag-accds-recency.cjs` — exact SQL queries, output format
- `scripts/verify-accds-merge.cjs` — 5 assertions, CTE structure, `MERGE_MODE` env knob
- `scripts/diag-accds-vs-dc.cjs` — invocation: `node scripts/diag-accds-vs-dc.cjs <projectId> <YYYY-MM>`
- `scripts/folder-crawl-cron.cjs` — 2-legged auth, `FOLDER_CRAWL_STATUSES`, `FOLDER_CRAWL_PROJECT_IDS`, `FOLDER_CRAWL_LIMIT`, pLimit(5), `AccProject` source
- `lib/acc/folderCrawl.ts` — `FolderCrawlResult` type, `CrawlOptions`, `totalSizeBytes` in `RawFolder`
- `prisma/schema.prisma` — `AccActivityAccds` model (all fields + 5 indexes), `AccFolder.totalSizeBytes Float?`, `AccFolderPermission` (no unique constraint)
- `scripts/accds_progress_ui.py` — progress monitor on :4322
- `.planning/phases/08-activity-re-extraction/08-CONTEXT.md` — locked decisions
- `.planning/STATE.md` — v2.0 OOM incident, phase order, blockers
- `.planning/ROADMAP.md` — Phase 8 success criteria, verification gates

### Secondary (ASSUMED — not verified against APS official docs in this session)
- APS DM API `GET hubs/:hub_id/projects` endpoint for full membership enumeration — needs official docs verification before writing spike code

---

## Metadata

**Confidence breakdown:**
- Crawler internals (env knobs, endpoint, windowing, resume, expiry): HIGH — read directly from source
- Verification queries and diagnostic commands: HIGH — read directly from source
- Folder crawl auth and project source: HIGH — read directly from source
- Member-only spike outcome: N/A — empirical; resolved at execution time
- History floor: ASSUMED (LOW) — server behavior not observable from code
- APS membership enumeration API: ASSUMED (LOW) — not verified against APS docs

**Research date:** 2026-06-22
**Valid until:** 2026-09-22 (stable scripts; APS endpoint behavior may change)

---

## Dashboard Self-Check

- **Context:** Loaded `08-CONTEXT.md`, `STATE.md`, `REQUIREMENTS.md`, `ROADMAP.md`. Read `scripts/accds-activity-ingest.cjs`, `scripts/accds-login.cjs`, `lib/acc/accdsActivity.ts`, `lib/acc/accdsToken.ts`, `lib/acc/accdsActivityMap.ts`, `scripts/diag-accds-recency.cjs`, `scripts/verify-accds-merge.cjs`, `scripts/diag-accds-vs-dc.cjs`, `scripts/folder-crawl-cron.cjs`, `lib/acc/folderCrawl.ts`, `prisma/schema.prisma` (AccActivityAccds, AccFolder, AccFolderPermission models), `scripts/accds_progress_ui.py`, `scripts/acc-grant-project-admin.cjs`, `.claude/skills/lecg-dashboard/references/deploy-sequence.md`.
- **Evidence:** All env knobs, endpoint URLs, Prisma model fields, diagnostic invocations, and resume/recovery logic verified from repo source files. No invented paths or APIs.
- **Constraints applied:** No new packages, no new TypeScript, no `npm run build` required; no DC quota; no APS refresh-token rotation; AccFolderPermission GROUP BY + LIMIT OOM guard documented; coverage-honesty (label MIN createdAt from diag output); no admin grant without spike confirming it is needed.
- **Gates:** `npx tsc --noEmit` = 0 (standing gate; no source change so always 0). `SELECT COUNT(DISTINCT "projectId"), MAX("createdAt") FROM "AccActivityAccds"` is the primary data gate. `node scripts/diag-accds-recency.cjs` + `node scripts/verify-accds-merge.cjs` for reconciliation. `SELECT COUNT(*) FILTER (WHERE "totalSizeBytes" IS NOT NULL) FROM "AccFolder"` for Phase 13 gate.
- **VERIFY:** (1) `accds/v0` returns data for member-only projects — spike at execution time; (2) server-side history floor — observe during full crawl; (3) `AccProject` count vs activity-crawl project count; (4) Playwright installed (`npm ls playwright`); (5) APS DM API for membership enumeration — verify endpoint against official APS docs before coding spike.
