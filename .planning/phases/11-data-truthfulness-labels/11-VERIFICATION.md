---
phase: 11-data-truthfulness-labels
verified: 2026-06-30T09:30:00Z
status: human_needed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Rebuild /access-analysis on :3000 and confirm the muted header coverage line reads 'Activity data covers {N} of {M} ACC projects · Data Connector metadata covers {K} of {M}' — with live integers, zinc muted text, and no '428' appearing anywhere on the page"
    expected: "Header appears between StatStrip and ProjectPicker; activity count (~956) leads; DC count (~550) is the secondary clause; text is text-xs text-muted-foreground, legible on a projector"
    why_human: "Coverage header requires a live RSC render on :3000 — jsdom tests confirm the testid/structure but not the pixel-level zinc styling or projector legibility"
  - test: "On the rebuilt /access-analysis page, hover (or tab to) the ⓘ icon next to the 'Activity by module' title"
    expected: "Tooltip appears ONLY on hover/focus (never always-on) with copy containing 'rawAction' and '~40.7%'; dismiss on mouse-out; no layout shift in the section header"
    why_human: "Hover/focus behavior is a Radix runtime interaction — the code is correctly structured (local TooltipProvider + TooltipTrigger) but a real browser is needed to confirm the tooltip fires, dismisses, and does not collide with the ActivityCoverageBadge"
  - test: "On the rebuilt /access-analysis page, view the Activity-over-time timeline section"
    expected: "A muted 'Data available from [Mon YYYY]' caption (month-year only, e.g. 'Nov 2024') appears below the chart; hovering the line shows 'Data from [Mon YYYY]' in the tooltip; both use zinc/semantic CSS variable styling"
    why_human: "The caption renders only when dataFloor is non-null (live DB-derived); the tooltip line is inside the ECharts formatter — both need a live RSC data fetch and a real browser to confirm"
  - test: "On the rebuilt /access-analysis page, expand 'Folder Activity by Role' and scan all project rows"
    expected: "Every row shows a human project name or the literal 'Unknown project' — no row shows a 32-character hex GUID"
    why_human: "The GUID-suppression fix requires the rebuilt RSC to fetch real AccProject + AccDcProject names from Postgres; jsdom tests confirm the resolver logic but not the live row rendering"
  - test: "Toggle light/dark mode on /access-analysis and inspect the timeline caption, coverage header, and tooltip text"
    expected: "All Phase 11 text elements render at readable contrast in both light and dark; cAxis (zinc-400 dark / zinc-600 light) and text-muted-foreground resolve correctly; no hardcoded color leaks visible"
    why_human: "CSS-variable resolution and ECharts cAxis/cTitle derived from useTheme() can only be confirmed by a real browser render in both theme states"
---

# Phase 11: Data-Truthfulness Labels — Verification Report

**Phase Goal:** `/access-analysis` honestly labels its data coverage for the workshop — activity/DC coverage, ACCDS date floor, module-donut caveat, and role-fallback docs are all visible or recorded.
**Verified:** 2026-06-30T09:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification.

