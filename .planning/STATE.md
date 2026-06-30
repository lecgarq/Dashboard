---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Concerns Hardening
current_phase: 11
current_phase_name: TRUTH-04 doc
status: in_progress
stopped_at: 11-03 plan complete
last_updated: "2026-06-30T15:08:11.598Z"
last_activity: 2026-06-30
last_activity_desc: Phase 11 Plan 11-02 completed (GUID-leak fix + Vitest; commits 045d89cb+8e9c88ec). Plan 11-03 (dataFloor) already committed (e042f1a2). Next = execute plan 11-04 (coverage header + module ⓘ tooltip, Wave 2).
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 9
  completed_plans: 8
  percent: 33
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-23)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.1 Concerns Hardening — Phase 11 (Data-Truthfulness Labels)

## Current Position

- **Milestone:** v2.1 — Concerns Hardening
- **Phase:** 11 of 14 — Data-Truthfulness Labels. Wave 1 COMPLETE: 11-01 (TRUTH-04 doc) ✓, 11-02 (GUID→name fix) ✓, 11-03 (dataFloor) ✓. Wave 2 = 11-04 (coverage header + module ⓘ tooltip), depends on 11-03.
- **Plan:** 4 of 4 Phase 11 plans executed. Next = 11-04 (Wave 2).
- **Status:** Phase 11 Wave 1 complete. 11-01 (TRUTH-04 doc), 11-02 (folderActivity GUID fix + Vitest), 11-03 (dataFloor RSC + buildFloors) all shipped. 11-04 (coverage header + ⓘ tooltip) is Wave 2, depends on 11-03. Key owner correction baked into 11-04: coverage header leads with free-crawl ~956/1,153, not the stale 428-DC framing. Pre-existing tsc error in mainCharts.tsx (from 11-03 type change) needs resolution in 11-04 or a follow-up.
- **Last activity:** 2026-06-30 — Phase 11 Plan 11-02 completed (GUID-leak fix + Vitest; commits 045d89cb+8e9c88ec). Plan 11-03 (dataFloor) already committed (e042f1a2). Next = execute plan 11-04 (coverage header + module ⓘ tooltip, Wave 2).

Progress: [████████░░] 78% (7 of 9 plans done; 2 of 6 phases fully complete)

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
- Plan 11-01: TRUTH-04 — mergeRoleNames lives in lib/server/accessInstanceView.ts; AccDcRole empty → AccRole fallback; DC wins on conflict (documented in INTEGRATIONS.md)
- Plan 11-02: AccProject names take precedence over AccDcProject in merged name map (AccProject is live API superset, fresher); fallback = "Unknown project" (never raw GUID); pure resolver exported for Vitest isolation
- Plan 11-02: DB verified — AccProject covers 100% of 956 ACCDS projectIds; AccDcProject covers only 495 (52%); zero residual after merge

### Blockers/Concerns

None blocking Phase 11 continuation. Key risks to track:

- DB-01 Prisma migration: run `npx tsc --noEmit` before migrate + rebuild
- BND-02/BND-03: spatial-graph-coupled `lib→app` edges are documented-deferred, not fixed
- TRUTH-02: needs `dataFloor` field added to timeline API response — verify exact tRPC procedure name before planning
- **RESOLVED (plan 11-02, 2026-06-30):** "Folder Activity by Role" GUID leak fixed. AccProject (1,153) merged into name resolution. DB verified: AccProject covers all 956 ACCDS projectIds (100%). Fallback = "Unknown project". 7-test Vitest pinned.
- **OPEN (pre-existing tsc error from plan 11-03):** `mainCharts.tsx:61` type mismatch — `ActivityTimelineResult` vs `ActivityTimelineRow[]`. Caused by 11-03's type change to `loadActivityTimeline()`. Must be fixed in plan 11-04 or before rebuild.

## Next Action

Phase 11 Wave 1 complete: 11-01 ✓ (TRUTH-04 doc), 11-02 ✓ (GUID→name fix), 11-03 ✓ (dataFloor).
Wave 2: Plan 11-04 (coverage header + module ⓘ tooltip) is next — depends on 11-03.
**Blocker for rebuild:** `mainCharts.tsx:61` tsc error from 11-03 must be fixed before `npm run build`.
**Next = execute plan 11-04** (coverage header + module ⓘ tooltip + fix the mainCharts tsc error).

**Phase 11 decisions locked (see 11-CONTEXT.md):**

- **TRUTH-01** — restrained header coverage line + keep per-chart
  `ActivityCoverageBadge`. **Owner correction:** lead with free-crawl activity
  coverage (~956/1,153, live count), label DC-metadata metrics with their ~550;
  the requirement's "428 of 1,152 DC" example is rejected as the headline.

- **TRUTH-02** — add `dataFloor` to the **`loadActivityTimeline()` RSC** in
  `lib/server/activityTimelineView.ts` (NOT tRPC — the CTE already computes
  per-project `MIN(createdAt)`). Account-wide "Data available from [month]"
  caption + per-project hover.

- **TRUTH-03** — ⓘ info-icon + Radix tooltip on the module donut; ~40.7% figure
  in tooltip + INTEGRATIONS.md, not always-on.

- **TRUTH-04** — document `AccDcRole`→`AccRole` fallback in INTEGRATIONS.md.
- **Folded-in scope** — repair the raw-GUID leak in
  `lib/server/folderActivityView.ts` by merging `AccProject` (1,153) names;
  graceful "Unknown project" fallback. VERIFY `AccProject.id` ↔
  `AccActivityAccds.projectId` first.

---
*Last updated: 2026-06-23 — Phase 10 complete + verified (7/7 must-haves; 10-VERIFICATION.md PASSED) + owner-approved rebuild on :3000. Note: `gsd-tools phase complete` again mis-reported is_last_phase:true / total_phases:2 (known CLI bug); STATE frontmatter + body repaired manually to reflect 2 of 6 phases done.*

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 11-data-truthfulness-labels P01 | 1 | 2 tasks | 1 files |
| Phase 11-data-truthfulness-labels P02 | 4 | 3 tasks | 2 files |
| Phase 11 P03 | 6 | 3 tasks | 6 files |

## Session

**Last session:** 2026-06-30T15:08:11.590Z
**Stopped at:** 11-03 plan complete
**Resume file:** none
