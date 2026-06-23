---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Concerns Hardening
status: in_progress
last_updated: "2026-06-24T00:10:00.000Z"
last_activity: "2026-06-23 — Phase 11 (Data-Truthfulness Labels) CONTEXT captured (11-CONTEXT.md, commit 5e0ad8b8). Owner correction locked: TRUTH-01 coverage label leads with the free-crawl activity coverage (~956/1,153), NOT the stale '428 DC' framing (428 = old DC-API-extractable; superseded). TRUTH-02 `dataFloor` is added to the `loadActivityTimeline()` RSC in lib/server/activityTimelineView.ts (NOT tRPC — resolves the open 'verify procedure' item). TRUTH-03 = ⓘ tooltip on module donut. GUID→name fix (folderActivityView.ts) folded in. Next = /gsd:plan-phase 11. Prior: Phase 10 COMPLETE+verified+owner-approved (9 commits 4392637d..3dc7a40b)."
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
- **Phase:** 11 of 14 — Data-Truthfulness Labels. CONTEXT captured (11-CONTEXT.md). Next = plan-phase 11. (Phase 10 ✓ COMPLETE + verified + owner-approved.)
- **Plan:** Phase 11 plans TBD. Decisions locked in 11-CONTEXT.md (4 TRUTH labels on /access-analysis + folded-in GUID→name fix).
- **Status:** Phase 11 discuss-phase done; ready to plan. Independently unblocked (depends on Phase 09 only). Key owner correction: coverage label uses free-crawl ~956/1,153, not the stale 428-DC framing.
- **Last activity:** 2026-06-23 — Phase 11 CONTEXT captured (commit 5e0ad8b8). TRUTH-02 dataFloor confirmed on the loadActivityTimeline() RSC (not tRPC); GUID-name fix folded in. Prior: Phase 10 COMPLETE + verified + owner-approved (9 commits 4392637d..3dc7a40b).

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

Phase 11 discuss-phase is complete — decisions captured in
`.planning/phases/11-data-truthfulness-labels/11-CONTEXT.md` (commit 5e0ad8b8).
**Next = `/gsd:plan-phase 11`** (after `/clear`).

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
