---
lecg_state_version: 2
milestone: v2.7
milestone_name: "Activity Universe"
current_phase: 41
current_phase_name: "Time Scrubber, Hard Gate & Closeout"
status: ready_to_plan
current_plan: null
stopped_at: "milestone v2.7 closed — next: $lecg-new-milestone"
last_updated: "2026-07-22T10:19:37-06:00"
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-21)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.7 Activity Universe closed; next milestone not yet defined.

## Current Position

- **Milestone:** **v2.7 Activity Universe — SHIPPED 2026-07-22.** All 12 requirements
  shipped across Phases 37–41. Retrospective and evidence audit are in `MILESTONES.md`;
  requirements and roadmap are archived under `.planning/milestones/v2.7-*`.
- **Outcome:** owner-approved L2 keeps all 4,904,886 activity events resident/countable
  while 490,489 render at far zoom; 94.41% author resolution, eight activity dimensions,
  exact-month playback, 451 ms payload median, and 1,699.7 ms navigation-ready median.
- **Final proof:** headed Intel D3D11 held 67.225 fps for 12.004 s with ambient active and
  Tier 0→0. BUILD_ID `QJVfBFWLtaVk9USrIvqbD`; health/database probe and authenticated
  4,904,886-event route probe passed.
- **Prior milestones:** v2.6 (8/8, 2026-07-20, BUILD_ID `39p7DFRd3DbgM8WjWU2Pz`),
  v2.5 (16/16, 2026-07-20, BUILD_ID `-zcfnulR0rESok3UDom50`), v2.4 (18/18, 2026-07-16),
  v2.3 (2026-07-14), v2.2, v2.1, v2.0, v1.0 — all in `MILESTONES.md` / `milestones/`.
  Codebase docs current (map refreshed post-v2.5, commit `680dde86`).

## Status (data baseline — still current)

- **State:** Data extraction COMPLETE and VERIFIED (historical census below). v2.7 added
  derived activity embeddings and a binary artifact, not a new external data source.

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

All 5 assertions PASS: `accds=4,554,785 dc_backfill=41,714 dc_admin=871`; unified total
`4,597,370` == merged query `4,597,370`; backfill + account-admin rows kept; boundary
spot-check reconciles.

## Deferred Items

Carried forward after the v2.7 close (2026-07-22). TIME-01 and the activity-universe
renderer work are shipped and removed from this list.

1. **Issue dims on the graph** — ISSUE-GRAPH-01 (needs `AccIssue.createdBy`→`AccDcUser`
   resolution spike, unmeasured rate). Was the stated v2.7 entry ticket; **superseded by
   the owner's activity-universe goal** → v2.8 candidate.
2. **Data-truth items** — SVC-01 service-override attribution refinement; DIM-05
   project-coverage denominator (verify whether 550/1,153 is correct before ever displaying
   it; `VERIFY:` in `dimensionCoverage.ts`).
3. **Activity embedding economics/tuning** — PaCMAP defaults shipped; a full fit costs
   about 50 minutes and 15.7 GB RSS. Tune ratios/features or add incremental projection
   only on owner UAT or materially more frequent rebuilds (CONCERNS Phase 38).
4. **DC-01 / DC-02** — external Account Admin provisioning blocker, unchanged.
5. **Standing:** COMPANY-GRAIN-01 (per-membership vs per-user company grain disagreement),
   ORPHAN-01 (remaining SliderGroup/dimensionSearch/dimensionWeights orphans), TEST-SPLIT-01
   (CONCERNS §8.2/8.3 giant test files — E2E-01 re-baselines assertions, does NOT split
   files), MILESTONES v2.1/v2.2 backfill, v2.3 phase-dir prune (20–23 + 07 still on disk),
   Phase-17 SPLIT-04 owner visual sign-off (test-basis-only, no live mount), per-folder
   terrain projection seed.
6. **Default e2e dev harness** — `playwright.config.ts` still stalls on `/login`; the
   established production-build `playwright.verify.config.ts` harness remains the real gate
   (`CONCERNS.md` §3.9).
7. **Activity-universe operational ceilings** — payload route buffers 149.7 MB per
   non-304 request; region LOD scans 4.9M rows at interaction end; event detail depends on
   artifact/meta/table order. Current measured gates pass; harden only when concurrency,
   corpus growth, or latency makes a ceiling real (CONCERNS Ph38/Ph39).

## Accumulated Context

### Standing guardrails (carry into every phase)

- Commit by explicit path only — branch carries heavy unrelated WIP; check
  `git diff --cached --name-only` before every commit.
- Never `npm run build` while `:3000` serves — deploy sequence stops the
  `LECG Dashboard Local` task first (guard-bash hook DENIES violations; denials are
  intentional).
- Server-side SQL/`groupBy` for any large-table aggregate, never `findMany` + JS reduce
  (TEST-01 OOM-guard class).
- `prisma migrate dev` chokes on the pre-existing pgvector shadow-DB requirement — raw-SQL
  + `migrate resolve` is the established fallback.
- Layouts organic, never a fixed grid (standing owner constraint).
- `prefers-reduced-motion` → static; interaction motion ≤200ms.
- PERF-02 frozen-handle invariant + TEST-01/02/03 stay green throughout.

### Decisions

Milestone decisions live in `PROJECT.md` Key Decisions, `MILESTONES.md` retrospectives
("Durable traps & decisions"), and the archived `milestones/vN.N-REQUIREMENTS.md` owner
scope decisions. v2.5's phase CONTEXT files are pruned from disk; full text is in git
history (last present at commit `27297514`).

## Next Action

**Run `$lecg-new-milestone`.** Seed it from Deferred Items and the live debt in
`.planning/codebase/CONCERNS.md`; ISSUE-GRAPH-01 remains the leading v2.8 candidate.
