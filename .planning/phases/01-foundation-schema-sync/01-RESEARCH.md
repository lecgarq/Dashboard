# Phase 1: Foundation — Schema + Sync Orchestration - Research

**Researched:** 2026-05-11
**Domain:** Prisma schema migration, Railway release commands / cron, email alerting, tRPC freshness query, `getAccountId` helper
**Confidence:** HIGH (codebase verified directly; Railway cron syntax from official docs; email path from existing code)

---

## 2026-05-11 Official-Docs Update

Before implementing Plan `01-03`, verify current Railway config-as-code docs. The implementation behavior is stable, but the key name in `railway.toml` may differ from older plan wording:

- Railway currently documents the deploy hook as a **Pre-Deploy Command**: https://docs.railway.com/deployments/pre-deploy-command
- Railway cron jobs use UTC cron schedules and should terminate cleanly: https://docs.railway.com/reference/cron-jobs
- Railway config-as-code key names must be checked against the current reference before editing `railway.toml`: https://docs.railway.com/config-as-code/reference

Planner/implementer rule: do not blindly use `releaseCommand`. Use the current documented key, likely `preDeployCommand`, if the reference confirms it. Record the selected key and source in `01-03-SUMMARY.md`.

See `01-IMPLEMENTATION-HANDOFF.md` for the implementation-ready handoff.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **No UI trigger buttons.** No Quick Sync or Deep Sync buttons appear in the dashboard. All syncs are server-side.
- **Quick Sync** runs as a Railway **release step** on every deploy, after `prisma migrate deploy`, before the new container serves traffic.
- **Deep Sync** runs as a **Railway cron** daily at **02:00 Hermosillo time (UTC-7) = 09:00 UTC**.
- **Hard timeout: 5 minutes** on Quick Sync. If it overruns, the deploy fails (release command exits non-zero).
- **On Quick Sync failure:** deploy is failed, old container keeps serving, alert email fires. Schema stays (migration already ran and is additive).
- **`AccDataConnectorJob`** — full row per Deep Sync run, retained forever.
- **`SyncMeta`** — single-row-per-sync-type key-value table holding `last_run_at`, `last_status`, `last_error`.
- **Email** to `luis.ecorteg@gmail.com` on any sync failure. Contains: sync type, timestamp, last error, jobId (Deep only).
- **Email-only** for v2.0 — no Sentry, no in-app banner.
- **Small "Last synced: 2h ago"** text in dashboard footer (or equivalent).
- **Reads from `SyncMeta`** (Quick Sync) and latest `AccDataConnectorJob.completedAt` (Deep Sync).
- **No `/sync-status` page** in this phase.
- **Auto-apply on deploy:** Railway release command runs `prisma migrate deploy` then Quick Sync then serves traffic.
- **Additive-only** — no feature flag, no dual-write shim, no back-compat shim in P1.
- **No DB snapshot** before migrate (additive is safe).
- **Pure DDL, no seed data.**
- **Overlap handling for Deep Sync:** skip new run if a previous is `pending` or `running`. Log `"skipped — previous still in-flight"`.
- **No auto-retry.** Failed jobs wait for next nightly cron.
- **Deep Sync states:** `pending` → `running` → (`success` | `failed`). No `cancelled` or `timeout`.

### Claude's Discretion

