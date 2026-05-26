# Folder Crawl Coverage Audit — 2026-05-26

**Mode:** read-only. No files modified, no crawl run, no DC quota consumed, no env changed, no Task Scheduler touched.

**Trigger:** DC priority-mode dry-run found `214 / 428` projects in lane `needs_permissions_crawl`. This audit explains _why_ and proposes a safe next step.

`★ Insight ─────────────────────────────────────`
- `folderCrawlStatus` lives on `AccProject`, but the **priority planner ranks `AccDcProject`** (the DC-eligible subset). The two universes are different sizes — that's the whole reason "428" exists vs the 1,152 active `AccProject` rows.
- `needs_permissions_crawl` is a **lane label, not a queue**: a project lands there when its formal backfill is fine but `folderCrawlStatus NOT IN ('ok','partial')`. So the bottleneck is the crawl scheduler, not DC quota.
- The crawl scheduler was designed to run as a **Railway weekly cron** (`folder-crawl-cron.cjs` header, line 7). Railway is retired (memory: `feedback_always_push_railway.md`), and no Task Scheduler task replaces it on Luis's PC.
`─────────────────────────────────────────────────`

---

## 1. `folderCrawlStatus` — schema and code-allowed values

| Source | Allowed values |
|---|---|
| Prisma schema (`prisma/schema.prisma:443`) — comment | `never \| ok \| partial \| failed` (default `never`) |
| `lib/acc/folderCrawl.ts:55,196,369,510` — `FolderCrawlResult.status` union | `ok \| partial \| failed \| inaccessible` |
| `extractionPriorityPlanner.ts:256` — defensive fallback | `unknown` (when DB value is `null`) |

