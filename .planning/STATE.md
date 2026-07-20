---
lecg_state_version: 2
milestone: v2.6
milestone_name: "Full-Rate Graph"
current_phase: 35
current_phase_name: "Similarity-Web Renderer Rethink"
status: ready_to_plan
current_plan: null
stopped_at: "Phase 35 context captured 2026-07-20 (Cosmos-native curved links preferred; deterministic zoom decimation allowed only for zoomed-out ambient fallback; selected/hovered and settled close view always complete) — next: /lecg-phase 35"
last_updated: "2026-07-20T12:32:23-06:00"
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-20)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.6 Full-Rate Graph — similarity-web renderer off the Canvas2D ceiling
behind a hard ≥50fps Tier-0 gate, plus the test/guard health sweep.

## Current Position

- **Milestone:** **v2.6 Full-Rate Graph — OPENED 2026-07-20.** 8 requirements
  (REND-01–03, E2E-01–02, TEST-04, GUARD-01, PIPE-02), 3 phases (34–36), 8/8 mapped;
  phase breakdown owner-approved 2026-07-20. Owner scope picks: renderer rethink headline +
  health sweep (candidates 1+3), hard ≥50fps Tier-0 bar; Tier-3 dims stay deferred
  (ISSUE-GRAPH-01 spike = v2.7 entry ticket).
- **Phase 34 (Test & Guard Health Sweep) COMPLETE 2026-07-20:** 4/4 plans summarized,
  5/5 success criteria verified, debt rolled to CONCERNS, and local production deployed
  as BUILD_ID `CV_frbgC6hmbArjJ53Qi7` (`/api/health` 200, database connected).
- **Prior milestones:** v2.5 (16/16, 2026-07-20, BUILD_ID `-zcfnulR0rESok3UDom50`),
  v2.4 (18/18, 2026-07-16), v2.3 (2026-07-14), v2.2, v2.1, v2.0, v1.0 —
  all in `MILESTONES.md` / `milestones/`.
- **Phase 35 (Similarity-Web Renderer Rethink)** is `ready_to_plan` — context captured
  2026-07-20 with Cosmos-native curved GPU links preferred by measurement and zoom
  decimation constrained to a deterministic zoomed-out ambient fallback.
- **Next:** `/lecg-phase 35` — plan and execute REND-01/03 from `35-CONTEXT.md`.
  Codebase docs are current (map refreshed post-v2.5, commit `680dde86`).

## Status (data baseline — still current)

- **State:** Data extraction COMPLETE and VERIFIED (census below), unchanged since
  2026-06-23. v2.1–v2.4 all shipped on this baseline; v2.5 adds no new data source.

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

Updated at the v2.6 open (2026-07-20). **Absorbed into v2.6 requirements** (dropped from
this list): similarity-web renderer rethink (→ REND-01–03), guard-bash powershell-wrap gap
(→ GUARD-01), e2e drift re-baseline + lasso budget (→ E2E-01/02), 3 `usePredicateEngine`
failures (→ TEST-04), stale-embedding prune (→ PIPE-02).

1. **Tier-3 graph dims** — ISSUE-GRAPH-01 (needs `AccIssue.createdBy`→`AccDcUser` resolution
   spike, unmeasured rate — **the v2.7 entry ticket**) + TIME-01 temporal scrubber →
   v2.7 candidates (owner explicitly left them out of v2.6).
2. **Data-truth items** — SVC-01 service-override attribution refinement; DIM-05
   project-coverage denominator (verify whether 550/1,153 is correct before ever displaying
   it; `VERIFY:` in `dimensionCoverage.ts`). Not picked for v2.6.
3. **PaCMAP MN_ratio/FP_ratio tuning** — package defaults shipped; revisit only on owner
   UAT ask (CONCERNS, phase-29 tagged).
4. **DC-01 / DC-02** — external Account Admin provisioning blocker, unchanged.
5. **Standing:** COMPANY-GRAIN-01 (per-membership vs per-user company grain disagreement),
   ORPHAN-01 (PresetBar/SliderGroup/dimensionSearch/dimensionWeights orphans), TEST-SPLIT-01
   (CONCERNS §8.2/8.3 giant test files — E2E-01 re-baselines assertions, does NOT split
   files), MILESTONES v2.1/v2.2 backfill, v2.3 phase-dir prune (20–23 + 07 still on disk),
   Phase-17 SPLIT-04 owner visual sign-off (test-basis-only, no live mount), per-folder
   terrain projection seed.

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
  + `migrate resolve` is the established fallback (should be unneeded this milestone: no
  migration planned).
- Layouts organic, never a fixed grid (standing owner constraint).
- `prefers-reduced-motion` → static; interaction motion ≤200ms.
- PERF-02 frozen-handle invariant + TEST-01/02/03 stay green throughout.

### Decisions

Milestone decisions live in `PROJECT.md` Key Decisions, `MILESTONES.md` retrospectives
("Durable traps & decisions"), and the archived `milestones/vN.N-REQUIREMENTS.md` owner
scope decisions. v2.5's phase CONTEXT files are pruned from disk; full text is in git
history (last present at commit `27297514`).

## Next Action

**Run `/lecg-phase 35`.** Context is locked in `35-CONTEXT.md`; measure the three approved
renderer levers against the Phase-33 LINK-PERF baseline, implement the smallest winner, and
preserve the Phase-32 visual contract. Historical baseline remains at commit `27297514`.
