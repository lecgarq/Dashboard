---
phase: 01-foundation-schema-sync
verified: 2026-05-11T10:58:00Z
status: gaps_found
score: 6/7 requirements verified (1 documentation drift)
re_verification:
  is_re_verification: false
gaps:
  - truth: "REQUIREMENTS.md SYNC-01/02/03/04 text matches the shipped architecture"
    status: partial
    reason: |
      Phase 1 ships a backend-only sync model (Quick Sync = Railway releaseCommand,
      Deep Sync = Railway cron, freshness pill = read-only). REQUIREMENTS.md still
      reads "User can trigger a Quick Sync..." / "User can trigger a Deep Sync..." /
      "UI polls a tRPC query..." for SYNC-01, SYNC-02, SYNC-03. Manual ACC sync UI
      surfaces were deliberately deleted in commit 0f22e8b. The requirement text
      describes a UI flow that intentionally does NOT exist in the codebase.
      The deferred-items note in 01-CONTEXT.md (line 101) explicitly flags this
      as a doc-drift to be rewritten; 01-03 SUMMARY decision 5 confirms the text
      was NOT amended in this phase. This is documentation drift, not implementation
      failure — backend behavior matches CONTEXT.md and shipped code matches plan.
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "SYNC-01/02/03/04 wording (lines 24-27) describes UI-triggered flows that no longer exist; the amendment note at line 22 acknowledges divergence but does not rewrite the requirement text"
    missing:
      - "Rewrite SYNC-01 to say: 'Quick Sync runs server-side as Railway releaseCommand after every deploy; dual-writes to accMemberCache during transition'"
      - "Rewrite SYNC-02 to say: 'Deep Sync runs server-side as nightly Railway cron (09:00 UTC); submits APS Data Connector job and persists state in AccDataConnectorJob'"
      - "Rewrite SYNC-03 to say: 'Sidebar SyncFreshnessPill polls accSync.getSyncFreshness/getActiveDeepSyncJob; status survives Railway container restarts (Postgres-sourced)'"
      - "Rewrite SYNC-04 to say: 'Deep Sync cron enforces overlap guard server-side (non-terminal AccDataConnectorJob check); failure reasons surfaced via Resend email alert to luis.ecorteg@gmail.com'"
      - "Update the Active Phase 01 amendment block (line 22) to mark the rewrite complete, or remove the 'two-button' header text entirely"
      - "Optional: rename 'Sync Orchestration' section description from 'Two-button sync model — REST is fast (Quick Sync), Data Connector is async (Deep Sync)' since there are no buttons"
---

# Phase 1: Foundation — Schema + Sync Orchestration Verification Report

**Phase Goal (ROADMAP.md):** Establish the relational data layer and the backend-only sync orchestration model (Quick Sync as Railway release step, Deep Sync as Railway cron — no user-trigger UI buttons per CONTEXT.md scope amendment). Every downstream phase depends on this.

**Verified:** 2026-05-11T10:58:00Z
**Status:** gaps_found (documentation drift only — implementation passes)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                          | Status     | Evidence                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 9 new Prisma models (8 ACC + SyncMeta) exist with documented composite indexes                | ✓ VERIFIED | `prisma/schema.prisma` lines 435-566 — all 9 models present; AccActivity has 3 indexes including `(autodeskId, createdAt DESC)`, `(projectId, createdAt DESC)`, `(action)` |
| 2   | Additive migration applied (0 DROPs)                                                          | ✓ VERIFIED | `prisma/migrations/20260511155810_acc_v2_foundation/migration.sql` — 9 CREATE TABLE, 2 DESC indexes, grep for DROP/ALTER DROP/RENAME → 0 matches            |
| 3   | Two projectId helpers shipped with Vitest unit tests (SCHEMA-03)                              | ✓ VERIFIED | `lib/server/acc-helpers.ts` exports `getAccountId` (strips `b.`) + `getProjectIdForDM` (preserves `b.`); 7/7 Vitest tests pass; users.ts call sites consume shared helper |
| 4   | Quick Sync runs from Railway release command + writes persistent SyncMeta                     | ✓ VERIFIED | `railway.toml` has `releaseCommand = "node scripts/release.cjs"`; release.cjs runs `prisma migrate deploy` → upserts `SyncMeta('quick')` → 5-min watchdog → graph rebuild gated by env flag |
| 5   | Deep Sync runs from cron, submits Data Connector job, persists AccDataConnectorJob            | ✓ VERIFIED | `scripts/deep-sync.cjs` POSTs to `/data-connector/v1/accounts/:id/requests`, persists `AccDataConnectorJob` row with status='pending' + requestId; docs/CRON_SETUP.md documents `0 9 * * *` schedule |
| 6   | Deep Sync status survives container restart (Postgres-sourced freshness)                      | ✓ VERIFIED | `server/routers/acc-sync.ts` queries `ctx.db.syncMeta` + `ctx.db.accDataConnectorJob` directly (no memory cache); SyncFreshnessPill mounted in Sidebar.tsx:478 with adaptive 15s/5min polling |
| 7   | Double-submit prevention enforced server-side                                                  | ✓ VERIFIED | `deep-sync.cjs:197-207` queries non-terminal AccDataConnectorJob rows before submit; logs `lastStatus='skipped'` + exits 0 when previous job is pending/running |
| 8   | REQUIREMENTS.md text matches shipped architecture                                              | ✗ FAILED   | SYNC-01/02/03/04 wording at REQUIREMENTS.md:24-27 still describes "User can trigger..." UI flows; manual UI deleted in 0f22e8b; doc rewrite explicitly deferred per 01-03 SUMMARY decision 5 |

