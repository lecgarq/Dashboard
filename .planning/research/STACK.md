# Stack Research

**Domain:** v2.0 ACC Extraction — APS endpoint coverage, Data Connector async job, Prisma schema additions
**Researched:** 2026-05-08
**Confidence:** HIGH for APS SDK + raw fetch decisions (ground-truth from installed packages + live npm); MEDIUM for pg-boss job pattern (verified via npm + community sources); HIGH for CSV/ZIP choices (npm verified + benchmark cross-checks)

## Scope

This file covers ONLY net-new additions for v2.0. The validated base stack (Next.js 16, React 19, tRPC 11.17.0, Prisma 7.7.0, PostgreSQL, TypeScript 6, Tailwind 4, Vitest, Cosmos.gl 3.0.0-beta.8, ECharts, framer-motion, `@aps_sdk/authentication` 1.0.1, `@aps_sdk/oss` 1.3.3) is not repeated here. The existing `lib/server/acc-admin.ts` raw-fetch pattern is authoritative context.

---

## Decision 1: APS SDK vs Raw Fetch for v2.0 Endpoints

**Verdict: Use raw fetch for all v2.0 APS calls, NOT new SDK packages.**

### Rationale

The existing `lib/server/acc-admin.ts` already implements raw `fetch` with:
- Retry-on-429 with `Retry-After` header respecting (up to 4 attempts, exponential backoff)
- `p-limit` concurrency control (currently at 3)
- Typed error wrapping via `IntegrationError`
- Pagination helpers (`fetchAccPaged`, `fetchHqUsers`)

Adding `@aps_sdk/construction-account-admin@1.2.1` would duplicate this infrastructure. The SDK wraps Axios (adds ~130 kB) and returns `AxiosPromise` types that require adaptation before reaching the existing `AccUser`/`AccProject` type system. The `@aps_sdk/data-management@1.1.4` SDK covers the folder contents API but again duplicates the retry/auth layer already in place.

**New endpoints needed for v2.0 and how to call them:**

| Extraction | Endpoint | Verb | Notes |
|-----------|----------|------|-------|
| Project list | `construction/admin/v1/accounts/:acct/projects` | GET | Already partially called; needs to be materialized into `AccProject` table |
| Project members matrix | `construction/admin/v1/projects/:pid/users` | GET | Covered by existing `fetchAccUserProjects`/`fetchAccUserProducts` but per-project not per-user; new traversal needed |
| Hub industry roles | `hq/v2/accounts/:acct/industry_roles` | GET | Raw fetch; note v2 not v1 (different from existing HQ v1 calls) |
| Per-project industry roles | `hq/v2/accounts/:acct/projects/:pid/industry_roles` | GET | Raw fetch; per-project loop |
| Folder tree | `project/v1/hubs/:hub/projects/:pid/topFolders` + `data/v1/projects/:pid/folders/:fid/contents` | GET (recursive) | Raw fetch; BFS with queue is safer than recursion for deep trees |
| Folder permissions | `bim360/docs/v1/projects/:pid/folders/:fid/permissions` | GET | Raw fetch; different base URL (`bim360` not `construction`); filter `subjectType === "ROLE"` |
| Last sign-in | `hq/v1/accounts/:acct/users` (already fetched) | GET | Already in `fetchAllAccUsers`; `last_sign_in` field already captured |
| Data Connector | `data-connector/v1/accounts/:acct/requests` (POST) + poll + download | Raw fetch | No SDK covers this endpoint (see below) |
| Recently added + who-added | `construction/admin/v1/projects/:pid/users?sort=addedOn desc` + activity log join | GET + CSV | Combine project member `addedOn` with Data Connector CSV `admin_activities` |

### Data Connector: No Official `@aps_sdk/*` Package Exists

The `@aps_sdk/*` namespace (published by `aps.sdk@autodesk.com`) does NOT include a data-connector module. The only matching npm package is `@adsk-platform/acc-dataconnector` (last updated October 2025, unofficial/community — not under the `aps.sdk` publisher). Do not introduce it: it adds an undeclared dependency outside the official SDK family, and the Data Connector API is a simple 3-call HTTP flow (POST request → GET poll → GET signed S3 URL) that the existing `fetchWithRetry` helper handles in ~40 lines.

---