- Exact tRPC routing / file layout for the freshness indicator query.
- Email sending mechanism (Resend vs Gmail OAuth — pick cheapest/simplest given Railway env).
- Exact wording of failure email subject/body.
- Footer placement and styling for "Last synced: …" indicator (must fit existing dashboard chrome).
- Schedule expression syntax (Railway cron format).
- Helper function file locations for `getAccountId` / `getProjectIdForDM`.
- Unit-test scaffolding choices (Vitest — match what's in the repo).

### Deferred Ideas (OUT OF SCOPE)

- Manual one-shot Deep Sync via Railway CLI.
- Dedicated `/sync-status` history page.
- Sentry / structured error tracking.
- In-app failure banner.
- Auto-retry with backoff.
- REQUIREMENTS.md wording update (SYNC-01..04 still describe UI flows — document as deviation, not fix).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | Prisma adds 7 new models (`AccProject`, `AccProjectMember`, `AccRole`, `AccProjectRole`, `AccFolder`, `AccFolderPermission`, `AccActivity`) plus `AccDataConnectorJob` | Schema section below; Prisma 7.x `@@index` and composite index syntax verified |
| SCHEMA-02 | `AccActivity` composite indexes from day one: `(autodeskId, created_at DESC)`, `(projectId, created_at DESC)`, `(action)` | Prisma `@@index` with `sort: Desc` documented in Architecture Patterns |
| SCHEMA-03 | Two distinct projectId helpers: `getAccountId(db)` strips `b.`, `getProjectIdForDM(rawId)` preserves `b.`; unit tests; existing callers audited | `getAccountId` already exists in `server/routers/users.ts` line 211; no callers need `getProjectIdForDM` yet — established once, audited for `b.` stripping |
| SYNC-01 | Quick Sync shell: Railway release step — runs synchronously, writes `SyncMeta`, dual-writes to `accMemberCache` (Phase 2 adds actual extraction logic) | Railway release command via `railway.toml`; script pattern documented |
| SYNC-02 | Deep Sync shell: submits APS Data Connector job, returns `requestId`, persists `AccDataConnectorJob` row | APS Data Connector API endpoints documented from `HOW_TO_Extract_Activity_Logs.md` |
| SYNC-03 | Deep Sync status survives Railway container restart — UI polls Postgres via tRPC query, not memory | `SyncMeta` + `AccDataConnectorJob` table serve this; tRPC pattern from existing `users` router |
| SYNC-04 | Double-submit prevention; failure reasons surfaced | DB check on `AccDataConnectorJob` for non-terminal rows before new run |
</phase_requirements>

---

## Summary

Phase 1 is an infrastructure phase: add 8 Prisma models (plus `SyncMeta`), wire up two server-side sync jobs (Railway release step + Railway cron), set up failure alerting, and surface a freshness indicator in the sidebar footer. No UI trigger buttons exist — every sync is server-driven.

The codebase is already well-prepared. `getAccountId(db)` exists inside `server/routers/users.ts` (lines 211–221) and only needs to be extracted to a shared helper file so Phase 2 callers can import it. The email infrastructure (`lib/server/email.ts`) already supports both Resend (checked first via `RESEND_API_KEY` env var) and Gmail OAuth as fallback — Phase 1 just adds a `sendSyncFailureAlert()` wrapper. The Prisma schema uses `@prisma/adapter-pg` (driver-adapters mode) and Prisma 7.x; all new models slot in under the existing `// ============ MODULE: ACC ... ============` sections.

Railway deploy flow currently has **no deploy/pre-deploy command key** in `railway.toml` - only `startCommand`. Adding the deploy hook requires updating `railway.toml` with the current documented Railway key plus writing a small Node.js release script. Railway cron is configured via the Railway dashboard's Cron UI (not in `railway.toml`). The freshness indicator goes in the sidebar bottom section (`<div className="border-t border-white/60 px-3 py-3">` in `Sidebar.tsx` lines 476-491) since there is no dashboard footer element - the sidebar bottom is the only persistent chrome below the nav.

**Primary recommendation:** Extract `getAccountId` to `lib/server/acc-helpers.ts`, add 8 Prisma models + `SyncMeta` + migration, write `scripts/release.cjs` (migrate + quick-sync shell with 5-min timeout + alert on error), add `scripts/deep-sync.cjs` (cron entry point), add `accSync` tRPC router with `getSyncFreshness` query, and add the freshness pill to the sidebar bottom.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | ^7.7.0 (in repo) | Schema + migration + DB client | Already in use; `@prisma/adapter-pg` driver adapter enabled |
| `@prisma/adapter-pg` | ^7.7.0 (in repo) | pg connection pooling adapter | Already in use in `server/db.ts` |
| Node.js standalone script | Node 22 (Dockerfile) | Release command and cron entry points | No extra install; Railway runs Node scripts |
| `lib/server/email.ts` | In-repo | Sync failure alerting | Already routes Resend then Gmail OAuth; zero new deps |
| Vitest | ^4.1.5 (in repo) | Unit tests for helpers | Already configured; `vitest.config.ts` + `vitest.setup.ts` in place |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | ^4.1.0 (in repo) | Format "2h ago" display string | `formatDistanceToNow` from existing dep |
| tRPC | ^11.17.0 (in repo) | Freshness indicator query | new `accSync` router with `getSyncFreshness` procedure |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Resend API (free tier, already wired) | Postmark / nodemailer | Resend already checked first in `email.ts`; `RESEND_API_KEY` env var → no new deps |
| Raw Postgres job table | pg-boss | pg-boss adds a dependency; explicitly Out-of-Scope in REQUIREMENTS.md |

**Installation:** No new dependencies required for this phase.

---

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── server/
│   ├── acc-admin.ts          # existing — fetch helpers
│   ├── acc-helpers.ts        # NEW — getAccountId(db), getProjectIdForDM(rawId)
│   ├── acc-sync.ts           # NEW — quickSyncShell(), deepSyncSubmit() orchestration
│   └── email.ts              # existing — add sendSyncFailureAlert()
scripts/
│   ├── release.cjs           # NEW — Railway release command entry point
│   └── deep-sync.cjs         # NEW — Railway cron entry point
server/
│   ├── routers/
│   │   ├── users.ts          # existing — remove inline getAccountId, import from acc-helpers
│   │   └── acc-sync.ts       # NEW router — getSyncFreshness query
│   └── root.ts               # add accSync router
prisma/
│   ├── schema.prisma         # add 8 models + SyncMeta
│   └── migrations/
│       └── YYYYMMDD_acc_v2_foundation/
│           └── migration.sql
components/
│   └── layout/
│       └── Sidebar.tsx       # add SyncFreshnessPill in bottom section
```

### Pattern 1: Railway Deploy / Pre-Deploy Command

**What:** A Node.js script runs after container build, before traffic switches. Non-zero exit = deploy fails.

**How to configure in `railway.toml`:**
Verify the current Railway config-as-code reference before editing. As of the 2026-05-11 official-docs update above, Railway documents this concept as a Pre-Deploy Command, so `preDeployCommand` is the likely key. Older research used `releaseCommand`; keep that only if the current reference still supports it.

```toml
[build]
builder = "DOCKERFILE"

[deploy]
preDeployCommand = "node scripts/release.cjs"
startCommand = "npm run start:prod"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Release script pattern (`scripts/release.cjs`):**

The release script uses `spawnSync` (not `exec`/`execSync`) to avoid shell injection:

```javascript
// scripts/release.cjs
const { spawnSync } = require("child_process");

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes hard limit

async function main() {
  // Step 1: migrate — safe static args, no user input
  console.log("[release] Running prisma migrate deploy...");
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    timeout: 60_000,
  });
  if (migrate.status !== 0) {
    console.error("[release] Migration failed");
    process.exit(1);
  }
  console.log("[release] Migrations applied.");

  // Step 2: Quick Sync shell
  // Phase 1 shell: just writes SyncMeta with a no-op result.
  // Phase 2 will fill in real extraction logic.
  const timer = setTimeout(() => {
    console.error("[release] Quick Sync timed out after 5 minutes. Failing deploy.");
    process.exit(1);
  }, TIMEOUT_MS);

  try {
    await runQuickSyncShell();
    clearTimeout(timer);
    console.log("[release] Quick Sync complete.");
  } catch (err) {
    clearTimeout(timer);
    await sendFailureAlertRaw("quick", err.message).catch(() => {});
    console.error("[release] Quick Sync failed:", err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[release] Fatal:", err);
  process.exit(1);
});
```

**IMPORTANT:** The release script runs in the Docker container (Node 22), so all repo files and `node_modules` are present. It uses `.cjs` extension (CommonJS) consistent with the existing `scripts/start-router.cjs` and `scripts/start-production.cjs` in this repo.

### Pattern 2: Railway Cron Job

**What:** A separate cron job runs `node scripts/deep-sync.cjs` on schedule.

**Cron schedule for 09:00 UTC daily:**
```
0 9 * * *
```

Railway cron format is standard 5-field POSIX cron (`minute hour day month weekday`). Configure via Railway dashboard: Service → Settings → "Add Cron Job" → enter the command `node scripts/deep-sync.cjs` and schedule `0 9 * * *`.

**CONFIDENCE: MEDIUM** — Railway cron is documented. The safest path for Phase 1 is configuring it via the Railway dashboard UI, which avoids `railway.toml` syntax drift. Document the steps in a `CRON_SETUP.md` file for Luis to follow.

**Deep sync entry point (`scripts/deep-sync.cjs`):**
```javascript
// scripts/deep-sync.cjs
async function main() {
  console.log("[deep-sync] Starting nightly Deep Sync job submission...");
  try {
    // Requires lib/server/acc-sync compiled or imported via ts-node/tsx
    const result = await submitDeepSyncJob();
    console.log("[deep-sync] Job submitted:", result.requestId);
  } catch (err) {
    console.error("[deep-sync] Failed:", err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[deep-sync] Fatal:", err);
  process.exit(1);
});
```

### Pattern 3: Prisma Schema — 8 New Models + SyncMeta

The existing schema ends with `AccGraphLayoutCache`. New ACC v2.0 models go in a new section below:

```prisma
// ============ MODULE: ACC V2.0 RELATIONAL LAYER ============

model AccProject {
  id          String             @id   // APS project ID (no b. prefix — Construction Admin)
  accountId   String
  name        String
  jobNumber   String?
  type        String?
  status      String             @default("active") // active | inactive
  createdAt   DateTime?
  updatedAt   DateTime           @updatedAt
  members     AccProjectMember[]
  roles       AccProjectRole[]
  folders     AccFolder[]

  @@index([accountId])
  @@index([status])
}

model AccProjectMember {
  id               String     @id @default(cuid())
  projectId        String
  project          AccProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  autodeskId       String
  email            String
  name             String
  status           String     // active | pending | deleted
  companyName      String?
  phone            String?
  addedOn          DateTime?
  lastSignIn       DateTime?
  projectAdmin     Boolean    @default(false)
  executive        Boolean    @default(false)
  products         Json       // per-module tier map
  syncedAt         DateTime
  roles            AccProjectRole[]

  @@unique([projectId, autodeskId])
  @@index([email])
  @@index([projectId])
  @@index([autodeskId])
}

model AccRole {
  id           String           @id  // APS role ID
  accountId    String
  name         String
  memberCount  Int              @default(0)
  syncedAt     DateTime
  projectRoles AccProjectRole[]

  @@index([accountId])
}

model AccProjectRole {
  id                      String            @id @default(cuid())
  projectId               String
  project                 AccProject        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  roleId                  String
  role                    AccRole           @relation(fields: [roleId], references: [id], onDelete: Cascade)
  memberId                String?
  member                  AccProjectMember? @relation(fields: [memberId], references: [id], onDelete: SetNull)
  docsAccessLevel         String?
  projectAdminAccessLevel String?

  @@unique([projectId, roleId, memberId])
  @@index([projectId])
  @@index([roleId])
}

model AccFolder {
  id          String              @id  // folder URN (with b. prefix — Data Management)
  projectId   String
  project     AccProject          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  parentId    String?
  name        String
  fullPath    String?
  syncedAt    DateTime
  permissions AccFolderPermission[]

  @@index([projectId])
  @@index([parentId])
}

model AccFolderPermission {
  id          String    @id @default(cuid())
  folderId    String
  folder      AccFolder @relation(fields: [folderId], references: [id], onDelete: Cascade)
  roleId      String
  actions     String[]  // raw APS actions array
  permType    String    // View Only | View+Download | Upload Only | etc.
  syncedAt    DateTime

  @@unique([folderId, roleId])
  @@index([folderId])
}

model AccActivity {
  id          String    @id @default(cuid())
  autodeskId  String
  projectId   String?
  action      String
  service     String?
  tool        String?
  details     String?
  createdAt   DateTime

  @@index([autodeskId, createdAt(sort: Desc)])
  @@index([projectId, createdAt(sort: Desc)])
  @@index([action])
}

model AccDataConnectorJob {
  id            String    @id @default(cuid())
  requestId     String    @unique  // APS Data Connector requestId
  status        String    @default("pending")  // pending | running | success | failed
  serviceGroups String[]
  dateRange     String?
  startedAt     DateTime  @default(now())
  completedAt   DateTime?
  downloadUrl   String?
  errorMessage  String?

  @@index([status])
  @@index([startedAt])
}

model SyncMeta {
  id          String    @id  // "quick" | "deep"
  lastRunAt   DateTime?
  lastStatus  String?   // success | failed | skipped
  lastError   String?
  updatedAt   DateTime  @updatedAt
}
```

**Note on SCHEMA-01 count:** REQUIREMENTS.md says "7 new models + `AccDataConnectorJob`" = 8. This research adds `SyncMeta` (explicitly required by CONTEXT.md for freshness tracking). The planner should treat the total as 9 new models (8 domain models + SyncMeta) and note SCHEMA-01 as "8 + SyncMeta".

### Pattern 4: `getAccountId` extraction

**Current state (HIGH confidence):** `getAccountId(db: any)` is a private function inside `server/routers/users.ts` at line 211. It reads `db.project.findFirst({ select: { apsHubId: true } })` and strips the `b.` prefix with `.replace(/^b\./, "")`. It throws a `TRPCError` if the hub ID is missing.

**Required changes for SCHEMA-03:**
1. Extract to `lib/server/acc-helpers.ts` as a named export.
2. Change the throw to throw an `IntegrationError` (or plain `Error`) instead of `TRPCError` — so the helper works from non-tRPC contexts (release script, cron script). The `users.ts` caller catches it and wraps in `TRPCError` via the existing `toAccRouterError` helper.
3. Import back into `server/routers/users.ts` — callers unaffected.
4. Add `getProjectIdForDM(rawId: string): string` — simple pure function, returns the raw ID unchanged (preserves `b.` prefix). Value is being explicit and testable.

**Existing callers that strip `b.` (SCHEMA-03 audit):**
- `server/routers/users.ts` line 213 — inside `getAccountId` itself. After extraction, no inline strips remain.
- `lib/server/acc-admin.ts` — receives a pre-stripped `accountId` from callers. No stripping inside.
- No other inline `b.` stripping found in a search of `server/` files.

### Pattern 5: Email alerting for sync failure

**Existing infrastructure (HIGH confidence):** `lib/server/email.ts` exports the private `sendEmail(to, subject, html)` function which checks `RESEND_API_KEY` first and falls back to Gmail OAuth. No new env vars or deps are needed.

**Add to `lib/server/email.ts`:**
```typescript
export async function sendSyncFailureAlert(opts: {
  syncType: "quick" | "deep";
  timestamp: string;
  errorMessage: string;
  jobId?: string;
}): Promise<void> {
  const { syncType, timestamp, errorMessage, jobId } = opts;
  const label = syncType === "quick" ? "Quick Sync (release step)" : "Deep Sync (nightly cron)";
  const subject = `[BIM Dashboard] ${label} failed — ${timestamp}`;
  const jobLine = jobId ? `<p><strong>Job ID:</strong> ${jobId}</p>` : "";
  await sendEmail(
    "luis.ecorteg@gmail.com",
    subject,
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2>Sync Failure Alert</h2>
      <p><strong>Sync type:</strong> ${label}</p>
      <p><strong>Time:</strong> ${timestamp}</p>
      ${jobLine}
      <p><strong>Error:</strong></p>
      <pre style="background:#f5f5f5;padding:12px;border-radius:4px;font-size:12px;overflow:auto;">${errorMessage}</pre>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
      <p style="color:#aaa;font-size:12px;">BIM Dashboard — Automated Sync Alerts</p>
    </div>`
  );
}
```

**Calling from CJS release script:** The release script cannot import TypeScript directly. Options:
- **Option A (recommended, zero deps):** Write `scripts/release.cjs` as pure CJS using `@prisma/client` + `pg` + raw `fetch()` for the Resend API call. No TS compilation needed.
- **Option B:** Use `node --experimental-transform-types scripts/release.ts` (Node 22 native TS type-stripping). Works for simple TS without path aliases if `@/` aliases are NOT used in the release script.
- **Option C:** Add `tsx` to devDeps and run `node_modules/.bin/tsx scripts/release.ts`.

Planner should pick Option A or B. Option A requires duplicating a few lines of Prisma logic in the script; Option B requires the release script to use relative imports only (no `@/` alias).

### Pattern 6: Sidebar freshness indicator placement

**Current layout (HIGH confidence):** The sidebar bottom section at lines 476–487 of `Sidebar.tsx` contains only a collapse button inside `<div className="border-t border-white/60 px-3 py-3">`. There is no dashboard footer element in the layout.

**Best placement:** Add a `SyncFreshnessPill` component above the collapse button, inside the same bottom div. The pill shows "Last synced: 2h ago" when expanded and collapses to a small dot when the sidebar is collapsed.

```tsx
// components/layout/SyncFreshnessPill.tsx — "use client"
// Uses trpc.accSync.getSyncFreshness.useQuery({ staleTime: 5 * 60 * 1000 })
// Formats lastRunAt with date-fns formatDistanceToNow
// Shows spinner while loading, "Never synced" if null
```

The new `accSync` router goes in `server/routers/acc-sync.ts` and is registered in `root.ts` as `accSync: accSyncRouter`.

### Anti-Patterns to Avoid

- **Do not use `exec()` or `execSync()` in release/cron scripts.** Use `spawnSync` with static argument arrays to avoid shell injection risk.
- **Do not call `process.exit()` from shared library code.** Only release/cron entry point scripts exit. Shared functions throw and let the caller handle.
- **Do not import from `server/db.ts` in the release script if using Option A.** The release script is CJS; `server/db.ts` uses TypeScript module syntax. Instantiate a minimal Prisma client inline in the script.
- **Do not mark `lib/server/acc-helpers.ts` with `"server-only"`.** The cron/release scripts are not Next.js modules; `server-only` throws outside Next.js context.
- **Do not throw `TRPCError` from `getAccountId` in the shared helper.** Throw `IntegrationError` or plain `Error`; let tRPC callers wrap it via `toAccRouterError`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | Custom interval timer | Railway Cron (dashboard UI) | Railway restarts on crash; timer dies with process |
| Job queue / retry | Custom retry loop | None (no-retry policy locked) | Policy: fail → wait for next nightly cron |
| Email delivery | SMTP from scratch | `lib/server/email.ts` (Resend → Gmail OAuth) | Already wired, zero new deps |
| "X ago" formatting | Custom date math | `date-fns` `formatDistanceToNow` | Already in repo |
| Deploy hook | Custom webhook | Railway deploy/pre-deploy command in `railway.toml` | First-class Railway feature; verify current key before editing |

---

## Common Pitfalls

### Pitfall 1: Release script uses TypeScript imports — fails at runtime

**What goes wrong:** `scripts/release.cjs` does `require("@/lib/server/acc-sync")` — Node resolves to `.ts` file, fails with `SyntaxError: Cannot use import statement in a module`.
**Why it happens:** CJS scripts can't consume TypeScript directly without a transform step. The `@/` alias also won't resolve outside the Next.js compiler context.
**How to avoid:** Keep the release and deep-sync scripts as self-contained `.cjs` files using relative `require()` paths, OR use Node 22's `--experimental-transform-types` flag with relative TS imports only.
**Warning signs:** `SyntaxError: Cannot use import statement in a module` or `Cannot find module '@/lib/server/acc-sync'`.

### Pitfall 2: `@prisma/adapter-pg` in release script

**What goes wrong:** The release script tries to use Prisma the same way as `server/db.ts` but fails because the module-level imports use TypeScript syntax.
**How to avoid:** The Dockerfile already runs `npm install --include=dev`, so `@prisma/client` and `pg` are in `node_modules`. The CJS release script can instantiate Prisma directly using `require("@prisma/client")` and `require("@prisma/adapter-pg")`.

### Pitfall 3: Prisma composite index with DESC sort

**What goes wrong:** `@@index([autodeskId, createdAt])` creates an ASC index. Queries sorting `ORDER BY created_at DESC` hit a less-efficient index.
**How to avoid:** Use `@@index([autodeskId, createdAt(sort: Desc)])` — Prisma 5+ and 7.x support per-field sort directions.
**Confidence:** MEDIUM — verify against Prisma 7 generated SQL in the migration file after `prisma migrate dev`.

### Pitfall 4: `DATABASE_URL` missing in release command context

**What goes wrong:** Release command runs without `DATABASE_URL` set.
**How to avoid:** Railway automatically injects all service env vars into the release command. No special setup needed. Verify in Railway logs on first deploy.

### Pitfall 5: `SyncMeta` concurrent write race

**What goes wrong:** Two concurrent processes both try to `upsert` the same `SyncMeta` row.
**Why it doesn't apply here:** Deep Sync overlap is handled by checking `AccDataConnectorJob` for non-terminal rows. Quick Sync only runs during Railway release — one release runs at a time. `SyncMeta` writes are safe.

### Pitfall 6: Release command and start command ordering

**What goes wrong:** If migration or Quick Sync hangs indefinitely, the old container keeps serving and the deploy never completes.
**How to avoid:** The 5-minute `setTimeout → process.exit(1)` in the release script is the primary guard. Also ensure `prisma migrate deploy` has a pg connection timeout (inherits from `PG_CONNECTION_TIMEOUT_MS=5000` env var set in `server/db.ts` pattern — or hard-code a short timeout in the release script's Prisma instantiation).

### Pitfall 7: `data:create` scope missing for Data Connector

**What goes wrong:** The APS Data Connector `POST /requests` endpoint requires `data:create` scope. The existing `get2LeggedAutodeskToken()` only requests `account:read data:read`.
**How to avoid:** Add `data:create` to the scope string in `get2LeggedAutodeskToken()` before calling the Data Connector API in deep sync.
**Confidence:** MEDIUM — verify against APS Data Connector API docs; the HOW_TO doc states `data:read` and `data:create` as prerequisites.

---

## Code Examples

### APS Data Connector — job submission

```typescript
// Source: APS_DOCS/HOW TO/HOW_TO_Extract_Activity_Logs.md
const DATA_CONNECTOR_BASE = "https://developer.api.autodesk.com/data-connector/v1";

