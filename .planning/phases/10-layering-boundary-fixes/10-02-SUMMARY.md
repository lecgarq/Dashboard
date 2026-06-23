---
phase: "10"
plan: "02"
subsystem: lib/acc, app/(dashboard)/access-analysis, scripts
tags: [boundary-fix, BND-02, classifier-extraction, zero-behavior-change]
dependency_graph:
  requires: []
  provides: [lib/acc/activityClassification.ts, moduleOverrides-barrel]
  affects: [app/(dashboard)/access-analysis/moduleOverrides.ts, scripts/diag-activity-*.cjs]
tech_stack:
  added: []
  patterns: [pure-re-export-barrel, lib-acc-classifier]
key_files:
  created:
    - lib/acc/activityClassification.ts
    - lib/acc/activityClassification.test.ts
  modified:
    - app/(dashboard)/access-analysis/moduleOverrides.ts
    - scripts/diag-activity-coordination.cjs
    - scripts/diag-activity-types.cjs
    - scripts/diag-activity-service-xtab.cjs
    - scripts/diag-activity-module-audit.cjs
decisions:
  - "Verbatim move: all classification logic, mapping tables, and exported symbols copied byte-for-byte; only the two taxonomy import paths updated to @/ alias"
  - "moduleOverrides.ts becomes a 4-line pure re-export barrel so all existing UI importers (ModulesPieChart.tsx, moduleCounts.ts, moduleCounts.test.ts) resolve unchanged"
  - "lib->app taxonomy edge (activityClassification.ts -> accTaxonomy/accNormalize) is DOCUMENTED-DEFERRED per BND-03; not an error here"
  - "Verify one-liner from plan errored due to shell escaping (checker note #3 anticipated); fallback evidence used (grep + simplified Node script)"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-23"
  tasks: 2
  files: 7
status: complete
---

# Phase 10 Plan 02: BND-02 Activity Classifier Extraction Summary

**One-liner:** Verbatim move of pure activity-classification logic from `app/(dashboard)/access-analysis/moduleOverrides.ts` to `lib/acc/activityClassification.ts`; `moduleOverrides.ts` becomes a pure re-export barrel; four diagnostic scripts repointed; `no-scripts-to-app` warning count drops 6→2.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Move classifier verbatim to lib/acc + pin test | 226b9bbf | lib/acc/activityClassification.ts, lib/acc/activityClassification.test.ts |
| 2 | Re-export barrel + repoint 4 diag scripts + repo-map regen | 2b838711 | app/(dashboard)/access-analysis/moduleOverrides.ts, 4x scripts/diag-activity-*.cjs |

## Verification Evidence

### Gates Run

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS (no errors) |
| `npx vitest run lib/acc/activityClassification.test.ts` | PASS — 11/11 tests |
| `npm run repo-map` | Completed; artifacts regenerated (gitignored, not committed) |
| `node scripts/repo-map/check.cjs` | PASS — 2 warnings (down from 6) |
| `node -e "...moduleOverrides scripts->app count..."` | 0 (simplified Node script, no shell escaping issue) |
| `grep -r "moduleOverrides" scripts/diag-activity-*.cjs` | no matches (scripts fully repointed) |
| `grep ... moduleOverrides.ts re-export line` | present at line 4 |

### Remaining `no-scripts-to-app` warnings (2, expected, deferred)

Both are `scripts/build-instance-features.ts -> app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts` and `instanceFeatureTokens.ts` — spatial-graph-coupled edges that are OUT OF SCOPE per BND-03 and documented-deferred to Phase 14.

## Deviations from Plan

### [Rule 3 - Deviation from verify command] Plan's Task 2 verify one-liner failed due to shell escaping

- **Found during:** Task 2 verification
- **Issue:** The `node -e "..."` one-liner in the plan's `<verify>` block failed with a `SyntaxError` due to shell escaping of backslashes in the regex normalization (`replaceAll('\\\\','/') `). This is exactly the scenario flagged in checker note #3 ("brittle to schema changes — fine as-is, just be aware if it errors").
- **Fix:** Applied the documented fallback — `node scripts/repo-map/check.cjs` (shows 2 warnings, down from 6) + `grep -r "moduleOverrides" scripts/diag-activity-*.cjs` (no output) + a simplified Node script without regex escaping confirmed 0 `moduleOverrides` warnings. Evidence is equivalent.
- **Files modified:** None — no code change, only verify approach.

### None on implementation — plan executed exactly as written.

## Workshop Impact

- **Invisible to the audience.** No rendered behavior changed on `/access-analysis` (same `classifyActivity`/`donutModules`/`CATEGORY_LABELS` output via the re-export barrel).
- `/template-mty` and `/users/spatial-graph` untouched.

## Data Truthfulness

- No data change. Same Prisma models, same rawAction-based classification, same donut output.
- The `/access-analysis` module-activity donut renders identically.

## Known Stubs

None. Implementation is complete and wired.

## Threat Flags

None. This plan moves existing code between module locations with no new network endpoints, auth paths, or schema changes.

## Dashboard Self-Check

- **Context:** `.planning/STATE.md`, `10-02-PLAN.md`, `10-CONTEXT.md`, `app/(dashboard)/access-analysis/moduleOverrides.ts` (source), `lib/acc/activityClassification.ts` (target), 4 diag script files, `.tools/repo-map/dependency-cruiser.json` (regenerated).
- **Evidence:** All paths repo-verified. `moduleOverrides.ts` exports confirmed from source (5 exports: classifyActivity, donutModules, CATEGORY_LABELS, CATEGORY_ORDER, UNMAPPED_MODULE; no `n()` export). 4 diag script import lines confirmed at exact line numbers. `lib/acc/` directory confirmed existing. `dependency-cruiser.json` warning count confirmed via Node script.
- **Constraints applied:** Zinc theme untouched (no UI change); no new WebGL; `/users/spatial-graph` files not touched; verbatim move (zero logic change); lib->app taxonomy edge documented-deferred per BND-03.
- **Gates run:** `npx tsc --noEmit` (PASS), `npx vitest run` 11/11 (PASS), `npm run repo-map` + `node scripts/repo-map/check.cjs` (2 warnings, PASS), grep confirmation (PASS). Rebuild/donut spot-check deferred to Plan 10-03's checkpoint (as planned).
- **VERIFY:** none — all claims verified from repo files and command output.

## Self-Check

- [x] `C:/LECG/Dashboard/lib/acc/activityClassification.ts` — exists
- [x] `C:/LECG/Dashboard/lib/acc/activityClassification.test.ts` — exists
- [x] `C:/LECG/Dashboard/app/(dashboard)/access-analysis/moduleOverrides.ts` — is pure re-export barrel
- [x] Commit 226b9bbf — exists (Task 1)
- [x] Commit 2b838711 — exists (Task 2)
- [x] `no-scripts-to-app` count = 2 (was 6), 0 on moduleOverrides path

## Self-Check: PASSED