---

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | A restrained muted header line leads with free-crawl activity coverage (~956/1,153 live), DC-metadata labeled separately (~550/1,153); no "428" framing; GUID fix returns names or "Unknown project" | ✓ VERIFIED | `data-testid="coverage-header"` at AccessAnalysisCharts.tsx:259 uses `covCovered`/`covTotal` (live) + `dcCoverage.covered`/`dcCoverage.total` (live). `rg "428"` returns 0 matches. `resolveProjectName` replaces `?? r.projectId`. |
| 2 | Activity timeline shows "Data available from [Mon YYYY]" caption + per-scope floor in hover tooltip; sourced from live `dataFloor` (`MIN(createdAt)`); zinc theme + semantic CSS vars | ✓ VERIFIED | `activityTimelineView.ts` returns `ActivityTimelineResult { rows, dataFloor, floorByProject }`. `ActivityTimelineChart.tsx:168-175` renders `data-testid="timeline-data-floor"`. Tooltip formatter at line 122-124 appends floor line. Colors via `useTheme()` → zinc-derived `cAxis`. 7 chart Vitests pass including 2 floor caption tests. |
| 3 | Module-activity donut carries hover/focus-only ⓘ Radix tooltip stating rawAction-based classification and ~40.7% unreconciled `service` gap | ✓ VERIFIED | `AccessAnalysisCharts.tsx:457-490` shows local `TooltipProvider` + `TooltipContent data-testid="module-caveat"` with "rawAction" and "~40.7%" text. `rg "rawAction"` confirms presence at line 485. No always-on caption code path present. |
| 4 | `.planning/codebase/INTEGRATIONS.md` documents `AccDcRole`-empty → `AccRole` fallback and DC-conflict behavior | ✓ VERIFIED | INTEGRATIONS.md lines 67-101: expanded "Role-name fallback (`AccDcRole` → `AccRole`)" subsection documents: empty reason, fallback via `mergeRoleNames` in `lib/server/accessInstanceView.ts`, DC-wins precedence, silent-drop behavior, downstream label requirement. |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/codebase/INTEGRATIONS.md` | AccDcRole→AccRole fallback + DC-conflict doc | ✓ VERIFIED | Lines 67-101 expanded subsection; `mergeRoleNames` cited at `lib/server/accessInstanceView.ts` |
| `lib/server/folderActivityView.ts` | `resolveProjectName` + `buildProjectNameMap` exports; no `?? r.projectId`; "Unknown project" fallback | ✓ VERIFIED | Both functions exported at lines 31-57. `resolveProjectName` returns "Unknown project" when id is absent or blank. No `?? r.projectId` pattern anywhere in file. |
| `lib/server/__tests__/folderActivityView.test.ts` | 7 Vitests pinning the pure name-resolution transform | ✓ VERIFIED | 7 tests pass: name-present resolves, absent → "Unknown project", blank → "Unknown project", AccProject-only id resolves, AccProject wins on conflict, map-builder both-sources, map-builder empty |
| `lib/server/activityTimelineView.ts` | Returns `ActivityTimelineResult { rows, dataFloor, floorByProject }`; `buildFloors` exported; `MIN(createdAt)` floor query | ✓ VERIFIED | `ActivityTimelineResult` interface at line 8; `buildFloors` pure export at line 34; parallel floor SQL at lines 100-104 |
| `lib/server/__tests__/activityTimelineView.test.ts` | 6 Vitests for `buildFloors` (account-wide min, per-project, YYYY-MM, null input) | ✓ VERIFIED | 6 tests pass: empty input, single project, multi-project min, account-level bucket, format assertion, null projectId coerce |
| `app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx` | `data-testid="timeline-data-floor"` caption; floor in tooltip formatter; `useTheme()` color resolution | ✓ VERIFIED | Caption at lines 168-175; tooltip floor line at 122-124; `useTheme()` → `resolvedTheme` → zinc-derived `cAxis`/`cTitle` at lines 32-34, 66-68 |
| `lib/server/dcCoverageView.ts` | `loadDcCoverage()` live `accDcProject.count()` + `accProject.count()`; `assembleDcCoverage` pure export; no hard-coded 550/1153 | ✓ VERIFIED | `assembleDcCoverage` at line 27; `loadDcCoverage` at line 37; live counts at lines 41-42; no hard-coded fallback constants |
| `lib/server/__tests__/dcCoverageView.test.ts` | 3 TDD Vitests for `assembleDcCoverage` | ✓ VERIFIED | 3 tests pass: verbatim return, covered ≤ total invariant, zero-input |
| `app/(dashboard)/access-analysis/mainCharts.tsx` | Loads `loadDcCoverage` + `loadActivityTimeline`; passes `timeline.rows`, `timeline.dataFloor`, `timeline.floorByProject`, `dcCoverage` to AccessAnalysisCharts | ✓ VERIFIED | Lines 30-40: all 8 loaders in `Promise.all`; lines 63-70: all floor + DC props passed |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` | `data-testid="coverage-header"` with live counts; module ⓘ `TooltipContent data-testid="module-caveat"` with rawAction + 40.7% | ✓ VERIFIED | Coverage header at lines 258-274 (no "428", all live props). Module tooltip at lines 457-490 (local TooltipProvider, correct copy). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `mainCharts.tsx` | `lib/server/activityTimelineView.ts` | `loadActivityTimeline()` destructured to `timeline`; `.rows/.dataFloor/.floorByProject` passed to `AccessAnalysisCharts` | ✓ WIRED | Lines 38, 63-65 verified |
| `mainCharts.tsx` | `lib/server/dcCoverageView.ts` | `loadDcCoverage()` → `dcCoverage` prop to `AccessAnalysisCharts` | ✓ WIRED | Lines 21, 39, 70 verified |
| `AccessAnalysisCharts.tsx` | `ActivityTimelineChart.tsx` | `dataFloor={dataFloor}` + `floorByProject={floorByProject}` prop pass | ✓ WIRED | Props accepted at `AccessAnalysisCharts` interface (lines 88-92); threaded through to `ActivityTimelineChart` at the chart call site |
| `AccessAnalysisCharts.tsx` | `components/ui/tooltip.tsx` (Radix) | Local `TooltipProvider` wrapping module ⓘ `TooltipTrigger`/`TooltipContent` | ✓ WIRED | Import at lines 32-36; usage at lines 457-490. Local provider confirmed (no global `TooltipProvider` in this tree) |
| `lib/server/folderActivityView.ts` | `AccProject` + `AccDcProject` Prisma models | `db.accProject.findMany()` in `Promise.all` alongside `db.accDcProject.findMany()` | ✓ WIRED | `Promise.all` at lines 78-93; `buildProjectNameMap(accProjects, dcProjects)` called at line 95 |
| `lib/server/folderActivityView.ts` | `resolveProjectName` (pure helper) | Calls `resolveProjectName(nameById, r.projectId)` in the row map; replaces old `?? r.projectId` | ✓ WIRED | Line 100 confirmed; old fallback pattern absent from file |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `ActivityTimelineChart.tsx` | `dataFloor` (string \| null) | `loadActivityTimeline()` → parallel SQL `MIN(createdAt)` over `AccActivityAccds` → `buildFloors()` | Yes — live Postgres query, not hardcoded | ✓ FLOWING |
| `AccessAnalysisCharts.tsx` | `covCovered` / `covTotal` (coverage header) | `activityCoverageCounts(coverage)` where `coverage = loadProjectCoverage()` live DB query | Yes — existing live query, reused | ✓ FLOWING |
| `AccessAnalysisCharts.tsx` | `dcCoverage.covered` / `dcCoverage.total` | `loadDcCoverage()` → `db.accDcProject.count()` + `db.accProject.count()` | Yes — two live `count()` Prisma queries | ✓ FLOWING |
| `AccessAnalysisCharts.tsx` | Module ⓘ tooltip "~40.7%" figure | Static calibrated constant (verified diagnostic finding from scripts referenced in STATE.md) | N/A — labeled as known constant per plan decision | ✓ ACCEPTABLE |
| `folderActivityView.ts` (via `FolderActivityReveal`) | `projectName` in `ProjectActivityTotal[]` | `buildProjectNameMap(accProjects, dcProjects)` from live `AccProject` + `AccDcProject` DB fetch | Yes — both sources queried live; "Unknown project" for unresolved | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `buildFloors` pure aggregation: 6 Vitests | `npx vitest run lib/server/__tests__/activityTimelineView.test.ts` | 6/6 PASS (292ms) | ✓ PASS |
| `resolveProjectName` + `buildProjectNameMap`: 7 Vitests | `npx vitest run lib/server/__tests__/folderActivityView.test.ts` | 7/7 PASS | ✓ PASS |
| `assembleDcCoverage`: 3 TDD Vitests | `npx vitest run lib/server/__tests__/dcCoverageView.test.ts` | 3/3 PASS | ✓ PASS |
| `ActivityTimelineChart` floor caption: 2 new Vitests (jsdom) | `npx vitest run "app/(dashboard)/access-analysis/__tests__/ActivityTimelineChart.test.tsx"` | 5/5 PASS (3 existing + 2 new) | ✓ PASS |
| Page RSC mock shape updated for new loaders | `npx vitest run "app/(dashboard)/access-analysis/page.test.tsx"` | 2/2 PASS | ✓ PASS |
| All 5 Phase 11 Vitest files combined | Combined run | 23/23 PASS | ✓ PASS |
| Whole-tree type-safety gate | `npx tsc --noEmit` | Clean — exit 0, no output | ✓ PASS |

