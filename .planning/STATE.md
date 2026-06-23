---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Concerns Hardening
status: in_progress
last_updated: "2026-06-23T23:40:00.000Z"
last_activity: "2026-06-23 — Phase 10 (Layering & Boundary Fixes) COMPLETE + verified (7/7 must-haves) + owner-approved rebuild on :3000. BND-01..04 all landed: clash query→accCoordination tRPC, classifier→lib/acc, 3 pure types→lib/acc, deferred lib→app/app→server edges documented in CONCERNS.md. Next = Phase 11 (TRUTH labels). 9 commits 4392637d..3dc7a40b. NOTE: `gsd-tools phase complete` mis-set status:completed/total_phases:2 (known is_last_phase bug) — repaired manually."
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-23)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.1 Concerns Hardening — Phase 11 (Data-Truthfulness Labels)

## Current Position

- **Milestone:** v2.1 — Concerns Hardening
- **Phase:** 10 of 14 — Layering & Boundary Fixes ✓ COMPLETE + verified (7/7) + owner-approved. Next = Phase 11.
- **Plan:** 10-01 (BND-01), 10-02 (BND-02), 10-03 (BND-03/04) all COMPLETE — 3/3 plans, owner-approved rebuild on :3000.
- **Status:** Phase 10 complete (verifier PASSED 7/7; owner-approved identical render). Phase 11 (TRUTH labels) is next — independently unblocked (depends on Phase 09 only).
- **Last activity:** 2026-06-23 — Phase 10 COMPLETE + verified + owner-approved. BND-01..04 landed; deferred edges documented in CONCERNS.md. 9 commits 4392637d..3dc7a40b.

Progress: [███░░░░░░░] 33% (2 of 6 phases — 09, 10 complete)

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
- **NEW (owner-flagged 2026-06-23, Phase 11 candidate):** "Folder Activity by Role" on `/access-analysis` shows raw project GUIDs instead of names for ~the gap between the 956-project activity set and the 550-project DC name source. Root cause: `lib/server/folderActivityView.ts:51` builds its name map from `accDcProject` only (550); line 58 falls back to `?? r.projectId`. Fix = also merge names from live `AccProject` (1,153, superset). Pre-existing, NOT a Phase 10 regression (folderActivityView.ts untouched by Phase 10). Thematically a TRUTH-label fix. VERIFY: `AccProject.id` aligns with `AccActivityAccds.projectId` for the missing projects (1-line DB count).

## Next Action

Phase 10 is complete, verified (7/7), and owner-approved. **Next = Phase 11 (Data-Truthfulness Labels)** — independently unblocked (depends on Phase 09 only).

Run `/gsd:discuss-phase 11` (then `/gsd:plan-phase 11`) after `/clear`.

**Phase 11 context / candidates:**
- TRUTH-02 needs a `dataFloor` field added to the timeline API response — verify the exact tRPC procedure name before planning.
- Fold in the owner-flagged Folder-Activity-by-Role name-coverage fix (see Blockers/Concerns) — it is a one-file label-truthfulness fix in `lib/server/folderActivityView.ts`.

---
*Last updated: 2026-06-23 — Phase 10 complete + verified (7/7 must-haves; 10-VERIFICATION.md PASSED) + owner-approved rebuild on :3000. Note: `gsd-tools phase complete` again mis-reported is_last_phase:true / total_phases:2 (known CLI bug); STATE frontmatter + body repaired manually to reflect 2 of 6 phases done.*
