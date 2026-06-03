# Phase 01 Implementation Handoff: ACC v2.0 Foundation

**Audience:** Claude Code implementing the next Phase 01 plans.
**Status:** Implementation-ready Markdown handoff.
**Scope:** Phase 01 plans `01-03` and `01-04` only.
**Last updated:** 2026-05-11.

## Goal

Implement the backend-only sync orchestration shell and sync freshness indicator for v2.0 ACC Extraction Completion.

Phase 01 does not implement real ACC extraction bodies. It establishes the deployment/cron shell, persistent status tables, alerting, and sidebar freshness visibility so later phases can fill in extraction and activity import logic.

## Non-Negotiable Scope

- Do not add Quick Sync or Deep Sync trigger buttons to the app.
- Do not add a sync status page, dashboard tab, or new view.
- Do not implement Phase 02 member/project/role extraction in this phase.
- Do not implement Phase 03 Data Connector ZIP download or CSV ingestion in this phase.
- Do not remove or rewrite existing v1.0 `accMemberCache` behavior.
- Do not touch unrelated dirty files. At handoff time, the workspace already had unrelated modifications in `.claude/settings.local.json` and `components/layout/SyncFreshnessPill.tsx`, plus untracked screenshots/logs.

## Current Source Of Truth

Read these files in this order before coding:

1. `.planning/STATE.md`
2. `.planning/REQUIREMENTS.md`
3. `.planning/ROADMAP.md`
4. `.planning/phases/01-foundation-schema-sync/01-CONTEXT.md`
5. `.planning/phases/01-foundation-schema-sync/01-RESEARCH.md`
6. `.planning/phases/01-foundation-schema-sync/01-01-SUMMARY.md`
7. `.planning/phases/01-foundation-schema-sync/01-02-SUMMARY.md`
8. `.planning/phases/01-foundation-schema-sync/01-03-PLAN.md`
9. `.planning/phases/01-foundation-schema-sync/01-04-PLAN.md`

If these files disagree, prefer this handoff plus `01-CONTEXT.md` over older wording in `REQUIREMENTS.md`.

## External Docs To Recheck Before Editing

The local plans were written with older Railway terminology. Before editing `railway.toml`, verify current Railway docs:

- Railway Pre-Deploy Command: https://docs.railway.com/deployments/pre-deploy-command
- Railway cron jobs: https://docs.railway.com/reference/cron-jobs
- Railway config-as-code reference: https://docs.railway.com/config-as-code/reference
- Prisma index sort support: https://docs.prisma.io/docs/orm/prisma-schema/data-model/indexes
- APS activity/Data Connector background: https://aps.autodesk.com/blog/accbim-360-insight-data-connector-api-supports-activities

Important Railway correction:

- The docs currently call this a **Pre-Deploy Command**, not a generic `releaseCommand`.
- Do not blindly add `releaseCommand = "node scripts/release.cjs"` unless the current Railway config reference still accepts that exact key.
- If the current accepted key is `preDeployCommand`, use `preDeployCommand = "node scripts/release.cjs"` and document the deviation in `01-03-SUMMARY.md`.
- The command must run after build and before the app starts. Non-zero exit must fail the deploy.

Important cron correction:

- Railway cron schedules are UTC.
- The target schedule is `0 9 * * *`, which is 09:00 UTC / 02:00 Hermosillo.
- Cron jobs must exit cleanly. Close Prisma/DB connections before exit.
- Railway may not start a new cron execution if the previous execution is still active. The app-level overlap guard is still required because APS job state is persisted in Postgres and must be explicit.

## Required Implementation Outcome

### Plan 01-03: Backend Sync Orchestration Shell

Implement these files only for this plan:

- `railway.toml`
- `scripts/release.cjs`
- `scripts/deep-sync.cjs`
- `lib/server/email.ts`
- `lib/server/acc-admin.ts`
- `docs/CRON_SETUP.md`

Expected behavior:

- Deploy/pre-deploy command runs `npx prisma migrate deploy`.
- After migration, Quick Sync shell runs with a hard 5-minute timeout.
- Quick Sync shell writes `SyncMeta` row `id = "quick"` on success and failure.
- Quick Sync failure sends a best-effort alert email to `luis.ecorteg@gmail.com` and exits non-zero.
- Migration failure exits non-zero without trying to send alert email.
- Deep Sync cron script checks `AccDataConnectorJob` for `pending` or `running` rows before submitting anything.
- If a job is in flight, Deep Sync writes `SyncMeta("deep")` with `lastStatus = "skipped"` and exits `0`.
- If no job is in flight, Deep Sync obtains an Autodesk 2-legged token with `account:read data:read data:create`, submits a Data Connector request, creates an `AccDataConnectorJob` row with `status = "pending"`, and writes `SyncMeta("deep")` success.
- Deep Sync failure writes `SyncMeta("deep")` failed, sends best-effort alert email, and exits non-zero.
- Both scripts are pure CommonJS. Do not import TypeScript files or `@/` aliases from the scripts.

### Plan 01-04: Sidebar Sync Freshness

Implement these files only for this plan:

- `server/routers/acc-sync.ts`
- `server/routers/root.ts`
- `components/layout/SyncFreshnessPill.tsx`
- `components/layout/Sidebar.tsx`

Expected behavior:

