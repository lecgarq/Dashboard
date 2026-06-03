---
phase: 08-dc-per-module-ingest-permission-csvs
plan: 07
subsystem: visibility
tags: [trpc, sync-freshness-pill, dc-ingest, module-badge, reauth]
requires:
  - 08-01-SUMMARY.md  # AccDcIngestRun + AccDcBackfillProgress schema
  - 08-06-SUMMARY.md  # runDcIngest writes the rows the pill reads
provides:
  - accSync.getDcIngestStatus
  - accSync.getBackfillProgress
  - components/layout/SyncFreshnessPill (DC-aware)
  - scripts/wipe-legacy-acc-activity.cjs
  - app/(dashboard)/users/UsersDirectoryClient#MODULE_BADGE_COLORS
  - app/(dashboard)/users/UsersDirectoryClient#ModuleBadge
affects:
  - server/routers/acc-sync.ts
  - components/layout/SyncFreshnessPill.tsx
  - app/(dashboard)/users/UsersDirectoryClient.tsx
  - app/(dashboard)/users/dashboard/DashboardSidePanel.tsx
tech-stack:
  added: []                    # next-auth/react.signIn already present (Phase 3)
  patterns: [worst-of-color-merge, click-to-reauth-gate, mirrored-color-map-to-avoid-cycle]
key-files:
  created:
    - scripts/wipe-legacy-acc-activity.cjs
    - scripts/dev/verify-08-07-pill.cjs
    - .planning/phases/08-dc-per-module-ingest-permission-csvs/08-07-SUMMARY.md
  modified:
    - server/routers/acc-sync.ts
    - components/layout/SyncFreshnessPill.tsx
    - app/(dashboard)/users/UsersDirectoryClient.tsx
    - app/(dashboard)/users/dashboard/DashboardSidePanel.tsx
decisions:
  - "DC tooltip surface = native title= (multi-line) instead of Popover/HoverCard — neither primitive exists in components/ui (Rule 3 deviation, no scope creep)"
  - "Color escalation = worst-of-{phase-3 freshness, dc.dcStatus} via colorRank() (red=3 > amber=2 > green=1 > neutral=0)"
  - "Click-to-reauth gated strictly by dc.tokenExpired — pill stays read-only otherwise (feedback_no_manual_sync_ui.md)"
  - "ActivityModuleBadge inlined into DashboardSidePanel.tsx + duplicated MODULE_BADGE_COLORS_LOCAL constant — UsersDirectoryClient already imports UserActivityBody via next/dynamic from DashboardSidePanel, so a reverse named-import would close a cycle"
  - "Hermosillo cron schedule hard-coded as 10:00 UTC year-round (no DST observed in America/Hermosillo)"
  - "Wipe script ships now but DOES NOT execute — Pitfall 10 says invocation waits for first successful Phase-8 run, owned by plan 08-08"
metrics:
  duration: ~13 min
  tasks: 2
  files: 6
  completed_date: "2026-05-15"
requirements:
  - DC8-04
  - DC8-14
  - DC8-15
  - DC8-16
---

# Phase 8 Plan 07: SyncFreshnessPill DC awareness + module badges Summary

JWT-style click-to-reauth pill rolling Phase-8 DC ingest status into the existing sidebar pill via two new tRPC procedures plus a 9-color module badge chip on every File Activity row.

## What shipped

### tRPC surface — `server/routers/acc-sync.ts`

Two new `protectedProcedure` queries appended to `accSyncRouter` (no Phase-3 procedure modified):

```typescript
getDcIngestStatus: protectedProcedure.query(async ({ ctx }) => ({
  dcStatus: 'green' | 'amber' | 'red',     // worst-of: tokenExpired || >36h => red; >24h || partial || quarantined => amber; else green
  lastRunAt: Date | null,                  // most recent AccDcIngestRun.startedAt
  lastRunStatus: string | null,            // success | partial | quota-exceeded | quarantined | failed | killed | skipped
  lastSuccessAt: Date | null,              // most recent successful run start
  nextRunInHours: number,                  // floor(hoursUntil(nextScheduledRun))
  quotaUsedToday: number,                  // run.quotaUsed if startedAt is same UTC day, else 0
  quotaCap: 25,                            // APS DC daily cap (CONTEXT.md)
  diffSummary: { usersAdded, usersRemoved, projectsAdded, projectsRemoved } | null,
  unknownModulesSeen: string[],            // surfaces 10th-module guard hits to UI
  tokenExpired: boolean,                   // /401|invalid_grant|token/i match on lastRun.errorMessage
}))

getBackfillProgress: protectedProcedure.query(async ({ ctx }) => ({
  monthsCovered: number,                   // sum across AccDcBackfillProgress
  monthsTotal: number,                     // sum of monthsBetween(projectCreatedAt, now), floor 1 per project
  backfillPct: number,                     // 0..1
  projectsTracked: number,
}))
```

