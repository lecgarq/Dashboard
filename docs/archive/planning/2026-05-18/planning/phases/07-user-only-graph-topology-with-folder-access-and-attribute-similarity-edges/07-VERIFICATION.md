---
phase: 07-user-only-graph-topology-with-folder-access-and-attribute-similarity-edges
verified: 2026-05-12T10:25:00Z
status: human_needed
score: 12/12 code must-haves verified (live UAT explicitly deferred per user directive 2026-05-12)
re_verification: false
human_verification:
  - test: "FPS at hub-scale (idle, pan/zoom, physics slider scrub) with all 5 sim dims ON + folders ON"
    expected: "≥30 fps in 2D; physics-slider scrub stays smooth (Pitfall 5 gate)"
    why_human: "Live cosmos.gl GPU upload + render at hub scale cannot be measured programmatically; explicitly deferred to phase-end manual UAT per user directive"
  - test: "Hover popover / click-through / cross-widget spotlight on folder hubs"
    expected: "Folder hub hover shows informative popover; click opens DashboardSidePanel with folder body content; cross-widget spotlight fires"
    why_human: "Visual + interactivity quality (DASH-18 contract) — surfaces wired in code, but UX-completeness is a human observation"
  - test: "Toggle view=user-only round-trip"
    expected: "All non-user nodes vanish; user nodes + 5-color similarity edges remain; toggle back restores"
    why_human: "Visual confirmation of setVisibleIndices behavior end-to-end"
  - test: "URL paste-in-new-tab restores Phase 7 filter state"
    expected: "filter panel renders with same 5 Phase 7 axes pre-set"
    why_human: "Manual browser action; round-trip itself unit-tested but full browser path is human-observable"
---

# Phase 7: User-only Graph Topology — Verification Report

**Phase Goal:** User-only graph topology with folder access and attribute-similarity edges. Both 2D (Cosmos.gl `AccUsersGraph`) and 3D (`Sphere3DGraph`) renderers gain: folder hubs, role↔folder permission edges (4 tiers), user↔user similarity edges (5 dimensions), and a user-only view toggle. All controls URL-persisted.

**Verified:** 2026-05-12
**Status:** human_needed (all CODE must-haves verified; live FPS + interactivity UAT deferred to phase end per Luis directive 2026-05-12)
**Re-verification:** No — initial verification.

## Phase Setup Context

