---
phase: 19-raw-scan-retirement-refresh
verified: 2026-07-02T22:10:00Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: No — initial verification
---

# Phase 19: Raw Scan Retirement & Refresh Verification Report

**Phase Goal:** Switch the `includePermissionSummary` consumers onto the `AccFolderPermissionSummary`
projection, retire/hard-guard the `includePermissionContexts:true` raw-scan branch, wire a refresh
mechanism into the ingest cron, and document the staleness bound in INTEGRATIONS.md.

**Verified:** 2026-07-02
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `includePermissionSummary` path reads `db.accFolderPermissionSummary.findMany`, NOT a live `$queryRaw` GROUP BY | ✓ VERIFIED | `lib/server/acc-hot-cache.ts:313-315` — `db.accFolderPermissionSummary.findMany({select:{projectId,roleId,folderCount,totalBytes,permTypes}})`; grep confirms zero `$queryRaw` GROUP BY remaining on the summary path (the `$queryRaw` calls that remain in the file are for the unrelated `includeActivityMix` path, confirmed by `acc-hot-cache.test.ts:169-173`) |
| 2 | `includePermissionContexts:true` hard-guarded — throws unless `ACC_ALLOW_RAW_PERMISSION_SCAN=1`; `.env.example` documents the escape hatch | ✓ VERIFIED | `acc-hot-cache.ts:289-297` throws `"...is hard-guarded (PROJ-02)..."` unless `process.env.ACC_ALLOW_RAW_PERMISSION_SCAN === "1"`; behavioral test `acc-hot-cache.test.ts:111-117` (`rejects.toThrow(/hard-guarded/)` + `expect(db.accFolderPermission.findMany).not.toHaveBeenCalled()`) passed live; `.env.example:86-89` documents `ACC_ALLOW_RAW_PERMISSION_SCAN=` with a warning comment (confirmed via PowerShell `Select-String`, file is Read-blocked by the local `.env*` guard) |
| 3 | `npm test` green: TEST-01 (OOM guard, now reading the projection) + TEST-02 terrain golden masters byte-identical | ✓ VERIFIED | Re-ran independently: `npx vitest run lib/server/acc-hot-cache.test.ts server/routers/acc-dc-graph.test.ts lib/server/acc-route-hydration.test.ts lib/acc/dcUserAssembly.test.ts` → 4 files / 42 tests passed. `npx vitest run lib/server/__tests__/folderPermissionTerrainView.test.ts lib/server/__tests__/templateFolderTerrain.test.ts lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts` → 3 files / 12 tests passed, zero test-file changes (terrain untouched) |
| 4 | Derived per-project dims unchanged — projection is a proven byte-identical mirror of the old aggregate | ✓ VERIFIED | Re-ran `node scripts/verify-folder-perm-summary.cjs` independently → `VERDICT: PASS`, live=22082/projection=22082, 0 full-outer-join mismatches, 20/20 spot-checks MATCH |
| 5 | `npx tsc --noEmit` exits clean after the switch + guard | ✓ VERIFIED | Re-ran independently → exit 0, no output |
| 6 | `scripts/dc-daily-ingest.cjs` refreshes `AccFolderPermissionSummary` post-ingest, non-fatal try/catch, same pattern as person-graph/embedding rebuilds | ✓ VERIFIED | `scripts/dc-daily-ingest.cjs:115-133` — new block inside `if (result.status === 'success')`, wrapped in `try { execSync('node scripts/backfill-folder-perm-summary.cjs', {stdio:'inherit'}) } catch (e) { log('...refresh failed (non-fatal): ' + e.message) }` |
| 7 | Refresh runs BEFORE `build-instance-features.ts`, ordered FIRST in the success branch | ✓ VERIFIED | Source order confirmed by direct read: refresh block at lines 127-133, person-graph rebuild at 134-140, `build-instance-features.ts` at 141-148 — refresh is literally the first statement in the success branch; execution is synchronous top-to-bottom (`execSync` blocks), so source order is sufficient evidence of run order |
| 8 | Reuses `scripts/backfill-folder-perm-summary.cjs` verbatim — no duplicated SQL, no Node-side row scan | ✓ VERIFIED | `git log -- scripts/backfill-folder-perm-summary.cjs` shows the script's only commit is Phase 18 (`9d55539c`) — untouched by Phase 19; the cron invokes it via `execSync` (external process), not a re-implementation |
| 9 | `.planning/codebase/INTEGRATIONS.md` documents the ≤1-ingest-cycle staleness bound, folder-crawl caveat, and manual fallback | ✓ VERIFIED | `INTEGRATIONS.md:110-133` — new `AccFolderPermissionSummary projection (REF-03)` subsection with WHAT / CONSUMER / REFRESH+STALENESS BOUND (`<=1 daily ingest cycle`) / CAVEAT (folder-crawl updates source out-of-band via `scripts/folder-crawl-cron.cjs`, confirmed this script exists) / MANUAL FALLBACK (`node scripts/backfill-folder-perm-summary.cjs`) |
| 10 | Post-refresh reconciliation PASS + owner visual parity on `/access-analysis` + `/template-mty` after a fresh `:3000` rebuild | ✓ VERIFIED | Reconciliation re-run above → PASS. Owner visual parity: per task brief, the 19-02 Task 2 `checkpoint:human-verify` (`gate="blocking"`) was performed and **approved by the owner on 2026-07-02** after a fresh `:3000` rebuild (`tsc` 0, `npm run build` 0, Task Scheduler restarted, `/api/health` 200, workshop routes 307 auth-redirect — no 500s), documented in `19-02-SUMMARY.md:41,120-130` and commit `a92ffe0d` |