**Score:** 7/8 truths verified (truth 8 = documentation drift, flagged by 01-03 SUMMARY decision 5 and 01-CONTEXT.md line 101 — implementation is correct, requirement text is stale)

### Required Artifacts

| Artifact                                              | Expected                                                  | Status     | Details                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                                | 9 ACC v2.0 models (8 + SyncMeta)                          | ✓ VERIFIED | 9 model blocks at lines 435, 452, 476, 487, 503, 517, 530, 545, 560                  |
| `prisma/migrations/20260511155810_acc_v2_foundation/migration.sql` | Additive DDL                              | ✓ VERIFIED | 9 CREATE TABLE, 18 CREATE INDEX, 0 DROP/RENAME                                       |
| `lib/server/acc-helpers.ts`                           | `getAccountId` + `getProjectIdForDM`                      | ✓ VERIFIED | Both exports present; plain Error throw (no @trpc/server dep) — CJS-script-importable |
| `lib/server/__tests__/acc-helpers.test.ts`            | Vitest cases                                              | ✓ VERIFIED | 7/7 passing (verified live: `npx vitest run` → 7 passed)                             |
| `server/routers/users.ts`                             | Consumes shared helper, no inline `b.` strip              | ✓ VERIFIED | Imports `getAccountId` from `@/lib/server/acc-helpers`; `resolveAccountIdForRouter` wrapper maps plain Error → TRPCError PRECONDITION_FAILED |
| `scripts/release.cjs`                                 | Railway release entry: migrate + Quick Sync + graph rebuild | ✓ VERIFIED | spawnSync prisma migrate deploy (60s) → Quick Sync NO-OP body upserting SyncMeta('quick') → 5-min watchdog → optional graph rebuild (env-gated) |
| `scripts/deep-sync.cjs`                               | Cron entry with overlap guard + Resend alert              | ✓ VERIFIED | Overlap guard checks pending/running rows; POSTs Data Connector; persists job; Resend raw-fetch alert on failure |
| `scripts/rebuild-graph.ts` + `lib/server/graph-rebuild.ts` | Shared graph rebuild extracted from users.ts         | ✓ VERIFIED | Both files exist; tsx invocation in release.cjs:194 gated by `REBUILD_ACC_GRAPH_ON_RELEASE=1` env flag (intentional) |
| `lib/server/email.ts` :: `sendSyncFailureAlert`       | Typed alert helper for TS callers                         | ✓ VERIFIED | Found at line 536; logger-wrapped, swallows secondary failures                       |
| `lib/server/aps-user-token.ts`                        | Token scope includes `data:create`                        | ✓ VERIFIED | Line 217: `scope: "account:read data:read data:create"` (required for Data Connector POST /requests) |
| `railway.toml`                                        | releaseCommand wired                                      | ✓ VERIFIED | `releaseCommand = "node scripts/release.cjs"` under `[deploy]`                       |
| `docs/CRON_SETUP.md`                                  | Non-technical Railway cron setup guide                    | ✓ VERIFIED | File exists                                                                          |
| `server/routers/acc-sync.ts`                          | `getSyncFreshness` + `getActiveDeepSyncJob`               | ✓ VERIFIED | Both `protectedProcedure` queries read Postgres directly; no in-memory cache         |
| `server/routers/root.ts`                              | accSync registered on appRouter                           | ✓ VERIFIED | Line 18 imports, line 37 registers as `accSync`                                       |
| `components/layout/SyncFreshnessPill.tsx`             | Adaptive-polling Postgres-sourced pill                    | ✓ VERIFIED | 15s active / 5min idle refetch; collapsed-mode dot; failed/skipped/success states     |
| `components/layout/Sidebar.tsx`                       | Mounts SyncFreshnessPill in bottom section                | ✓ VERIFIED | Line 16 imports, line 478 mounts inside border-t bottom div above collapse button     |
| Manual ACC sync UI surfaces                            | Removed                                                   | ✓ VERIFIED | grep for "Sync All\|stale-cache\|Refresh button\|onSyncAll" in app/(dashboard)/users → 0 matches |

