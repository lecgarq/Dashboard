# Phase 3: Activity Pipeline — Deep Sync + File Activity — Research

**Researched:** 2026-05-11
**Domain:** APS BIM360 Data Connector ingestion (ZIP→CSV stream → Postgres), per-user lazy activity tRPC, RecentlyAdded WHO-added-WHOM, paginated drill-down in DashboardSidePanel
**Confidence:** HIGH (ground-truth grep + Read of every relevant existing file; locked decisions from CONTEXT.md; prior STACK.md verified end-to-end against current package.json and prisma/schema.prisma)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Activity drill-down panel (ACTV-05)**
- Organization: Nested — top-level sections by action TYPE (e.g. Files, Member events, Project events), reverse-chronological order WITHIN each section.
- Section state: All sections expanded by default.
- Section headers: Show counts, e.g. `Files (42)`.
- Row fields: Action + target + project + relative timestamp. Example: `Uploaded → Foo.dwg · ACME Tower · 2 days ago`.
- Pagination: 25 rows per type-section, with "Load more" button inside each section.
- Row click behavior: Non-interactive in v1 (no spotlight, no deep-link). Phase 5 may add cross-widget spotlight.
- Filters above sections: Compact row with `[Date range ▾] [Project ▾]`. Default date range: All time. Default project filter: All projects.
- Empty states: No activity at all → `No activity yet`. Filter returns zero rows → `No activity in this range` + clear-filter button.

**WHO-added-WHOM surfacing (ACTV-04)**
- Display: Stacked avatars on each invitation row — invitee avatar in front, inviter avatar slightly behind (~6px overlap, inviter slightly smaller).
- Unresolved inviter: Show `Invited by Unknown` with a small warning icon.
- Inviter click → filter mode: Clicking the inviter avatar/name filters widget to "everyone Jane invited". Filter pill: `Filtered by Jane Doe ×`.
- Re-invited users (multiple inviters): Show most recent inviter primary, with `(+N others)` suffix; hover reveals full list, newest first.
- Scope: Inviter avatar/text appears only on invitation rows. Widget remains invitation-focused.

**"File activity" definition (ACTV-03)**
- Action types counted as file activity: View/Download, Upload/Versioned, Edit/Markup/Comment, Delete/Restored. All four buckets count, tracked as SEPARATE timestamps.
- Shape: Per-user separate timestamps: `lastView`, `lastUpload`, `lastEdit`, `lastDelete`. NOT a single rolled-up `lastFileActivity`.
- Zero-activity display: Show `Never` (or `—`). Do not fall back to last sign-in. Do not hide.
- Action-type normalization: Store **raw** `action_type` from CSV in DB. Normalize to categories at query time via app-code mapping. Mapping fixes do not require re-ingest.
- Lazy query behavior: tRPC query invoked on row hover with debounce in user list AND on side-panel open. NOT eager-loaded into `BulkAccUser`/`FindingsContext`.
- Caching: React Query default (stale-while-revalidate). Staleness bounded by next sync.

**List-column UX (LIST-03 prep)**
- Default visibility: All 4 mini-columns (View / Upload / Edit / Delete) visible by default.
- Header style: Grouped header `File Activity` spanning 4 sub-columns (multi-row header).
- Cell format: Relative time (`2d ago`); absolute date on hover tooltip.
- Sort: Click sub-column header sorts by that timestamp descending; `Never` values sort to bottom.

**Attribution edge cases**
- Primary join: Case-insensitive exact email match between activity rows and `AccProjectMember`, **with Autodesk user-ID fallback** when email match fails.
- On failure: Show `Unknown inviter` with warning icon.
- Audit logging: Persist unmatched-attribution cases into `UnresolvedAttribution` table.
- Same-person-multiple-emails: Auto-merge when Autodesk ID matches. Without ID, treat as separate users.

**Sync visibility / status**
- Surfacing: **Extend** existing `SyncFreshnessPill`. No new pill.
- Failure visual: Pill turns amber on failure; hover reveals reason. No toasts.
- Partial-success runs: Distinguished from full failure — amber + `Partial` label.
- Manual trigger: **No manual UI** anywhere. Cron-driven only.

**AccActivity schema (informs SCHEMA + ingest design)**
- Persist Autodesk user ID per activity row. If not in CSV, look up against MEM data at ingest.
- Store `raw_action_type` (TEXT). Normalized category computed at query time (NOT stored as column).
- Indexes: `(user_email, timestamp DESC)`, `(project_id, timestamp DESC)`, `(autodesk_user_id, timestamp DESC)`.
- Retention: All-time, no prune.

**RecentlyAdded widget time window**
- Default window: Segmented control `[7d | 30d | 90d]` (default 30d).
- Row count: 10 rows visible in widget; `See all` link opens full list in side panel.
- Sort: Newest first.
- Filter interaction: When `Filtered by Jane` is active, time-window filter is **relaxed** — show all of Jane's invitations regardless of date.

### Claude's Discretion
- Exact avatar sizes, overlap pixel values, color tokens — follow existing dashboard design system.
- Multi-row table header implementation details for `File Activity` grouped header.
- Hover-debounce timing (suggest 200–300ms).
- Exact column order of the 4 mini-columns.
- `UnresolvedAttribution` table schema details (timestamp + raw email + activity ID + reason sufficient).
- React Query `staleTime` / `gcTime` tuning.
- Default selection between 7d/30d/90d (suggest 30d).
- Wording / icon for amber "Partial" sync state.
- Whether Autodesk ID lookup against MEM happens inline during ingest vs in a post-ingest pass.