## Decision 2: CSV Parsing

**Verdict: Use `csv-parse@6.2.1` (stream Transform API, zero dependencies, Node.js native).**

### Rationale

The Data Connector ZIP contains multiple CSV files. The activities CSV can be large (millions of rows for all-time extraction). Two credible options exist:

| Library | Download mode | Node.js stream | Dependencies | Size |
|---------|--------------|----------------|-------------|------|
| `csv-parse@6` | Stream Transform (native) | Native; pipe directly from unzipper entry stream | 0 | 1.4 MB unpacked |
| `papaparse@5` | In-memory string or File object | Partial: accepts Readable stream but was designed for browser; does not implement Node Transform interface | 0 | ~230 kB |

`csv-parse` is the correct choice because:
1. It implements `stream.Transform`, so it can be piped directly from an unzipper entry readable without buffering the entire file in memory. This matters for all-time activity logs which may be hundreds of MB.
2. Zero dependencies — no transitive risk.
3. Published actively (1 month ago as of research date), 1.4M weekly downloads, `csv.js.org` org with long maintenance history.
4. `papaparse` requires reading the entire stream to a string before parsing on Node or using its own internal chunking — no pipe-based API.

The existing codebase already uses `stream-json@2.1.0` for JSON streaming, confirming the project's comfort with the Node stream Transform pattern.

---

## Decision 3: ZIP Extraction

**Verdict: Use `unzipper@0.12.3` (streaming, cross-platform, pipe-compatible with csv-parse).**

### Rationale

The Data Connector `downloadUrl` is a signed S3 URL that returns a `.zip` file. The ZIP contains multiple named CSV files; we need to extract specific entries (`project_activities.csv`, `admin_activities.csv`, `users.csv`, `projects.csv`) without writing to disk.

| Library | Streaming | In-memory entry extraction | Active maintenance | Notes |
|---------|-----------|---------------------------|-------------------|-------|
| `unzipper@0.12.3` | Yes — `unzipper.Parse()` emits entry streams | Yes — pipe entry.buffer() or pipe to csv-parse | Yes (76 versions, MIT) | 56 kB unpacked; 5 deps |
| `jszip@3` | No — loads entire ZIP into memory | Yes but only after full load | Yes | Fine for small ZIPs but wrong for large Data Connector exports |
| `adm-zip@0.5` | No — synchronous, full in-memory | Yes | Yes | Same memory concern; synchronous API blocks event loop |
| Node built-in `zlib` | Yes (deflate/gzip only) | No ZIP container support | N/A | zlib handles compression algorithm; ZIP container format is separate |

`unzipper` is correct because:
1. `unzipper.Parse()` returns a Node Transform stream; pipe from `fetch` response body directly → no temp files.
2. Individual entries are also streams — pipe CSV entry directly into `csv-parse` Transform without buffering.
3. The full pipeline is: `response.body → unzipper.Parse() → filter by entry.path → csv-parse Transform → Prisma upsert batches`.
4. Memory footprint: O(current CSV row batch) not O(ZIP size).

The signed S3 URL requires no auth headers (`Authorization` header must NOT be sent to S3 signed URLs — the signature is in the query string). Use plain `fetch(downloadUrl)` without auth.

---

## Decision 4: Background Job Pattern for Data Connector Sync

**Verdict: pg-boss@12.18.2 (PostgreSQL-backed job queue, uses existing Railway Postgres, no new infrastructure).**

### Why Not Inline tRPC Mutation

The Data Connector job takes minutes to hours. A tRPC mutation runs inside a Next.js Route Handler which times out at 30s (Railway default) or up to 5 minutes with `maxDuration` config. The sync cannot complete inline. The trigger must return immediately with a job ID; progress is polled separately.

### Why Not BullMQ / Redis

BullMQ requires Redis. The project has an `@upstash/redis` dependency already in `package.json` (Upstash serverless Redis), so Redis is technically available. However:
- Upstash has per-command pricing; a polling loop for a long-running job generates many commands.
- The project already has Railway PostgreSQL running 24/7. Adding a second stateful service for job state is pure overhead.
- Manual sync is infrequent (user-triggered). A heavyweight queue infrastructure (BullMQ workers, Redis pub/sub) is disproportionate.

### Why Not Inngest

