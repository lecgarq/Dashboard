---
phase: 01-foundation-schema-sync
plan: 03
subsystem: infra
tags: [railway, cron, prisma, resend, aps, data-connector, sync-orchestration]

requires:
  - phase: 01-foundation-schema-sync (01-01)
    provides: SyncMeta + AccDataConnectorJob Prisma models that this orchestration writes to
  - phase: 01-foundation-schema-sync (01-02)
    provides: shared getAccountId / acc-helpers (TS callers); CJS scripts re-implement the b. strip inline
provides:
  - Railway release-command runs prisma migrate deploy + Quick Sync shell with 5-min hard timeout
  - Nightly Deep Sync cron entry point with AccDataConnectorJob overlap guard + APS Data Connector submission
  - sendSyncFailureAlert helper (Resend / Gmail fallback) for TS callers; CJS scripts use raw-fetch Resend inline
  - Autodesk 2-legged token scope extended with data:create (required by Data Connector POST /requests)
  - docs/CRON_SETUP.md non-technical Railway cron setup guide for Luis
  - Manual ACC sync surfaces removed from dashboard (release-driven sync is now the only path)
  - Auto-rebuild of ACC graph cache on every Railway release (recoverable step)
affects: [phase 2 (real Quick Sync extraction), phase 3 (Data Connector ZIP download), 01-04 (sidebar freshness pill)]

tech-stack:
  added:
    - tsx (runtime dep, for scripts/rebuild-graph.ts execution under Railway release step)
  patterns:
    - "Pure CJS orchestration scripts: scripts/release.cjs and scripts/deep-sync.cjs avoid TS imports + @/ aliases (RESEARCH Pitfall 1)"
    - "Inline raw-fetch Resend in CJS scripts (cannot require lib/server/email.ts TS module from .cjs); sendSyncFailureAlert remains canonical for TS callers"
    - "5-minute setTimeout watchdog on Quick Sync that force-exits non-zero past the cap (CONTEXT-locked hard timeout)"
    - "AccDataConnectorJob double-submit guard checks for non-terminal {pending,running} rows before submitting; logs lastStatus='skipped' and exits 0"
    - "Best-effort SyncMeta upsert wrapped in try/catch on failure paths so DB-error sites don't mask the original throw"
    - "Recoverable post-migration steps (e.g. graph rebuild) log + continue rather than failing the deploy"

key-files:
  created:
    - scripts/release.cjs
    - scripts/deep-sync.cjs
    - scripts/rebuild-graph.ts
    - lib/server/graph-rebuild.ts
    - docs/CRON_SETUP.md
  modified:
    - lib/server/email.ts
    - lib/server/aps-user-token.ts
    - railway.toml
    - package.json
    - package-lock.json
    - server/routers/users.ts
    - app/(dashboard)/users/AccUsersGraph.tsx
    - app/(dashboard)/users/AccAnalysisPanel.tsx
    - app/(dashboard)/users/UsersDirectoryClient.tsx

key-decisions:
  - "Used releaseCommand in railway.toml (Railway still accepts it for this project) rather than preDeployCommand; behaviour identical — runs after build, before container serves traffic, non-zero fails deploy"
  - "Option A (pure CJS, no TS import) confirmed for release + deep-sync scripts — avoids --experimental-transform-types and @/ alias resolution outside Next.js context"
  - "CJS deep-sync.cjs duplicates the b. strip inline (3 lines) — Plan 02 getAccountId remains canonical for TS callers; deliberate dual-implementation"
  - "Token scope expanded to account:read data:read data:create (data:create needed by Data Connector POST /requests, RESEARCH Pitfall 7)"
  - "Manual ACC sync UI surfaces (Sync All button, Refresh button, stale-cache overlay) removed — release-driven Quick Sync is the only sync path going forward (CONTEXT scope amendment)"
  - "ACC graph cache rebuild wired as recoverable step 3 of scripts/release.cjs — a rebuild failure logs and continues rather than blocking deploy (cache freshness is non-critical for serving traffic)"

patterns-established:
  - "CJS-from-TS bridge: TS exports an SDK-flavoured helper (sendSyncFailureAlert); CJS callers duplicate minimally via raw fetch with shared env vars (RESEND_API_KEY, RESEND_FROM)"
  - "Failure-path layering: try-write SyncMeta → try-send alert → exit 1 — every layer wrapped in catch to prevent secondary failures masking root cause"

requirements-completed: [SYNC-01, SYNC-02, SYNC-04]

duration: ~2h (including scope additions + human-verify window)
completed: 2026-05-11
---

# Phase 1 Plan 3: Sync Orchestration Shell Summary

**Railway release-command runs `prisma migrate deploy` + Quick Sync shell + graph cache rebuild with 5-minute hard timeout; nightly Deep Sync cron submits APS Data Connector jobs with `AccDataConnectorJob` overlap guard and email alerts on failure.**

## Performance

