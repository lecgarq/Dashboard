---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Concerns Hardening
status: executing
stopped_at: Phase 13 context gathered
last_updated: "2026-06-30T18:23:05.639Z"
last_activity: "2026-06-30 — Phase 12 COMPLETE: 8 commits (dfe3af09..ca82f1dc). OBS-01/02/03 live. Verifier human_needed (vitest 13/13 + 7/7, tsc clean, scope + secret hygiene clean); the 3 outstanding items are operator eyeball-only (monitor color line, crawler [WARN], [ACC-ROLES] warn which cannot fire in prod). Owner-approved."
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 11
  completed_plans: 11
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-23)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.1 Concerns Hardening — Phase 13 (Type-Safety Guards)

## Current Position

- **Milestone:** v2.1 — Concerns Hardening (4 of 6 phases complete: 09, 10, 11, 12)
- **Phase:** 12 of 14 ✓ COMPLETE + verified (automated; verifier status human_needed — all automated gates passed) + owner-approved. Next = Phase 13 — Type-Safety Guards.
- **Plan:** Phase 12 had 2/2 plans complete: 12-01 (OBS-01 ACCDS session health) and 12-02 (OBS-02 role-resolution warning + OBS-03 stale-diagnostic removal).
- **Status:** Phase 12 closed. Milestone v2.1 in progress (Phases 13, 14 remain). Phase 13 ready to discuss/plan.
- **Last activity:** 2026-06-30 — Phase 12 COMPLETE: 8 commits (dfe3af09..ca82f1dc). OBS-01/02/03 live. Verifier human_needed (vitest 13/13 + 7/7, tsc clean, scope + secret hygiene clean); the 3 outstanding items are operator eyeball-only (monitor color line, crawler [WARN], [ACC-ROLES] warn which cannot fire in prod). Owner-approved.

Progress: [██████░░░░] 67% (4 of 6 phases complete — 09, 10, 11, 12)

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

## Next Action

Phase 12 COMPLETE + verified (automated) + owner-approved. Milestone v2.1 continues with
**Phase 13 — Type-Safety Guards**.

**Next = `/gsd:discuss-phase 13`** (no 13-CONTEXT.md yet) **or `/gsd:plan-phase 13`** (after `/clear`).

Phase 13 scope (from ROADMAP): mark `bulkUsers` lean-payload fields as `never[]`, add an
`accGraphFilters` compile-time drift assert. Requirements: per REQUIREMENTS.md (TYPE-*).

Remaining v2.1 phases after 13: Phase 14 (Characterization Tests).

Optional operator smoke checks still open for Phase 12 (non-blocking, owner-approved without them):
run the `:4321` monitor and confirm the green/amber/red session line; run the crawler with an
expiring fixture and confirm the `[WARN]` preflight prints. Fixtures left in the session scratchpad.

---
*Last updated: 2026-06-30 — Phase 12 complete + verified (verifier status human_needed; all automated gates passed: vitest 13/13 + 7/7, tsc clean, scope + secret hygiene clean) + owner-approved. Note: `gsd-tools phase complete` AGAIN mis-reported is_last_phase:true / next_phase:null / total_phases:4 / status:completed / milestone:v1.0 and DROPPED current_phase (known CLI bug); STATE frontmatter + body repaired manually to 4 of 6 phases done, milestone v2.1 in_progress, current_phase 13. ROADMAP checkbox updated correctly by the CLI this time.*

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 11-data-truthfulness-labels P01 | 1 | 2 tasks | 1 files |
| Phase 11-data-truthfulness-labels P02 | 4 | 3 tasks | 2 files |
| Phase 11 P03 | 6 | 3 tasks | 6 files |
| Phase 11 P04 | 10 | 3 tasks | 6 files |
| Phase 12 P02 | ~15min | 2 tasks | 3 files |
| Phase 12 P01 | ~20min | 3 tasks | 4 files |

## Session

**Last session:** 2026-06-30T18:23:05.637Z
**Stopped at:** Phase 13 context gathered
**Resume file:** .planning/phases/13-type-safety-guards/13-CONTEXT.md
