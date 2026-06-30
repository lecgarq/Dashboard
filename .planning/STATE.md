---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Concerns Hardening
current_phase: 14
current_phase_name: characterization-tests
status: executing
stopped_at: Phase 14 COMPLETE + verified (4/4 must-haves); milestone v2.1 all 6 phases done — awaiting closeout
last_updated: "2026-06-30T22:30:00.000Z"
last_activity: 2026-06-30
last_activity_desc: "Phase 14 COMPLETE + VERIFIED (status: passed, 4/4 must-haves). 14-01 (TEST-02): golden-master pins for loadFolderPermissionTerrain/loadFolderPermissionOverview + loadTerrainProjects shape pin in folderPermissionTerrainView.test.ts; REF-01 SPLIT-PENDING signposts on the 3 terrain monoliths + REF-02 on folderPermissionTerrainView.ts (commits 9a5173f0, 69f2139a). 14-02 (TEST-03): shared AccFolderPermission query contract pinned via loadTemplateFolderTerrain (5-column set, row-bound, project-scope, null-path) + REF-02 signpost on templateFolderTerrain.ts (commits f8e15f6e, 243d10e9). 9/9 new tests green, tsc clean. Milestone v2.1 (Concerns Hardening) all 6 phases complete — next = /gsd:complete-milestone."
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 14
  completed_plans: 14
  percent: 100
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-23)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.1 Concerns Hardening COMPLETE — all 6 phases done; awaiting milestone closeout

## Current Position

- **Milestone:** v2.1 — Concerns Hardening (6 of 6 phases complete: 09, 10, 11, 12, 13, 14 ✓) — awaiting `/gsd:complete-milestone`
- **Phase:** 14 of 14 ✓ COMPLETE + VERIFIED (status: passed, 4/4 must-haves) — Characterization Tests.
- **Plan:** Phase 14 had 2/2 plans complete: 14-01 (TEST-02 boundary pins + REF-01/REF-02 SPLIT-PENDING signposts) + 14-02 (TEST-03 shared-query contract + REF-02 signpost).
- **Status:** Milestone v2.1 fully executed + verified. Phase 14 closed (verifier 4/4). Next = milestone closeout (`/gsd:complete-milestone`). NOTE: `gsd-tools phase complete` NOT run for Phase 14 — its outputs (ROADMAP all-Complete, REQUIREMENTS TEST-02/03 Complete, STATE 6/6) were already written by the plan-execution docs commits; running the known-buggy CLI would risk blanking a correct STATE. Self-gate `--rebuild` intentionally skipped: test+comment-only phase, no route/behavior change, and a whole-tree rebuild would ship unrelated branch WIP to `:3000`.
- **Last activity:** 2026-06-30 — Phase 14 COMPLETE + VERIFIED. 14-01 commits 9a5173f0/69f2139a; 14-02 commits f8e15f6e/243d10e9. 9/9 new characterization tests green, tsc clean. 2 pre-existing failures in FolderPermissionTerrain.test.tsx confirmed out-of-scope branch WIP (untouched by Phase 14).

Progress: [████████████] 100% (all 6 phases complete + verified — milestone closeout pending)

## Status (data baseline — still current)

- **State:** Data extraction COMPLETE and VERIFIED (census below). Baseline reset to
  `.planning/` is committed in PROJECT.md/STATE.md; v2.1 builds on it.

## Data Extraction — Verified 2026-06-23

Confirmed read-only against the live local PostgreSQL DB.

### Census (`scripts/count-acc-data.cjs` logic, no-SSL)

| Table / metric | Count |
|----------------|-------|
| AccProject (live API) | 1,153 |
| AccDcProject (Data Connector) | 550 |
| AccFolder | 415,908 |
| AccFolder — sized (contents crawled) | 111,308 |
| AccFolder — total files | 420,096 |
| AccFolder — total size | 3.17 TB |
| AccFolderPermission | 6,040,610 |
| AccProjectMember (live) | 14,566 |
| AccDcProjectUser | 22,835 |
| AccActivity (Data Connector events) | 1,102,030 |
| AccActivityAccds (web-session crawl) | 4,554,785 |
| Distinct projects in AccActivityAccds | 956 |
| Folder-crawl status | 975 ok / 178 inaccessible (= 1,153) |
| Activity by source | project 1,101,159 / admin 871 |
| AccDcIngestRun | 72 |

