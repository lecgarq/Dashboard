---
lecg_state_version: 2
milestone: v2.5
milestone_name: "Living Graph"
current_phase: 33
current_phase_name: "Perf Closeout & Verification"
status: ready_to_plan
current_plan: null
stopped_at: "milestone v2.5 closed — next: /lecg-new-milestone (audit 16/16 shipped 2026-07-20; retrospective in MILESTONES.md; archives milestones/v2.5-*; phase dirs 29–33 pruned; seed the next milestone with the Deferred Items below + CONCERNS Ph33 debt, notably the similarity-web renderer rethink v2.6 candidate)"
last_updated: "2026-07-20T10:30:00-06:00"
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-16)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** none — v2.5 Living Graph CLOSED 2026-07-20 (16/16 shipped). Next:
`/lecg-new-milestone`.

## Current Position

- **Milestone:** none active. **v2.5 Living Graph CLOSED 2026-07-20** — 16/16 requirements
  shipped across Phases 29–33 (retrospective + per-ID audit table in `MILESTONES.md`;
  archives `milestones/v2.5-REQUIREMENTS.md` / `milestones/v2.5-ROADMAP.md`; phase dirs
  29–33 pruned). Final production BUILD_ID `-zcfnulR0rESok3UDom50` (2026-07-20).
- **Prior milestones:** v2.4 (18/18, 2026-07-16), v2.3 (2026-07-14), v2.2, v2.1, v2.0, v1.0 —
  all in `MILESTONES.md` / `milestones/`.
- **Next:** `/lecg-new-milestone`, seeded with the Deferred Items below + CONCERNS Ph33 debt.
  Headline v2.6 candidates: similarity-web renderer rethink (Canvas2D raster-bound —
  OffscreenCanvas worker / cosmos-native links / zoom decimation), ISSUE-GRAPH-01 spike,
  TIME-01 temporal scrubber, e2e drift re-baseline. Consider `/lecg-map-codebase` first —
  codebase docs predate the v2.5 graph work.

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

Carried forward at the v2.5 close (2026-07-20):

1. **Similarity-web renderer rethink** — Canvas2D rasterization is the proven fps ceiling
   (~40 ms/frame for the 14.2k-bezier web; throttle already banked +94% → 41.33 fps, tier
   controller still degrades <50 fps by design). Levers: OffscreenCanvas worker,
   cosmos-native links, zoom decimation (CONCERNS Ph33, `33-BASELINE.md` evidence archived
   in git history) → **v2.6 headline candidate**.
2. **guard-bash powershell-wrap gap** — deny rules bypassed by powershell-wrapped builds;
   Git Bash double-quoted `$env:` expands to empty (overwrote live `.next` once, recovered)
   (CONCERNS `[NEW Ph33]`).
3. **Tier-3 graph dims** — ISSUE-GRAPH-01 (needs `AccIssue.createdBy`→`AccDcUser` resolution
   spike) + TIME-01 temporal scrubber → v2.6 candidates.
4. **e2e drift re-baseline** — `acc-dc-graph.spec.ts` carries 14 pre-existing failures
   (node count 16,942→22,279 + physics-shell sidebar testids gone); suite can't gate until
   re-baselined. Lasso e2e 120s budget (CONCERNS §3.4) also still open.
5. **DIM-05 project-coverage denominator** — verify whether 550/1,153 is the correct
   DC-sourced denominator before ever displaying it (`VERIFY:` in `dimensionCoverage.ts`).
6. **3 pre-existing `usePredicateEngine` Phase-25 unit failures** — banded-catalog aperture
   tests, proven pre-existing WIP (stash-and-rerun), not a regression.
7. **PaCMAP MN_ratio/FP_ratio tuning** — package defaults shipped; revisit only on owner
   UAT ask (CONCERNS, phase-29 tagged).
8. **Standing:** COMPANY-GRAIN-01 (per-membership vs per-user company grain disagreement),
   ORPHAN-01 (PresetBar/SliderGroup/dimensionSearch/dimensionWeights orphans), TEST-SPLIT-01
   (CONCERNS §8.2/8.3 giant test files), MILESTONES v2.1/v2.2 backfill, v2.3 phase-dir
   prune (20–23 + 07 still on disk), Phase-17 SPLIT-04 owner visual sign-off
   (test-basis-only, no live mount).

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

**Run `/lecg-new-milestone`.** v2.5 closed 2026-07-20 (16/16). Seed it with the
Deferred Items above + CONCERNS Ph33 debt (similarity-web renderer rethink is the
headline v2.6 candidate). Consider `/lecg-map-codebase` first — the codebase docs
predate v2.5's embedding/similarity/choreography work.