- **Duration:** ~2h (3 implementation tasks + 3 mid-flight scope-addition commits + human-verify window)
- **Tasks:** 4 (3 auto + 1 human-verify)
- **Files modified/created:** 14
- **Commits:** 6 task/scope commits + 1 metadata commit

## Accomplishments

- **SYNC-01 (Quick Sync shell):** `scripts/release.cjs` wired as Railway `releaseCommand`. Runs migrations → Quick Sync placeholder body (writes `SyncMeta('quick')`) → graph cache rebuild. 5-minute watchdog hard-exits on overrun.
- **SYNC-02 (Deep Sync shell):** `scripts/deep-sync.cjs` configured for Railway cron at `0 9 * * *`. Submits Data Connector job, persists `AccDataConnectorJob('pending')` row, writes `SyncMeta('deep')`.
- **SYNC-04 (double-submit guard + failure alerting):** Deep Sync short-circuits with `lastStatus="skipped"` when a non-terminal `AccDataConnectorJob` row exists. Both scripts send Resend alert email to luis.ecorteg@gmail.com on failure via inline raw-fetch.
- **Autodesk scope extension:** `data:create` added to 2-legged token scope (required for Data Connector POST /requests).
- **Cron setup doc:** `docs/CRON_SETUP.md` is non-technical step-by-step for Railway dashboard cron configuration.
- **Manual sync UI removed:** ACC dashboard no longer exposes user-triggered sync buttons (CONTEXT scope amendment — release-driven sync is the only path).
- **Auto graph-cache rebuild:** Wired as recoverable step 3 of release script; failure logs and continues without blocking deploy.

## Task Commits

| Task | Description                                                                                   | Commit    |
|------|-----------------------------------------------------------------------------------------------|-----------|
| 1    | `feat(01-03): add sendSyncFailureAlert + data:create scope`                                   | `6f50630` |
| 2    | `feat(01-03): add Railway release command for Quick Sync shell`                               | `7a6b683` |
| 3    | `feat(01-03): add Deep Sync cron entry point + Railway cron setup docs`                       | `8097ae9` |
| —    | `feat(ui): hide manual ACC sync surfaces from dashboard` *(mid-flight scope addition)*        | `0f22e8b` |
| —    | `refactor: extract rebuildAccGraphCache into lib/server/graph-rebuild` *(scope addition)*    | `d095c56` |
| —    | `feat(01-03): auto-rebuild ACC graph cache on Railway release` *(scope addition)*             | `1561b9d` |

**Plan metadata commit:** see final `docs(01-03): complete sync orchestration plan` commit.

## Files Created/Modified

- `scripts/release.cjs` — Railway release entry. spawnSync prisma migrate deploy → Quick Sync shell (SyncMeta upsert) → graph rebuild → exit. 5-min watchdog.
- `scripts/deep-sync.cjs` — Cron entry. Overlap guard, 2-legged token fetch, Data Connector POST, AccDataConnectorJob persistence, SyncMeta upsert, Resend alert on failure.
- `scripts/rebuild-graph.ts` — tsx-executed entry that invokes lib/server/graph-rebuild.ts.
- `lib/server/graph-rebuild.ts` — shared rebuildAccGraphCache extracted from server/routers/users.ts.
- `lib/server/email.ts` — sendSyncFailureAlert(opts) appended (typed wrapper over existing sendEmail).
- `lib/server/aps-user-token.ts` — scope string now `account:read data:read data:create`.
- `docs/CRON_SETUP.md` — non-technical Railway cron setup walkthrough.
- `railway.toml` — added `releaseCommand = "node scripts/release.cjs"`.
- `app/(dashboard)/users/AccUsersGraph.tsx`, `AccAnalysisPanel.tsx`, `UsersDirectoryClient.tsx` — removed Sync All / Refresh buttons and stale-cache overlay.
- `package.json` / `package-lock.json` — tsx added as runtime dep.
- `server/routers/users.ts` — graph rebuild logic moved into lib/server/graph-rebuild.ts; router now imports it.

## Decisions Made

1. **`releaseCommand` over `preDeployCommand`:** Existing `railway.toml` already used `[deploy]` block conventions; `releaseCommand` is still accepted by current Railway config-as-code for this project. Behavior is identical — non-zero fails the deploy. Documented per plan's `<critical_addendum>` request.
2. **Pure CJS scripts (Option A):** No TS imports, no `@/` aliases. Prisma instantiated via `require("@prisma/client") + require("@prisma/adapter-pg")`. Avoids Node 22's experimental `--experimental-transform-types` flag.
3. **Inline `b.` strip in deep-sync.cjs:** Plan 02's `getAccountId` helper remains canonical for TS callers; the 3-line duplication in the CJS script is deliberate and noted as a dual-implementation. If a third caller emerges, lift to a shared `.cjs` helper.
4. **Email-failure path tested live:** No — `RESEND_API_KEY` is set on Railway but not in local dev env at human-verify time; the failure-path code was code-walked and exit-status verified instead. (Documented per plan output spec.)
5. **Scope amendment surface (REQUIREMENTS.md vs CONTEXT.md):** REQUIREMENTS.md SYNC-01..04 still describes UI-triggered flows. Phase 1 implementation is backend-only per CONTEXT.md "Major scope amendment" block. The REQUIREMENTS.md text was NOT rewritten — the amendment comment block at the top of the Sync Orchestration section in REQUIREMENTS.md is the canonical reconciliation note. Future v2.x WRITE/real-time milestone can revisit user-trigger UI if desired.
6. **Cron configured in Railway dashboard:** User-approved at human-verify; per user "approved" reply, treating as confirmed.