### Key Link Verification

| From                            | To                                            | Via                                                    | Status  | Details                                                                  |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------------ | ------- | ------------------------------------------------------------------------ |
| `railway.toml`                  | `scripts/release.cjs`                         | `releaseCommand = "node scripts/release.cjs"`           | WIRED   | Confirmed at top of railway.toml [deploy] block                          |
| `scripts/release.cjs`           | `SyncMeta` table                              | `prisma.syncMeta.upsert({where:{id:"quick"},...})`     | WIRED   | release.cjs:105 success path, line 131 failure path                      |
| `scripts/deep-sync.cjs`         | `AccDataConnectorJob` table                   | `prisma.accDataConnectorJob.create(...)` after submit  | WIRED   | deep-sync.cjs:221 persists row with status='pending' + requestId         |
| `scripts/deep-sync.cjs`         | Overlap guard                                  | `findFirst({status:{in:["pending","running"]}})`       | WIRED   | deep-sync.cjs:197 checks before submitting                               |
| `scripts/deep-sync.cjs`         | Resend (failure alert)                        | `fetch("https://api.resend.com/emails", ...)`          | WIRED   | deep-sync.cjs:60 raw-fetch in `sendFailureAlertRaw`                      |
| `SyncFreshnessPill.tsx`         | `accSync.getSyncFreshness`                    | `trpc.accSync.getSyncFreshness.useQuery`                | WIRED   | Pill.tsx:37; adaptive refetchInterval driven by getActiveDeepSyncJob result |
| `acc-sync.ts` router            | Postgres (SyncMeta + AccDataConnectorJob)     | `ctx.db.syncMeta.findUnique` + `ctx.db.accDataConnectorJob.findFirst` | WIRED   | acc-sync.ts:14-22; no memory cache → SYNC-03 restart survival satisfied  |
| `Sidebar.tsx`                   | `SyncFreshnessPill`                            | `<SyncFreshnessPill collapsed={collapsed} />`           | WIRED   | Sidebar.tsx:478                                                          |
| `users.ts` router               | `lib/server/acc-helpers.ts :: getAccountId`   | `import { getAccountId }` + `resolveAccountIdForRouter` wrapper | WIRED   | 3 call sites converted (syncAccUser, bulkAccSync, syncHubRoles); audit grep clean |
| `scripts/release.cjs`           | `scripts/rebuild-graph.ts`                    | `spawnSync("npx", ["tsx", "scripts/rebuild-graph.ts"])` (env-gated) | WIRED   | release.cjs:194; intentional gate via `REBUILD_ACC_GRAPH_ON_RELEASE=1`   |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                       | Status     | Evidence                                                                                                                                |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| SCHEMA-01   | 01-01       | Prisma adds 7 new ACC models + AccDataConnectorJob; initial migration applied on dev + Railway                    | ✓ SATISFIED | 9 model blocks in schema.prisma (435-566); migration `20260511155810_acc_v2_foundation` exists; dev applied per SUMMARY (`prisma migrate status` clean) |
| SCHEMA-02   | 01-01       | AccActivity composite indexes from day one: `(autodeskId, created_at DESC)`, `(projectId, created_at DESC)`, `(action)` | ✓ SATISFIED | schema.prisma lines 540-542 emit all three indexes; migration.sql lines 165-168 emit `"createdAt" DESC` correctly                       |
| SCHEMA-03   | 01-02       | Two distinct projectId helpers + unit tests; existing `b.`-stripping callers audited                              | ✓ SATISFIED | `lib/server/acc-helpers.ts` exports both; 7/7 Vitest pass; audit grep `replace(/^b\./)` in server/ + lib/server/ returns only acc-helpers.ts:28 |
| SYNC-01     | 01-03       | (Per REQ text) User-triggered Quick Sync UI. **Per CONTEXT amendment:** backend-only release step                 | ⚠️ DOC DRIFT | Backend implementation satisfies the CONTEXT-amended intent (release.cjs writes SyncMeta('quick')); REQUIREMENTS.md text still describes UI flow |
| SYNC-02     | 01-03       | (Per REQ text) User-triggered Deep Sync UI returning jobId. **Per CONTEXT amendment:** Railway cron               | ⚠️ DOC DRIFT | Backend implementation satisfies amended intent (deep-sync.cjs submits + persists job); REQ text still describes UI button             |
| SYNC-03     | 01-04       | Deep Sync status visible; survives Railway container restart                                                      | ✓ SATISFIED | accSyncRouter reads Postgres directly; SyncFreshnessPill polls 15s/5min; restart-survival contract verified by code review              |
| SYNC-04     | 01-03       | Double-submit prevention + clear failure reasons                                                                  | ✓ SATISFIED | deep-sync.cjs:197-207 overlap guard; Resend alert sends sync type / timestamp / error / jobId; sendSyncFailureAlert TS helper present |