Inngest is a managed SaaS with step-function durability. Excellent choice for complex multi-step workflows with retries across services. For this project it introduces an external dependency, a new Inngest account, and outbound HTTP to Inngest's servers for every step. The Data Connector sync is a single linear async workflow (POST → poll → download → parse → upsert); it does not need cross-service orchestration or day-long sleeps.

### pg-boss Pattern

pg-boss stores jobs in a `pgboss` schema inside the existing Railway PostgreSQL database. It supports:
- Job insertion from tRPC mutation (returns `jobId` immediately)
- Worker runs in the same Next.js process (via `app/api/pg-boss-worker/route.ts` initialization on first request, or a standalone `scripts/worker.ts` if Railway is configured as a long-running worker process)
- Job progress updates via `boss.complete(jobId, { progress })` readable by a tRPC polling query
- At-most-once execution with configurable retry

**Integration sketch:**

```ts
// tRPC mutation — trigger only
triggerDataConnectorSync: adminProcedure.mutation(async ({ ctx }) => {
  const boss = await getPgBoss(); // singleton; connects to same DATABASE_URL
  const jobId = await boss.send('data-connector-sync', { accountId: ctx.accountId });
  return { jobId };
}),

// tRPC query — poll progress
getDataConnectorJobStatus: adminProcedure
  .input(z.object({ jobId: z.string() }))
  .query(async ({ input }) => {
    const boss = await getPgBoss();
    const job = await boss.getJobById('data-connector-sync', input.jobId);
    return { state: job?.state, output: job?.output };
  }),
```

Railway deploys this project as a long-running Node.js process (not serverless functions), so pg-boss can keep a persistent connection.

### Supporting Library

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `pg-boss` | `^12.18.2` | PostgreSQL-backed job queue | Uses existing Railway Postgres; no new infra; 285 kB; TypeScript-first; 261 npm versions (mature); MIT |

---

## New SDK Packages to Install

```bash
# Production
npm install pg-boss csv-parse unzipper

# No new @aps_sdk/* packages — all v2.0 APS calls use existing raw fetch infrastructure
```

```bash
# Type declarations (csv-parse and unzipper ship their own .d.ts; pg-boss is TypeScript-native)
# Nothing extra needed
```

---

## Prisma Schema Additions

### New Models

The existing `AccMemberCache` JSON blob does NOT survive as the primary store. Seven new relational tables are needed. They must coexist with the existing migrations — the `AccMemberCache` model stays as a compatibility read target until the graph cache layer is migrated to the new tables in a later phase.

