---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Concerns Hardening
current_phase: 10
current_phase_name: Wave 2 complete — blocking rebuild checkpoint pending (Task 3)
status: in_progress
last_updated: "2026-06-23T23:01:25.941Z"
last_activity: 2026-06-23
last_activity_desc: "Plan 10-03 (BND-03/BND-04) Tasks 1+2 complete: 3 type modules moved to lib/acc with re-export barrels; CONCERNS.md BND-03/BND-04 verdict appended; all automated gates pass (tsc, repo-map check, ast-grep direct-prisma-in-ui=0, vitest 2207/2209). Task 3 = blocking human rebuild checkpoint. Commits 0188808e + d61d6e0b."
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
  percent: 33
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-23)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.1 Concerns Hardening — Phase 10 (Layering & Boundary Fixes)

## Current Position

- **Milestone:** v2.1 — Concerns Hardening
- **Phase:** 10 of 14 — Layering & Boundary Fixes (Wave 2 complete; blocking rebuild checkpoint pending)
- **Plan:** 10-01 (BND-01) COMPLETE; 10-02 (BND-02) COMPLETE; 10-03 (BND-03/04) Tasks 1+2 COMPLETE — Task 3 = blocking human rebuild checkpoint
- **Status:** Phase 10 automated gates DONE — awaiting owner rebuild + visual spot-check on :3000
- **Last activity:** 2026-06-23 — Plan 10-03 Tasks 1+2 complete: 3 pure aggregation types moved to lib/acc (coordinationCounts, timelineCounts, moduleCountsTypes); lib/server view imports repointed; CONCERNS.md BND-03/BND-04 verdict appended (21 lib->app edges classified; 28 app->server edges audited, 0 violations). All automated gates pass. Commits 0188808e + d61d6e0b.

Progress: [██████████] 100% (5 of 5 plans in phase 10 automated work done; rebuild checkpoint pending)

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

- All other figures match the recorded Phase 8 gates to the row (4.55M activity
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

### Blockers/Concerns

None blocking Phase 09. Key risks to track:

- DB-01 Prisma migration: run `npx tsc --noEmit` before migrate + rebuild
- BND-02/BND-03: spatial-graph-coupled `lib→app` edges are documented-deferred, not fixed
- TRUTH-02: needs `dataFloor` field added to timeline API response — verify exact tRPC procedure name before planning

## Next Action

**BLOCKING CHECKPOINT (Task 3 of 10-03):** Rebuild on `:3000` and confirm `/access-analysis` and `/template-mty` render identically.

Steps:
1. Stop Task Scheduler task (`LECG Dashboard`).
2. `npx tsc --noEmit` (confirm clean — was clean at gate time).
3. `npm run build`.
4. Restart Task Scheduler task. Open `:3000`.
5. Verify `/access-analysis`: module donut, coordination panel (clash drill-down), activity timeline, coordination-by-project all render identically.
6. Verify `/template-mty`: terrain/role views render identically.
7. Confirm no console errors, no theme/layout drift.

After owner approves: Phase 10 is complete. Next = Phase 11 (TRUTH labels — independently unblocked, depends on Phase 09 only).

**Phase 11 context:** TRUTH-02 needs `dataFloor` field added to timeline API response — verify exact tRPC procedure name before planning.

---
*Last updated: 2026-06-23 — Phase 09 complete + verified (5/5 must-haves passed; commits 66c9f404..fe82b79a). Note: `gsd-tools phase complete` mis-reported is_last_phase:true / total_phases:1 (known CLI bug); STATE frontmatter + body repaired manually to reflect 1 of 6 phases done.*