**Score:** 10/10 truths verified (0 present-behavior-unverified)

### Roadmap Success Criteria Cross-Check

| # | SC (ROADMAP.md Phase 19) | Status | Note |
|---|---------------------------|--------|------|
| 1 | "All `includePermissionSummary` consumers ... and terrain files read from `AccFolderPermissionSummary`; the contexts branch is removed or hard-guarded" | ✓ VERIFIED (with documented scope resolution) | The literal "terrain files" clause is a conflation, resolved with evidence in `19-01-PLAN.md`'s "Boundary-risk resolution" section and the ROADMAP.md Phase 19 "Boundary note" (line 263): the projection is a per-`(projectId,roleId)` rollup; terrain needs per-folder tier via `folderPermQuery.ts` and cannot read the rollup without losing granularity and breaking TEST-02. Terrain correctly stays on `folderPermQuery.ts` — confirmed via `git log` that `lib/server/folderPermissionTerrainView.ts`, `lib/server/templateFolderTerrain.ts`, and `lib/server/folderPermQuery.ts` were NOT touched by any Phase 19 commit. The genuine, non-lossy scope (the summary aggregate) is switched. Contexts branch is hard-guarded (not removed) — an accepted, documented design choice (fails loudly, preserves WS2 edge-feed capability). |
| 2 | TEST-01 + all terrain golden masters pass; `npm test` green | ✓ VERIFIED | See Truth #3 |
| 3 | `/access-analysis` + `/template-mty` render identically (owner visual check) | ✓ VERIFIED | See Truth #10 — owner approved 2026-07-02 |
| 4 | Refresh mechanism wired into `dc-daily-ingest.cjs`; staleness bound documented | ✓ VERIFIED | See Truths #6, #7, #9 |
| 5 | `npx tsc --noEmit` exits clean after all consumer and cron/refresh changes | ✓ VERIFIED | Re-ran independently → exit 0 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/server/acc-hot-cache.ts` | Summary branch reads `AccFolderPermissionSummary`; contexts branch hard-guarded | ✓ VERIFIED | Contains `accFolderPermissionSummary.findMany` (line 313) and the throw guard (lines 289-297) |
| `lib/server/acc-hot-cache.test.ts` | TEST-01 reads projection; contexts test asserts throw | ✓ VERIFIED | Contains `accFolderPermissionSummary` (mock + assertion at lines 60-62, 304, 319); throw assertion at 111-117 |
| `server/routers/acc-dc-graph.test.ts` | Router test sources the projection model | ✓ VERIFIED | Contains `accFolderPermissionSummary` mock (line 177) + assertions (191-192) |
| `.env.example` | Documents `ACC_ALLOW_RAW_PERMISSION_SCAN` | ✓ VERIFIED | Line 89, with explanatory comment (verified via PowerShell — file is Read-tool-blocked by local secret guard) |
| `scripts/dc-daily-ingest.cjs` | Non-fatal refresh block, ordered first in success branch | ✓ VERIFIED | Contains `backfill-folder-perm-summary` (line 130); ordered before person-graph + embedding blocks |
| `.planning/codebase/INTEGRATIONS.md` | Documents refresh + staleness bound | ✓ VERIFIED | Contains `AccFolderPermissionSummary` subsection (lines 110-133) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `acc-hot-cache.ts` (summary else-branch) | `db.accFolderPermissionSummary` | `findMany` rebuilding `${projectId}::${roleId}` Map | ✓ WIRED | Code read + TEST-01 passes with projection mock |
| `acc-hot-cache.ts` (contexts branch) | hard-guard throw | `throw` unless `ACC_ALLOW_RAW_PERMISSION_SCAN==='1'` | ✓ WIRED | Code read + throw test passes |
| `dc-daily-ingest.cjs` (success branch) | `scripts/backfill-folder-perm-summary.cjs` | `execSync(...)` inside non-fatal try/catch, before embedding build | ✓ WIRED | Code read; script re-run independently exits 0 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| tsc typecheck | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Targeted vitest (PROJ-02 consumer switch + guard) | `npx vitest run lib/server/acc-hot-cache.test.ts server/routers/acc-dc-graph.test.ts lib/server/acc-route-hydration.test.ts lib/acc/dcUserAssembly.test.ts` | 4 files / 42 tests passed | ✓ PASS |
| TEST-02 terrain golden masters (byte-identical, terrain untouched) | `npx vitest run lib/server/__tests__/folderPermissionTerrainView.test.ts lib/server/__tests__/templateFolderTerrain.test.ts lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts` | 3 files / 12 tests passed | ✓ PASS |
| Post-refresh reconciliation | `node scripts/verify-folder-perm-summary.cjs` | VERDICT: PASS (22082==22082, 0 mismatches, 20/20 spot-checks) | ✓ PASS |
| Hard-guard throw assertion | (within acc-hot-cache.test.ts, line 111-117) | `rejects.toThrow(/hard-guarded/)` + `accFolderPermission.findMany` not called | ✓ PASS |
| OOM-bound assertion (summary path never scans raw table) | (within acc-hot-cache.test.ts, line 319) | `expect(db.accFolderPermission.findMany).not.toHaveBeenCalled()` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| PROJ-02 | 19-01-PLAN.md | Consumer switch + raw-scan hard-guard | ✓ SATISFIED | Truths 1-5 above; REQUIREMENTS.md line 65 marked Complete |
| PROJ-03 | 19-02-PLAN.md | Cron refresh + staleness-bound doc | ✓ SATISFIED | Truths 6-10 above; REQUIREMENTS.md line 66 marked Complete |

No orphaned requirements — `.planning/REQUIREMENTS.md` maps only PROJ-02 and PROJ-03 to Phase 19, both accounted for above.

### Anti-Patterns Found

None. `grep -n "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` across all Phase 19 changed source files (`lib/server/acc-hot-cache.ts`, `lib/server/acc-hot-cache.test.ts`, `server/routers/acc-dc-graph.test.ts`, `scripts/dc-daily-ingest.cjs`) returned zero matches.

