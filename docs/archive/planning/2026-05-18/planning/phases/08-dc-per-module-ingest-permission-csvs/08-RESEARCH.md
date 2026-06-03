# Phase 8: DC per-module ingest + permission CSVs — Research

**Researched:** 2026-05-15
**Domain:** APS Data Connector pipeline (multi-module activity CSVs + admin/permission CSVs), Prisma full-replace snapshots, Windows Task Scheduler, progressive breadth-first backfill state machine
**Confidence:** HIGH (concrete repo evidence + locked CONTEXT.md decisions; Autodesk schema verified against running scripts and 2026-05-15 memory)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Activity module scope:**
- All 9 activity modules ingested (Docs, Issues, Submittals, RFIs, Sheets, Admin, Cost, Assets, Bridge) — every `activities_<module>_activities.csv` in DC output.
- Module recorded but not visually separated: all module activity merges into existing widgets. `AccActivity.service` column populated with module name (currently NULL for all rows).
- Module badge on each row in File Activity widget (small chip `Docs`, `Issues`, etc.). Widget label may be tweaked from "File Activity" to "Activity".
- Module-agnostic pipeline: never skip a module at ingest time; dashboards decide what is surfaced.
- Unknown future modules (Autodesk adds a 10th): log loudly, skip rows, surface in runlog. No silent ingest into generic bucket.
- `_changes.csv` siblings and submittal detail tables NOT in scope.
- Dedup by event signature: existing `@@unique([autodeskId, rawAction, createdAt, projectId])` catches cross-module dups.
- Raw action verbs preserved per module — no normalization.
- All-time retention; rows never deleted.
- Filter out system actors at ingest (known bots: `Autodesk Cloud Worker`, `Construction Cloud Sync`, etc.). Maintain known-bot list as a constant.
- No special handling for sensitive events in this phase.
- 1-day overlap window on each daily run; dedup catches it.

**Permission data destination:**
- All 15+ admin/permission CSVs ingested (`admin_users`, `admin_companies`, `admin_projects`, `admin_project_users`, `admin_project_user_roles`, `admin_project_user_products`, `admin_project_user_companies`, `admin_project_roles`, `admin_project_products`, `admin_project_companies`, `admin_roles`, `admin_business_units`, `admin_account_services`, `admin_project_services`, `admin_project_user_services`, `admin_accounts`).
- New parallel tables `AccDc*` prefix (`AccDcUser`, `AccDcCompany`, `AccDcProject`, `AccDcProjectUser`, `AccDcProjectUserRole`, `AccDcProjectUserProduct`, `AccDcProjectUserCompany`, `AccDcProjectRole`, etc.).
- Full replace per snapshot, transactionally — each daily run wraps per-CSV delete-all + insert-all in a transaction.
- DC wins on conflict with live-API data.
- Orphans (DC-only users/projects) land in `AccDc*` tables without FK constraints to existing tables.
- Companies become first-class entities: `AccDcCompany` is real; `AccDcProjectUserCompany` links users; existing free-text `AccProjectMember.companyName` stays populated by Phase 2 for back-compat.
- Live immediately after ingest — no staging/promote step.
- Permission data feeds existing Access Analysis surfaces; no new widgets in this phase.

**Backfill depth + ongoing cadence:**
- All-time depth, achieved progressively — NOT a single 2-year burst.
- Daily cadence — one run per UTC day after initial backfill.
- Windows Task Scheduler on Luis's PC. No in-app cron, no GitHub Actions, no Railway.
- 30-day slice per daily run across ALL admin projects in parallel; window extends backward day by day until per-project creation date.
- Floor = per-project creation date (extracted from `admin_projects.csv`).
- Accelerated backfill for newly-detected projects (when `admin_projects.csv` reveals new project, next few daily runs prioritize filling its history).
- New admin projects auto-detected each run via `admin_projects.csv`; zero manual config.
- 03:00 local Hermosillo time (~09:00 UTC).
- Quota fallback: abort gracefully + resume next day. Save state. No email noise.
- Run duration budget: <=30 minutes.

**Legacy data + visibility:**
- Wipe + re-ingest the 2,507 legacy `AccActivity` rows.
- Extend existing Phase 3 `SyncFreshnessPill` (sidebar) — no new pages, no new routes.
- Pill hover/click reveals: `DC ingest: backfill at month X of Y . next run in Zh . quota used N/25 today . access changes in last 24h: +A users, -B users`.
- Pill state: green (<24h), amber (24-36h or partial/quarantined), red (>36h or token expired).
- Token-failure recovery: click pill -> launches Autodesk OAuth flow in-app.
- DB log table (`AccDcIngestRun` or extension of `SyncMeta`) records every run with detailed metrics.
- Diff summary per ingest: +N users granted / -M revoked stored alongside run row.

**Operations + recovery:**
- Anomaly auto-quarantine: post-ingest sanity checks (row-count delta vs previous, missing CSV, all-zero) block transactional commit.
- Kill switch: flag file `.dc-ingest.disabled` at project root.
- PII handling: standard Postgres columns.
- Cron health detection: the pill IS the detector — 36h+ flips amber.
- `RUNBOOK.md` ships at phase end in phase directory.

### Claude's Discretion

- Exact Prisma model column types (nullable vs not-null for product-tier fields)
- The known-bot list contents (planner researches APS docs to populate)
- Anomaly threshold values (e.g. "row count drop > X% triggers quarantine")
- Postgres transaction isolation level for full-replace (likely SERIALIZABLE)
- Exact file/route layout for AccDc* Prisma models (one schema file or many)
- Auth-flow UX for "click pill to re-auth" (new tab, modal, etc.)
- Persistence shape of progressive-backfill state (column on `AccDcIngestRun` vs separate `AccDcBackfillProgress` table)

### Deferred Ideas (OUT OF SCOPE)