### Deferred Ideas (OUT OF SCOPE)
- Cross-widget spotlight on clicking an activity row → Phase 5.
- Activity-row deep-link into ACC (open file/project in BIM360 web) → backlog.
- Activity search / global activity timeline view → out of scope.
- Auto-merge by name + company heuristic → backlog.
- Archive old activity rows to cold storage → future.
- Hidden `/admin/sync` manual re-trigger route → backlog.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACTV-01 | Data Connector ZIP downloaded via signed S3 URL with NO Authorization header; streaming unzip into per-CSV streams without buffering full archive. | `scripts/deep-sync.cjs` already submits + persists the job. Phase 3 adds a NEW completion-handling step: a cron `deep-sync-ingest.cjs` (or Quick-Sync release-step hook) that finds `AccDataConnectorJob` rows with `status="pending"`/`"running"`, polls APS, and on `"success"` streams the signed-URL ZIP via `fetch(downloadUrl)` (no Authorization header — signature is in querystring) → `unzipper.Parse()` → filter entry.path for `project_activities.csv` and `admin_activities.csv` → pipe each into csv-parse. See "Architecture Patterns → Pattern: Two-Stage Cron". |
| ACTV-02 | `project_activities.csv` and `admin_activities.csv` streamed through `csv-parse` and upserted into `AccActivity` in 500-row batches via `createMany({ skipDuplicates: true })`. All-time retention; no prune. | Pattern documented in `.planning/research/ARCHITECTURE.md` "Pattern 4: Streaming CSV Ingest via Pause/Resume Backpressure". `AccActivity` model already exists in `prisma/schema.prisma:530-543` but **needs migration** — see "Schema Gaps" section. `skipDuplicates: true` requires a meaningful `@@unique` constraint, which `AccActivity` currently lacks. |
| ACTV-03 | Last file activity per user computed from `AccActivity` (filtered to file-related actions), exposed via lazy tRPC query for side-panel drill-down. NOT eager-loaded into `BulkAccUser` or `FindingsContext`. | Lazy tRPC pattern: new procedure `accActivity.getFileActivityForUser({email})` returning `{lastView, lastUpload, lastEdit, lastDelete}` keyed off `(user_email, timestamp DESC)` index. Hover prefetch via `trpcUtils.accActivity.getFileActivityForUser.prefetch({email})` with 200–300ms debounce in user list row. Action-type → category mapping lives in NEW `lib/acc/activityCategories.ts` (not a DB column). |
| ACTV-04 | WHO-added-WHOM attribution in RecentlyAdded — joins `Member Added`/`User Invited`/`Project Member Added` activity rows to invited user's `AccProjectMember` row by email; surfaces inviting admin's name. | Primary join: case-insensitive email parse from `details` column → `AccProjectMember.email`. Fallback: Autodesk user-ID match if `details` contains user_id. Unresolved → row inserted into `UnresolvedAttribution`. Inviter = `AccActivity.autodeskId` (the actor). Looked up via `AccProjectMember.autodeskId` to get name+avatar. CURRENT `RecentlyAddedWidget.tsx` is a 90-day calendar HEATMAP (not a row list) — per CONTEXT.md "Stacked avatars on each invitation row" → the row list must be rendered in `DashboardSidePanel`'s `DayBody` AND/OR the widget itself needs a row-list mode. See "Open Questions → Q1". |
| ACTV-05 | Activity drill-down panel paginated by recency in existing `DashboardSidePanel`. | Existing `DashboardSidePanel.tsx` already supports a `kind:"admin"` panel (per-user via email). Add new `kind:"userActivity"` (or extend `"admin"`) with: nested type-section grouping (Files / Member events / Project events / Other) × 25-row paginated lists × per-section "Load more". Driven by new `accActivity.listForUser({email, cursor, categoryFilter?, projectFilter?, dateRange?})` cursor-paginated tRPC query. |
</phase_requirements>

## Summary

Phase 3 wires the second half of Deep Sync. Phase 1 already submits the APS Data Connector job and persists `AccDataConnectorJob`; Phase 3 adds the **ingestion completion** half: poll → download signed-S3 ZIP → stream-unzip → stream-parse two CSVs → batched `createMany` into `AccActivity`. Then exposes per-user activity through a **lazy** tRPC slice (no eager load), surfaces inviter attribution in RecentlyAdded with email→Autodesk-ID fallback, and adds nested type-section drill-down to `DashboardSidePanel`.

The streaming stack (`unzipper` + `csv-parse`) is locked by CONTEXT.md and corroborated by prior research (`.planning/research/STACK.md`). Neither package is yet installed (verified via `package.json`); both must be added in Wave 0. The `AccActivity` Prisma model exists at `prisma/schema.prisma:530-543` but **does not yet have all required columns** (missing `user_email`, raw-action separation, and a dedup `@@unique` for `skipDuplicates`). A Prisma migration is required.

The deep-sync cron (`scripts/deep-sync.cjs`) currently fires once nightly and exits after job submission. Phase 3 must split or extend that flow: a **second** cron (or post-deploy step) polls `AccDataConnectorJob` rows in `pending`/`running` state and runs the ingest pipeline when APS reports `success`. This avoids one cron run holding open a multi-hour HTTP poll.

**Primary recommendation:** Add `unzipper@0.12.3` + `csv-parse@6.2.1` (Wave 0); ALTER `AccActivity` (add `userEmail`, `rawAction`, `autodeskId NOT NULL`, `(userEmail, createdAt DESC)` index, dedup `@@unique`); add `UnresolvedAttribution` model; add a second cron script `scripts/deep-sync-ingest.cjs` that owns the poll+ingest half of the lifecycle; add `accActivity` tRPC router with lazy per-user procedures; extend `SyncFreshnessPill` with a third pill segment for Deep-Sync-ingest freshness; render WHO-added-WHOM stacked avatars in a NEW row-list view (likely in `DashboardSidePanel.DayBody` since the current RecentlyAddedWidget is a calendar heatmap — see Open Question Q1).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `unzipper` | `^0.12.3` | Streaming ZIP container extraction; emits per-entry Readable streams. | Pipe-compatible with `csv-parse`. Memory = O(current batch), not O(ZIP size). 1,822 dependents on npm. Verified current latest version 0.12.3 (no newer release since Phase 1 research). |
| `csv-parse` | `^6.2.1` | Streaming CSV → row object via Node `stream.Transform`. | Zero runtime deps. 2,966 npm dependents. Native Transform implementation = pipe-compatible with unzipper entry stream. |
| `@prisma/client` | `^7.8.0` (already installed) | `createMany({ skipDuplicates: true })` for 500-row batched inserts. | Translates to single `INSERT ... ON CONFLICT DO NOTHING`. Idempotent re-ingest. |
| `@trpc/server` 11.17.0 + `@trpc/react-query` 11.17.0 (already installed) | — | Lazy per-user queries with hover prefetch via `useUtils()`. | Existing `accSync` router shows the pattern; refetch cadence + `staleTime` already proven. |
| `date-fns` (already installed) | `^4.1.0` | Relative-time formatting (`2d ago`), UTC bucketing. | Already used in `RecentlyAddedWidget.tsx` (`format`, `parseISO`) and `SyncFreshnessPill` (`formatDistanceToNow`). |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `stream/promises` (node:built-in) | — | `pipeline()` async-await composition over the ZIP→CSV→batch chain. | Use everywhere a long pipe is built. Handles error propagation automatically. |
| `node:fetch` (built-in via Node 22) | — | Download signed S3 URL. | `fetch(downloadUrl)` with **no headers** at all (Authorization on signed URLs is a 403). The response `body` is a Web ReadableStream — convert via `Readable.fromWeb(res.body)` before piping into `unzipper.Parse()`. |
| `p-limit` (already installed `^7.3.0`) | — | Cap per-project concurrency if attribution requires per-project member lookups. | Existing Phase 2 callers use `pLimit(3)`/`pLimit(5)`. Reuse the pattern; do not introduce a second concurrency library. |