`inaccessible` is written by the crawler (when a project's `top folders` endpoint returns 403/404 — see `folderCrawl.ts:264`) but is **not in the schema comment**. It's effectively a fifth real value with no schema enforcement.

## 2. Current distribution (live PG, 2026-05-26)

### All `AccProject` rows (n = 1,152, all `status='active'`)

| `folderCrawlStatus` | count |
|---|---:|
| `never`         | **803** |
| `ok`            | **308** |
| `inaccessible`  | **41**  |
| `partial`       | 0 |
| `failed`        | 0 |
| `unknown`/null  | 0 |

Distinct values in DB right now: `{ never, ok, inaccessible }`.

### Planner's narrower universe — `AccDcProject` (n = 428, of which 374 active)

The DC priority planner pulls projects from `AccDcProject` (`lib/acc/dcIngest.ts:559`), then enriches each with `folderCrawlStatus` from the matching `AccProject` row (`dcIngest.ts:563-565`).

| Planner universe filter | `never` | `ok` | `inaccessible` | total |
|---|---:|---:|---:|---:|
| `AccDcProject` (all)              | 278 | 131 | 19 | 428 |
| `AccDcProject` where `status='active'` | **243** | **131** | 0 | 374 |

Of the **243 active DC projects with `folderCrawlStatus='never'`**:
- All 243 have **zero rows in `AccFolder`**.
- ~29 of them get re-classified by the planner into earlier lanes (`use_quota_first`, `needs_activity_backfill`) because their formal backfill state is missing — so they show as needing quota _and_ a crawl. That leaves the **214** that appear in `needs_permissions_crawl` (matches dry-run).

### Crawl-row totals
- `AccFolder` rows: **137,687**
- `AccFolderPermission` rows: **2,021,736**

### Last folder-sync activity (`MAX("AccFolder"."syncedAt")` per project, by day)

| Day | Projects last-synced |
|---|---:|
| 2026-05-22 | 229 |
| 2026-05-19 | 4 |
| 2026-05-14 | 3 |
| 2026-05-13 | 29 |
| 2026-05-12 | 43 |

Globally, `AccFolder.syncedAt` ranges **2026-05-12 → 2026-05-22**. **No folder rows have been written in the last 4 days.**

## 3. Why are 214 projects in `needs_permissions_crawl`?

From `extractionPriorityPlanner.ts:155`:

```ts
if (!["ok", "partial"].includes(args.folderCrawlStatus)) return "needs_permissions_crawl";
```

So the lane fires whenever crawl status is `never`, `inaccessible`, `failed`, `unknown`, or any future value other than `ok`/`partial`.

For the 214 today, the dominant root cause is unambiguously **`never` — these projects have never been crawled**:
- All 243 active DC projects with `never` have **0 rows in `AccFolder`** — no historical crawl ever wrote anything for them.
- 0 are `failed`, 0 are `partial`, 0 are `inaccessible` _within the planner universe_ (the 41 `inaccessible` rows in the full `AccProject` table are all `dc_status='archived'` and thus outside the active DC working set).
- 0 are "stale crawls" — the bucket "ok but ageing" doesn't exist; the planner doesn't time-decay `ok`.

So the breakdown asked for in question 4:

| Sub-cause | Count |
|---|---:|
| Never crawled                       | **214** (all of them, by elimination) |
| Failed crawls                       | 0 |
| Inaccessible (in planner universe)  | 0 |
| Stale (ok but old)                  | 0 (planner ignores age of `ok`) |
| Missing DB state                    | 0 (every `AccDcProject` has a matching `AccProject` row in the active set) |

## 4. What writes `folderCrawlStatus`?

| Writer | Trigger | Statuses it sets |
|---|---|---|
| `lib/acc/folderCrawl.ts` → `extractAndPersistFolders()` (lines 418-420, 518-521) | Full crawl per project | `ok`, `partial`, `failed`, `inaccessible` |
| `lib/acc/folderCrawl.ts` → permissions-only recovery (line 658) | Recovery pass over `partial` projects | `ok`, `partial` |
| Prisma default (`schema.prisma:443`) | New `AccProject` row from sync | `never` |

There is **no writer that updates an `ok` row back to `stale`**. Aging is not modelled.

## 5. What schedules folder crawl today?

- **Production script:** `scripts/folder-crawl-cron.cjs` — header documents it as a **Railway weekly cron** (`0 4 * * 0`).
- **Dry-run script:** `scripts/dry-run-folder-crawl.cjs` — zero-writes, generates `CRAWL-ESTIMATE.md`.
- **Recovery script:** `scripts/folder-perms-recover.cjs` — re-fetches permissions for projects stuck at `partial`.

Operator-side reality on Luis's PC:

```
schtasks /Query  →  DC-Backfill-730d-*, DC-Daily-Ingest, LECG Dashboard Local,
                    LECG Postgres Local
                    (no folder-crawl-cron, no folder-perms-recover)
```

→ **No scheduler is running folder-crawl-cron.cjs anywhere right now.**
The last evidence of a run is `logs/folder-crawl-test-5-2026-05-19.log` — a manual 5-project test on 2026-05-19 (1 ok, soft/hard caps tripped on 3 others). That date matches the orphan in the syncedAt histogram (4 projects on 2026-05-19).

## 6. Folder crawl: quota, auth, write-behaviour

| Property | Value | Source |
|---|---|---|
| Auth | **2-legged client_credentials**, scope `account:read data:read data:create` | `folder-crawl-cron.cjs:99-104` |
| Token endpoint | `developer.api.autodesk.com/authentication/v2/token` | `folder-crawl-cron.cjs:40` |
| Quota cost | **Independent of Data Connector quota**. Uses Data Management API + BIM360 permissions API. No daily-cap is tracked anywhere in this repo. (Standard APS per-app rate limits still apply via `fetchWithRetry`.) | `folderCrawl.ts:20`, no `AccDcIngestRun`-equivalent for crawls |
| Reads/writes APS | **Read-only against APS** — only `GET` calls (top-folders, contents, permissions). Cannot change permissions or folder data. | `folderCrawl.ts` (no POST/PUT/DELETE) |
| Writes DB | Upserts `AccFolder` + `AccFolderPermission`; updates `AccProject.folderCrawlStatus` | `folderCrawl.ts:441,480,518` |
| Per-project soft cap | 5 min (warn) | `folderCrawl.ts:64` / `dry-run-folder-crawl.cjs:179` |
| Per-project hard cap | 15 min (abort → `partial`) | `folderCrawl.ts:64` / `dry-run-folder-crawl.cjs:180` |
| Concurrency | `pLimit(5)` across projects, `pLimit(5)` within a project | `folder-crawl-cron.cjs:171`, `folderCrawl.ts` constants |

Per the 2026-05-19 run: large projects routinely trip the soft cap (5min) and a few hit hard cap (15min) on first crawl — i.e. crawling 214 projects in one shot at `pLimit(5)` is on the order of **45 min to several hours**, not 5 minutes.

## 7. Risk surface

- ✅ Cannot mutate ACC permissions or folder data — reads only.
- ✅ Does not consume Data Connector daily quota (the budget the DC dry-run was about).
- ⚠️ DB write volume can be large for first crawls: the 2026-05-22 batch alone wrote 84,489 `AccFolder` rows and the prior permissions-recover pass wrote 431k+ permissions.
- ⚠️ Standard APS rate-limit pressure — `fetchWithRetry` handles back-off, but `pLimit(5)` × N projects with deep BFS hammers the hub. Existing safeguards: per-project soft/hard caps, token refresh hook.
- ⚠️ Hard-cap abort marks projects `partial`; they then need `folder-perms-recover.cjs` to finish. The schema comment doesn't list `inaccessible`, so any future migration that constrains the column to the documented set would break the existing 41 rows.

## 8. Safest next step

Recommended sequencing (each step is gated by Luis approval):

1. **Run the dry-run on a 5-project sample first** (`scripts/dry-run-folder-crawl.cjs` already exists, performs zero DB writes, and writes a fresh `CRAWL-ESTIMATE.md`). Confirm token still works and per-project durations are sane on the 2026-05-26 hub state. Cheapest possible probe; will not change any DB row.
2. **Smoke-test the real writer on 5 projects** by running `folder-crawl-cron.cjs` with `FOLDER_CRAWL_LIMIT=5` and `FOLDER_CRAWL_STATUSES=never`. This is exactly what the 2026-05-19 log shows — the path is known to work end-to-end. Pick 5 small-by-member-count projects to keep the run short.
3. **Then** decide cadence: ad-hoc batch (recommended now) vs new Windows Scheduled Task on Luis's PC (the Railway equivalent — Luis's machine already runs `LECG Dashboard Local`, `LECG Postgres Local`, `DC-Daily-Ingest`).
4. **Defer**: scheduling. Until step 2 confirms the path still works on the current hub + token + Postgres-18 setup, adding a scheduler is premature.

Concretely, the very next safe action is **step 1 — re-run the dry-run** (or a `FOLDER_CRAWL_LIMIT=5` subset of it). No scheduler edits, no env edits, no broad crawl.

## 9. Suggested operational improvements (defer — not part of this audit)

- Add a writer that ages `ok` → `stale` after N days (planner currently can't see ageing, so a 6-month-old `ok` looks identical to a fresh one).
- Update the schema comment / migration to legalise `inaccessible` (currently undocumented but written by code).
- Track folder-crawl runs in a dedicated table mirroring `AccDcIngestRun` so we can see the same coverage histogram for crawls that we already see for DC.

---

**Audit deliverable complete. No implementation performed.**