- `accSync.getSyncFreshness` reads only persistent Postgres state: `SyncMeta` and latest successful `AccDataConnectorJob`.
- `accSync.getActiveDeepSyncJob` returns the latest `pending` or `running` deep sync job.
- The sidebar bottom area shows an unobtrusive expanded label such as `Last synced: 2h ago`.
- Collapsed sidebar shows only a colored dot with a `title` tooltip.
- States are distinguishable: never synced, success, failed, skipped, deep sync active.
- When a deep sync is active, the client polls in the 5-30 second range; default is 15 seconds.
- Idle polling can be slower; default is 5 minutes.
- Status must survive server restart because it is read from Postgres, not memory.

## Implementation Details Claude Must Preserve

### Prisma Client In CJS Scripts

Use the repo's existing Prisma 7 pattern. Inspect `server/db.ts`, generated Prisma client output, and current scripts before choosing the exact constructor. Do not invent a second database stack.

If the repo requires `@prisma/adapter-pg`, use the same adapter pattern as the app. Always call `await prisma.$disconnect()` in `finally`.

### Data Connector Request

The Phase 01 Deep Sync script submits only the request. It does not poll for completion or download results.

Request shape:

```json
{
  "description": "LECG Dashboard nightly ACC activity export",
  "isActive": true,
  "scheduleInterval": "ONE_TIME",
  "serviceGroups": ["activities", "admin"],
  "dateRange": "PAST_7_DAYS"
}
```

Persist the APS response id as `AccDataConnectorJob.requestId`. If the response shape differs, fail loudly with the response body in `lastError`.

### Alert Email

`lib/server/email.ts` already has the app email transport. Add:

```ts
export async function sendSyncFailureAlert(opts: {
  syncType: "quick" | "deep";
  timestamp: string;
  errorMessage: string;
  jobId?: string;
}): Promise<void>
```

The helper must catch its own errors and never throw to callers already handling sync failure.

The CJS scripts cannot safely import that TypeScript helper. Implement a small inline Resend sender inside each script or share a CJS-only helper if you create one under `scripts/`. If `RESEND_API_KEY` is missing, log a warning and continue.

### Account ID Handling

- `getAccountId(db)` strips the leading `b.` for Construction Admin / HQ APIs.
- `getProjectIdForDM(rawId)` preserves the leading `b.` for Data Management.
- In `scripts/deep-sync.cjs`, it is acceptable to duplicate the tiny `b.` strip inline because importing TS helpers from CJS is intentionally avoided. Document this in `01-03-SUMMARY.md`.

### UI Placement

Mount the freshness pill in the existing sidebar bottom chrome, above the collapse button. Do not create a dashboard footer if one does not already exist.

Respect the sidebar's actual collapsed state variable. Do not guess a prop name until `components/layout/Sidebar.tsx` has been inspected.

## Verification Commands

Run these before claiming completion:

```powershell
npx tsc --noEmit
npm run build
```

For Plan 01-03 also run syntax/load checks that do not accidentally execute production sync against APS unless explicitly intended:

```powershell
node --check scripts/release.cjs
node --check scripts/deep-sync.cjs
Select-String -Path railway.toml -Pattern "preDeployCommand|releaseCommand"
Select-String -Path docs/CRON_SETUP.md -Pattern "0 9 \* \* \*"
```

For Plan 01-04 also verify registrations:

```powershell
Select-String -Path server/routers/root.ts -Pattern "accSync"
Select-String -Path components/layout/Sidebar.tsx -Pattern "SyncFreshnessPill"
```

Manual/local checks:

- Run the release script only against a safe local/dev database.
- Confirm `SyncMeta("quick")` is written.
- Insert a fake `AccDataConnectorJob` with `status = "pending"` and confirm `scripts/deep-sync.cjs` skips instead of submitting a new APS request.
- Confirm the fake row is removed after testing.
- In the browser, check expanded and collapsed sidebar states.
- Simulate failed and skipped statuses in the DB and verify the pill changes state.
- Restart the dev server and confirm the pill still shows the same persisted state.

Production/Railway checks:

- Confirm deploy/pre-deploy command appears in Railway logs before the app start command.
- Confirm non-zero exit fails deploy in a controlled test only if safe.
- Configure Railway cron manually in the Railway dashboard.
- Confirm cron command is `node scripts/deep-sync.cjs`.
- Confirm cron schedule is `0 9 * * *`.

## Summary Files Required After Implementation

Create or update:

- `.planning/phases/01-foundation-schema-sync/01-03-SUMMARY.md`
- `.planning/phases/01-foundation-schema-sync/01-04-SUMMARY.md`

Each summary must include:

- Exact Railway config key used (`preDeployCommand` or `releaseCommand`) and why.
- Verification commands run and results.
- Whether local Resend alerting was actually tested.
- Whether Railway cron was configured in the dashboard.
- Any deviations from the plan.
- Any user/manual verification still pending.

## Common Failure Modes

- Using stale `releaseCommand` terminology without verifying Railway accepts it.
- Importing TypeScript app modules from `.cjs` scripts and failing in Railway.
- Forgetting `data:create` in the Autodesk token scope.
- Leaving Prisma connections open in cron jobs.
- Running Deep Sync without the in-flight job guard.
- Eager-loading last file activity into `BulkAccUser` during Phase 01 or Phase 03 planning. It must stay lazy per requirements.
- Adding new UI surfaces despite the no-new-tabs/no-new-pages rule.
- Editing unrelated dirty code while trying to update docs.

## Acceptance Criteria

Phase 01 is complete only when:

- Plan 01-03 and 01-04 implementation is finished.
- TypeScript and production build pass.
- Local DB checks prove `SyncMeta` and `AccDataConnectorJob` behavior.
- Sidebar freshness survives a dev server restart.
- Railway deploy/pre-deploy behavior is verified in logs.
- Cron is configured or explicitly marked as user-pending.
- Summary files document evidence and deviations.
