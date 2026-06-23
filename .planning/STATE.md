---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Concerns Hardening
status: in_progress
last_updated: "2026-06-23T22:20:42.000Z"
last_activity: "2026-06-23 — Phase 10 (Layering & Boundary Fixes) context captured (10-CONTEXT.md, commit 20789a30). Decisions: BND-01 → new acc-coordination tRPC procedure + thin Server Action (Claude's discretion); BND-03/04 → Conservative, defer spatial-graph edges (user); test depth → light pin tests on moved code only (Claude's discretion). Ready to plan Phase 10."
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-23)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.1 Concerns Hardening — Phase 10 (Layering & Boundary Fixes)

## Current Position

- **Milestone:** v2.1 — Concerns Hardening
- **Phase:** 10 of 14 — Layering & Boundary Fixes (next, not yet planned)
- **Plan:** — (Phase 10 not yet planned; 10-CONTEXT.md captured)
- **Status:** Phase 09 complete + verified; Phase 10 context gathered (10-CONTEXT.md, commit 20789a30) — ready to plan
- **Last activity:** 2026-06-23 — Phase 10 context captured via /gsd:discuss-phase (3 gray areas resolved: BND-01 tRPC home, BND-03/04 deferral line, test depth)

Progress: [█░░░░░░░░░] 17% (1 of 6 phases)

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

Phase 10 context captured (`.planning/phases/10-layering-boundary-fixes/10-CONTEXT.md`). Run
`/gsd:plan-phase 10` to plan Phase 10: Layering & Boundary Fixes. Locked context for the planner:
BND-01 → new `acc-coordination` tRPC procedure wrapping a `lib/server` helper + keep
`coordinationActions.ts` as a thin Server Action (call site unchanged); BND-03/04 → Conservative
(remove only non-spatial-graph edges, document the rest as deferred); test depth → light pin tests on
the moved `classifyActivity`/`donutModules` + clash-query shape only (heavy characterization stays in
Phase 14). Researcher VERIFY items: fresh `repo-map check` edge enumeration, `clash.ts` vs new router,
`root.ts` composition, exact `moduleOverrides.ts` exports + the four `diag-activity` import lines.
Phase 11 (TRUTH labels) remains independently unblocked (depends on 09 only).

---
*Last updated: 2026-06-23 — Phase 09 complete + verified (5/5 must-haves passed; commits 66c9f404..fe82b79a). Note: `gsd-tools phase complete` mis-reported is_last_phase:true / total_phases:1 (known CLI bug); STATE frontmatter + body repaired manually to reflect 1 of 6 phases done.*
