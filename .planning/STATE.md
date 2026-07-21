---
lecg_state_version: 2
milestone: v2.7
milestone_name: "Activity Universe"
current_phase: 40
current_phase_name: "Dimensions & Sliders at Scale"
status: executing
current_plan: "40-03"
stopped_at: "40-01 + 40-02 COMPLETE (commits 6b7be17a, 2356e659; all gates green). Executing 40-03 (sidebar repopulation + shell wiring + labels + retirement) — resume: /lecg-phase 40"
last_updated: "2026-07-21T20:10:00-06:00"
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-21)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.7 Activity Universe — spatial graph node grain becomes one node per
extracted activity event.

## Current Position

- **Milestone:** **v2.7 Activity Universe — OPENED 2026-07-21** (owner goal given
  2026-07-20). 12 requirements (SCALE-01/02, ACT-01–04, EMB-07, DIM-07, PERF-07, TIME-01,
  REND-04, E2E-03), phases 37–41, 12/12 mapped, breakdown owner-approved 2026-07-21.
- **Owner scope decisions (recorded in REQUIREMENTS "Read Before Planning"):** ALL
  4,862,301 raw activity events chosen over offered bounded grains (106k/40k); full
  replace of the user-instance graph, no mode toggle, dimension sliders must survive;
  hard ≥50fps Tier-0 bar retained; TIME-01 temporal scrubber folded in. Safety mechanism:
  Phase-37 feasibility spike picks the shipped rung on an owner-approved fallback ladder
  (L0 all-animated → L1 decimated ambient → L2 far-zoom LOD → L3 verb+month grain
  106,196) — every activity counted at every rung.
- **Grain census (measured 2026-07-21, read-only):** `AccActivityAccds` 4,862,301 rows
  (grew from the 2026-06-23 census 4,554,785) · last 12 months 4,458,926 · distinct
  authors 2,313 · user+project+verb+month 106,196 · user+project+month 40,166 · current
  graph 22,279 nodes.
- **Phase 37 COMPLETE 2026-07-21 — owner locked ladder rung L2 (LOD rendering).**
  Evidence (`37-BASELINE.md`, hardware D3D11 Intel iGPU): full 4,862,301-point render
  8 fps static (L0/L1 FAIL), ≥50 fps static ceiling ≈ 500k rendered points, L3 grain
  106,196 green everywhere (73 fps CPU ambient); binary columnar payload 73 MB in
  1,072 ms total; PaCMAP 1M fit 379.8 s measured, full-fit ~34 min (extrapolation),
  determinism identical; cosmos GPU force sim NOT the ambient path (20.4 fps @500k);
  faiss flat projection slower than full fit. Spike surfaces flag-gated
  (`NEXT_PUBLIC_ACC_SCALE_SPIKE`), 404 in prod. Deployed BUILD_ID
  `LGy8KOP1nWXoeczYd5-8J` (health 200). SwiftShader measurement trap recorded in
  CONCERNS (fps specs must run headed + D3D11 + renderer guard).
- **Prior milestones:** v2.6 (8/8, 2026-07-20, BUILD_ID `39p7DFRd3DbgM8WjWU2Pz`),
  v2.5 (16/16, 2026-07-20, BUILD_ID `-zcfnulR0rESok3UDom50`), v2.4 (18/18, 2026-07-16),
  v2.3 (2026-07-14), v2.2, v2.1, v2.0, v1.0 — all in `MILESTONES.md` / `milestones/`.
  Codebase docs current (map refreshed post-v2.5, commit `680dde86`).

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

Updated at the v2.7 open (2026-07-21). **Absorbed into v2.7 requirements** (dropped from
this list): TIME-01 temporal scrubber (→ TIME-01, unblocked — month is a native node
attribute at activity grain).

1. **Issue dims on the graph** — ISSUE-GRAPH-01 (needs `AccIssue.createdBy`→`AccDcUser`
   resolution spike, unmeasured rate). Was the stated v2.7 entry ticket; **superseded by
   the owner's activity-universe goal** → v2.8 candidate.
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
6. **Focus-session camera restore** — Escape clears isolation but does not restore the
   pre-focus camera (`CONCERNS.md` §3.8); re-add the e2e assertion when fixed.
7. **Default e2e dev harness** — `playwright.config.ts` still stalls on `/login`; the
   established production-build `playwright.verify.config.ts` harness remains the real gate
   (`CONCERNS.md` §3.9).
8. **Cluster-label chips on the default graph** — currently flag-ON-only; owner decision
   required before treating this as a regression (`CONCERNS.md` §3.10).

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

**Run `/lecg-phase 40`** (Dimensions & Sliders at Scale — DIM-07, PERF-07).
`40-CONTEXT.md` captured 2026-07-21 with 4 locked owner decisions: (1) ambient =
decimated CPU ~100k of the rendered subset (73 fps proven path), (2) morph = GPU lerp
shader in GraphCanvas2D with decimated-morph+snap as recorded fallback, (3) slider UI =
kept CatalogSliderSidebar shell repopulated with 8 activity dims (search/presets retire),
(4) group-by = all categories with organic centroids, top-N labels, author excluded from
group-by. All dimension columns already resident client-side — no payload/pipeline work.