// POST /accounts/:accountId/requests
// accountId = hub ID with b. stripped (getAccountId result)
const res = await fetch(`${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    description: "Deep Sync — nightly activity export",
    isActive: true,
    scheduleInterval: "ONE_TIME",
    serviceGroups: ["activities", "admin"],
    dateRange: "PAST_7_DAYS",
  }),
});
const { id: requestId } = await res.json(); // persist to AccDataConnectorJob

// GET /accounts/:accountId/requests/:requestId/jobs  (polling — Phase 3 only)
// Phase 1 only submits; polling and ZIP download are Phase 3 deliverables.
```

### Prisma upsert for SyncMeta

```typescript
await db.syncMeta.upsert({
  where: { id: "quick" },
  create: {
    id: "quick",
    lastRunAt: new Date(),
    lastStatus: "success",
    lastError: null,
  },
  update: {
    lastRunAt: new Date(),
    lastStatus: "success",
    lastError: null,
  },
});
```

### tRPC accSync router

```typescript
// server/routers/acc-sync.ts
import { router, protectedProcedure } from "../trpc";

export const accSyncRouter = router({
  getSyncFreshness: protectedProcedure.query(async ({ ctx }) => {
    const [quickMeta, latestDeepJob] = await Promise.all([
      ctx.db.syncMeta.findUnique({ where: { id: "quick" } }),
      ctx.db.accDataConnectorJob.findFirst({
        where: { status: "success" },
        orderBy: { completedAt: "desc" },
      }),
    ]);
    return {
      quickLastRunAt: quickMeta?.lastRunAt ?? null,
      quickLastStatus: quickMeta?.lastStatus ?? null,
      deepLastCompletedAt: latestDeepJob?.completedAt ?? null,
    };
  }),
});
// Register in root.ts: accSync: accSyncRouter
```

### Overlap guard for Deep Sync

```typescript
// Before submitting a new Data Connector job:
const inFlight = await db.accDataConnectorJob.findFirst({
  where: { status: { in: ["pending", "running"] } },
  orderBy: { startedAt: "desc" },
});

if (inFlight) {
  console.log(`[deep-sync] Skipping — previous job ${inFlight.requestId} still in-flight (${inFlight.status})`);
  await db.syncMeta.upsert({
    where: { id: "deep" },
    create: { id: "deep", lastRunAt: new Date(), lastStatus: "skipped" },
    update: { lastRunAt: new Date(), lastStatus: "skipped" },
  });
  return;
}
```

---

## Open Questions

1. **Release script TypeScript strategy**
   - What we know: The release script is a `.cjs` file. Node 22 supports `--experimental-transform-types`. The Dockerfile installs devDeps.
   - What's unclear: Is `--experimental-transform-types` stable enough for production release scripts?
   - Recommendation: Planner chooses at task time. Self-contained `.cjs` (Option A) is safest and requires zero new deps. Document the choice in the task.

2. **Railway cron configuration**
   - What we know: Railway supports cron; schedule `0 9 * * *` for 09:00 UTC.
   - What's unclear: Whether the Hermosillo hub needs UTC-7 offset year-round (no DST change — Hermosillo does not observe DST), so 09:00 UTC = 02:00 Hermosillo is constant.
   - Recommendation: Configure via Railway dashboard UI; create `docs/CRON_SETUP.md` with step-by-step instructions.

3. **`data:create` scope for Data Connector**
   - What we know: The HOW_TO doc lists `data:read` and `data:create` as prerequisites.
   - What's unclear: Does the existing 2-legged token (`account:read data:read`) need `data:create` added, or does `data:read` alone allow job submission?
   - Recommendation: Add `data:create` defensively to `get2LeggedAutodeskToken()` scope. Worst case = harmless extra scope.

---

## Sources

### Primary (HIGH confidence)

- `C:\LECG\Dashboard\prisma\schema.prisma` — existing schema; all new models verified additive
- `C:\LECG\Dashboard\server\routers\users.ts` lines 211–221 — `getAccountId` implementation
- `C:\LECG\Dashboard\lib\server\email.ts` lines 332–404 — Resend + Gmail OAuth dual-path, already wired
- `C:\LECG\Dashboard\railway.toml` — confirmed no deploy/pre-deploy command field currently
- `C:\LECG\Dashboard\Dockerfile` — Node 22, full `npm install --include=dev`
- `C:\LECG\Dashboard\APS_DOCS\HOW TO\HOW_TO_Extract_Activity_Logs.md` — Data Connector 3-step flow, endpoint URLs, response shapes
- `C:\LECG\Dashboard\components\layout\Sidebar.tsx` lines 476–491 — sidebar bottom is the only persistent chrome for a freshness indicator
- `C:\LECG\Dashboard\vitest.config.ts` + `vitest.setup.ts` — Vitest 4.x, node environment, `server-only` mock in place
- `C:\LECG\Dashboard\scripts\start-router.cjs` + `scripts\start-production.cjs` — CJS script pattern already established in this repo

### Secondary (MEDIUM confidence)

- Railway deploy/pre-deploy command key in `[deploy]` block — verify current config-as-code docs before editing; likely `preDeployCommand` as of 2026-05-11 docs
- Railway cron: 5-field POSIX cron `0 9 * * *` — standard cron; Railway confirmed
- Prisma `@@index` with `sort: Desc` — documented Prisma 5+ feature; applicable to Prisma 7.x
- APS Data Connector scope requirements (`data:create`) — from HOW_TO prerequisites; not verified against live APS API

### Tertiary (LOW confidence)

- Node 22 `--experimental-transform-types` stability for production release scripts — flagged as experimental

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in `package.json`; no new deps needed
- Architecture: HIGH — existing patterns in codebase verified directly; schema models from REQUIREMENTS.md + CONTEXT.md
- Pitfalls: HIGH for TS-in-CJS and sidebar placement; MEDIUM for Railway ordering and APS scope

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (stable stack; Railway and Prisma APIs unlikely to change)