- "Notable Activity" widget / sensitive-event tagging
- Email alerts (any kind)
- "Permissions Overview" widget
- Dedicated DC Ingest status page
- Dedicated module widgets (Issues, Submittals, RFIs widgets)
- `_changes.csv` audit-trail ingest
- Submittal-detail tables
- Verb normalization
- Append-only snapshot history for permissions
- Stage + manual promote / diff-threshold auto-promote
- Pseudonymization / column encryption
- CSV export button per widget
- Read-only API endpoint
- Multi-user / shared dashboard
- Configurable run schedule
</user_constraints>

<phase_requirements>
## Phase Requirements

Roadmap does not assign REQ-IDs to Phase 8 yet. Inferred from CONTEXT.md (planner should formalize as `DC8-NN` series and register in REQUIREMENTS.md). Mapping:

| ID | Description | Research Support |
|----|-------------|-----------------|
| DC8-01 | Ingest all 9 `activities_<module>_activities.csv` files into `AccActivity` with `service=<module>` | `dc-ingest-where-i-admin.cjs` ACTIVITY_FILE_RE already matches `^activities_[a-z_]+_activities\.csv$`; just propagate the captured module name into `service` instead of leaving null. Standard Stack section. |
| DC8-02 | Drop system-actor rows at parse boundary via known-bot constant | mapCsvRow extension; Known-Bot List example. |
| DC8-03 | Unknown-module guard (10th module appears -> log + skip, surface in runlog) | Module set constant + log emit. Architecture Pattern 3. |
| DC8-04 | Wipe + re-ingest the 2,507 legacy AccActivity rows | One-time SQL `DELETE FROM "AccActivity"`; backfill auto-fills via progressive sliding window. |
| DC8-05 | New Prisma models `AccDcUser`, `AccDcCompany`, `AccDcProject`, `AccDcProjectUser`, `AccDcProjectUserRole`, `AccDcProjectUserProduct`, `AccDcProjectUserCompany`, `AccDcProjectRole`, `AccDcProjectProduct`, `AccDcProjectCompany`, `AccDcRole`, `AccDcBusinessUnit`, `AccDcAccountService`, `AccDcProjectService`, `AccDcProjectUserService`, `AccDcAccount` | Schema example; mirrors the 16 admin CSVs in CONTEXT.md. |
| DC8-06 | Full-replace per snapshot in a single Prisma transaction | Architecture Pattern 2 (transactional snapshot). |
| DC8-07 | Progressive breadth-first backfill — daily 30-day slice across all admin projects, window slides backward until per-project createdAt | Architecture Pattern 1 (Progressive Window State Machine). |
| DC8-08 | `AccDcIngestRun` table records every run (started/ended, rows-per-module, quota-used, status, error, slice window, diff summary) | Schema example. |
| DC8-09 | Anomaly auto-quarantine (sanity checks block transaction commit) | Architecture Pattern 4. |
| DC8-10 | Kill-switch flag file `.dc-ingest.disabled` at project root | Trivial `existsSync` check at run start. |
| DC8-11 | Quota fallback: graceful abort + resume next day; state-saved per-project slices | Persist `lastSliceEndCovered` per (projectId, module-bucket) on the progress table. |
| DC8-12 | Windows Task Scheduler runs cron at 03:00 local | Existing `scripts/dc-daily-cron.ps1` is the harness — extend, don't replace. |
| DC8-13 | Auto-detect new admin projects from `admin_projects.csv` each run; accelerate their backfill | New-project flag on progress table. |
| DC8-14 | SyncFreshnessPill extension: hover/click shows backfill month X/Y, next-run countdown, quota used N/25, access-changes +A/-B | `components/layout/SyncFreshnessPill.tsx` extension; new tRPC procedure on `accSync` router. |
| DC8-15 | Token-failure recovery: click pill launches Autodesk OAuth flow in-app | NextAuth `signIn("autodesk", ...)` call — Phase 3 already has the provider. |
| DC8-16 | Module badge per row in File Activity widget (reads `AccActivity.service`) | Front-end-only — render existing `service` field. |
| DC8-17 | `RUNBOOK.md` ships in phase directory | Doc deliverable. |
</phase_requirements>

## Summary

Phase 8 is **a pipeline refactor + schema expansion**, not a fresh build. The existing ingest stack (`scripts/dc-ingest-where-i-admin.cjs` -> `lib/acc/ingestActivityZip.ts`) is already 80% of what is needed for the activity side — it already recognizes the per-module regex `^activities_[a-z_]+_activities\.csv$` and uses 3-leg user-context auth (the only path that works since 2-leg was permanently blocked 2026-05-12). What is missing is: (1) writing the captured module name into `AccActivity.service`, (2) a known-bot filter at the parse boundary, (3) a 10th-module guard, (4) the entire 16-CSV admin/permission ingest into new `AccDc*` tables, (5) the progressive breadth-first backfill state machine (the **distinctive design** of this phase), and (6) Windows Task Scheduler wiring (already partially shipped in `scripts/dc-daily-cron.ps1`).

The permission side is entirely new code but architecturally simple: each daily run does a `prisma.$transaction` that deletes all rows then `createMany`s the new rows for each admin CSV. Companies, business units, and per-project-user-products become first-class entities for the first time. **DC wins on conflict** with the Phase 2 live-API tables — the dashboard will need to prefer `AccDcProjectUser` over `AccProjectMember` going forward (out-of-scope here, just do not break it).

The progressive-window state machine is where research actually matters: APS Data Connector `POST /requests` accepts `dateRange: "CUSTOM"` with `startDate`/`endDate` ISO timestamps (verified in `dc-custom-chunks-3leg.cjs`) and `projectIdList` capped at **50 projects** (APS hard limit, evidenced in `dc-ingest-where-i-admin.cjs:36`). One daily run must submit `ceil(activeProjects/50)` requests for the same 30-day window, each request counting against the ~25/UTC-day quota. With Hermosillo's ~250 admin projects, that is 5 requests/day — well under the cap, as CONTEXT predicts.