### Alternatives Considered (already eliminated by STACK.md + CONTEXT.md)

| Instead of | Could Use | Tradeoff (why NOT) |
|------------|-----------|--------------------|
| `unzipper` | `jszip` / `adm-zip` | Both load full ZIP into memory; ROADMAP flags 400MB+ exports → OOM on Railway container. |
| `csv-parse` | `papaparse` | No native Node `stream.Transform`; can't pipe from unzipper entry without buffering whole CSV. |
| Raw fetch poll loop | `pg-boss` | Out of scope per `REQUIREMENTS.md` (no Redis/BullMQ/Inngest). Existing `AccDataConnectorJob` table IS the queue. |
| New `@aps_sdk/data-connector` | Raw fetch (existing pattern) | No such SDK package exists in the official `aps.sdk@autodesk.com` namespace. Already verified in `STACK.md`. |

**Installation:**
```bash
npm install unzipper csv-parse
# Type declarations ship in-package — no @types/* needed.
```

> Caveat: `unzipper` has 5 transitive deps (`bluebird`, `duplexer2`, `fs-extra`, `graceful-fs`, `node-int64`). All MIT, all widely deployed. Acceptable for this project.

## Architecture Patterns

### Recommended Project Structure (NEW + MODIFIED files)

```
prisma/
└── schema.prisma                      # MODIFY: AccActivity columns + UnresolvedAttribution model
scripts/
├── deep-sync.cjs                      # KEEP: submission-only (already correct per 03-CONTEXT.md)
└── deep-sync-ingest.cjs               # NEW: polls in-flight AccDataConnectorJob rows, runs ingest pipeline
lib/
├── acc/
│   ├── activityCategories.ts          # NEW: raw_action_type → category mapping (Files/Member/Project/Other)
│   ├── ingestActivityZip.ts           # NEW: download signed URL → unzipper.Parse → per-entry csv-parse → batch upsert
│   ├── attributeInviter.ts            # NEW: email + autodeskId join → AccProjectMember; unresolved → UnresolvedAttribution
│   └── activityQueryHelpers.ts        # NEW: per-user/per-category last-timestamp aggregator (server-side)
server/routers/
└── acc-activity.ts                    # NEW: tRPC router — getFileActivityForUser (lazy), listForUser (paginated), listInvitations (RecentlyAdded backend)
server/routers/
├── root.ts                            # MODIFY: register accActivity router
└── acc-sync.ts                        # MODIFY: extend getSyncFreshness to include ingest-stage status (partial-success label)
components/layout/
└── SyncFreshnessPill.tsx              # MODIFY: amber/Partial state; surface deep-sync-ingest failures
app/(dashboard)/users/
├── UsersDirectoryClient.tsx           # MODIFY: add 4 File Activity sub-columns; hover prefetch
└── dashboard/
    ├── DashboardSidePanel.tsx         # MODIFY: extend AdminBody OR add UserActivityBody with nested type-section drill-down
    └── widgets/
        └── RecentlyAddedWidget.tsx    # MODIFY: optional new "row list" view OR delegate row list to side panel (Open Q1)
```

### Pattern 1: Two-Stage Cron Lifecycle (CRITICAL — DEPARTURE FROM PHASE 1)

**What:** The Deep Sync lifecycle splits across TWO cron-triggered scripts.

| Stage | Script | When | Action |
|-------|--------|------|--------|
| Submit | `scripts/deep-sync.cjs` (exists) | Nightly 09:00 UTC | Overlap guard → POST Data Connector → persist `AccDataConnectorJob{status:"pending", requestId}`. Exit. |
| Ingest | `scripts/deep-sync-ingest.cjs` (NEW) | Every 15min (or post-deploy, OR 30min after submit) | Find rows where `status IN ("pending","running")` → GET `/jobs/:requestId` → if `success`, download + unzip + parse + upsert → update row to `success`/`failed`. Skip if any row already `running` in ingest stage (guard via separate `ingestStartedAt` column). |

**Why:** A nightly cron polling for hours holds open Postgres connections and risks Railway killing the process. APS jobs can take minutes to hours; decouple submission from ingest.

**Alternative (also acceptable):** Single deep-sync.cjs polls in a tight loop with backoff up to a max wall-clock budget (e.g. 25 min), then exits leaving `status="running"`; a separate "rescue" cron picks up stragglers. Same effect; choose during planning.

**Source:** Synthesized from `scripts/deep-sync.cjs` analysis + Phase 1 STATE.md (no ingest stage exists yet) + ROADMAP Phase 3 pre-flight risks.

### Pattern 2: Streaming Pipe Chain with 500-Row Batching

**What:** A single pipeline string with pause/resume backpressure between csv-parse and Prisma.