```prisma
// ============ MODULE: ACC v2.0 RELATIONAL TABLES ============

model AccSyncJob {
  id          String    @id @default(cuid())
  pgBossJobId String?   @unique        // pg-boss job ID for status polling
  status      String    @default("pending") // pending | running | done | failed
  startedAt   DateTime?
  finishedAt  DateTime?
  rowsUpserted Int      @default(0)
  error       String?
  createdAt   DateTime  @default(now())

  @@index([status])
  @@index([createdAt])
}

model AccProject {
  id          String    @id              // APS project UUID (no b. prefix)
  hubId       String                     // APS hub/account ID (no b. prefix)
  name        String
  type        String?
  jobNumber   String?
  status      String?
  createdAt   DateTime?                  // APS createdAt from API
  syncedAt    DateTime

  members     AccProjectMember[]
  roles       AccProjectRole[]
  folders     AccFolder[]

  @@index([hubId])
  @@index([syncedAt])
}

model AccProjectMember {
  id              String    @id @default(cuid())
  projectId       String
  project         AccProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  autodeskId      String                   // APS user UUID
  email           String
  name            String?
  status          String?                  // active | pending | deleted
  companyName     String?
  addedOn         DateTime?
  isProjectAdmin  Boolean   @default(false)
  products        Json?                    // { "docs": "administrator", "build": "member", ... }
  syncedAt        DateTime

  @@unique([projectId, autodeskId])
  @@index([email])
  @@index([autodeskId])
  @@index([addedOn])
  @@index([projectId, addedOn])            // recently-added per project
}

model AccRole {
  id          String    @id              // APS role UUID
  hubId       String
  name        String
  memberCount Int       @default(0)
  syncedAt    DateTime

  projectRoles AccProjectRole[]

  @@unique([hubId, id])
  @@index([hubId])
}

model AccProjectRole {
  id          String    @id @default(cuid())
  projectId   String
  project     AccProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  roleId      String
  role        AccRole    @relation(fields: [roleId], references: [id], onDelete: Cascade)
  // Services defaults from hq/v2 industry_roles response
  docsAccess         String?   // "none" | "user" | "admin"
  projectAdminAccess String?
  syncedAt    DateTime

  @@unique([projectId, roleId])
  @@index([projectId])
  @@index([roleId])
}

model AccFolder {
  id          String    @id              // APS folder URN (the full urn:adsk... string)
  projectId   String
  project     AccProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  parentId    String?                   // null for top-level folders
  name        String
  path        String                    // materialized path: "Project Files/Architecture"
  syncedAt    DateTime

  permissions AccFolderPermission[]

  @@index([projectId])
  @@index([projectId, parentId])
  @@index([path])
}

model AccFolderPermission {
  id          String    @id @default(cuid())
  folderId    String
  folder      AccFolder  @relation(fields: [folderId], references: [id], onDelete: Cascade)
  roleId      String                   // APS role UUID (subjectId from permissions API)
  roleName    String
  actions     String[]                 // ["VIEW","DOWNLOAD","COLLABORATE","PUBLISH","EDIT","CONTROL"]
  permType    String?                  // derived label: "View Only" | "Full Controller" etc.
  syncedAt    DateTime

  @@unique([folderId, roleId])
  @@index([folderId])
  @@index([roleId])
}

model AccActivity {
  id          String    @id @default(cuid())
  // Source: project_activities.csv or admin_activities.csv from Data Connector
  sourceFile  String                   // "project" | "admin"
  autodeskId  String                   // user_id from CSV (the actor)
  projectId   String?                  // null for hub-level admin activities
  service     String?
  tool        String?
  action      String
  details     String?
  createdAt   DateTime                 // created_at from CSV
  syncedAt    DateTime                 @default(now())

  @@index([autodeskId, createdAt(sort: Desc)])   // last-activity-per-user queries
  @@index([projectId, createdAt(sort: Desc)])    // per-project activity timeline
  @@index([action])                              // filter "Member Added" / "File Uploaded"
  @@index([createdAt(sort: Desc)])               // global recency scan
}
```

### Schema Constraints from Existing Migrations

1. The existing `Project` model has `apsProjectId String?` and `apsHubId String?` — these are the app's internal project records (Families/Clash), NOT the ACC project entities. Do not add a relation between `AccProject` and `Project`; they are separate domain entities. The naming collision is real and must be called out in migration comments.

2. The existing `AccMemberCache` model stays in the schema. Remove it only after the graph cache layer (`AccGraphLayoutCache` + `getPrecomputedGraph`) is migrated to read from `AccProjectMember` instead of `AccMemberCache`. This is a separate phase concern, not part of the schema migration itself.

3. All new models use `String @id` with APS-assigned UUIDs where APS provides stable IDs (`AccProject`, `AccRole`, `AccFolder`). Use `@default(cuid())` only where APS provides no stable PK (`AccProjectMember`, `AccProjectRole`, `AccFolderPermission`, `AccActivity`, `AccSyncJob`).

4. `AccActivity.createdAt` is the source-system timestamp (from CSV `created_at` field) — not the upsert timestamp. `syncedAt` captures when it was written. This distinction matters for the "all-time retention" requirement: the data is authoritative as of `createdAt`, and `syncedAt` is purely operational.

### Index Recommendations for Activity Log Scale

The `AccActivity` table will grow unbounded (all-time retention). Required indexes:

| Index | Query it serves |
|-------|----------------|
| `(autodeskId, createdAt DESC)` | Last file activity per user; user activity timeline |
| `(projectId, createdAt DESC)` | Per-project activity feed; recently-added context |
| `(action)` | Filter "Member Added" / "User Invited" for who-added-who |
| `(createdAt DESC)` | Global recency scan, admin overview |

No composite `(projectId, autodeskId, createdAt)` index yet — add it in the phase where "user activity per project" UI is built, to avoid index write overhead before it's needed.