---

### Probe Execution

Step 7c: SKIPPED — no probe scripts declared for Phase 11. Phase is UI/data-label work; no migration or CLI-tooling probes needed.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TRUTH-01 | 11-02 (GUID fix) + 11-04 (header) | Live coverage header + GUID-suppression fix | ✓ SATISFIED | Coverage header in AccessAnalysisCharts.tsx; resolveProjectName in folderActivityView.ts |
| TRUTH-02 | 11-03 | Activity timeline dataFloor caption + tooltip | ✓ SATISFIED | ActivityTimelineResult type change; floor caption in ActivityTimelineChart.tsx |
| TRUTH-03 | 11-04 | Module donut ⓘ hover tooltip (rawAction + 40.7%) | ✓ SATISFIED | TooltipContent data-testid="module-caveat" with rawAction + 40.7% text in AccessAnalysisCharts.tsx |
| TRUTH-04 | 11-01 | INTEGRATIONS.md role-fallback + DC-conflict doc | ✓ SATISFIED | INTEGRATIONS.md lines 67-101 expanded subsection |

**REQUIREMENTS.md traceability warning:** The REQUIREMENTS.md checkbox for TRUTH-03 remains `[ ]` (unchecked) and the status table shows "Pending" at line 91, despite implementation being complete and verified. The TRUTH-01 requirement description still references the stale "428 of 1,152" framing that was owner-rejected; the implementation correctly follows the ROADMAP's SC1 and 11-CONTEXT.md direction instead. Both are administrative documentation gaps — neither is a code gap. REQUIREMENTS.md should be updated: TRUTH-03 → `[x]` and table row → "Complete"; TRUTH-01 description wording is advisory only.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | No debt markers (TBD/FIXME/XXX), no placeholder implementations, no hardcoded 428/550/956/1153 literals in JSX, no `?? r.projectId` GUID fallback remaining | 
| `ActivityTimelineChart.tsx` line 8 | `const ACCENT = "#38bdf8"` hardcoded hex | Info | Not a stub — this is the consistent sky-400 accent used across the timeline (same as Model-Coordination module color). `cAxis`/`cTitle` ARE resolved via `useTheme()`. Acceptable per Dashboard pattern. |