**Coverage summary:**
- Hard requirements satisfied by implementation: 7/7 (SCHEMA-01..03 + SYNC-01..04 backend behavior)
- Requirement-text drift: 4 (SYNC-01, SYNC-02, SYNC-03, SYNC-04 — texts read as UI flows; reality is backend-only)
- 01-03 SUMMARY decision 5 explicitly chose NOT to rewrite the text in this phase; the amendment block in REQUIREMENTS.md is the canonical reconciliation note
- No orphaned requirements (REQUIREMENTS.md maps SCHEMA-01..03 + SYNC-01..04 to Phase 1; all 4 plans cover all 7 IDs)

### Anti-Patterns Found

| File                          | Line | Pattern                                | Severity   | Impact                                                                              |
| ----------------------------- | ---- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `scripts/release.cjs`         | 101-123 | NO-OP Quick Sync body (just SyncMeta upsert) | ℹ️ Info     | Intentional Phase 1 shell — Phase 2 fills in real extraction; SUMMARY documents this as "the seam Phase 2 plans will fill in" |
| `scripts/deep-sync.cjs`       | 129-135 | Inline `b.` strip duplicating getAccountId  | ℹ️ Info     | Documented dual-implementation (CJS cannot require TS); 01-03 SUMMARY decision 3 explicitly notes this |
| `.planning/REQUIREMENTS.md`   | 24-27 | UI-flow wording for SYNC-01..04         | ⚠️ Warning  | Doc drift; flagged in 01-CONTEXT.md:101 and 01-03 SUMMARY decision 5 as deferred rewrite |

No 🛑 Blocker anti-patterns found. The graph-rebuild env-gating (`REBUILD_ACC_GRAPH_ON_RELEASE=1`) is intentional per the verification prompt.

### Human Verification Required

None required for Phase 1 — implementation is verifiable from code. The cron entry in Railway dashboard is the only operational item that cannot be confirmed from the repo, and the user already approved this at human-verify per 01-03 SUMMARY open items. First-run visibility will come at the next 09:00 UTC cron tick.

### Gaps Summary

**Implementation: PASSED.** All 17 declared artifacts exist on disk; all 10 key links are wired; all 17 commits referenced by SUMMARYs exist in git history; 7/7 Vitest cases pass; migration is strictly additive (0 DROPs); composite indexes shipped from day one with correct DESC ordering; manual sync UI surfaces removed per CONTEXT scope amendment; freshness pill is Postgres-sourced (SYNC-03 restart-survival contract intact); server-side overlap guard and Resend alerting are wired end-to-end (SYNC-04).

**Documentation drift: 1 gap (SYNC-01/02/03/04 requirement text).** REQUIREMENTS.md still describes UI-triggered sync flows. The shipped code is backend-only per the active CONTEXT.md scope amendment and 01-03 SUMMARY decision 5 (which explicitly chose NOT to rewrite the text in this phase, leaving the in-file amendment block as the canonical reconciliation). This is the divergence the verification prompt called out: requirement text describes user-triggered UI flows but Phase 1 shipped backend-only.

**Recommendation:** Open a small doc-only follow-up to rewrite SYNC-01..04 against the backend-only model (text drafts provided under `gaps[0].missing` in this report's frontmatter). This is not a blocker for Phase 2 — the implementation contract is correct; only the human-readable text is stale.

---

_Verified: 2026-05-11T10:58:00Z_
_Verifier: Claude (gsd-verifier)_