**Primary recommendation:** Build on top of `dc-ingest-where-i-admin.cjs` rather than starting fresh. Refactor it into a library (`lib/acc/dcIngest.ts`) so the cron script becomes a thin wrapper; add a `lib/acc/dcAdminCsvIngest.ts` sibling that handles the 16 admin CSVs into a transactional `AccDc*` snapshot; introduce `AccDcIngestRun` + `AccDcBackfillProgress` tables; extend `SyncFreshnessPill` to read the new data. Keep `lib/acc/ingestActivityZip.ts` unchanged (or deprecate after the new path lands) — it is the legacy single-ZIP path that maps to the YESTERDAY-only schema.

## Standard Stack

### Core (already in repo — reuse)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | ^7.8.0 | DB access incl. `$transaction` for full-replace | Already the project ORM; supports interactive transactions with isolation level config. |
| `@prisma/adapter-pg` | ^7.8.0 | PG driver adapter used by every script | Required by current Prisma setup. |
| `csv-parse` | ^6.2.1 | Streaming CSV parser | Already in use in `lib/acc/ingestActivityZip.ts` + `dc-ingest-where-i-admin.cjs`. Stream interface honors backpressure. |
| `unzipper` | ^0.12.3 | Streaming ZIP extraction | Already in use. Note: legacy single-ZIP path. **DC per-module schema returns individual per-file signed URLs, NOT a ZIP** — see Pitfall 3. |
| `tsx` | ^4.21.0 | Allows `.cjs` cron scripts to `require()` TS modules | Already used by all DC scripts. |
| `vitest` | ^4.1.6 | Unit testing | Project test framework. |

### Supporting (already in repo)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next-auth` | ^5.0.0-beta.31 | NextAuth `signIn("autodesk", ...)` | Token-failure click-to-reauth flow. |
| `date-fns` | ^4.1.0 | Date math for sliding window | Already in use. Compute slice start/end. |
| `p-limit` | ^7.3.0 | Concurrency cap | Not currently used in DC scripts (they are sequential by design). Probably keep sequential to respect APS 10-req/min. |
| `@trpc/server` | ^11.17.0 | tRPC procedure for pill data | Extend existing `accSyncRouter`. |

### Do Not Add

| Do Not Add | Why |
|------------|-----|
| `node-cron` / `croner` / `bull` / `agenda` | CONTEXT locks scheduling to Windows Task Scheduler. In-process cron breaks if the Next.js server restarts. |
| `papaparse` | Buffers; cannot stream from per-file signed URLs cleanly. `csv-parse` is the existing choice. |
| `pg-boss` | Listed in v2.0 REQUIREMENTS Out-of-Scope. No job queue needed; the pipeline is daily-batch + sequential. |
| `jszip` / `adm-zip` | Listed in v2.0 Out-of-Scope. Memory-heavy. |
| `nodemailer` / `resend` (for this phase) | CONTEXT explicitly: "No emails." |

**No new installs required.** Phase 8 should land without `npm install`.

## Architecture Patterns

### Recommended File Structure

```
lib/acc/
  dcIngest.ts                # NEW — main orchestrator (extracted from dc-ingest-where-i-admin.cjs)
  dcAdminCsvIngest.ts        # NEW — 16-CSV permission snapshot ingest (transactional)
  dcActivityCsvIngest.ts     # NEW — per-module activity CSV ingest (extracted from current script)
  dcProgressiveBackfill.ts   # NEW — slide-window state machine (the distinctive design)
  dcKnownBots.ts             # NEW — bot actor constant + isBotActor()
  dcAnomalyChecks.ts         # NEW — quarantine sanity checks
  ingestActivityZip.ts       # KEEP — legacy single-ZIP path (deprecate after cutover)

scripts/
  dc-daily-cron.ps1          # EXTEND — already shipped; add timeout + .dc-ingest.disabled check
  dc-daily-ingest.cjs        # NEW — thin wrapper around lib/acc/dcIngest.ts

prisma/migrations/
  20260516XXXXXX_acc_dc_tables/
    migration.sql            # NEW — 16 AccDc* tables + AccDcIngestRun + AccDcBackfillProgress

components/layout/
  SyncFreshnessPill.tsx      # EXTEND — add hover popover with DC ingest details

server/routers/
  accSync.ts                 # EXTEND — add getDcIngestStatus, getBackfillProgress, getAccessDiff procedures

.planning/phases/08-.../
  RUNBOOK.md                 # NEW — phase deliverable
```

### Pattern 1: Progressive Window State Machine (the distinctive design)

**What:** Each daily run advances a shared 30-day window backward in time across ALL admin projects in parallel. Per-project floor = `AccDcProject.createdAt` (from `admin_projects.csv`). State persists in `AccDcBackfillProgress`.

**State table shape:**
```prisma
model AccDcBackfillProgress {
  projectId          String   @id
  earliestCovered    DateTime?
  latestCovered      DateTime?
  projectCreatedAt   DateTime
  newProjectFlag     Boolean  @default(false)
  updatedAt          DateTime @updatedAt
}
```

**Algorithm (run-time, in `dcProgressiveBackfill.ts`):**
```typescript
// Source: derived from CONTEXT.md progressive-backfill decisions
async function planDailySlice(prisma: PrismaClient): Promise<DailyPlan> {
  const yesterday = startOfUTCDay(new Date(Date.now() - 86_400_000));
  const projects = await prisma.accDcProject.findMany({ select: { id: true, createdAt: true } });
  const progress = new Map(
    (await prisma.accDcBackfillProgress.findMany()).map(p => [p.projectId, p])
  );

  const slices: { projectId: string; start: Date; end: Date }[] = [];
  for (const project of projects) {
    const p = progress.get(project.id);
    if (!p) {
      // New project — slice = last 30 days, flagged for accelerated backfill
      slices.push({ projectId: project.id, start: subDays(yesterday, 30), end: yesterday });
      continue;
    }
    // Backward edge: 30 days deeper than earliestCovered (floored at projectCreatedAt)
    const backwardEnd = p.earliestCovered;
    const backwardStart = max(subDays(backwardEnd, 30), p.projectCreatedAt);
    if (backwardStart < backwardEnd) {
      slices.push({ projectId: project.id, start: backwardStart, end: backwardEnd });
    }
    // Forward catch-up (overlap +1 day per CONTEXT)
    const forwardStart = subDays(p.latestCovered, 1);
    if (forwardStart < yesterday) {
      slices.push({ projectId: project.id, start: forwardStart, end: yesterday });
    }
  }
  // Group projects with same (start,end) into APS requests of up to 50 ids
  return groupByWindow(slices);
}
```