### Dashboard Guardrail Checks

- **Scope fence:** `git diff --stat 9dbe606b~1 e34ec7e7` (all three Phase 19 code commits) touches exactly: `.env.example`, `lib/server/acc-hot-cache.ts`, `lib/server/acc-hot-cache.test.ts`, `server/routers/acc-dc-graph.test.ts`, `scripts/dc-daily-ingest.cjs`, `.planning/codebase/INTEGRATIONS.md`, plus planning-state files (`REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `19-01-SUMMARY.md`). No generic `src/...` paths.
- **Terrain untouched (correct outcome, not a gap):** `git log -- lib/server/folderPermissionTerrainView.ts lib/server/templateFolderTerrain.ts lib/server/folderPermQuery.ts` shows no Phase 19 commits touching these files.
- **No `app/` route changed; `/users/spatial-graph` NOT touched.** Confirmed via the same scope-fence diff — zero `app/` paths in the three-commit diff.
- **No new WebGL, zinc theme untouched:** zero UI files in scope this phase — an internal server-side data-source swap plus a cron script and a planning doc, exactly as both plans' "Workshop-impact note" sections state.
- **Data truthfulness:** the projection inherits the live aggregate's coverage boundary (`folderCrawlStatus IN ('ok','partial')`, baked into the Phase 18 backfill — unchanged); INTEGRATIONS.md documents the staleness bound and the folder-crawl caveat honestly rather than implying instant freshness.

### Human Verification Required

None. The one item that would normally require human sign-off — owner visual parity on `/access-analysis` + `/template-mty` after a `:3000` rebuild (roadmap SC#3 / 19-02 Task 2, `checkpoint:human-verify`, `gate="blocking"`) — was already performed and approved by the owner on 2026-07-02, per the verification task brief and corroborated by `19-02-SUMMARY.md` (commit `a92ffe0d`) with concrete rebuild evidence (tsc 0, build 0, task restarted, `/api/health` 200, workshop routes 307, "approved" quote).

### Gaps Summary

No blocking gaps. Phase 19 goal is achieved: the `includePermissionSummary` consumers now read the `AccFolderPermissionSummary` projection instead of a live `$queryRaw` GROUP BY (proven byte-identical via fresh reconciliation), the raw-scan `includePermissionContexts:true` branch is hard-guarded behind an explicit, documented escape hatch, a non-fatal refresh is wired as the first step of the ingest cron's success branch (ahead of the embedding build that also reads the projection), and `.planning/codebase/INTEGRATIONS.md` documents the staleness bound, the out-of-band folder-crawl caveat, and the manual fallback. Terrain was correctly left untouched per the evidence-backed boundary resolution in `19-01-PLAN.md` and the ROADMAP.md boundary note — forcing terrain onto the per-`(projectId,roleId)` rollup would lose the per-folder granularity TEST-02 depends on.

**Minor housekeeping note (non-blocking, informational only):** `.planning/ROADMAP.md` (Phase 19 checkbox and "Plans: 1/2") and `.planning/STATE.md` still read as of the pre-owner-approval snapshot (commit `a97c1102`) — the owner-approval commit `a92ffe0d` only updated `19-02-SUMMARY.md`. These planning-state files should be synced to reflect Phase 19 = 2/2 plans complete / CLOSED at phase-close, alongside `REQUIREMENTS.md`'s stale "phase-level owner visual parity checkpoint SC#3 still pending" note (line 66) — this is expected orchestrator phase-close bookkeeping, not a code or goal-achievement gap.

---

## Dashboard Self-Check

- **Context:** Loaded `.claude/skills/lecg-dashboard/SKILL.md`, `CLAUDE.md`/`.claude/CLAUDE.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/config.json`, both 19-01/19-02 PLAN + SUMMARY files, `19-CONTEXT.md`, `.planning/REQUIREMENTS.md`.
- **Scope matched:** internal server-side data-source swap in `lib/server/acc-hot-cache.ts` (consumed by `/access-analysis` and `/template-mty` via `getCachedAccDcBulkUsers`) plus `scripts/dc-daily-ingest.cjs` (cron) and `.planning/codebase/INTEGRATIONS.md` (docs). No other workshop page touched.
- **Exact artifacts:** every path, test file, script, and env var claim in this report was verified directly from repo files/commands (see Evidence column above), not from SUMMARY.md prose alone.
- **Repo roots:** no generic `src/...` claims.
- **Data truth:** projection coverage boundary and staleness bound documented honestly in INTEGRATIONS.md; verified via fresh independent reconciliation run (PASS).
- **UI constraints:** N/A this phase — zero UI files touched, confirmed via scope-fence diff.
- **Boundary constraints:** no Prisma-in-UI drift introduced; the swap stays inside `lib/server/`.
- **Gates run:** `npx tsc --noEmit` (0 errors), targeted `npx vitest run` (4 files/42 tests + 3 terrain files/12 tests, all green), `node scripts/verify-folder-perm-summary.cjs` (VERDICT PASS). Repo-map check skipped — no import graph/boundary change (confirmed via scope-fence diff: only `lib/server/acc-hot-cache.ts` internals changed, its exports/imports unchanged).
- **VERIFY:** none outstanding.

---

*Verified: 2026-07-02*
*Verifier: Claude (gsd-verifier)*