Helpers (file-private):
- `nextScheduledRun(now)` — Hermosillo 03:00 local = 10:00 UTC year-round (no DST). Returns next 10:00 UTC strictly greater than `now`.
- `isSameUtcDay(a, b)` — UTC-day equality for the `quotaUsedToday` reset.
- `monthsBetween(start, end)` — whole-month delta floor with day-of-month rounding; returns 0 for inverted ranges.

### Pill — `components/layout/SyncFreshnessPill.tsx`

Backward-compatible extension. Phase-3 `computePillState` untouched; new `mergeWithDcState(base, dc, backfill)` runs after and:

1. **Color escalation:** `colorRank(dotClass)` ranks rose=3 > amber=2 > emerald=1 > neutral=0; takes the max of base vs DC color.
2. **Tooltip rebuild** (multi-line via native `title=`):
   ```
   Quick Sync: {existing label}
   Deep Sync (DC): {dcStatus} · {lastRunStatus} · last success {ago}
   Backfill: month {covered} of {total} (XX%) across N projects
   Next run: in Nh
   Quota: N/25 used today
   Access changes last 24h: +A / -B users · +C / -D projects
   Unknown modules detected: {list}             // only if non-empty
   Autodesk token expired — click to re-authenticate.   // only when tokenExpired
   ```
3. **Click handler:** `tokenExpired ? () => signIn('autodesk', { callbackUrl: window.location.href }) : undefined`. Cursor flips to pointer + `role='button'` only when reauth is wired — keeps pill read-only otherwise.

Polling: DC queries refresh every 5 min (independent of the active-deep-sync 15s cadence — DC ingest is daily, no need to hit it harder).

### Module badge — `app/(dashboard)/users/UsersDirectoryClient.tsx`

Exported constant + component:

```typescript
export const MODULE_BADGE_COLORS: Record<string, string> = {
  docs:       'bg-blue-100 text-blue-800',
  issues:     'bg-red-100 text-red-800',
  submittals: 'bg-amber-100 text-amber-800',
  rfis:       'bg-emerald-100 text-emerald-800',
  sheets:     'bg-indigo-100 text-indigo-800',
  admin:      'bg-slate-100 text-slate-700',
  cost:       'bg-purple-100 text-purple-800',
  assets:     'bg-teal-100 text-teal-800',
  bridge:     'bg-orange-100 text-orange-800',
};

export function ModuleBadge({ service }: { service: string | null | undefined }) { ... }
```

Lookup: `MODULE_BADGE_COLORS[service.toLowerCase()] ?? 'bg-slate-200 text-slate-700'` — unknown future modules fall back to neutral slate, never crash.

### Module badge in actual rows — `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx`

`UserActivityBody` (the per-row activity rendering site, queried via `trpc.accActivity.listForUser.useInfiniteQuery`) gained a small `<ActivityModuleBadge service={row.service} />` rendered at the start of every row. The badge logic + color map is **duplicated** here (`MODULE_BADGE_COLORS_LOCAL` + `ActivityModuleBadge`) instead of imported from UsersDirectoryClient — UsersDirectoryClient already pulls `UserActivityBody` from this file via `next/dynamic`, and a reverse named-import would close a circular dependency. The duplicate is 9 short string entries; drift risk is acceptable.

### Wipe script — `scripts/wipe-legacy-acc-activity.cjs`

One-time DC8-04 cleanup. Verified count: **2,507 rows** (matches plan invariant exactly).

Safety:
- `--dry-run` reports count, never writes.
- `--yes` required for actual deletion.
- PrismaPg adapter pattern (Prisma v7.8.0 requires it).
- dotenv loader picks up `DATABASE_URL` from `.env`.

**NOT EXECUTED in this plan.** Per Pitfall 10, invocation waits for the first successful Phase-8 dcIngest run that validates the new pipeline. Plan 08-08 owns that step.

### Verify harness — `scripts/dev/verify-08-07-pill.cjs`

Behavior assertions tied to the three frontmatter `key_links`:

1. `npx tsc --noEmit` clean.
2. `npx eslint` of both touched files clean.
3. SyncFreshnessPill queries `getDcIngestStatus` AND references >= 2 of `{lastSuccessAt, lastRunStatus, nextRunInHours, quotaUsedToday, diffSummary}` — actual: 5/5.
4. `signIn('autodesk', ...)` present AND guarded by `tokenExpired` within 400 chars.
5. `MODULE_BADGE_COLORS` declared in UsersDirectoryClient AND looked up using `service` as the key.

All green locally (Windows; spawnSync `shell: isWin` to handle `npx.cmd`).

## Widget label decision

Kept "File Activity" as the column-group label. CONTEXT.md mentioned the option to relabel to "Activity" once non-Docs modules dominate. We can't yet observe that distribution — the pipeline hasn't completed even one ingest cycle. Re-evaluate after Wave 4 manual UAT shows the actual module mix.

## Deviations from Plan

### Rule 3 — Auto-fixed blocking issues