Prisma `@@index([createdAt(sort: Desc)])` syntax requires Prisma 4.6+ and is supported in the project's Prisma 7.7.0. Confirm with: `@@index([createdAt(sort: Desc)])` — valid Prisma SDL.

---

## APS Rate Limit Strategy (v2.0 Risk)

APS does not publish specific RPS figures. The documented behavior is: `429 Too Many Requests` with `Retry-After` header. The existing `fetchWithRetry` already implements this correctly.

**New v2.0 rate limit pressure points:**

| Operation | Risk | Mitigation |
|-----------|------|-----------|
| Recursive folder crawl | HIGH — N projects × M folders × depth; easily thousands of API calls | BFS queue with `p-limit(5)` per project; process projects serially; cache folder tree after first sync |
| Per-project industry roles (`hq/v2`) | MEDIUM — one call per project, but hundreds of projects | Same `p-limit(3)` as existing pattern; batch with project list fetched first |
| Folder permissions | HIGH — one call per folder per project | Emit progress events to pg-boss job; allow incremental resume on failure |
| Data Connector poll | LOW — one call per 60s during job runtime | 60-second polling interval as shown in HOW_TO docs |

**Key behavioral note from HOW_TO docs:** Data Connector extracted ZIPs are stored on AWS for 30 days. If a re-download is needed, the same `downloadUrl` is valid within that window. Store the `downloadUrl` in `AccSyncJob` alongside the `requestId` so a retry does not need to re-trigger the job.

---

## Alternatives Considered

