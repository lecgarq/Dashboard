# Unified activity source for the Access Analysis activity panels

**Date:** 2026-06-12
**Branch:** `feat/access-analysis-redesign`
**Status:** Approved — ready for plan

## Problem

The three activity panels on `/access-analysis` — **Activity over time** (timeline),
**Activity by role** (donut), **Activity by module** (donut) — read the legacy Data
Connector table `AccActivity`. DC is effectively frozen: quota-limited (~25 req/UTC-day),
403-locked on most projects, and the reason the quota-free `AccActivityAccds` crawl was
built. We now have a fuller, fully-attributed activity source (`AccActivityAccds`,
~2.54M rows) and want the panels to use it as the **single source of truth** — without
losing the older history and account-level admin activity that only DC holds.

## Decision

Make the activity panels read **one unified dataset**: `AccActivityAccds` is primary;
`AccActivity` (DC) **complements** it by filling only the gaps accds cannot cover. The
user never picks a source — there is no toggle. The merge lives entirely inside the three
server views; the page, the client component, and the pure summarizers are unchanged.

This supersedes two earlier directions considered during brainstorming: a DC↔accds
**toggle** (rejected — the owner wants a single source of truth, no picking) and an
**accds-only clean break** (rejected — it would drop the pre-accds history and the
account-level admin rows).

## Grounding data (measured 2026-06-12, local Postgres)

| | accds (`AccActivityAccds`) | DC (`AccActivity`) |
|---|---|---|
| Rows | 2,538,927 | 1,078,068 |
| Projects | 229 | 229 (same set; `accds_only=0`, `dc_only=0`) |
| User attribution | 100% (0 missing) | ~11,863 rows unattributed |
| Date range | 2025-06-17 → today | 2024-12-11 → today |
| Account-level admin rows | 0 (`projectId` is `NOT NULL`) | 825 |

**Vocabulary is shared.** accds `activityVerb` strings are the *same* tokens as DC
`rawAction` (`view-entity`, `upload-entity`, `assign-permission`, …), so the existing
`classifyActivity()` classifier works on accds rows with no new mapping.

**Per-project accds coverage starts at widely varying dates** — this is the fact that
forces a per-project (not global) merge boundary:

| accds coverage begins | # projects |
|---|---|
| 2025-06 | 129 |
| 2025-07 | 41 |
| 2025-08 → 2025-10 | 38 |
| 2025-11 → 2026-05 | 21 |

Per-project accds start ranges from **2025-06-17 to 2026-05-20**. A single global cutoff
would drop DC rows that accds never covered for ~100 late-starting projects, creating
holes. The merge boundary must therefore be per-project.

**The merge arithmetic, sized:**
- 41,696 DC project rows *predate* their project's accds start → **kept** (backfill).
- 1,035,547 DC project rows fall in the overlap → **dropped** (accds owns them, fuller).
- 825 DC account-level admin rows → **kept** (accds holds none; no overlap possible).
- Unified total ≈ **2,581,448 rows** (2.54M accds + 41.7k backfill + 825 admin).

## The merge rule

Applied identically in all three views:

```
For each project P:
    accds owns   [ P's earliest accds row  →  now ]
    DC fills     [ everything strictly before P's earliest accds row ]
Account-level activity (admin, no project):
    DC, all time   (accds cannot hold these)
```