### Merge integrity (`scripts/verify-accds-merge.cjs`, partitioned mode)

All 5 assertions PASS:

- `accds=4,554,785  dc_backfill=41,714  dc_admin=871`
- Unified total `4,597,370` == merged query `4,597,370` (reconciliation)
- backfill kept (41,714), account-level admin kept (871)
- boundary spot-check (latest-start project) reconciles

### Notes

- Folder total size is **3.17 TB** now vs ~3.4 TB recorded at crawl time — minor
  drift, not a correctness failure.

- All other figures match the recorded activity re-extraction gates to the row (4.55M activity
  rows, 956 projects, 111,308 sized folders).

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v2.1 scope lock: spatial-graph excluded, guardrails+labels first, research skipped
- Phase 09 starts with DB work + TEST-01 (OOM regression guard) together
- Phase 11 (TRUTH labels) depends on Phase 09 only — independent of boundary fixes
- Phases 13/14 depend on Phase 10 (boundary fixes first, then type guards + char tests)
- Plan 09-01: .env.example committed via !.env.example gitignore exception (opt-in pattern, no secrets)
- Plan 09-01: TEST-01 is a pinning test (OOM fix already shipped); passes immediately in GREEN (expected)
- Plan 09-01: DB-04 guardrail is comment-only on includePermissionContexts branch; no behavior change
- Plan 09-02: DB-01 index applied via pg Client + prisma migrate resolve (not migrate dev — pgvector choke); Bitmap Index Scan proven on low-frequency roleId (count=1)
- Plan 09-02: EXPLAIN ANALYZE chose Bitmap Index Scan (not plain Index Scan) — both confirm acc_folder_permission_role_id_idx is used; success criterion met
- Plan 11-01: TRUTH-04 — mergeRoleNames lives in lib/server/accessInstanceView.ts; AccDcRole empty → AccRole fallback; DC wins on conflict (documented in INTEGRATIONS.md)
- Plan 11-02: AccProject names take precedence over AccDcProject in merged name map (AccProject is live API superset, fresher); fallback = "Unknown project" (never raw GUID); pure resolver exported for Vitest isolation
- Plan 11-02: DB verified — AccProject covers 100% of 956 ACCDS projectIds; AccDcProject covers only 495 (52%); zero residual after merge
- Plan 12-01: OBS-01 — local ACCDS session-health helper, crawler startup preflight, and progress-monitor session line; no Autodesk call and no cookie values logged/rendered
- Plan 12-02: OBS-02 — effective-empty predicate shouldWarnEmptyRoleResolution + [ACC-ROLES] warn at loadInstanceView; warns ONLY when both AccDcRole+AccRole yield zero names; by-design AccDcRole-empty alone stays silent
- Plan 12-02: OBS-03 — stale TODO[02.5] diagnostic removal from acc-admin.ts code-grounded; companyRole/lastSignIn resolution intact; field names confirmed 2026-05-18

### Blockers/Concerns

None blocking Phase 13 planning/execution. Key risks to track:

- Run `npx tsc --noEmit` before any rebuild; full `npm run build` must go
  through the Task Scheduler stop/start deploy sequence or
  `node scripts/gsd-self-gate.cjs --rebuild`.

- BND-02/BND-03: spatial-graph-coupled `lib→app` edges are documented-deferred, not fixed.
- Phase 13 (Type-Safety Guards): mark `bulkUsers` lean-payload fields as `never[]`,
  add `accGraphFilters` compile-time drift assert. Phases 13/14 depend on Phase 10.