**Why this is the right shape:**
- Quota burn predictable (~5 requests/day for Hermosillo's ~250 projects).
- Dashboard productive day 1 (every project has last 30 days).
- Historical depth grows visibly day-by-day.
- Crash mid-run leaves state untouched until commit; next day picks up cleanly.
- New projects get accelerated treatment via `newProjectFlag`.

### Pattern 2: Transactional Full-Replace Snapshot

**What:** Each admin CSV is fully wiped and re-inserted in a single `$transaction`, so the dashboard never sees an empty intermediate state.

```typescript
// Source: Prisma docs (interactive transactions) — verify isolation level support via Context7
await prisma.$transaction(async (tx) => {
  // Insert order matters if any AccDc* table is going to have FKs.
  // CONTEXT decision: NO FKs on AccDc* (orphans tolerated). Simplifies this loop.
  for (const csv of ADMIN_CSV_ORDER) {
    const rows = await parseAdminCsv(csv, downloadFn);
    await tx[csv.model].deleteMany({});
    if (rows.length > 0) {
      await tx[csv.model].createMany({ data: rows });
    }
  }
  // Sanity checks run here — throw to abort the whole snapshot
  await assertNoAnomalies(tx, previousRunMetrics);
}, {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 5 * 60 * 1000, // 5min — full-replace of ~16 tables
  maxWait: 30_000,
});
```

**Isolation level (LOW confidence pending verification):** `Serializable` is safest for a read-modify-write that must not interleave with dashboard reads. Postgres serializable can cause serialization failures under concurrency; mitigated here because **only one ingest runs at a time** (`AccDcIngestRun.status='running'` guard, mirroring Phase 3's `AccDataConnectorJob` overlap guard). Planner: verify with Context7 (`mcp__context7__resolve-library-id` -> "Prisma" -> query "transaction isolation level postgres") before committing the value. Acceptable alternative: `ReadCommitted` (Prisma default) with an explicit advisory lock via `tx.$executeRaw` on `pg_advisory_xact_lock(...)`.

### Pattern 3: Module-Agnostic Activity Ingest with Unknown-Module Guard

```typescript
// lib/acc/dcActivityCsvIngest.ts
const KNOWN_MODULES = new Set([
  'docs', 'issues', 'submittals', 'rfis', 'sheets',
  'admin', 'cost', 'assets', 'bridge',
]);

const ACTIVITY_FILE_RE = /^activities_([a-z_]+)_activities\.csv$/i;

function parseModuleFromFilename(filename: string): string | null {
  const m = ACTIVITY_FILE_RE.exec(filename);
  if (!m) return null;
  return m[1].toLowerCase();
}

function ingestActivityFile(filename: string, /* ... */) {
  const module = parseModuleFromFilename(filename);
  if (!module) return; // not an activity file
  if (!KNOWN_MODULES.has(module)) {
    runLog.unknownModuleSeen.push(module); // surface in AccDcIngestRun.errorMessage
    console.warn(`[dc-ingest] Unknown module '${module}' in ${filename} — skipping rows`);
    return;
  }
  // ... stream rows, set service: module on every row
}
```

### Pattern 4: Anomaly Auto-Quarantine

```typescript
// lib/acc/dcAnomalyChecks.ts
export interface AnomalyThresholds {
  maxUserDropPct: number;        // suggested default: 10 (10% drop blocks)
  maxProjectDropPct: number;     // suggested default: 5
  requireAllAdminCsvs: boolean;  // true — missing CSV = quarantine
  requireNonZeroInsert: boolean; // true on first-ingest day for that CSV
}

export async function assertNoAnomalies(
  tx: PrismaTransactionClient,
  previous: PreviousRunMetrics | null,
  thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
): Promise<void> {
  if (!previous) return; // no baseline yet
  const newUsers = await tx.accDcUser.count();
  const drop = (previous.userCount - newUsers) / previous.userCount * 100;
  if (drop > thresholds.maxUserDropPct) {
    throw new AnomalyError(`User count dropped ${drop.toFixed(1)}% (threshold ${thresholds.maxUserDropPct}%)`);
  }
  // ...
}
```

**Why throw inside transaction:** Prisma `$transaction` rolls back on uncaught throw. Pill goes amber on next read because `AccDcIngestRun.status='quarantined'` row was written outside the transaction (in a separate post-transaction step). Pattern: open transaction -> checks -> throw on bad -> catch outside -> upsert `AccDcIngestRun` with status='quarantined'.

### Anti-Patterns to Avoid

- **Per-CSV transaction.** Wrapping each CSV separately defeats the "dashboard never sees an empty intermediate" guarantee. One transaction wraps all 16.
- **Upsert loops.** With ~250 projects times ~average-N users, `upsert` per row is 10-100x slower than delete-all + createMany.
- **Module=NULL fallback.** Any code path that writes `service: null` for a module-bearing row defeats DC8-01. Enforce non-null at the mapper boundary.
- **Sharing the legacy `ingestActivityZip.ts` for new path.** It assumes a single ZIP. The per-module DC schema delivers per-file signed URLs (see Pitfall 3) — building on top of it leaks ZIP assumptions everywhere.
- **In-process cron.** Already locked in CONTEXT — call out anyway since Next.js dev/prod restart would silently kill it.

## Do Not Hand-Roll

| Problem | Do Not Build | Use Instead | Why |
|---------|--------------|-------------|-----|
| Token refresh / OAuth flow | Manual `/authentication/v2/token` POST in every script | `refreshUserToken()` already in `dc-ingest-where-i-admin.cjs` — extract into `lib/server/aps-oauth.ts` | Token rotation logic + DB-write-back is non-trivial; existing code handles 5-min lookahead, scope preservation. |
| 50-project APS limit chunking | Hand-loop slicing per call site | Existing `PROJECT_BATCH=50` constant + the `for (let i = 0; i < ids.length; i += PROJECT_BATCH)` pattern | The limit is enforced server-side; APS returns 400 if exceeded. Documented at `dc-ingest-where-i-admin.cjs:36`. |
| Per-file signed URL fetch (post-2026-05-15 schema) | Custom retry/auth-strip code | Extend `dcDataListing` + `dcSignedUrl` pattern already in `dc-ingest-where-i-admin.cjs:219-237` | The 3-call flow (`/jobs/:id/data-listing` -> `/jobs/:id/data/:name` -> signed URL) is the only documented path that works for per-module output. |
| ZIP streaming (legacy YESTERDAY range) | Custom unzip | `unzipper.Parse({ forceStream: true })` already in `ingestActivityZip.ts:298` | Backpressure-aware. Sequential entry consumption avoids interleaving (Pitfall 8). |
| CSV streaming parse | Custom split-on-comma | `csv-parse` with `{ columns: true, bom: true, relax_column_count: true }` from `ingestActivityZip.ts:168-174` | BOM handling is non-negotiable for Windows/Excel CSVs. |
| Polling reduce-status | Custom enum mashing | `reduceJobsStatus()` from `dc-ingest-where-i-admin.cjs:208-217` | Handles both `status` and `completionStatus` shapes APS returns; covers fail/cancel/error. |
| Email lookup post-ingest | Second pass UPDATE | Inline per-batch `enrichEmails()` from `ingestActivityZip.ts:104-156` | Single-pass; cached `admin_users.csv` map per ZIP. Phase 3 decision 03-02 codified this. |
| Backfill state column | New ad-hoc JSON blob in `SyncMeta` | Dedicated `AccDcBackfillProgress` model | Queryable per-project. Migrations are cheap; one-off blob is not. |

**Key insight:** The current ~470-line `dc-ingest-where-i-admin.cjs` is essentially the reference implementation. Phase 8 is "refactor this into modules, plug in the admin CSV ingest, swap quota-fail/timeout for the progressive backfill state machine, persist run metrics."

## Common Pitfalls

### Pitfall 1: Signed S3 URL with Authorization Header -> 403

**What goes wrong:** Sending `Authorization: Bearer ...` on the signed S3 download fails with 403.
**Why:** APS signs the URL itself; adding any auth header invalidates the signature.
**How to avoid:** Bare `fetch(signedUrl)` — no headers.
**Warning signs:** "HTTP 403" on otherwise-successful `/data-listing` call.
**Source:** `ingestActivityZip.ts:280-282` comment + `APS_DOCS/HOW TO/HOW_TO_Extract_Activity_Logs.md`.

### Pitfall 2: 2-Leg Auth Permanently Blocked

**What goes wrong:** Trying to submit a DC request with `grant_type=client_credentials` returns 401/403.
**Why:** Production APS client_id is unauthorized for Data Connector API; verified blocked since 2026-05-12.
**How to avoid:** Always use 3-leg user token (Luis's refresh token in `prisma.account`). `refreshUserToken()` is the canonical path.
**Source:** Project memory `project_data_connector_declined.md` + `dc-ingest-where-i-admin.cjs:107-122` comment "2-leg may not have DC scope".

### Pitfall 3: Per-Module Schema Returns Per-File Signed URLs, Not a ZIP

**What goes wrong:** Calling `ingestActivityZip(downloadUrl, ...)` on the new schema fails — there is no single `downloadUrl`.
**Why:** 2026-05-15 dry-run discovery: 2-yr backfills return 46 files via `/jobs/:id/data-listing`, each file requiring `/jobs/:id/data/:name` to get its own signed URL. Only the YESTERDAY range returns a single ZIP per legacy schema.
**How to avoid:** Build the new pipeline on the per-file path (`dcDataListing` + `dcSignedUrl` pattern). Detect schema at runtime: if listing has `.zip` entries -> legacy; otherwise per-file.
**Warning signs:** `[dc-ingest-3leg] Download URLs=0` log line (already coded in `dc-ingest-pending-3leg.cjs:128`).
**Source:** Project memory `project_dc_csv_schema_real.md` + script comment `dc-ingest-where-i-admin.cjs:44-46`.

### Pitfall 4: APS Daily Quota ~25 Requests/UTC-Day Per User

**What goes wrong:** Run aborts mid-flight with HTTP 429; subsequent requests fail until UTC midnight.
**Why:** Per-user soft cap from APS. Hit on 2026-05-13.
**How to avoid:**
- Stay well under cap by design (5 req/day in Hermosillo's case is the target).
- Catch 429 in `dcSubmit()`, persist state, exit cleanly. `DC_RESUME=1` already supports this in `dc-ingest-where-i-admin.cjs:40`.
- Pill amber state + `AccDcIngestRun.status='quota-exceeded'` per CONTEXT decisions.
**Warning signs:** `error.status === 429` in any APS call.
**Source:** Project memory `project_dc_daily_quota.md` + existing 429 handling at `dc-ingest-where-i-admin.cjs` (re-raise path).

### Pitfall 5: APS 504 Gateway Timeout on First `POST /requests` Attempt

**What goes wrong:** `POST /requests` returns 504 even though APS is healthy.
**Why:** APS DC backend has intermittent timeouts on first call.
**How to avoid:** Exponential backoff retry (10s, 20s, 40s, 80s) for 5xx — already coded in `dc-ingest-where-i-admin.cjs:164-194`.
**Warning signs:** `POST /requests 504` log line; recover on retry 2 or 3.

### Pitfall 6: Description Field Punctuation Rejection

**What goes wrong:** APS rejects `POST /requests` with 400 if description contains punctuation other than space/dash.
**Why:** Undocumented APS validation.
**How to avoid:** Strip via regex to alnum+space+dash — coded in `dc-ingest-where-i-admin.cjs:311`.
**Warning signs:** 400 with cryptic body on submission. Note: `dc-custom-chunks-3leg.cjs:133` has un-sanitized description and **may break** under some inputs — fix during refactor.

### Pitfall 7: Postgres NULL in Composite Unique -> Disabled Dedup

**What goes wrong:** Admin rows with `projectId=null` produce duplicates on re-ingest.
**Why:** Postgres treats `NULL != NULL` in unique constraints; the `@@unique([autodeskId, rawAction, createdAt, projectId])` skips NULL rows.
**How to avoid:** Use empty-string sentinel `""` for admin rows. Already coded in `ingestActivityZip.ts:74-76`.

### Pitfall 8: ZIP Entry Iteration Must Be Strictly Sequential

**What goes wrong:** Interleaved entry reads corrupt the stream / lose rows.
**Why:** `unzipper.Parse()` is a Transform — concurrent entry consumption is unsupported.
**How to avoid:** `for await (const entry of directory)` consumes one entry at a time. Do not Promise.all over entries.
**Source:** `ingestActivityZip.ts:298-307` comment + Phase 3 RESEARCH Pitfall 5.

### Pitfall 9: Token Refresh Race Across Long-Running Loops

**What goes wrong:** Token expires (1h TTL) mid-poll-loop; subsequent requests 401.
**Why:** Naively calling `refreshUserToken()` once at start; access_token lifetime is ~3600s.
**How to avoid:** Call `refreshUserToken()` before every APS call (function early-returns if still fresh). Already pattern in `dc-ingest-where-i-admin.cjs:307,337,377,384`.

### Pitfall 10: `service` Field Currently NULL — Do Not Trust Legacy Rows

**What goes wrong:** Wiping legacy rows before the new pipeline lands leaves the dashboard empty until first daily run.
**Why:** CONTEXT specifies wipe + re-ingest; first run may take 30 minutes.
**How to avoid:** Schedule the wipe **inside** the first new run's transaction (delete legacy -> insert new in same tx). Or sequence: cron runs successfully once -> manual SQL wipe -> next cron re-ingests.

### Pitfall 11: `_changes.csv` Siblings + Submittal Detail Files

**What goes wrong:** Greedy CSV filter accidentally ingests `_changes.csv` or `submittals_target_*.csv` files.
**Why:** CONTEXT excludes them. Filter must be strict.
**How to avoid:** Activity filter: exactly `^activities_[a-z_]+_activities\.csv$`. Admin filter: explicit allow-list of the 16 `admin_*` files. No greedy patterns.

## Code Examples

### Example 1: AccDc* Prisma Schema (skeleton)

```prisma
// Source: derived from CONTEXT.md decisions + project schema conventions
model AccDcUser {
  id           String   @id
  email        String?
  name         String?
  status       String?
  companyId    String?
  ingestRunId  String
  ingestedAt   DateTime
  @@index([email])
  @@index([companyId])
}

model AccDcCompany {
  id          String   @id
  name        String
  hubId       String?
  ingestRunId String
  ingestedAt  DateTime
}

model AccDcProject {
  id          String   @id
  accountId   String
  name        String
  jobNumber   String?
  status      String?
  createdAt   DateTime?
  ingestRunId String
  ingestedAt  DateTime
  @@index([accountId])
}

model AccDcProjectUser {
  projectId   String
  userId      String
  status      String?
  addedOn     DateTime?
  lastSignIn  DateTime?
  ingestRunId String
  ingestedAt  DateTime
  @@id([projectId, userId])
  @@index([userId])
}

// ... + AccDcProjectUserRole, AccDcProjectUserProduct, AccDcProjectUserCompany,
//       AccDcProjectRole, AccDcProjectProduct, AccDcProjectCompany,
//       AccDcRole, AccDcBusinessUnit,
//       AccDcAccountService, AccDcProjectService, AccDcProjectUserService,
//       AccDcAccount  (16 total mirroring CSVs)

model AccDcIngestRun {
  id                  String    @id @default(cuid())
  startedAt           DateTime  @default(now())
  endedAt             DateTime?
  status              String
  sliceWindowStart    DateTime?
  sliceWindowEnd      DateTime?
  projectsProcessed   Int       @default(0)
  rowsByModule        Json
  rowsByAdminCsv      Json
  quotaUsed           Int       @default(0)
  diffSummary         Json?
  unknownModulesSeen  String[]  @default([])
  errorMessage        String?
  @@index([startedAt(sort: Desc)])
  @@index([status])
}

model AccDcBackfillProgress {
  projectId        String   @id
  earliestCovered  DateTime?
  latestCovered    DateTime?
  projectCreatedAt DateTime
  newProjectFlag   Boolean  @default(false)
  updatedAt        DateTime @updatedAt
}
```

### Example 2: Known-Bot List (Claude's discretion populated from observations)

```typescript
// lib/acc/dcKnownBots.ts
// Source: CONTEXT.md + APS observations; expand as new bots surface.
export const KNOWN_BOT_NAMES = new Set([
  'Autodesk Cloud Worker',
  'Construction Cloud Sync',
  'BIM 360 System',
  'ACC System',
  'Autodesk Insight',
  'Autodesk Service Account',
]);

// IDs are more stable than names; populate as observed in logs.
export const KNOWN_BOT_AUTODESK_IDS = new Set<string>([
  // Add observed system actor IDs as the runs land.
]);

export function isBotActor(row: { name?: string | null; autodeskId?: string | null }): boolean {
  if (row.autodeskId && KNOWN_BOT_AUTODESK_IDS.has(row.autodeskId)) return true;
  if (row.name && KNOWN_BOT_NAMES.has(row.name)) return true;
  return false;
}
```

### Example 3: Kill-Switch + Stale-Lock Guards

```typescript
// scripts/dc-daily-ingest.cjs (entry point)
const KILL_SWITCH_FILE = path.join(__dirname, '..', '.dc-ingest.disabled');

async function main() {
  if (fs.existsSync(KILL_SWITCH_FILE)) {
    console.log('[dc-ingest] Kill switch active — exiting.');
    process.exit(0);
  }

  const prisma = createPrisma();
  try {
    // Stale-lock check (mirror Phase 3 03-02 pattern)
    const inFlight = await prisma.accDcIngestRun.findFirst({
      where: { status: 'running' },
      orderBy: { startedAt: 'desc' },
    });
    if (inFlight) {
      const ageMs = Date.now() - inFlight.startedAt.getTime();
      if (ageMs < 60 * 60 * 1000) {
        console.log(`[dc-ingest] Another run is in-flight; exiting.`);
        process.exit(0);
      }
      // Stale > 60min — reclaim
      await prisma.accDcIngestRun.update({
        where: { id: inFlight.id },
        data: { status: 'failed', errorMessage: 'Stale lock reclaimed', endedAt: new Date() },
      });
    }
    await runDcIngest(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
```

### Example 4: Pill Tooltip Data Procedure

```typescript
// server/routers/accSync.ts extension
getDcIngestStatus: publicProcedure.query(async ({ ctx }) => {
  const [lastRun, progress, lastSuccess] = await Promise.all([
    ctx.prisma.accDcIngestRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    ctx.prisma.accDcBackfillProgress.findMany(),
    ctx.prisma.accDcIngestRun.findFirst({
      where: { status: 'success' }, orderBy: { startedAt: 'desc' },
    }),
  ]);

  // Compute backfill progress: avg(monthsCovered) / avg(monthsTotal)
  const months = progress.map(p => {
    if (!p.earliestCovered || !p.latestCovered) return { covered: 0, total: 0 };
    const total = monthsBetween(p.projectCreatedAt, new Date());
    const covered = monthsBetween(p.earliestCovered, p.latestCovered);
    return { covered, total };
  });
  const totalMonths = months.reduce((s, m) => s + m.total, 0);
  const coveredMonths = months.reduce((s, m) => s + m.covered, 0);

  return {
    lastRunAt: lastRun?.startedAt ?? null,
    lastRunStatus: lastRun?.status ?? null,
    lastSuccessAt: lastSuccess?.startedAt ?? null,
    backfillPct: totalMonths > 0 ? coveredMonths / totalMonths : 0,
    backfillMonthsCovered: coveredMonths,
    backfillMonthsTotal: totalMonths,
    quotaUsedToday: lastRun?.quotaUsed ?? 0,
    quotaCap: 25,
    diffSummary: lastSuccess?.diffSummary ?? null,
    unknownModulesSeen: lastSuccess?.unknownModulesSeen ?? [],
  };
}),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single ZIP per request (`project_activities.csv` + `admin_activities.csv`) | Per-file signed URLs, 46 files in per-module schema | 2026-05-15 dry-run | Existing `ingestActivityZip.ts` (single-ZIP) becomes legacy; only YESTERDAY range still returns a ZIP. |
| Railway nightly cron @ 09:00 UTC | Windows Task Scheduler @ 03:00 local | 2026-05-13 Railway trial expiry | `scripts/dc-daily-cron.ps1` is the harness. No deploy auto-runs. |
| 2-leg client-credentials auth | 3-leg user-context (Luis's refresh token) | 2026-05-12 (2-leg permanently blocked) | All DC scripts must read `prisma.account` and refresh. |
| Hardcoded `requestId` in dc-ingest-pending-3leg.cjs | Generalized via `DC_REQUEST_ID` env + status-fallback query | 2026-05-12 | Promote scripts auto-pick the most-recent pending/running/success row. |
| 9 Quick-Sync live-API procedures for permission data | DC snapshot tables `AccDc*` | Phase 8 (this phase) | Live-API code stays for back-compat; dashboard reads DC. |

**Deprecated / outdated:**
- `scripts/deep-sync.cjs` (Railway nightly trigger) — never run since 2026-05-13. Replaced by `dc-daily-cron.ps1`.
- `lib/acc/ingestActivityZip.ts` legacy single-ZIP path — keep for YESTERDAY range; new code goes through per-file path.

## Open Questions

1. **Transaction isolation level for the 16-CSV full-replace**
   - What we know: Prisma supports `Prisma.TransactionIsolationLevel.{ReadCommitted, RepeatableRead, Serializable}`. Serializable is safest but can fail under contention.
   - What is unclear: Whether Postgres advisory locks are simpler than serializable for our single-writer case.
   - Recommendation: Start with `Serializable` + run-level lock (`AccDcIngestRun.status='running'`). Verify with Context7 (`mcp__context7__resolve-library-id` -> "Prisma" -> query "transaction isolation level postgres") before commit.

2. **Anomaly threshold defaults**
   - What we know: CONTEXT marks this as Claude's discretion.
   - Recommendation defaults: user-count drop > 10% blocks; project-count drop > 5% blocks; missing any of the 16 admin CSVs blocks; first-ingest of a CSV requires >=1 row otherwise blocks. Expose all 4 thresholds as constants in `lib/acc/dcAnomalyChecks.ts` for fast tuning.

3. **Known-bot autodesk-id discovery**
   - What we know: Names list is partial. CONTEXT defers IDs to "as observed."
   - Recommendation: Empty `KNOWN_BOT_AUTODESK_IDS` set on day 1; surface bot-candidate IDs in `AccDcIngestRun.diffSummary` (top-5 actors by row count) so the planner can promote real bot IDs into the constant over time.

4. **Re-auth UX (Claude's discretion)**
   - What we know: CONTEXT says "click pill to re-auth" but leaves modal-vs-tab open.
   - Recommendation: Use NextAuth's built-in flow — `signIn('autodesk', { callbackUrl: window.location.href })`. Native browser redirect; no modal needed; existing pattern in the app.

5. **Diff-summary computation cost**
   - What we know: Diff vs last successful run for users-added/removed surfaces in pill tooltip.
   - What is unclear: Cheapest way to compute — query last-run snapshot vs new snapshot inside the same transaction (transient JOIN) or pre-aggregate counts.
   - Recommendation: Compute INSIDE the transaction using `tx.accDcUser.findMany({ select: { id: true } })` before delete + after insert, set-difference in JS. ~250 users times ~10 projects times ~50 users-per-project = 12.5k IDs; trivial.

6. **Phase 7.1 vs Phase 8 ordering**
   - What we know: Phase 7.1 is currently in-flight (CONTEXT for 7.1 exists but no plans yet); Phase 8 is the next planned.
   - Recommendation: No technical dependency between them. Plan Phase 8 immediately; landing order is operational.

## Validation Architecture

> Note: `.planning/config.json` only has `workflow.research: true` set. `workflow.nyquist_validation` is absent (default false). Section included as a courtesy for planner — drop if planner does not need it.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.6 |
| Config file | `vitest.config.ts` (`environment: 'node'`, globals: true, setup `vitest.setup.ts`) |
| Quick run command | `npx vitest run lib/acc/<module>.test.ts` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DC8-01 | `parseModuleFromFilename` returns module for each of 9 known names; null for unknown | unit | `npx vitest run lib/acc/dcActivityCsvIngest.test.ts -x` | Wave 0 |
| DC8-02 | `isBotActor` true for each bot name; false for normal | unit | `npx vitest run lib/acc/dcKnownBots.test.ts -x` | Wave 0 |
| DC8-03 | Unknown module logged + skipped + recorded in run.unknownModulesSeen | unit | same as DC8-01 | Wave 0 |
| DC8-06 | Transactional full-replace: mock tx rollback on anomaly | unit (with mocked Prisma tx) | `npx vitest run lib/acc/dcAdminCsvIngest.test.ts -x` | Wave 0 |
| DC8-07 | `planDailySlice` produces correct slice list across edge cases (new project, fully-backfilled project, project at floor) | unit | `npx vitest run lib/acc/dcProgressiveBackfill.test.ts -x` | Wave 0 |
| DC8-09 | `assertNoAnomalies` throws on user-drop > 10%, missing CSV, etc. | unit | `npx vitest run lib/acc/dcAnomalyChecks.test.ts -x` | Wave 0 |
| DC8-10 | Kill-switch file detected -> early exit | unit | `npx vitest run lib/acc/dcIngest.test.ts -x` | Wave 0 |
| DC8-14 | `getDcIngestStatus` returns expected shape | smoke | run against dev DB | manual |
| DC8-16 | Module badge renders for each module value | manual UAT | n/a | manual |

### Sampling Rate
- **Per task commit:** `npx vitest run lib/acc/<changed-module>.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + manual smoke of one daily run on dev DB.

### Wave 0 Gaps
- [ ] `lib/acc/dcActivityCsvIngest.test.ts` — covers DC8-01, DC8-03
- [ ] `lib/acc/dcKnownBots.test.ts` — covers DC8-02
- [ ] `lib/acc/dcAdminCsvIngest.test.ts` — covers DC8-06
- [ ] `lib/acc/dcProgressiveBackfill.test.ts` — covers DC8-07
- [ ] `lib/acc/dcAnomalyChecks.test.ts` — covers DC8-09
- [ ] `lib/acc/dcIngest.test.ts` — covers DC8-10
- No framework install needed (Vitest already present).

## Sources

### Primary (HIGH confidence)
- Repo file `scripts/dc-ingest-where-i-admin.cjs` (reference implementation; per-module file regex, 50-project limit, 3-leg auth, 504 retry, quota handling, polling reduce-status, signed-URL fetch pattern)
- Repo file `lib/acc/ingestActivityZip.ts` (streaming patterns, email enrichment, BOM-safe CSV, sequential entry consumption, empty-string sentinel for admin)
- Repo file `scripts/dc-daily-cron.ps1` (Windows Task Scheduler harness — already shipped)
- Repo file `scripts/dc-custom-chunks-3leg.cjs` (CUSTOM dateRange + halving-recovery, isolation-level-ish concurrency guard)
- Repo file `scripts/dc-ingest-pending-3leg.cjs` (3-call data-listing flow when no `downloadUrl`)
- Repo file `prisma/schema.prisma` (AccActivity unique constraint, AccDataConnectorJob, SyncMeta — patterns to mirror)
- Repo file `components/layout/SyncFreshnessPill.tsx` (extension target)
- `APS_DOCS/HOW TO/HOW_TO_Extract_Activity_Logs.md` (canonical DC flow)
- Project memory `project_dc_csv_schema_real.md` (per-module vs legacy schema split, 2026-05-15)
- Project memory `project_dc_daily_quota.md` (25 req/UTC-day; DC_RESUME=1)
- Project memory `project_data_connector_declined.md` (2-leg dead, 3-leg works)
- Project memory `feedback_no_manual_sync_ui.md` (hide manual sync UI; automatic only)
- `.planning/STATE.md` Phase 3 decisions 03-01..03-04 (Phase 3 patterns to reuse)
- `.planning/REQUIREMENTS.md` Out of Scope list (libraries to avoid)

### Secondary (MEDIUM confidence)
- Implicit Prisma `$transaction({ isolationLevel })` API — works on `@prisma/client@^7.8.0` but planner should verify supported levels via Context7 before locking.

### Tertiary (LOW confidence)
- Anomaly threshold defaults (10%/5%/etc.) — fabricated as defensible defaults; expose as constants.
- Known-bot list — names are partial; autodesk-IDs unknown until observed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library already in use in the repo, version-locked, behavior battle-tested.
- Architecture (progressive backfill state machine): MEDIUM-HIGH — algorithm derived directly from CONTEXT's distinctive design + APS quotas + 50-project limit. State persistence shape is a planner discretion item; recommended shape is safe.
- Architecture (transactional snapshot): MEDIUM — pattern is standard Prisma, but isolation level not yet verified against `@prisma/client@^7.8.0` via Context7.
- Pitfalls: HIGH — all 11 pitfalls are observed in existing repo code with file:line evidence.
- Validation map: HIGH — Vitest is already configured and used heavily in `lib/acc/*.test.ts`.

**Research date:** 2026-05-15
**Valid until:** ~2026-06-15 (stable APS API; flag for refresh if Autodesk changes Data Connector schema again).
