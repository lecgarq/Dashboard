---
phase: 24-baseline-dimension-id-unification
verified: 2026-07-14T23:10:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 24: Baseline & Dimension ID Unification Verification Report

**Phase Goal:** Capture the honest first-paint baseline BEFORE anything else changes; unify
the catalog vs registry dimension id-spaces.
**Verified:** 2026-07-14
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria + must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A first-paint / time-to-graph-rendered baseline for `/users/spatial-graph` is measured and recorded BEFORE any other v2.4 change touches the surface | ✓ VERIFIED | `24-BASELINE.md` records median time-to-graph-rendered 6193.2ms, median first-paint 644ms, N=5 table, 22,279 nodes, cosmos.gl 3.3.0, `.next-e2e/BUILD_ID`, commit hash, date. Measurement commit (`33d6e58f`) precedes all 24-02 unification commits (`e499bc39`, `6665b28e`, `ce8b34f6`). Discloses pre-existing unrelated WIP present in the working tree at build time and verifies (via `git diff`) it did not touch the DIM-03 id-space files — sequencing intent holds. |
| 2 | Group-by and Color-by resolve from ONE shared id-space; the two independently-maintained 3-string arrays no longer exist | ✓ VERIFIED | `groupByDimensions.ts` has no local `PRESETS` array — imports `PRESET_DIMENSION_IDS` from `./dimensionIdSpace`. `nodeColors.ts` has no hardcoded `["role","project","user"]` literal — `COLOR_MODES` is derived via `PRESET_DIMENSION_IDS.map(colorModeIdForCatalogId)`. Both files confirmed importing from `./dimensionIdSpace` (source read directly). |
| 3 | Existing dimension tests (`groupByDimensions.test.ts`, `nodeColors.test.ts`) pass UNTOUCHED — the invariance gate | ✓ VERIFIED | `git diff --stat e9b95abc..HEAD -- groupByDimensions.test.ts nodeColors.test.ts` is empty (zero diff across all phase commits). Only new test file is `dimensionIdSpace.test.ts`. `npm test` confirms 2538 passed, 1 skipped (matches SUMMARY claim exactly, includes the 3 new tests). |
| 4 | `dimensionRegistry.ts` no longer falsely claims `RUNTIME_DIMENSION_IDS` is "the single source of truth for what the runtime uses"; replacement states real ownership | ✓ VERIFIED | Source read at `dimensionRegistry.ts:313-333`: comment now states catalog = id-space of record (sliders/grouping/clustering, picker list lives in `dimensionIdSpace.ts`); registry = color descriptors + filter-chip metadata + legacy 6-slider target list; registry explicitly not retired (owner decision). `grep -c "single source of truth for what the runtime uses"` → 0 matches. |
| 5 | Baseline record is honest — real measured numbers, not estimates, with full required content | ✓ VERIFIED | `24-BASELINE.md` contains: median time-to-graph-rendered, median first-paint, 5-run table (cold run flagged), cosmos.gl version + patch, node count, BUILD_ID, commit hash, date, verbatim GPU-2D-sim-OFF caveat citing `GraphCanvas.tsx:137-139`, verbatim stale-figure-superseded caveat, and Phase 28 re-run instructions with exact commands. |
| 6 | `scripts/measure-spatial-graph-baseline.cjs` and `tests/e2e/spatial-graph-baseline.spec.ts` exist, are committed, and are genuinely re-runnable (not stubs) | ✓ VERIFIED | Both files read in full: orchestrator does real preflight/env-record/spawn/merge logic (stdlib-only, no stub); spec does real N=5 fresh-context Playwright measurement with rAF-poll timing and JSON output. `git ls-files` confirms both committed. |
| 7 | PERF-04 remains Pending in REQUIREMENTS.md (Phase 28's job, not Phase 24's) | ✓ VERIFIED | REQUIREMENTS.md line 136-140: checkbox `[ ]`, text explicitly states "Not yet complete — the no-regression comparison is Phase 28's job." Table line 233: `\| PERF-04 \| Phase 28 \| Pending (baseline captured Phase 24) \|` — exact expected wording. |
| 8 | `npx tsc --noEmit` and `npm test` pass green (independently re-run by verifier, not sourced from SUMMARY) | ✓ VERIFIED | Verifier ran both directly: `npx tsc --noEmit` → 0 errors/0 output. `npm test` → "Test Files 330 passed \| 1 skipped (331)", "Tests 2538 passed \| 1 skipped (2539)". |