- **RESOLVED (Phase 12, 2026-06-30):** OBS-01 — ACCDS session health now visible before a crawl fails (crawler `[WARN]` preflight + `:4321` monitor green/amber/red line); local cookie-file read only, no Autodesk call, no cookie values logged.
- **RESOLVED (Phase 12, 2026-06-30):** OBS-02 — silent role-resolution failure now logs `[ACC-ROLES]` at the verified `loadInstanceView` boundary on effective-empty (deliberate divergence from roadmap's `acc-hot-cache.ts`, which never references `AccDcRole`).
- **RESOLVED (Phase 12, 2026-06-30):** OBS-03 — stale `TODO[02.5]` diagnostics removed from `acc-admin.ts`; `companyRole`/`lastSignIn` resolution intact.
- **RESOLVED (plan 11-02, 2026-06-30):** "Folder Activity by Role" GUID leak fixed. AccProject (1,153) merged into name resolution. DB verified: AccProject covers all 956 ACCDS projectIds (100%). Fallback = "Unknown project". 7-test Vitest pinned.
- **RESOLVED (plan 11-04, 2026-06-30):** mainCharts.tsx tsc error was already resolved by 11-03's commit 926c57dc. tsc clean confirmed at start and end of 11-04 execution.
- **RESOLVED (plan 13-01, 2026-06-30):** TYPE-01 — lean bulkUsers roles/modules now typed never[] via LeanBulkAccProject/LeanBulkAccUser at getCachedAccDcBulkUsers lean construction site. TYPE-02 — _DimKeysAreValid/_dimKeyGuard one-directional subset assert live in accGraphFilters.ts (type-only import). tsc clean, vitest 51/51.

## Next Action

Phase 14 is COMPLETE + VERIFIED (verifier status: passed, 4/4 must-haves;
`.planning/phases/14-characterization-tests/14-VERIFICATION.md`). Both plan
summaries exist (14-01-SUMMARY.md, 14-02-SUMMARY.md). Milestone v2.1 (Concerns
Hardening) now has all 6 phases complete + verified.

**Next = `/gsd:complete-milestone` (after `/clear`).**

Milestone-close inputs already true:
- All 6 phases (09–14) Complete in ROADMAP; all v2.1 requirements satisfied.
- TEST-02 + TEST-03 marked Complete in REQUIREMENTS.md.
- 9/9 new characterization tests green; `npx tsc --noEmit` clean.

Deliberate deferrals carried into closeout (not blockers):
- Self-gate `--rebuild` NOT run for Phase 14 (test+comment-only; whole-tree rebuild
  would ship unrelated branch WIP to `:3000`). Run it as part of milestone-close
  only if a clean rebuild of the intended working tree is desired.
- 2 pre-existing failures in `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx`
  are uncommitted branch WIP unrelated to Phase 14 — a full `npm test` is not 100%
  green until that WIP is resolved or committed.

Optional operator smoke checks still open for Phase 12 (non-blocking, owner-approved without them):
run the `:4321` monitor and confirm the green/amber/red session line; run the crawler with an
expiring fixture and confirm the `[WARN]` preflight prints. Fixtures left in the session scratchpad.

---
*Last updated: 2026-06-30 — Phase 13 complete: 2 commits (e0d46b91, 965993fd). TYPE-01 and TYPE-02 requirements marked complete. tsc clean, vitest 51/51 accGraphFilters. ROADMAP phase 13 updated to Complete via CLI (roadmap.update-plan-progress 13). Note: state.advance-plan failed (known CLI bug — "Cannot parse Current Plan or Total Plans"); frontmatter + body repaired manually to 5 of 6 phases done, milestone v2.1, current_phase 14 next.*

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 11-data-truthfulness-labels P01 | 1 | 2 tasks | 1 files |
| Phase 11-data-truthfulness-labels P02 | 4 | 3 tasks | 2 files |
| Phase 11 P03 | 6 | 3 tasks | 6 files |
| Phase 11 P04 | 10 | 3 tasks | 6 files |
| Phase 12 P02 | ~15min | 2 tasks | 3 files |
| Phase 12 P01 | ~20min | 3 tasks | 4 files |
| Phase 13 P01 | 390s | 2 tasks | 2 files |

## Session

**Last session:** 2026-06-30T22:16:01.449Z
**Stopped at:** Phase 14 planned; ready to execute 14-01 and 14-02
**Resume file:** .planning/phases/14-characterization-tests/14-CONTEXT.md