- PHASE-DEPS.md gate recorded `DECISION: 3D-WIRING=DEFER` and `DECISION: 3D-FOLDERS=NO-GO` (Phase 6 has shipped 0/10 SUMMARYs). Plans 07-07 and 07-08 are intentional deferred-stub SUMMARYs and are NOT counted as missing.
- 07-09 PERF-REPORT.md contains DEFERRED markers for live FPS / interactivity UAT — explicitly punted to phase-end manual UAT per user directive (2026-05-12); NOT a gap.
- Requirements GRAPH7-01..12 are referenced by plan frontmatter but are not yet registered in `REQUIREMENTS.md`. Per user instruction, this is treated as a phase-setup gap rather than a missing-requirement gap.

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                              | Status                | Evidence                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Wave-0 dependency gate recorded with grep-friendly DECISION lines                                  | ✓ VERIFIED            | `PHASE-DEPS.md` has both `DECISION: 3D-FOLDERS=NO-GO` and `DECISION: 3D-WIRING=DEFER`                                                                                                                               |
| 2   | Pure folder-collapse module exists + Vitest green                                                  | ✓ VERIFIED            | `lib/acc/folderHubCollapse.ts` (130 lines, pure — no Prisma/React); 7 test cases pass                                                                                                                               |
| 3   | Pure similarity-edge module exists + Vitest green (incl. perf smoke)                               | ✓ VERIFIED            | `lib/acc/userSimilarity.ts` (164 lines, pure); 9 cases pass incl. 500-user × 10-role perf smoke <500ms                                                                                                              |
| 4   | `GraphFilters` extended with 5 new keys (showFolders, permTiers, simDims, simMin, viewMode) + defaults; `nodeMatchesFilters` honors viewMode + showFolders | ✓ VERIFIED            | `accGraphFilters.ts:18-25,56-64,77-81,119-120`. Tests in `accGraphFilters.test.ts` green (50 cases).                                                                                                                |
| 5   | 2D topology adapter consumes the two pure modules and emits folder hubs, role-folder, folder-project, and user-similarity edges (with permTier + dimension + weight) | ✓ VERIFIED            | `accGraphOrganicLayout.ts:4-8` imports; `:281-313` folder-hub emission; `:314-333` similarity-edge emission. 5 new tests in `accGraphTopology.test.ts` pass.                                                       |
| 6   | `GraphRenderNode.kind` union includes "folder"; folder color override bypasses `getCategoryColor`  | ✓ VERIFIED            | `graphRenderers.ts:36` `if (node.kind === "folder") return FOLDER_NODE_COLOR;` in `resolveRenderNodeColor`                                                                                                          |
| 7   | `buildLinkColorBuffer` accepts optional `perEdgeColors` for per-edge color override                | ✓ VERIFIED            | `cosmosUtils.ts:263-283` extended signature with `{ defaultColor?, perEdgeColors? }`                                                                                                                                |
| 8   | `AccUsersGraph` fetches `accFolders.getMatrix`, builds transitive `SimilarityInput` (user→role→folder), and passes through to topology — memoized so physics sliders don't recompute | ✓ VERIFIED            | `AccUsersGraph.tsx:723-779` query + memoized similarityInput; `:783-793` folder-hub rows; `:809-841` `buildExtendedTopology` deliberately excludes physics state (Pitfall 5 gate)                                  |
| 9   | Filter panel UI renders 5 new control groups (View mode, Show folders, Permission tiers, Similarity dimensions, Min-shared slider) | ✓ VERIFIED            | `AccUsersGraph.tsx:2606-2696` JSX block with all 5 controls present                                                                                                                                                 |
| 10  | URL round-trip for 5 keys (folders, ptiers, simDims, simMin, view) with non-default-only writer    | ✓ VERIFIED            | `AccUsersGraph.tsx:305-364` reader; `:375-399` writer with non-default-only emission; compact letter aliases v/u/e/c + fa/r/p/c/a                                                                                  |
| 11  | Per-edge color buffer driven by permTier (role-folder) and dimension (user-similarity)             | ✓ VERIFIED            | `AccUsersGraph.tsx:60-77` `PERM_TIER_COLOR` (4 hues) + `SIM_DIM_COLOR` (5 hues) + per-link color resolver                                                                                                            |
| 12  | viewMode=user-only drops every non-user-similarity link at adapter level; permTier/simDim toggles drop matching edges | ✓ VERIFIED            | `AccUsersGraph.tsx:821-838` post-topology edge filter implements the 3 drops                                                                                                                                        |
| 13  | 3D wiring (Plans 07-07, 07-08) deferred via gate, not missing                                      | ✓ VERIFIED (expected) | Both stub SUMMARYs cite `DECISION: 3D-WIRING=DEFER`; no sphere3d/* directory on disk (consistent with Phase 6 = 0/10)                                                                                              |
| 14  | Live FPS + interactivity UAT signed off                                                            | ? UNCERTAIN           | Plan 07-09 PERF-REPORT.md DECISION = `PHASE-7-ACCEPT=PENDING-MANUAL-UAT` — explicitly DEFERRED to phase-end manual UAT per user directive 2026-05-12. Not a gap by directive.                                       |

**Score:** 13/13 automatable truths verified · 1 truth awaits live UAT (explicitly deferred, not a gap)

### Required Artifacts

| Artifact                                                                | Expected                                                       | Status     | Details                                                                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `.planning/phases/07-…/PHASE-DEPS.md`                                   | Gate output with DECISION lines                                | ✓ VERIFIED | 41 lines; both DECISION lines present; re-probe triggers documented                                      |
| `lib/acc/folderHubCollapse.ts`                                          | `collapseFoldersToDepth` + `CollapsedFolder` + `FolderHubInputRow` | ✓ VERIFIED | 130 lines, pure, 7 tests green                                                                           |
| `lib/acc/folderHubCollapse.test.ts`                                     | Vitest coverage                                                | ✓ VERIFIED | 7 cases incl. empty, depth-collapse, union, dedup, escape hatch, cross-project                           |
| `lib/acc/userSimilarity.ts`                                             | `computeSimilarityEdges` + types + `SIMILARITY_DIMS`           | ✓ VERIFIED | 164 lines, pure, bucketed indexing                                                                       |
| `lib/acc/userSimilarity.test.ts`                                        | Vitest coverage (incl. perf smoke)                             | ✓ VERIFIED | 9 cases pass, perf smoke <500ms                                                                          |
| `app/(dashboard)/users/accGraphFilters.ts`                              | Extended GraphFilters + node predicate                         | ✓ VERIFIED | 163 lines; 5 new keys + types exported; predicate honors viewMode + showFolders                          |
| `app/(dashboard)/users/accGraphFilters.test.ts`                         | Coverage for new filter dims                                   | ✓ VERIFIED | 50 cases pass (existing + Phase 7 additions)                                                             |
| `app/(dashboard)/users/accGraphOrganicLayout.ts`                        | Extended hub/link kinds + buildAccTopologyGraph                | ✓ VERIFIED | 536 lines; folder + similarity emission paths present                                                    |
| `app/(dashboard)/users/graphRenderers.ts`                               | Folder color branch in `resolveRenderNodeColor`                | ✓ VERIFIED | Branch on `kind === "folder"` at line 36 (Pitfall 4 defended in both Canvas2D + cosmos color paths)      |
| `app/(dashboard)/users/cosmosUtils.ts`                                  | `buildLinkColorBuffer` accepts perEdgeColors                   | ✓ VERIFIED | Signature extended; legacy callers (no options) preserved                                                |
| `app/(dashboard)/users/accGraphTopology.test.ts`                        | Coverage for Phase 7 topology extensions                       | ✓ VERIFIED | New describe block with 5 cases passes                                                                   |
| `app/(dashboard)/users/AccUsersGraph.tsx`                               | Full 2D wiring + filter panel + URL + edge color buffer        | ✓ VERIFIED | 3777 lines; tRPC fetch, memoized SimilarityInput, panel JSX, URL R/W, per-edge color buffer all present  |
| `.planning/phases/07-…/PERF-REPORT.md`                                  | FPS + interactivity UAT findings                               | ⚠️ DEFERRED | Live FPS sections marked `DEFERRED TO MANUAL UAT`; DECISION = `PHASE-7-ACCEPT=PENDING-MANUAL-UAT` per Luis directive |
| `app/(dashboard)/users/sphere3d/*` (Plans 07-07, 07-08)                 | 3D wiring                                                      | ⏸ DEFERRED | Plans intentionally stubbed via PHASE-DEPS.md gate; not a Phase 7 gap                                    |

### Key Link Verification

| From                                | To                                                          | Via                                 | Status     | Details                                                                                         |
| ----------------------------------- | ----------------------------------------------------------- | ----------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| 07-07-PLAN.md / 07-08-PLAN.md       | `PHASE-DEPS.md`                                             | `DECISION: 3D-(WIRING\|FOLDERS)=`   | ✓ WIRED    | Both stub SUMMARYs cite the DECISION lines verbatim                                              |
| `lib/acc/folderHubCollapse.ts`      | `server/routers/acc-folders.ts:FolderMatrixRow` (structural) | local `FolderHubInputRow` matches    | ✓ WIRED    | Structural type kept pure; AccUsersGraph adapts query rows on read                              |
| `accGraphOrganicLayout.ts`          | `lib/acc/folderHubCollapse.ts:collapseFoldersToDepth`       | direct import                       | ✓ WIRED    | `accGraphOrganicLayout.ts:4` import + `:281-313` call                                            |
| `accGraphOrganicLayout.ts`          | `lib/acc/userSimilarity.ts:computeSimilarityEdges`          | direct import                       | ✓ WIRED    | `accGraphOrganicLayout.ts:8` import + `:323-333` call                                            |
| `AccUsersGraph.tsx`                 | `accFolders.getMatrix` tRPC                                 | `trpc.accFolders.getMatrix.useQuery` | ✓ WIRED    | Line 723; 600s stale-while-revalidate                                                            |
| `AccUsersGraph.tsx` (filter panel)  | URL params (folders, ptiers, simDims, simMin, view)         | `readFiltersFromUrl` + `writeFiltersToUrl` | ✓ WIRED    | Reader 305-364; writer 375-399; non-default-only emit keeps URL short                            |
| `AccUsersGraph.tsx` (edge buffer)   | cosmos `setLinkColors` via `buildLinkColorBuffer`           | `{ perEdgeColors }` option          | ✓ WIRED    | `PERM_TIER_COLOR` + `SIM_DIM_COLOR` LUTs flow into per-link resolver                             |

### Requirements Coverage

Per phase setup directive, GRAPH7-01..12 are not yet entered into REQUIREMENTS.md. They appear in plan frontmatter only. Treated as a known phase-setup gap (not a Phase-7 verification gap).

| Requirement (from plan frontmatter) | Source Plan(s)  | Code-level Status                                                                                              |
| ----------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| GRAPH7-01 (folder hub collapse)     | 07-02, 07-05, 07-07 | ✓ Code shipped 2D (folderHubCollapse + emission); 3D deferred                                              |
| GRAPH7-02 (folder-project edge)     | 07-05, 07-07    | ✓ Code shipped 2D; 3D deferred                                                                                 |
| GRAPH7-03 (role-folder edge + tier) | 07-05, 07-07    | ✓ Code shipped 2D; 3D deferred                                                                                 |
| GRAPH7-04 (user-similarity edges)   | 07-03, 07-05, 07-07 | ✓ Code shipped 2D; 3D deferred                                                                              |
| GRAPH7-05 (5 sim dimensions)        | 07-03, 07-06, 07-08 | ✓ All 5 dims in SIMILARITY_DIMS + UI checkboxes; 3D panel deferred                                          |
| GRAPH7-06 (filter panel: show folders + tiers + dims + min) | 07-04, 07-06, 07-07, 07-08 | ✓ 2D panel shipped; 3D panel deferred                                              |
| GRAPH7-08 (URL persistence)         | 07-06, 07-08    | ✓ 2D URL persistence shipped; 3D URL persistence deferred                                                      |
| GRAPH7-09 (view-mode toggle)        | 07-04, 07-06, 07-08 | ✓ 2D toggle + predicate + adapter drop shipped; 3D deferred                                                |
| GRAPH7-10 (DEPS gate)               | 07-01, 07-07    | ✓ PHASE-DEPS.md gate produced and consumed                                                                     |
| GRAPH7-11 (per-edge color buffer)   | 07-05, 07-06, 07-07 | ✓ 2D per-edge color shipped; 3D LUT deferred                                                                |
| GRAPH7-12 (FPS at hub scale)        | 07-09           | ? PENDING manual UAT (deferred by directive)                                                                   |
| FILT-EXT, DEPS-GATE, DASH-18        | 07-01, 07-04, 07-09 | ✓ filter contract + gate present; DASH-18 interactivity wired at code level, awaits live confirmation       |

### Anti-Patterns Found

None of significance. No `TODO`/`FIXME`/`PLACEHOLDER` blocker patterns introduced in Phase 7 files. The 3D stub SUMMARYs are intentional documented stubs, not anti-patterns.

| File                                                  | Pattern                                                    | Severity   | Impact                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| 07-07-SUMMARY.md / 07-08-SUMMARY.md                   | "stub SUMMARY" / status=SKIPPED-DEFERRED                   | ℹ️ Info    | Intentional gate-driven defer; covered by PHASE-DEPS.md             |
| PERF-REPORT.md                                        | "DEFERRED TO MANUAL UAT" markers                           | ℹ️ Info    | Explicit user directive 2026-05-12; not a quality issue             |

### Test & Compile Verification

- `npx vitest run` on the four Phase 7 test files: **74/74 pass** (302ms).
- `npx tsc --noEmit -p .`: clean (zero TS errors).

### Human Verification Required

The following items are not programmatically verifiable. They have been explicitly punted by the user to a single phase-end manual UAT pass; the executor has captured them in `PERF-REPORT.md` and will run them as a batch.

#### 1. Hub-scale FPS in 2D

**Test:** Open `/users`, enable all filter dims + folders, pan/zoom and scrub physics sliders.
**Expected:** ≥30 fps idle and during interaction; physics-slider scrub stays smooth (Pitfall 5 gate).
**Why human:** Live cosmos.gl GPU upload + render performance not measurable from CLI.

#### 2. Folder-hub interactivity (DASH-18 contract)

**Test:** Hover a folder hub → popover. Click → DashboardSidePanel opens with folder body. Trigger cross-widget spotlight.
**Expected:** Each surface renders meaningful content (not blank); spotlight propagates.
**Why human:** UX quality and content fitness require visual inspection.

#### 3. View-mode user-only toggle

**Test:** Click View mode → User-only. Toggle back.
**Expected:** All non-user nodes disappear; user-similarity edges remain colored by dimension; toggle back restores full graph.
**Why human:** End-to-end visual confirmation of setVisibleIndices + edge filter.

#### 4. URL paste-in-new-tab restore

**Test:** Set a non-default filter state, copy URL, paste into a new tab.
**Expected:** Filter panel restores all 5 Phase 7 axes to the same values.
**Why human:** Round-trip is unit-tested; full browser path is human-observable.

### Gaps Summary

No code gaps. All 13 automatable must-haves verify. The remaining truth (live FPS + interactivity UAT) is explicitly deferred by user directive 2026-05-12 and tracked inside `PERF-REPORT.md`. The 3D-side work (Plans 07-07, 07-08) is intentionally stubbed via the PHASE-DEPS.md gate and reopens automatically when Phase 6 ships.

Recommendation:
- Run the deferred manual UAT pass at phase end. If approved → flip PERF-REPORT.md DECISION to `PHASE-7-ACCEPT=APPROVED` and close Phase 7.
- If gaps surface during UAT → invoke `/gsd:plan-phase 07 --gaps` with PERF-REPORT.md as input.
- Backlog (separate, non-blocking): register GRAPH7-01..12 in REQUIREMENTS.md so future verification can score directly against it.

---

_Verified: 2026-05-12T10:25:00Z_
_Verifier: Claude (gsd-verifier)_