| Decision | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| APS API calls | Raw `fetch` in `lib/server/` | `@aps_sdk/construction-account-admin@1.2.1` | SDK adds Axios transitive dep, wraps existing retry/auth layer, returns AxiosPromise types mismatched to existing type system. Raw fetch is already working with retry logic. |
| Data Connector | Raw `fetch` (3 calls total) | `@adsk-platform/acc-dataconnector` | Non-official publisher; not under `aps.sdk@autodesk.com` namespace; 3-call HTTP flow does not justify a dependency. |
| CSV parsing | `csv-parse@6` | `papaparse@5` | papaparse has no native Node `stream.Transform` pipe interface; must buffer full file. csv-parse pipes directly from unzipper entry stream; O(batch) memory. |
| ZIP extraction | `unzipper@0.12.3` | `jszip@3` | jszip loads entire ZIP into memory before any entry is accessible. unzipper streams entries; compatible with pipe chain. |
| ZIP extraction | `unzipper@0.12.3` | `adm-zip@0.5` | adm-zip is synchronous; blocks event loop during extraction. |
| Background jobs | `pg-boss@12.18.2` | BullMQ + Redis | Redis is available via Upstash but adds per-command cost and a second stateful service. pg-boss reuses existing Railway Postgres. |
| Background jobs | `pg-boss@12.18.2` | Inngest | Inngest is SaaS with external dependency. Overkill for a single linear job triggered manually at most once per day. |
| Background jobs | `pg-boss@12.18.2` | Inline tRPC mutation | Railway/Next.js 30s–5min timeout cannot accommodate a multi-hour Data Connector job. Must return job ID immediately. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@aps_sdk/construction-account-admin` | Wraps Axios; duplicates retry/auth layer already in `lib/server/acc-admin.ts`; mismatches existing `AccUser`/`AccProject` types | Extend `lib/server/acc-admin.ts` with new raw fetch functions |
| `@aps_sdk/data-management` | Same concern as above; the folder API is 2 simple GET calls with pagination | Raw fetch helpers following existing `fetchAccPaged` pattern |
| `@adsk-platform/acc-dataconnector` | Non-official publisher; 3-call Data Connector flow does not justify a dependency | Raw fetch: POST request, GET jobs poll, GET signed S3 URL (no auth header on S3) |
| `papaparse` | No stream.Transform pipe interface on Node; forces full-file buffering | `csv-parse@6` (zero deps, native Transform) |
| `jszip` | Full in-memory ZIP load; wrong for large Data Connector exports | `unzipper@0.12.3` (streaming) |
| `adm-zip` | Synchronous; blocks event loop | `unzipper@0.12.3` |
| `bullmq` | Requires Redis infra for a manually-triggered once-a-day job | `pg-boss` (uses existing Postgres) |
| Inngest | External SaaS dependency; adds network hop for every job step | `pg-boss` |
| Redis (new) | Already available via Upstash but per-command pricing + second infra concern; pg-boss reuses existing DB | `pg-boss` |
| `node:zlib` alone | zlib handles deflate algorithm, not ZIP container format | `unzipper` wraps zlib for ZIP container |
| `@prisma/adapter-pg` changes | Already in stack at ^7.7.0; no version bump needed for new tables | Keep existing adapter |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `pg-boss` | `^12.18.2` | Node.js 18+, PostgreSQL 11+ (Railway Postgres is 15+), TypeScript 5+ | TypeScript-native; no @types needed. Uses `pg` driver — already in devDependencies. Shares `DATABASE_URL` env var with Prisma. |
| `csv-parse` | `^6.2.1` | Node.js 14+, TypeScript 5+ | Zero deps; ships own .d.ts. v6 is current major (breaking changes from v4 are all internal API). |
| `unzipper` | `^0.12.3` | Node.js 14+, TypeScript 5+ | Ships own .d.ts. 5 deps (`bluebird`, `duplexer2`, `fs-extra`, `graceful-fs`, `node-int64`); all widely used and stable. |
| `pg-boss@12` | `pg@^8.20.0` | Already in devDependencies at `^8.20.0` | pg-boss uses pg internally; versions must be compatible. The existing pg@8.20.0 satisfies pg-boss@12's `^8` requirement. |
| `Prisma@7.7.0` | `@@index([createdAt(sort: Desc)])` | Prisma 4.6+ SDL feature | Desc index sort is supported. Verify in migration output — Prisma generates `CREATE INDEX ... ORDER BY created_at DESC`. |

---

## Sources

- `C:/LECG/Dashboard/lib/server/acc-admin.ts` — Existing raw fetch pattern, retry logic, and type system (HIGH confidence — ground truth)
- `C:/LECG/Dashboard/package.json` — Installed dependencies confirming `@aps_sdk/authentication`, `@aps_sdk/oss`, `@aps_sdk/model-derivative`, `stream-json`, `p-limit`, `pg` (HIGH confidence — ground truth)
- `npm info @aps_sdk/construction-account-admin` — v1.2.1, Apache-2.0, deps: axios + @aps_sdk/autodesk-sdkmanager (HIGH confidence — live npm)
- `npm info @aps_sdk/data-management` — v1.1.4, confirmed exists but not needed (HIGH confidence — live npm)
- `npm info pg-boss` — v12.18.2, MIT, 261 versions, TypeScript-native (HIGH confidence — live npm)
- `npm info csv-parse` — v6.2.1, MIT, 0 deps, published 1 month ago (HIGH confidence — live npm)
- `npm info unzipper` — v0.12.3, MIT, 5 deps, 56 kB unpacked (HIGH confidence — live npm)
- `/tmp/aps_test` — local install of `@aps_sdk/construction-account-admin` to inspect dist/api/; confirmed `ProjectUsersApi`, `ProjectsApi` present; no IndustryRoles or FolderPermissions API (HIGH confidence — direct inspection)
- [APS SDK Node GitHub](https://github.com/autodesk-platform-services/aps-sdk-node) — package list: authentication, construction-account-admin, construction-issues, data-management, model-derivative, oss, autodesk-sdkmanager, webhooks, secure-service-account — no data-connector module (MEDIUM confidence — WebFetch)
- [APS Rate Limits blog](https://aps.autodesk.com/blog/autodesk-platform-services-aps-api-rate-limits-best-practices-developers) — 429 + Retry-After pattern; specific limits not published (MEDIUM confidence — WebFetch)
- HOW_TO docs at `C:/LECG/Dashboard/APS_DOCS/HOW TO/` — ground truth for all 9 extraction flows (HIGH confidence — user-scraped official APS docs)
- [pg-boss Railway guide](https://docs.railway.com/guides/cron-workers-queues) — PostgreSQL-backed queues endorsed for Railway (MEDIUM confidence — WebSearch)
- [csv-parse vs papaparse benchmark](https://leanylabs.com/blog/js-csv-parsers-benchmarks/) — csv-parse stream Transform vs papaparse memory model (MEDIUM confidence — WebSearch)

---
*Stack research for: v2.0 ACC Extraction Completion — LECG Dashboard*
*Researched: 2026-05-08*