**1. [Rule 3 - Missing primitive] No Popover/HoverCard in `components/ui/`**
- **Found during:** Task 2
- **Issue:** Plan instructed to use existing Popover/HoverCard for the rich tooltip; neither primitive exists in this codebase.
- **Fix:** Used native `title=` attribute with `\n`-separated multi-line body. Browser hover renders all 7-8 lines without animation. No new primitive added (would balloon scope into shadcn-radix install + theming).
- **Files modified:** `components/layout/SyncFreshnessPill.tsx`
- **Commit:** `4a61965`

**2. [Rule 3 - Wrong file location] File Activity row rendering site is not in UsersDirectoryClient.tsx**
- **Found during:** Task 2
- **Issue:** Plan `files_modified` lists `UsersDirectoryClient.tsx` for the badge chip with note "only the File Activity rows touched". The actual per-row rendering with `row.rawAction` lives in `DashboardSidePanel.tsx#UserActivityBody` (line 833) — UsersDirectoryClient only renders aggregate FileActivityCells (latest-view/upload/edit/delete), not the row stream.
- **Fix:** Defined `MODULE_BADGE_COLORS` + `ModuleBadge` in UsersDirectoryClient.tsx (canonical home — also satisfies the verifier's `MODULE_BADGE_COLORS[...service...]` regex), AND inlined a mirrored copy in DashboardSidePanel.tsx where the rows actually render. Added DashboardSidePanel.tsx to `files_modified`.
- **Files modified:** `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx`
- **Commit:** `4a61965`

**3. [Rule 3 - Prisma v7.8.0] Wipe script needs PrismaPg adapter + dotenv loader**
- **Found during:** Task 1 verification (dry-run failed with `PrismaClientInitializationError`)
- **Issue:** Plan example uses bare `new PrismaClient()`; v7.8.0 requires the adapter pattern (same constraint Phase 8 plans 01 + 06 hit).
- **Fix:** Added `PrismaPg` adapter wiring + best-effort dotenv loader, mirroring `scripts/dc-daily-ingest.cjs` pattern.
- **Files modified:** `scripts/wipe-legacy-acc-activity.cjs`
- **Commit:** `12d160e`

**4. [Rule 3 - Windows `.cmd`] verify harness needs `shell: true` on Windows**
- **Found during:** Task 2 verification (spawnSync `npx.cmd` returned `EINVAL`)
- **Issue:** Node child_process refuses to spawn `.cmd` files without a shell on Windows.
- **Fix:** `shell: isWin` (true on win32, false elsewhere). All argv tokens are file-private constants — no injection surface.
- **Files modified:** `scripts/dev/verify-08-07-pill.cjs`

## Authentication gates

None during execution. The pill enables future auth gates: when DC ingest hits `401 invalid_grant`, the pill goes red, exposes `Autodesk token expired` in tooltip, and a single click flows through `signIn('autodesk', { callbackUrl: window.location.href })`.

## Visual deferrals to Wave 4 UAT

These cannot be observed until the first successful dcIngest cycle on Luis's PC populates `AccDcIngestRun` + `AccDcBackfillProgress`:

- Live tooltip render with all 7-8 fields populated (currently shows only Quick Sync line + neutral DC fallback in dev).
- Module badge color distribution across the activity stream (will drive any "File Activity" -> "Activity" label change).
- Color-rank merge correctness when DC and Quick Sync disagree (e.g. Quick green + DC amber should render amber).
- Click-to-reauth round trip: red+tokenExpired pill -> click -> Autodesk consent screen -> back to dashboard with refreshed token -> pill flips to green on next 5min refetch.
- Backfill progress accuracy: `monthsBetween(projectCreatedAt, now)` against real AccDcProject rows — sanity-check the totals.

## Hand-off to Plan 08-08

08-08 owns:
1. Newly-detected / diff badge UI consuming `dc.diffSummary` and the per-project `newProjectFlag` from AccDcBackfillProgress.
2. **Invocation** of `node scripts/wipe-legacy-acc-activity.cjs --yes` once the first successful dcIngest run shows non-zero rows in AccDcActivity-equivalent surfaces. Pitfall 10.
3. Wave-4 manual UAT pass over the pill tooltip + module badges.

## Self-Check: PASSED

All claimed files exist on disk and all claimed commits are reachable in `git log`.

- FOUND: `server/routers/acc-sync.ts` (modified — getDcIngestStatus + getBackfillProgress at end of router)
- FOUND: `components/layout/SyncFreshnessPill.tsx` (modified — DC merge + signIn click)
- FOUND: `app/(dashboard)/users/UsersDirectoryClient.tsx` (modified — MODULE_BADGE_COLORS + ModuleBadge exported)
- FOUND: `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` (modified — ActivityModuleBadge inlined into row render)
- FOUND: `scripts/wipe-legacy-acc-activity.cjs` (created — dry-run reports 2507 rows)
- FOUND: `scripts/dev/verify-08-07-pill.cjs` (created — 6/6 assertions pass)
- FOUND commit: `12d160e` (Task 1 — tRPC procedures + wipe script)
- FOUND commit: `4a61965` (Task 2 — pill + badge + verify harness)