```typescript
// Source: synthesized from .planning/research/ARCHITECTURE.md Pattern 4 + unzipper README
// + csv-parse v6 Transform docs (https://csv.js.org/parse/)
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";
import { parse } from "csv-parse";
import type { PrismaClient } from "@prisma/client";

const BATCH = 500;
const TARGET_CSVS = new Set(["project_activities.csv", "admin_activities.csv"]);

export async function ingestActivityZip(
  downloadUrl: string,
  prisma: PrismaClient,
  jobId: string,
): Promise<{ rowsByFile: Record<string, number>; unresolved: number }> {
  // 1. Stream the signed S3 URL — NO Authorization header.
  const res = await fetch(downloadUrl);
  if (!res.ok || !res.body) {
    throw new Error(`Signed S3 GET failed: HTTP ${res.status}`);
  }

  const counts: Record<string, number> = {};
  let unresolved = 0;
  const nodeStream = Readable.fromWeb(res.body as never);

  await new Promise<void>((resolve, reject) => {
    nodeStream
      .pipe(unzipper.Parse())
      .on("entry", async (entry: any) => {
        const filename = entry.path.split("/").pop() as string;
        if (!TARGET_CSVS.has(filename)) {
          entry.autodrain();
          return;
        }

        const parser = parse({
          columns: true,
          bom: true,                   // PITFALL: BOM-stripping is required for Excel/Windows exports
          relax_column_count: true,
          trim: true,
          // Optional: skip_empty_lines: true
        });

        let buffer: any[] = [];
        const flush = async () => {
          if (buffer.length === 0) return;
          const slice = buffer;
          buffer = [];
          await prisma.accActivity.createMany({
            data: slice,
            skipDuplicates: true,        // requires @@unique on AccActivity — see Schema Gaps
          });
        };

        entry.pipe(parser);
        parser.on("data", async (row: any) => {
          parser.pause();
          buffer.push(mapCsvRow(row, filename)); // synchronous mapping
          if (buffer.length >= BATCH) await flush();
          parser.resume();
        });
        parser.on("end", async () => {
          await flush();
          counts[filename] = (counts[filename] ?? 0) + buffer.length;
        });
        parser.on("error", reject);
      })
      .on("error", reject)
      .on("close", resolve);
  });

  return { rowsByFile: counts, unresolved };
}
```

**Notes:**
- `Readable.fromWeb` is required because Node 22 `fetch` returns a WHATWG `ReadableStream`, not a Node `Readable`. Verified Node 22+ behavior.
- Backpressure here is **synchronous flush trigger**, NOT awaited inside `data` event (Node streams emit `data` synchronously; we use `parser.pause()` to coordinate). A more rigorous version uses an `async function*` consumer.

### Pattern 3: Action-Type Category Mapping (App-Code, Not DB)

**What:** A single table `lib/acc/activityCategories.ts` mapping raw APS strings to UI categories.

```typescript
// Source: synthesized from HOW_TO_Extract_Last_User_File_Activity.md + HOW_TO_Extract_Recent_User_Additions.md
export type ActivityCategory = "view" | "upload" | "edit" | "delete" | "memberEvent" | "projectEvent" | "other";

const MAP: Record<string, ActivityCategory> = {
  // File events
  "File Viewed": "view",
  "Document Viewed": "view",
  "File Downloaded": "view",                  // counts as view per CONTEXT lock
  "File Uploaded": "upload",
  "Document Version Created": "upload",
  "File Edited": "edit",
  "Markup Created": "edit",
  "Comment Added": "edit",
  "File Deleted": "delete",
  "File Restored": "delete",
  // Member events
  "Member Added": "memberEvent",
  "User Invited": "memberEvent",
  "Project Member Added": "memberEvent",
  // Project events
  "Project Created": "projectEvent",
  "Project Updated": "projectEvent",
};

export function categorize(rawAction: string): ActivityCategory {
  return MAP[rawAction] ?? "other";
}
```

**Why:** CONTEXT.md locks "Mapping fixes do not require re-ingest." Keeping the mapping in app code (vs a `category` DB column) means a typo fix is a code redeploy, not a backfill.

**Verification gap:** The list of raw action strings is partly synthesized from HOW_TO docs (which give examples, not an exhaustive enum). Wave 0 task should produce the actual distinct `action` values after the first successful ingest — MEDIUM confidence on the exact strings.

### Pattern 4: Lazy tRPC + Hover Prefetch (React Query Idiom)

**What:** `accActivity.getFileActivityForUser` is a `protectedProcedure.input(z.object({ email: z.string() }))` query. The user list row registers a 250ms-debounced `onMouseEnter` that calls `trpc.useUtils().accActivity.getFileActivityForUser.prefetch({ email })`. The side panel opens → React Query reads from cache (instant) or fires the actual query.

```typescript
// Source: trpc.io v11 docs (https://trpc.io/docs/client/react/useUtils)
// Verified against existing usage in components/layout/SyncFreshnessPill.tsx (.useQuery pattern)
const utils = trpc.useUtils();
const handleMouseEnter = useDebouncedCallback(() => {
  utils.accActivity.getFileActivityForUser.prefetch({ email });
}, 250);
```

**Why:**
- ACTV-03 contract: "NOT eager-loaded into BulkAccUser or FindingsContext."
- React Query default `staleTime` of 0 means a query re-fires on every component remount; bound staleTime to `1000 * 60 * 5` (5 min) to avoid thrashing during fast hover. Tune in plan.

### Anti-Patterns to Avoid (from prior ARCHITECTURE.md + new ones)

- **Loading all AccActivity into BulkAccUser:** `FindingsContext` would balloon to GBs. Lazy-only.
- **Polling APS from the browser:** APS 2-legged credentials are server-side. Polling is via `accSync` tRPC reading Postgres + (server-side) APS GET.
- **`upsert` per row in a loop:** O(n) round-trips. Use `createMany({ skipDuplicates: true })` with `@@unique` dedup key.
- **Authorization header on signed S3 URL:** APS signed URLs reject any Authorization header with 403. Use bare `fetch(downloadUrl)`.
- **In-memory ZIP buffering (jszip/adm-zip):** OOM on 400MB+ exports.
- **Skipping BOM handling in csv-parse:** Windows/Excel CSVs ship UTF-8 BOM; without `bom: true` the first column name becomes `﻿created_at` and silently mismatches. PITFALL.
- **Re-ingesting overlapping date ranges WITHOUT `@@unique`:** Phase 1's `dateRange: "PAST_7_DAYS"` overlaps day-over-day → duplicate rows unless dedup constraint enforced.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP container extraction | Manual `zlib` + ZIP central-directory parser | `unzipper` | ZIP container format (local file headers, central directory, end-of-central-directory record) is non-trivial; zlib only handles the *compression algorithm*, not the container. |
| CSV row parsing | `line.split(",")` | `csv-parse` | CSV has quoted-field rules, embedded newlines, escaped quotes, optional BOM. `String.split` mis-parses ~5% of real-world rows. |
| Streaming backpressure | Custom `pause()`/`resume()` loop | `pipeline()` + csv-parse Transform + Prisma batch flush | `pipeline()` from `node:stream/promises` handles error propagation across all stages; manual coordination drops errors. |
| Job state polling cadence | `setInterval` + manual backoff | Cron schedule + Postgres queries on `AccDataConnectorJob` | Already proven in `scripts/deep-sync.cjs` + `accSync` router. No setInterval needed; cron IS the loop. |
| Email matching (case-insensitive) | `email.toLowerCase() === target.toLowerCase()` in app code | `WHERE email ILIKE` in Postgres OR pre-normalized column | Postgres ILIKE is index-friendly with `(lower(email))` functional index OR store `emailLower` column. App-code casing on a multi-million-row scan is slow. |
| Relative-time formatting (`2d ago`) | Custom `Math.floor((now-then)/86400000)` | `formatDistanceToNow` from `date-fns` | Already imported in `SyncFreshnessPill.tsx`. Handles localization, edge cases (just now, in 1 day, etc.). |
| Hover debounce | Custom `setTimeout` ref | Existing pattern (whatever is used elsewhere in `UsersDirectoryClient.tsx`) | Search the codebase for `useDebouncedCallback` / `useDebounce` before introducing a new util. If none exists, a 10-line custom hook is acceptable. |