---

### Human Verification Required

These items require a rebuild on `:3000` (do NOT run `npm run build` while :3000 is serving) and browser inspection. All were explicitly deferred to end-of-phase per `human_verify_mode: end-of-phase` in the plan config.

#### 1. Coverage Header Visual Appearance

**Test:** Rebuild /access-analysis on :3000. Inspect the area between `StatStrip` and `ProjectPicker`.
**Expected:** A muted text-xs line reads "Activity data covers {N} of {M} ACC projects · Data Connector metadata covers {K} of {M}" with live integers (~956 and ~550 respectively); rendered in `text-muted-foreground` zinc-dark styling; legible on a projector.
**Why human:** CSS-variable resolution and real RSC data flow can only be confirmed in a live browser; jsdom confirms `data-testid="coverage-header"` renders but not zinc styling or projector legibility.

#### 2. Module ⓘ Tooltip Hover Behavior

**Test:** On the rebuilt /access-analysis page, hover (or tab to) the ⓘ icon next to the "Activity by module" section title.
**Expected:** Tooltip appears ONLY on hover/focus — never always-visible. Copy must contain "rawAction" and "~40.7%". Tooltip dismisses on mouse-out. The ⓘ icon does not collide with the `ActivityCoverageBadge` sitting adjacent to it in the same badge slot.
**Why human:** Radix tooltip hover/focus triggering and dismiss behavior require a real browser render; the structural code is correct but interaction cannot be confirmed by Vitest jsdom.

#### 3. Timeline Floor Caption and Tooltip Line

**Test:** View the "Activity over time" panel on the rebuilt /access-analysis page; hover the chart line.
**Expected:** "Data available from [Mon YYYY]" caption appears below the EChart (month-year only, e.g. "Nov 2024"); the hover tooltip also contains "Data from [Mon YYYY]" in muted color; no daily precision (no "Nov 15, 2024"); caption hidden in the empty state.
**Why human:** ECharts tooltip formatter runs in the browser rendering engine; floor value requires a live Postgres query via the RSC; visual checks confirm zinc-color legibility.

