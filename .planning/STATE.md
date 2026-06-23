---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Concerns Hardening
current_phase: 10
current_phase_name: PLANNED, ready to execute
status: in_progress
last_updated: "2026-06-23T22:46:09.758Z"
last_activity: 2026-06-23
last_activity_desc: "`/gsd:plan-phase 10` complete: planner resolved 5 VERIFY items live, checker passed with 3 non-blocking execution notes (below)"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 5
  completed_plans: 3
  percent: 17
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-23)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.1 Concerns Hardening — Phase 10 (Layering & Boundary Fixes)

## Current Position

- **Milestone:** v2.1 — Concerns Hardening
- **Phase:** 10 of 14 — Layering & Boundary Fixes (PLANNED, ready to execute)
- **Plan:** 10-01 (BND-01) COMPLETE; 10-02 (BND-02) COMPLETE; 10-03 (BND-03/04) pending (Wave 2)
- **Status:** Phase 10 Wave 1 complete — ready for Wave 2 (10-03)
- **Last activity:** 2026-06-23 — Plan 10-02 (BND-02) complete: activityClassification.ts moved to lib/acc/, moduleOverrides.ts is pure re-export barrel, 4 diag scripts repointed, repo-map no-scripts-to-app 6->2, tsc clean, vitest 11/11. Commits 226b9bbf + 2b838711.

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

Phase 10 is planned and checker-verified. Run `/gsd:execute-phase 10` (after `/clear`) to execute:
Wave 1 = 10-01 (BND-01) + 10-02 (BND-02) in parallel; Wave 2 = 10-03 (BND-03/04), which ends at a
blocking rebuild + `:3000` spot-check human checkpoint.

**Carry these 3 checker execution-time notes into execution (non-blocking, do not re-plan):**

1. **BND-03 deferred-edge list (10-03 Task 2):** also enumerate the `lib/server/projectClashView.ts →
   app/(dashboard)/access-analysis/coordinationClash` type-only edge (new in 10-01) and the
   `lib/acc/activityClassification.ts → accTaxonomy/accNormalize` edge (new in 10-02) in the CONCERNS.md
   deferred narrative — both are clean type imports that the fresh `repo-map check` will surface.

2. **BND-04 audit count (10-03):** confirm the post-10-01 `app→server` count is **28** (10-01 drops only
   the `@/server/db` import; `@/server/auth` stays by design) before writing the audit verdict.

3. **10-02 Task 2 verify one-liner:** the Node JSON parse of `dependency-cruiser.json` for the
   `no-scripts-to-app` warning on the `moduleOverrides` path is brittle to schema changes — fine as-is,
   just be aware if it errors.

Locked plan facts: BND-01 → new `acc-coordination` tRPC procedure + `lib/server/projectClashView.ts`
helper + thin Server Action (call site unchanged); BND-02 → `lib/acc/activityClassification.ts` verbatim
move re-exported from `moduleOverrides.ts` + 4 diag scripts repointed; BND-03/04 → Conservative (move 3
clean type modules, document spatial-graph + folderTerrain-monolith edges as Phase-14-deferred). NOTE:
`moduleOverrides.ts` has **no `n()` export** — the REQUIREMENTS/CONTEXT `n` reference is stale; do not
invent one. Phase 11 (TRUTH labels) remains independently unblocked (depends on 09 only).

---
*Last updated: 2026-06-23 — Phase 09 complete + verified (5/5 must-haves passed; commits 66c9f404..fe82b79a). Note: `gsd-tools phase complete` mis-reported is_last_phase:true / total_phases:1 (known CLI bug); STATE frontmatter + body repaired manually to reflect 1 of 6 phases done.*