**Score:** 8/8 truths verified (0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/(dashboard)/users/access-analysis/dimensionIdSpace.ts` | `PRESET_DIMENSION_IDS` catalog id-space of record + bridge | ✓ VERIFIED | Exists, substantive (31 lines, real logic), imported by both consumers |
| `app/(dashboard)/users/access-analysis/dimensionIdSpace.test.ts` | Locks preset order + bridge resolution | ✓ VERIFIED | 3 tests: order lock, identity-bridge, registry-id guard on bridge entries |
| `app/(dashboard)/users/access-analysis/groupByDimensions.ts` | Local PRESETS deleted, imports from dimensionIdSpace | ✓ VERIFIED | Confirmed no local array; imports `PRESET_DIMENSION_IDS` |
| `app/(dashboard)/users/access-analysis/nodeColors.ts` | COLOR_MODES derived, not hardcoded | ✓ VERIFIED | Confirmed `COLOR_MODES = PRESET_DIMENSION_IDS.map(colorModeIdForCatalogId)` |
| `app/(dashboard)/users/access-analysis/dimensionRegistry.ts` | Doc comment corrected | ✓ VERIFIED | Comment-only change, accurate ownership statement present |
| `scripts/measure-spatial-graph-baseline.cjs` | Re-runnable orchestrator | ✓ VERIFIED | Stdlib-only, real preflight/env-record/spawn/merge logic |
| `tests/e2e/spatial-graph-baseline.spec.ts` | N=5 measured-load Playwright spec | ✓ VERIFIED | Real fresh-context measurement + rAF-poll timing, no stub |
| `.planning/phases/24-baseline-dimension-id-unification/24-BASELINE.md` | First-class baseline record | ✓ VERIFIED | Full required content present, verified above |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `groupByDimensions.ts` | `dimensionIdSpace.ts` | `import { PRESET_DIMENSION_IDS } from "./dimensionIdSpace"` | ✓ WIRED | Confirmed line 9 |
| `nodeColors.ts` | `dimensionIdSpace.ts` | `import { PRESET_DIMENSION_IDS, colorModeIdForCatalogId } from "./dimensionIdSpace"` | ✓ WIRED | Confirmed line 30, used at line 66-67 |
| `scripts/measure-spatial-graph-baseline.cjs` | `tests/e2e/spatial-graph-baseline.spec.ts` | `npx playwright test spatial-graph-baseline --config playwright.verify.config.ts` | ✓ WIRED | Confirmed in `runPlaywright()` |
| `spatial-graph-baseline.spec.ts` | `window.__ACC_GRAPH_TEST__` | `isReady()` + `getRenderedNodeCount()` rAF poll | ✓ WIRED | Confirmed in `measureOnce()` |

### Behavioral Spot-Checks / Gates (independently re-run by verifier)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Typecheck | `npx tsc --noEmit` | 0 errors | ✓ PASS |
| Unit/component tests | `npm test` | 330 files, 2538 passed / 1 skipped | ✓ PASS (matches SUMMARY claim exactly) |
| Invariance gate | `git diff --stat e9b95abc..HEAD -- groupByDimensions.test.ts nodeColors.test.ts` | empty | ✓ PASS |
| DIM-06 string removal | `grep -c "single source of truth for what the runtime uses" dimensionRegistry.ts` | 0 | ✓ PASS |
| Scope fence: `/access-analysis` charts page | `git diff --stat e9b95abc..HEAD -- "app/(dashboard)/access-analysis/"` | empty | ✓ PASS |
| Scope fence: `/users/spatial-graph` route dir | `git diff --stat e9b95abc..HEAD -- "app/(dashboard)/users/spatial-graph/"` | empty | ✓ PASS |
| Scope fence: consumer components untouched | diff on `Toolbar.tsx`, `GroupByControls.tsx`, `AccessAnalysisShell.tsx`, `dimensionCatalog.structural.ts` | empty | ✓ PASS |
| Scope fence: no dep/schema drift | diff on `package.json`, `package-lock.json`, `prisma/schema.prisma` | empty | ✓ PASS |
| Debt markers | grep TBD/FIXME/XXX/TODO/HACK/placeholder on all 7 phase files | none found | ✓ PASS |
| Working tree clean for phase files | `git status --short \| grep <phase files>` | empty | ✓ PASS — all committed |

Note: `npm run build` / `npx next build` intentionally NOT run, per explicit instruction (would swap the live `:3000` dist).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| DIM-03 | 24-02 | Single unified dimension id-space | ✓ SATISFIED | Both option lists resolve from `dimensionIdSpace.ts`; local arrays deleted; REQUIREMENTS.md checkbox `[x]` |
| DIM-06 | 24-02 | Stale doc comment corrected | ✓ SATISFIED | `dimensionRegistry.ts` comment rewritten with accurate ownership; REQUIREMENTS.md checkbox `[x]` |
| PERF-04 (baseline half) | 24-01 | Baseline captured (verification half owned by Phase 28) | ✓ SATISFIED (partial, by design) | `24-BASELINE.md` committed; REQUIREMENTS.md checkbox correctly LEFT `[ ]` — text explicitly states "Not yet complete"; table correctly shows "Phase 28 / Pending (baseline captured Phase 24)" |

No orphaned requirements: REQUIREMENTS.md's phase-mapping table (line 243) lists exactly DIM-03, DIM-06 for Phase 24, matching both plans' `requirements:` frontmatter.

### Anti-Patterns Found

None. All 7 phase-scoped files (dimensionIdSpace.ts/.test.ts, groupByDimensions.ts, nodeColors.ts, dimensionRegistry.ts, measure-spatial-graph-baseline.cjs, spatial-graph-baseline.spec.ts) scanned for TBD/FIXME/XXX/TODO/HACK/placeholder/"not yet implemented" — zero matches.

### Human Verification Required

None. This phase is explicitly non-visual plumbing (owner-locked behavior-invariance bar), and the invariance is proven by an automated, byte-exact test-file diff rather than requiring a manual UI check. All claims were independently reproducible from source and command output.

### Dashboard Self-Check

- **Context:** `.planning/STATE.md`, `.planning/PROJECT.md` (not directly needed beyond STATE), `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, both PLAN.md, both SUMMARY.md, `24-BASELINE.md`, `24-CONTEXT.md` all read.
- **Scope matched:** `/users/spatial-graph` (spatial-graph shell under `app/(dashboard)/users/access-analysis/`) — confirmed distinct from `app/(dashboard)/access-analysis/` (23-panel charts page, untouched, verified by empty diff).
- **Exact artifacts:** every path/command verified directly against source and live command output (tsc, npm test, git diff, git log, grep) — no `VERIFY:` claims taken from SUMMARY without independent confirmation.
- **Repo roots:** no generic `src/...` paths encountered or used.
- **Data truth:** no data/loader changes; baseline record honestly discloses pre-existing unrelated WIP present at measurement build time and confirms it did not touch the id-space files.
- **UI constraints:** zinc theme untouched (no UI files touched at all — pure plumbing); no new WebGL; no card/motion changes; N/A for this phase's scope.
- **Boundary constraints:** no Prisma/component-boundary changes; `dimensionIdSpace.ts` is pure (no React/DOM/I/O), `import type` only from `dimensionRegistry` (no runtime cycle) — confirmed by source read.
- **Gates:** `npx tsc --noEmit` and `npm test` independently re-run by the verifier (not sourced from SUMMARY) — both green, matching SUMMARY's claimed counts exactly. `npm run build` deliberately skipped (live `:3000` protection).
- **VERIFY:** none outstanding.

---

_Verified: 2026-07-14_
_Verifier: Claude (gsd-verifier)_