#### 4. Folder Activity by Role — No Raw GUIDs

**Test:** On the rebuilt /access-analysis page, expand the "Folder Activity by Role" panel and scan all project rows.
**Expected:** Every row shows a human-readable project name or the literal "Unknown project" — no 32-character hex GUID visible.
**Why human:** Requires live AccProject + AccDcProject data from Postgres to confirm the merged name map resolves all ACCDS projectIds.

#### 5. Light/Dark Mode Color Resolution

**Test:** Toggle light/dark mode on /access-analysis and inspect the coverage header, timeline floor caption, and tooltip text.
**Expected:** All Phase 11 text elements remain readable in both modes; `cAxis` and `cTitle` values (zinc-400 / zinc-600 derived from `useTheme()`) render correctly; `text-muted-foreground` CSS variable resolves as expected in both themes.
**Why human:** CSS-variable and ECharts color resolution can only be confirmed by visual browser inspection in both theme states.

---

### Gaps Summary

No implementation gaps identified. All 4 ROADMAP success criteria are verified at the code level:
- SC1 (TRUTH-01): Coverage header live + GUID fix complete.
- SC2 (TRUTH-02): dataFloor caption + tooltip wired from Postgres MIN(createdAt).
- SC3 (TRUTH-03): Module ⓘ tooltip structurally correct with local TooltipProvider.
- SC4 (TRUTH-04): INTEGRATIONS.md expanded with verified mergeRoleNames citation.

**Administrative items for follow-up (non-blocking):**
- REQUIREMENTS.md TRUTH-03 checkbox (`[ ]`) and table row ("Pending") should be updated to match the completed state.
- REQUIREMENTS.md TRUTH-01 description references the stale "428" framing — advisory text can be updated to reflect the owner-corrected free-crawl framing.

**Deferred per plan (`human_verify_mode: end-of-phase`):** Visual UAT rebuild on :3000 covering all 5 human verification items above. Deploy = `npm run build` + Task Scheduler restart. Do NOT rebuild while :3000 is actively serving.

---

## Dashboard Self-Check

- **Context:** `.planning/STATE.md` (Phase 11 complete), `.planning/PROJECT.md`, `.planning/ROADMAP.md` (Phase 11 SCs verified), `.planning/REQUIREMENTS.md` (TRUTH-01..04 cross-referenced), `11-CONTEXT.md`, `11-01/02/03/04-PLAN.md + SUMMARY.md` (all read), live source files read directly.
- **Evidence:** Exact file paths and line references verified from actual repo files. Vitests run and confirmed 23/23 pass. `npx tsc --noEmit` run and confirmed clean. `rg "428"` in AccessAnalysisCharts.tsx: 0 matches. `rg "rawAction"` in AccessAnalysisCharts.tsx: 1 match (line 485, tooltip content). `?? r.projectId` absent from folderActivityView.ts. All 9 phase 11 commits verified in `git log`.
- **Constraints:** Zinc theme: semantic CSS vars (`text-muted-foreground`, `text-[10px]`, `text-xs`) used throughout. ECharts colors resolved via `useTheme()` → `resolvedTheme` → zinc-derived `cAxis`/`cTitle`. No new WebGL: confirmed (no WebGL imports in any Phase 11 file). `/users/spatial-graph` untouched: confirmed (0 matches in phase 11 file set). DB access stays in `lib/server/`: confirmed (dcCoverageView, activityTimelineView, folderActivityView all in `lib/server/`; no Prisma in components). Coverage integers live (not hardcoded): confirmed.
- **Gates:** `npx tsc --noEmit` (CLEAN), `npx vitest run` 23/23 (PASS). Rebuild on :3000 deferred — owner-driven step per deploy-sequence.md.
- **VERIFY:** (1) REQUIREMENTS.md TRUTH-03 checkbox needs updating. (2) Visual UAT rebuild items above (5 items) are unresolved — these are the human_needed items blocking a `passed` status.

---

_Verified: 2026-06-30T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