## Deviations from Plan

### Mid-flight scope additions (orchestrator-directed, outside original task list)

These were added during/around the human-verify window because they form the natural completion of the release-driven sync story. They are documented here rather than under the deviation rules because they were directed by the orchestrator, not auto-applied.

**1. [Scope addition] Hide manual ACC sync surfaces in dashboard UI**
- **Found during:** Human-verify window (post-Task 3)
- **Rationale:** With release-driven Quick Sync in place, the Sync All button, Refresh button, and stale-cache overlay in AccUsersGraph contradict the new model and would invite double-sync. CONTEXT scope amendment confirms backend-only sync.
- **Files modified:** `AccUsersGraph.tsx`, `AccAnalysisPanel.tsx`, `UsersDirectoryClient.tsx`
- **Commit:** `0f22e8b`

**2. [Scope addition] Extract rebuildAccGraphCache into shared module**
- **Rationale:** Needed as prerequisite to wiring graph rebuild into release script; the logic previously lived inside server/routers/users.ts and could not be invoked from a CJS entry point.
- **Files modified:** `server/routers/users.ts`, `lib/server/graph-rebuild.ts` (new)
- **Commit:** `d095c56`

**3. [Scope addition] Auto-rebuild ACC graph cache on Railway release**
- **Rationale:** With UI Refresh button gone (scope-addition #1), graph cache freshness needs an automatic trigger. Added as recoverable Step 3 of release.cjs — failure logs and continues rather than blocking deploy.
- **Files modified:** `scripts/rebuild-graph.ts` (new), `scripts/release.cjs`, `package.json`, `package-lock.json` (tsx added as runtime dep)
- **Commit:** `1561b9d`

### Auto-fixed Issues

None during the original 3 tasks — plan executed as written.

---

**Total deviations:** 3 mid-flight scope additions (all orchestrator-directed, complementary to original plan scope). 0 auto-fixes under Rules 1-3. 0 architectural Rule-4 escalations.
**Impact on plan:** Net-positive — the additions close the manual-UI feedback loop and add automated graph-cache rebuild that would otherwise have required a follow-up plan. No regression in original 3-task scope.

## Authentication Gates

None during execution. The Resend API key check happens at runtime in production; local dev does not have `RESEND_API_KEY` set, which is why the live email-failure path was not exercised end-to-end (see Decision 4 above).

## Issues Encountered

None blocking. One open item documented below.

## Open Items

- **Live email-failure-path test:** Not exercised at human-verify time because local env lacks `RESEND_API_KEY`. Code-walked + exit-status-verified only. Will be implicitly validated on first real Quick Sync or Deep Sync production failure.
- **Cron in Railway dashboard:** User said "approved" — taking this as confirmation the cron is configured per `docs/CRON_SETUP.md`. If first-run logs at next 09:00 UTC do not show `[deep-sync] Job submitted: req_...`, revisit the dashboard cron config.

## User Setup Required

The plan's frontmatter declares a `user_setup` step (Railway cron job). Per the user's "approved" reply, this is treated as complete. If a separate `01-USER-SETUP.md` is desired for the phase rollup, it can be generated when the phase concludes (Plan 01-04 is still outstanding).

## Next Phase Readiness

- Plan 01-04 (accSync tRPC router + Sidebar freshness pill) is the remaining Phase 1 plan. The sidebar freshness pill (commit `19332aa`) and accSync router (commit `49de888`) already appear in the deploy branch — Plan 01-04 work is in progress / partially shipped and will be summarised under its own SUMMARY.
- Phase 2 (Core Extraction) can begin once 01-04 is closed. The Quick Sync placeholder body in `scripts/release.cjs` is the seam Phase 2 plans will fill in with real per-project extraction.

---
*Phase: 01-foundation-schema-sync*
*Completed: 2026-05-11*

## Self-Check: PASSED

- All 6 declared key-files present on disk (release.cjs, deep-sync.cjs, rebuild-graph.ts, graph-rebuild.ts, CRON_SETUP.md, this SUMMARY)
- All 6 declared commit hashes resolve in `git log --all` (6f50630, 7a6b683, 8097ae9, 0f22e8b, d095c56, 1561b9d)