**Key insight:** This phase has three distinct deceptive-complexity zones — ZIP extraction, CSV streaming, and React Query lazy prefetching. Each is a one-line library call but ~200 lines of correct error-handling if hand-rolled.

## Common Pitfalls

### Pitfall 1: BOM in Windows-Exported CSV
**What goes wrong:** First column header in `parsed.headers[0]` becomes `﻿created_at` (or whatever the first column is), so `row.created_at` is `undefined`. Every ingested row has `createdAt: null` and the unique constraint fires false-duplicates.
**Why it happens:** Excel exports UTF-8 with BOM by default. APS Data Connector CSVs (server-generated) usually do NOT have BOM, but the contract is not documented — defend against both.
**How to avoid:** Pass `bom: true` to `csv-parse` options. (csv-parse v6 supports this; verified at https://csv.js.org/parse/options/bom/.)
**Warning signs:** First-batch ingest shows N rows inserted but `SELECT count(*) WHERE createdAt IS NULL` ≥ 0.5 × N.

### Pitfall 2: Signed S3 URL TTL Expiry
**What goes wrong:** Per `.planning/research/STACK.md`, Data Connector ZIPs are valid on AWS S3 for **30 days**. But the *signed URL itself* may expire faster (typical: 1-24 hours). If the ingest cron runs many hours after submission, the URL may 403.
**Why it happens:** S3 pre-signed URLs include an `X-Amz-Expires` param. APS does not document the exact TTL; community reports range 1h-24h.
**How to avoid:** If ingest fails with 403 on a "success" job, re-call APS `GET /requests/:requestId/jobs` to get a freshly-signed `downloadUrl`. APS returns a new signed URL on each poll while the job stays valid. (MEDIUM confidence — needs verification on first failure.)
**Warning signs:** Ingest succeeds for fast jobs but fails for slow jobs that take > N hours.

### Pitfall 3: Railway Container Memory Ceiling
**What goes wrong:** Even with streaming, csv-parse + Prisma batch buffer + Node V8 overhead can OOM on Railway's default 512MB-1GB container with a 400MB+ ZIP that decompresses 5×.
**Why it happens:** A 500-row batch of activity objects ≈ ~500KB; benign. But the unzipper crc-32 verification step buffers entry tails in some configurations. And ECONNRESET retries inside Prisma rebuffer the entire `data` array.
**How to avoid:**
1. Set `BATCH = 500` (not 2000+).
2. Wrap the entire ingest in `try/finally` + `await prisma.$disconnect()` to release pool connections.
3. Use `prisma` with `max: 2` adapter (same pattern as `scripts/deep-sync.cjs:88-93`).
4. Test with synthetic 100MB+ ZIP before relying on it for prod.
**Warning signs:** Railway "out of memory" SIGKILL logs; `AccDataConnectorJob` row stuck at `running`.

### Pitfall 4: `createMany skipDuplicates` Silently Drops Rows Without `@@unique`
**What goes wrong:** Without a meaningful `@@unique` on `AccActivity`, `skipDuplicates: true` becomes a no-op AND the same row inserts N times across re-ingests. The query `SELECT lastView FROM ...` returns confusingly large counts.
**Why it happens:** Prisma `skipDuplicates` translates to `ON CONFLICT DO NOTHING` against the unique constraints PRESENT. Currently `AccActivity` has only indexes, no `@@unique`.
**How to avoid:** Add `@@unique([autodeskId, action, createdAt, projectId])` (NULL-safe in Postgres because composite unique with NULLable column treats nulls as not-equal — verify with EXPLAIN or use coalesce'd column).
**Warning signs:** `SELECT count(*) FROM AccActivity` grows linearly with ingest count instead of plateauing at distinct-row count.

### Pitfall 5: Unzipper Backpressure Drop with Multi-Entry ZIP
**What goes wrong:** If two CSV entries inside the ZIP are processed in parallel (`.on("entry")` fires for both before the first finishes), they race on Prisma's connection pool.
**Why it happens:** unzipper emits `entry` events as soon as it sees each local file header. The user code must serialize.
**How to avoid:** Inside `.on("entry")`, if the entry is one we want, `await` its completion before allowing the next; OR queue entries and process sequentially after `Parse()` finishes. Alternative: process each target CSV as a separate `unzipper.Open.url()` pass with `Stream.path` filtering.
**Warning signs:** `Error: Pool exhausted` from Prisma during ingest; rows from `admin_activities.csv` appearing interleaved with `project_activities.csv` in logs.

### Pitfall 6: Email Case-Insensitive Join Performance
**What goes wrong:** Joining `AccActivity.userEmail` to `AccProjectMember.email` with `LOWER(...)` on a 10M-row activity table without a functional index is sequential scan territory.
**How to avoid:**
1. Store `userEmail` in `AccActivity` already lowercased at ingest (no functional index needed — the value IS lowercased).
2. Existing `AccProjectMember.email` from Phase 2 — verify it's lowercased on write (check `lib/server/acc-helpers.ts`).
**Warning signs:** Drill-down panel takes >2s to open even after warm cache.

### Pitfall 7: Re-Ingest Idempotency on Failed Mid-Stream
**What goes wrong:** Ingest crashes after inserting 70% of `project_activities.csv`. Next cron run re-downloads the same ZIP and tries to re-insert. Without dedup, duplicates. With dedup, ~70% of inserts are wasted "skipped" rows.
**How to avoid:** Mark `AccDataConnectorJob.status = "running"` BEFORE starting ingest; only mark `success` when both CSVs fully consumed. On retry, the same job re-runs; `skipDuplicates` makes the partial-state idempotent. Acceptable waste.
**Warning signs:** Job stuck in `running` for hours; logs show "row already exists" warnings.

### Pitfall 8: APS "PAST_7_DAYS" Day-Over-Day Overlap
**What goes wrong:** Nightly cron with `dateRange: "PAST_7_DAYS"` (per `scripts/deep-sync.cjs:148`) means each ingest includes 6 days of overlap with the previous. Without dedup, the table grows 7× the actual activity rate.
**How to avoid:** Same fix as Pitfall 4 — meaningful `@@unique`. CONTEXT.md locks "All-time retention, no prune" so the dedup is the only defense.

### Pitfall 9: RecentlyAddedWidget Is a Calendar Heatmap, Not a Row List
**What goes wrong:** CONTEXT.md describes "stacked avatars on each invitation row" but `RecentlyAddedWidget.tsx` (verified by reading the file) is a 90-day GitHub-style calendar grid — there is no "row" concept in the widget itself; rows live inside `DashboardSidePanel.DayBody`.
**How to avoid:** Surface stacked avatars in `DashboardSidePanel.DayBody`'s members table (or extend `MembersTable` with an "Invited by" column). Optionally add a "row list view toggle" to the widget. Flagged as Open Question Q1.
**Warning signs:** Discovered too late in implementation.

## Schema Gaps

**Current `AccActivity` (prisma/schema.prisma:530-543) is INSUFFICIENT.**

| CONTEXT.md Requirement | Current Schema | Action |
|------------------------|---------------|--------|
| Persist Autodesk user ID per row | ✅ `autodeskId String` exists | None |
| `user_email` index `(user_email, timestamp DESC)` | ❌ No `userEmail` column | **ADD** column + index |
| Store raw `action_type` | Partial: `action String` exists, but ambiguous whether "raw" or "normalized" | **RENAME** to `rawAction` (or add comment lock) |
| `(project_id, timestamp DESC)` index | ✅ Exists | None |
| `(autodesk_user_id, timestamp DESC)` index | ✅ Exists | None |
| `createMany({skipDuplicates})` dedup key | ❌ No `@@unique` constraint | **ADD** `@@unique([autodeskId, action, createdAt, projectId])` (carefully — projectId is nullable) |
| Source CSV file marker | ❌ Missing | **ADD** `sourceFile String` ("project" | "admin") to distinguish `project_activities.csv` from `admin_activities.csv` |
| `details` / `description` payload | ✅ `details String?` | None |

**Migration shape (additive — safe per Phase 1 policy):**

```prisma
model AccActivity {
  id         String   @id @default(cuid())
  autodeskId String                                       // CSV user_id (the actor)
  userEmail  String?                                      // NEW: resolved from users.csv join at ingest; lowercased
  projectId  String?
  rawAction  String                                       // renamed from `action` — explicit lossless
  action     String                                       // BACKFILL alias during transition window? Or just rename. Plan-time choice.
  service    String?
  tool       String?
  details    String?
  sourceFile String                                       // NEW: "project" | "admin"
  createdAt  DateTime                                     // source-system timestamp

  @@unique([autodeskId, rawAction, createdAt, projectId]) // NEW: dedup key
  @@index([autodeskId, createdAt(sort: Desc)])
  @@index([userEmail, createdAt(sort: Desc)])             // NEW: drives ACTV-03 lazy query
  @@index([projectId, createdAt(sort: Desc)])
  @@index([rawAction])                                    // RENAMED from action
}
```

**New `UnresolvedAttribution` model (minimal per CONTEXT.md discretion):**

```prisma
model UnresolvedAttribution {
  id          String   @id @default(cuid())
  activityId  String                            // references AccActivity.id (logical FK; not enforced to allow soft retention)
  rawEmail    String?                           // parsed from details column
  rawDetails  String?                           // full details for forensics
  reason      String                            // "no_email_match" | "no_autodesk_id_match" | "ambiguous_match"
  createdAt   DateTime @default(now())

  @@index([reason])
  @@index([createdAt])
}
```

**Migration risk:** Renaming `action` → `rawAction` is a destructive rename in Prisma. If `AccActivity` already has rows in prod (verify with planner), prefer keeping `action` and adding a comment `/// raw — do not normalize`. Otherwise pure rename is fine.

## Code Examples

### Example 1: Lazy tRPC Procedure with Cursor Pagination

```typescript
// server/routers/acc-activity.ts (NEW)
// Source: synthesized from server/routers/acc-sync.ts (existing pattern) + tRPC v11 input validation docs
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { categorize, type ActivityCategory } from "@/lib/acc/activityCategories";

export const accActivityRouter = router({
  // ACTV-03: lazy per-user file-activity timestamps. Side-panel + hover prefetch path.
  getFileActivityForUser: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      const emailLower = input.email.toLowerCase();
      // Fetch the most-recent activity per row, then aggregate per category in app code.
      // (A more efficient SQL approach: 4 separate aggregate queries with WHERE rawAction IN (...) — pick at plan time.)
      const rows = await ctx.db.accActivity.findMany({
        where: { userEmail: emailLower },
        orderBy: { createdAt: "desc" },
        take: 200, // bounded scan; categories should populate from the top ~200 events
        select: { rawAction: true, createdAt: true },
      });
      const result: Record<ActivityCategory, Date | null> = {
        view: null, upload: null, edit: null, delete: null,
        memberEvent: null, projectEvent: null, other: null,
      };
      for (const r of rows) {
        const cat = categorize(r.rawAction);
        if (!result[cat]) result[cat] = r.createdAt;
      }
      return {
        lastView: result.view,
        lastUpload: result.upload,
        lastEdit: result.edit,
        lastDelete: result.delete,
      };
    }),

  // ACTV-05: paginated, type-grouped drill-down. Cursor by createdAt+id for stable pagination.
  listForUser: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      categories: z.array(z.enum(["view","upload","edit","delete","memberEvent","projectEvent","other"])).optional(),
      projectId: z.string().optional(),
      dateRange: z.object({ from: z.date(), to: z.date() }).optional(),
      cursor: z.object({ createdAt: z.date(), id: z.string() }).optional(),
      limit: z.number().min(1).max(50).default(25),
    }))
    .query(async ({ ctx, input }) => {
      // Implementation: SELECT ... WHERE userEmail=... [AND projectId=...] [AND createdAt BETWEEN ...]
      // ORDER BY createdAt DESC, id DESC LIMIT 26 (one extra to compute hasMore).
      // Categories filter applied in app code via categorize() since stored as raw.
      // ...
    }),

  // ACTV-04 + RecentlyAdded backend: invitation rows in date window with inviter lookup
  listInvitations: protectedProcedure
    .input(z.object({
      windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
      inviterFilter: z.string().optional(), // autodeskId — when "Filtered by Jane" pill is active
    }))
    .query(async ({ ctx, input }) => {
      // SELECT activity rows where rawAction IN ('Member Added','User Invited','Project Member Added')
      // JOIN to AccProjectMember (by parsed email from details, fallback by autodeskId)
      // Returns: { inviteeEmail, inviteeName, inviteeAvatar, inviterName, inviterAvatar, inviterAutodeskId | null, createdAt }
      // ...
    }),
});
```

### Example 2: Attribution Helper

```typescript
// lib/acc/attributeInviter.ts (NEW)
// Source: synthesized from HOW_TO_Extract_Recent_User_Additions.md + CONTEXT.md attribution rules

import type { PrismaClient } from "@prisma/client";

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/g;

export interface AttributionResult {
  inviterAutodeskId: string;       // from AccActivity.autodeskId (always present)
  inviterMemberId: string | null;  // resolved AccProjectMember.id
  inviteeEmail: string | null;     // parsed from details
  inviteeMemberId: string | null;
  reason?: "no_email_match" | "no_autodesk_id_match" | "ambiguous_match";
}

export async function attribute(
  activity: { id: string; autodeskId: string; details: string | null; projectId: string | null },
  prisma: PrismaClient,
): Promise<AttributionResult> {
  // 1. Parse email from details
  const emails = activity.details?.match(EMAIL_RE) ?? [];
  const inviteeEmail = emails[0]?.toLowerCase() ?? null;

  // 2. Resolve inviter via AccProjectMember (case-insensitive, autodeskId is canonical)
  const inviter = await prisma.accProjectMember.findFirst({
    where: { autodeskId: activity.autodeskId },
    select: { id: true },
  });

  // 3. Resolve invitee via email match first, autodeskId fallback unavailable (no ID in details)
  let invitee = null;
  if (inviteeEmail) {
    invitee = await prisma.accProjectMember.findFirst({
      where: { email: { equals: inviteeEmail, mode: "insensitive" } },
      select: { id: true },
    });
  }

  const result: AttributionResult = {
    inviterAutodeskId: activity.autodeskId,
    inviterMemberId: inviter?.id ?? null,
    inviteeEmail,
    inviteeMemberId: invitee?.id ?? null,
  };

  if (!invitee) {
    result.reason = inviteeEmail ? "no_email_match" : "no_autodesk_id_match";
    await prisma.unresolvedAttribution.create({
      data: {
        activityId: activity.id,
        rawEmail: inviteeEmail,
        rawDetails: activity.details,
        reason: result.reason,
      },
    });
  }
  return result;
}
```

### Example 3: User-List 4-Column "File Activity" Grouped Header

```tsx
// app/(dashboard)/users/UsersDirectoryClient.tsx (MODIFY — sketch)
// Source: HTML5 spec for grouped table headers + existing UsersDirectoryClient.tsx structure

<table>
  <thead>
    <tr>
      <th rowSpan={2}>Name</th>
      <th rowSpan={2}>Email</th>
      <th colSpan={4} className="text-center border-b">File Activity</th>
      <th rowSpan={2}>Status</th>
    </tr>
    <tr>
      <th>View</th>
      <th>Upload</th>
      <th>Edit</th>
      <th>Delete</th>
    </tr>
  </thead>
  <tbody>
    {users.map(u => (
      <UserRow key={u.email} user={u} onHover={() => prefetchActivity(u.email)} />
    ))}
  </tbody>
</table>

// UserRow renders FileActivityCells that read from trpc.accActivity.getFileActivityForUser cache
// (or shows skeleton if not yet prefetched and not yet open in side panel).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline tRPC mutation that polls APS Data Connector for hours | Cron-driven two-stage lifecycle (submit + ingest) via `scripts/*.cjs` and `AccDataConnectorJob` row | Phase 1 (already done for submit) | Survives Railway container restarts; no HTTP timeout risk. Phase 3 adds the ingest half. |
| `papaparse` + buffer-whole-file (community default) | `csv-parse@6` streaming Transform | csv-parse v6 release (2025) | Memory O(batch) instead of O(file). |
| `jszip` in-memory ZIP load | `unzipper@0.12.3` streaming Parse | Long-standing; reaffirmed by ROADMAP | No OOM on 400MB+ exports. |
| `useEffect` + `setInterval` polling in components | `tRPC.useQuery` with `refetchInterval` | Existing pattern (SyncFreshnessPill) | Component unmounts auto-stop polling; integrates with React Query cache. |

**Deprecated / outdated:**
- The CSV ingest example in `HOW_TO_Extract_Last_User_File_Activity.md` uses `papaparse` — DO NOT follow this snippet literally. CONTEXT.md and STACK.md both reject papaparse.
- `@aps_sdk/data-connector` does NOT exist (confirmed). Any reference in older docs to "use the SDK" is wrong for this endpoint family.

## Open Questions

1. **RecentlyAddedWidget shape conflict (Q1 — important)**
   - What we know: `RecentlyAddedWidget.tsx` is a 90-day calendar heatmap (no per-invitation row UI in the widget itself); `DashboardSidePanel.DayBody` renders a basic email-only `MembersTable` when a day cell is clicked.
   - What's unclear: CONTEXT.md describes "stacked avatars on each invitation row" and a "Filtered by Jane Doe ×" filter pill inside the WIDGET. This implies either (a) the widget gets a new "row list" mode toggle, or (b) the side-panel `DayBody` is the new home for the row list and the widget remains a heatmap. CONTEXT also says "10 rows visible in widget; `See all` link opens the full list in side panel" — which suggests the widget DOES have a row-list view, contradicting its current heatmap-only shape.
   - Recommendation: Plan-phase Open Question for the user. Default proposal: KEEP the heatmap as the at-a-glance view but ADD a row list **below** the calendar (10 rows, "See all" → side panel). Stacked avatars + filter pill live in the row list section.

2. **Ingest cron cadence vs single nightly run**
   - What we know: Phase 1 deep-sync.cjs runs nightly at 09:00 UTC. APS jobs can take minutes to hours.
   - What's unclear: Is a separate ingest cron (every 15min) acceptable on Railway, or should we extend `deep-sync.cjs` to poll-with-budget then exit?
   - Recommendation: Add a second cron `scripts/deep-sync-ingest.cjs` running every 30min. Plan-time decision.

3. **`createMany skipDuplicates` with nullable `projectId` in dedup key**
   - What we know: Postgres treats `NULL != NULL` in unique constraints by default, so `@@unique([autodeskId, rawAction, createdAt, projectId])` will NOT dedup admin_activities rows (where projectId is NULL).
   - What's unclear: Either (a) accept some admin-row duplication and dedup at query time, (b) use a sentinel string (`""`) for projectId on admin rows, or (c) add a separate `@@unique([autodeskId, rawAction, createdAt])` partial unique index where projectId IS NULL (Postgres-specific).
   - Recommendation: Plan-time decision. Default: sentinel `""` is simplest given Prisma migration constraints.

4. **Autodesk-ID-from-MEM lookup: inline vs post-ingest pass?**
   - What we know: CONTEXT.md grants Claude's discretion.
   - What's unclear: Inline lookup during ingest = 1 extra query per row (slow but simple). Post-ingest pass = bulk `UPDATE AccActivity SET autodeskId = ... FROM AccProjectMember WHERE ...` (fast but a second job).
   - Recommendation: Post-ingest pass with a single SQL update. Plan time.

5. **Existing `action` column data**
   - What we know: `AccActivity.action` column exists in schema; STATE.md doesn't confirm any rows ingested yet.
   - What's unclear: If prod has rows, renaming `action` → `rawAction` is destructive.
   - Recommendation: Planner runs `SELECT count(*) FROM "AccActivity"` against prod before drafting the migration.

## Validation Architecture

**Not applicable.** Verified `.planning/config.json` contains only `{"workflow":{"research":true}}` — `nyquist_validation` is not set (falsy). Section skipped per gsd-phase-researcher rules. (Vitest is installed and used; the planner can still write unit tests where useful, but the Phase 3 plan does not require the formal nyquist test matrix.)

## Sources

### Primary (HIGH confidence — ground truth read directly)
- `C:/LECG/Dashboard/.planning/phases/03-activity-pipeline/03-CONTEXT.md` — locked decisions
- `C:/LECG/Dashboard/.planning/REQUIREMENTS.md` — ACTV-01..05 definitions
- `C:/LECG/Dashboard/.planning/ROADMAP.md` — Phase 3 success criteria + pre-flight risks
- `C:/LECG/Dashboard/.planning/STATE.md` — Phase 1+2 status, dual-write context
- `C:/LECG/Dashboard/.planning/research/STACK.md` — prior decisions on unzipper/csv-parse/no-SDK
- `C:/LECG/Dashboard/.planning/research/ARCHITECTURE.md` — prior architectural patterns + anti-patterns
- `C:/LECG/Dashboard/APS_DOCS/HOW TO/HOW_TO_Extract_Activity_Logs.md` — 3-call Data Connector flow, signed S3 URL no-auth quirk
- `C:/LECG/Dashboard/APS_DOCS/HOW TO/HOW_TO_Extract_Last_User_File_Activity.md` — file action enum (View/Upload/Edit/Delete examples)
- `C:/LECG/Dashboard/APS_DOCS/HOW TO/HOW_TO_Extract_Recent_User_Additions.md` — WHO-added-WHOM CSV parse pattern
- `C:/LECG/Dashboard/prisma/schema.prisma` — current `AccActivity` and `AccDataConnectorJob` shape
- `C:/LECG/Dashboard/scripts/deep-sync.cjs` — current cron submission entry point
- `C:/LECG/Dashboard/server/routers/acc-sync.ts` — existing tRPC freshness router pattern
- `C:/LECG/Dashboard/server/routers/root.ts` — router registration site
- `C:/LECG/Dashboard/components/layout/SyncFreshnessPill.tsx` — sync pill state computation
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx` — calendar heatmap (NOT row list — Open Q1)
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` — sheet panel + body discriminated union
- `C:/LECG/Dashboard/app/(dashboard)/users/UsersDirectoryClient.tsx` — user-list shell (where File Activity columns slot in)
- `C:/LECG/Dashboard/lib/server/acc-admin.ts` — `fetchWithRetry` pattern (re-use for any future APS calls)
- `C:/LECG/Dashboard/package.json` — confirms `unzipper` and `csv-parse` NOT yet installed

### Secondary (MEDIUM confidence — WebSearch verified against multiple sources)
- npm registry — `unzipper@0.12.3`, 1,822 dependents, MIT, last 2025
- npm registry — `csv-parse@6.2.1`, 2,966 dependents, MIT, 2 months ago
- `csv.js.org/parse/options/bom/` — `bom: true` option for BOM stripping
- `trpc.io/docs/client/react/useUtils` — `utils.<procedure>.prefetch()` lazy prefetch pattern

### Tertiary (LOW confidence — flagged for validation)
- Exact list of APS raw `action` strings in CSV — synthesized from HOW_TO docs; needs first-ingest verification
- Signed S3 URL TTL behavior on long-running jobs — community-reported 1h–24h range; not officially documented by APS

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `unzipper` + `csv-parse` versions verified on npm; both in prior STACK.md.
- Architecture: HIGH — patterns derived from direct file reads + prior research files; two-stage cron is a clarification of Phase 1's already-implemented submit-only stage.
- Schema gaps: HIGH — fields enumerated by direct grep of `prisma/schema.prisma`.
- Pitfalls: MEDIUM-HIGH — BOM, S3 TTL, OOM, dedup all sourced from library docs + community reports + STACK.md cross-references.
- Action-type enum coverage: MEDIUM — APS does not publish exhaustive action-type list; mapping needs first-ingest validation.

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (30 days — streaming-stack libs stable; APS endpoint contracts stable)