Exact at timestamp granularity: the overlap is excluded (no double-count) and DC fills
right up to each project's accds-start (no gap). The two tables share no common event id
(DC stores a synthetic cuid; accds stores ACC's real `activity_id`), so identity-based
dedup is impossible — the time partition is the dedup.

**Assumption:** within a project's covered range, accds is contiguous from its earliest
row (the crawl fetched all available activity per project in one pass). If accds ever had
an internal gap, DC rows inside that gap would be dropped rather than filled. This is not
observed in the data and is acceptable for a volume dashboard; noted as a known bound.

## Architecture

### Server — three views become raw-SQL `UNION ALL` merges

Each view keeps its current exported signature (`load*(force=false): Promise<Row[]>`),
its 5-minute module-level cache, and its existing return type. Only the query body
changes from a single-table read to a two-table merge sharing this CTE:

```sql
WITH astart AS (
  SELECT "projectId", MIN("createdAt") AS s
  FROM "AccActivityAccds"
  GROUP BY "projectId"
)
```

**`lib/server/moduleActivityView.ts`** → `ModuleActivityRow { projectId, projectName, rawAction, count }`

```sql
SELECT pid AS "projectId", action AS "rawAction", SUM(c)::int AS count
FROM (
  SELECT "projectId" AS pid, "activityVerb" AS action, COUNT(*)::int AS c
    FROM "AccActivityAccds" GROUP BY 1, 2
  UNION ALL
  SELECT COALESCE(NULLIF(d."projectId", ''), '') AS pid, d."rawAction" AS action, COUNT(*)::int AS c
    FROM "AccActivity" d
    LEFT JOIN astart a ON a."projectId" = d."projectId"
    WHERE d."projectId" IS NULL OR d."projectId" = ''   -- account-level admin, all time
       OR a.s IS NULL                                    -- project absent from accds (defensive)
       OR d."createdAt" < a.s                            -- pre-accds backfill
    GROUP BY 1, 2
) u
GROUP BY pid, action
```
Project name resolved in JS via `accDcProject` (`projectId = ''` → `"Account-level"`),
exactly as today. `classifyActivity(rawAction)` is unchanged; account-level admin rows
classify into the existing **Admin Actions** module.

**`lib/server/activityByActorView.ts`** → `ActivityActorRow { projectId, projectName, userEmail, userName, count }`

```sql
SELECT pid AS "projectId", email AS "userEmail", SUM(c)::int AS count
FROM (
  SELECT "projectId" AS pid, "userEmail" AS email, COUNT(*)::int AS c
    FROM "AccActivityAccds" WHERE "userEmail" IS NOT NULL GROUP BY 1, 2
  UNION ALL
  SELECT d."projectId" AS pid, d."userEmail" AS email, COUNT(*)::int AS c
    FROM "AccActivity" d
    LEFT JOIN astart a ON a."projectId" = d."projectId"
    WHERE d."projectId" IS NOT NULL AND d."projectId" <> ''
      AND d."userEmail" IS NOT NULL
      AND (a.s IS NULL OR d."createdAt" < a.s)           -- pre-accds backfill only
    GROUP BY 1, 2
) u
GROUP BY pid, email
```
Account-level rows are excluded (no project → no role), matching today's behavior.
Display names stay resolved via the `AccDcUser` lookup (a superset that also covers
backfill-era users who may not appear in accds), falling back to the email.

**`lib/server/activityTimelineView.ts`** → `ActivityTimelineRow { projectId, projectName, month, count }`
(already raw SQL; add the CTE + UNION)

```sql
SELECT pid AS "projectId", month, SUM(c)::int AS count
FROM (
  SELECT "projectId" AS pid, to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, COUNT(*)::int AS c
    FROM "AccActivityAccds" GROUP BY 1, 2
  UNION ALL
  SELECT COALESCE(NULLIF(d."projectId", ''), '') AS pid, to_char(date_trunc('month', d."createdAt"), 'YYYY-MM') AS month, COUNT(*)::int AS c
    FROM "AccActivity" d
    LEFT JOIN astart a ON a."projectId" = d."projectId"
    WHERE d."projectId" IS NULL OR d."projectId" = ''
       OR a.s IS NULL
       OR d."createdAt" < a.s
    GROUP BY 1, 2
) u
GROUP BY pid, month
```
Project name resolved as today. The backfill restores the full **Dec 2024 → today** span
and the **Account-level** pseudo-project.

### Page & client — unchanged

`app/(dashboard)/access-analysis/page.tsx` keeps the identical loader calls and the same
props into `AccessAnalysisCharts`. The client component, the three pure summarizers
(`summarizeActivityTimeline`, `summarizeActivityByRole`, `summarizeModules`), and the
chart components are untouched — they consume the same row shapes. Because the merge
restores the full date span and the Account-level slice, the page reads the same as
today; only the underlying numbers change (recent year now backed by fuller accds data).
The "across all years" timeline caption stays accurate.

## Why no `source` parameter

There is exactly one dataset. Threading a `source` arg would model a choice that does not
exist and invite the very toggle the owner rejected. The merge is the view's definition,
not a mode.

## Testing & verification

The views are thin DB-bound `server-only` modules with no existing unit tests; the logic
that *does* have tests (the pure summarizers and chart components) is unchanged and must
stay green. Verification is therefore real-data + suite-level:

1. **Existing unit suite green** — summarizers, chart components, and `page.test.tsx`
   (which mocks the three loaders) pass unchanged.
2. **No double-count / no gap** — a parity script confirms the unified per-project totals
   equal `accds(all) + DC(createdAt < per-project accds-start)`, and that the overlap
   (1.035M DC rows) is excluded.
3. **Late-start project spot-check** — pick a project whose accds starts ~Oct 2025;
   confirm its timeline shows DC filling Jun–Sep 2025 and accds from Oct 2025 on, with no
   duplicated or missing month.
4. **Account-level restored** — the "Account-level" project reappears in the picker and
   the timeline; the module donut shows an Admin Actions slice.
5. **Unmapped stays small** — the module donut's "Unmapped" catch-all slice is a small
   fraction of total volume for accds verbs (sanity on classification coverage).
6. **Visual UAT** after rebuild (owner's standard pattern).

## Deploy

Ships by rebuild, not a git deploy-branch merge: `NEXT_DIST_DIR=.next-new npm run build`
→ swap `.next` → restart `npm start` (per the local Task-Scheduler deploy mechanism).
Do not `npm run build` against the running `:3000` dist.

## Out of scope / non-goals

- No change to the accds crawler, ingest, or schema.
- No change to non-activity panels (Role distribution, Folder terrain, Model Coordination).
- No retirement/deletion of the `AccActivity` table or its ingest — DC remains as the
  backfill/admin source under the hood.
- No historical role attribution: backfill activity is attributed to each actor's
  *current* membership role, exactly as the donut does today.
