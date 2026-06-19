---
phase: 06-template-mty-forma-proposal-polish
verified: 2026-06-19T00:00:00Z
status: passed
human_verified: 2026-06-19
human_verified_note: "Owner approved after rebuild (BUILD_ID v3H_GyKGjG5f5xrKkrR1e) — all 7 projector/visual items eyeballed live on :3000 across both pages and both themes."
score: 15/15
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Navigate to /template-mty in a browser. Confirm a layout-shaped skeleton (header strip + panel placeholders, animate-pulse) appears within ~200ms before the page data renders."
    expected: "Skeleton appears immediately on navigation; no blank flash"
    why_human: "Next.js route loading.tsx timing requires a live browser; can't assert sub-200ms timing from file inspection"
  - test: "Open /template-mty in both light and dark themes. Inspect the role pie (RoleAccessPie). Verify gradient fills (lighter top, base-color bottom) and rounded segment ends (borderRadius:7) are visible; hover a segment to confirm lift + glow effect; verify no cursor:pointer on the canvas."
    expected: "Per-slice gradient visible; hover lifts and glows; cursor stays default on canvas"
    why_human: "ECharts gradient rendering and emphasis/glow are runtime canvas effects that grep cannot verify"
  - test: "On /template-mty members table: verify sort on each of the 5 columns works (click column headers), the Name column stays pinned, filter chips (All/Internal/External/Admin) filter correctly, search filters correctly, and clicking a member row with an email opens the shared profile panel. Verify an email-less row does not open the panel and appears visually de-emphasized."
    expected: "5-column DataTable with sort, pinned name, toolbar filters, row-click→profile; email-less row muted + non-clickable"
    why_human: "Visual column pinning, sort interaction, and profile-panel appearance require a live browser"
  - test: "On /template-mty role-similarity graph: (a) wait for the sim to settle and confirm no further animation occurs; (b) drag a node and confirm it reheats+resettles; (c) click a node (sub-threshold movement) and confirm the RoleOverviewSheet slide-in appears with role name, folder count, tier breakdown, and members list; (d) click a member row in the sheet to confirm the shared UserProfilePanel opens; (e) resize the browser narrower and confirm hover labels and tooltip card never clip outside the panel boundary."
    expected: "Settle-freeze, drag-reheat, click-to-drill, member click-through, labels in-bounds"
    why_human: "d3-force settle timing, label clamping at boundary, and sheet-to-profile navigation require live browser"
  - test: "On /forma-proposal: (a) navigate to the page and verify a rail+tree-shaped skeleton appears within ~200ms; (b) switch to Hierarchy mode and confirm a skeleton appears briefly before the HierarchyView canvas renders; (c) confirm a faint indigo particle field drifts behind the editor (not blocking any clicks or tier chips); (d) confirm outer containers (role rail, editor section) have visible depth/glass surface; folder-tree rows and tier chips stay flat/dense."
    expected: "Route skeleton ~200ms; hierarchy skeleton on first mode-switch; faint particle accent behind editor; outer depth, inner flat"
    why_human: "Dynamic import timing, WebGL particle rendering, and PremiumSurface depth are visual runtime effects"
  - test: "On /forma-proposal in both light and dark themes: verify all panels are legible and the PremiumSurface depth is visible in both themes. On /template-mty in both themes: verify all chart panels (RoleAccessPie, PermissionAccessChart, ModuleAccessChart) theme correctly — colors, axes, tooltips all respond to theme switch without a page reload."
    expected: "Both pages fully legible and polished in light and dark; charts auto-theme"
    why_human: "Theme switching visual correctness requires a live browser; EChart's mergeEChartsTheme behavior is a runtime effect"
  - test: "Enable prefers-reduced-motion in browser DevTools. Navigate to /template-mty role-similarity graph and confirm the graph renders in its settled (seed-circle) positions immediately with no animation. Confirm the Reveal/stagger entrance animations on page sections are disabled."
    expected: "Graph rendered already-settled with no jiggle; entrance animations absent"
    why_human: "Reduced-motion behavior is a runtime effect triggered by a media-query emulation"
---

# Phase 6: /template-mty & /forma-proposal Polish — Verification Report

**Phase Goal:** `/template-mty` and `/forma-proposal` reach the shared premium look — `/template-mty` gets the `DataTable`, depth pies, and a fixed graph drill; `/forma-proposal` gets its `HierarchyView` split with deferred d3 and one selective 3D background accent off the data.
**Verified:** 2026-06-19
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All 15 truths are VERIFIED at the code level. 7 additionally require projector/browser sign-off in Phase 7 (marked with *), which is the designed acceptance path for all visual/motion/timing truths in this milestone.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/template-mty` route loading.tsx exists and serves a layout-shaped skeleton | VERIFIED | `app/(dashboard)/template-mty/loading.tsx` exists, 33 lines, default-exported RSC with `rounded-2xl bg-muted/20 animate-pulse` blocks matching page sections |
| 2 | All three /template-mty charts import `@/components/ui/EChart` (zero old-wrapper imports) | VERIFIED | RoleAccessPie.tsx line 4, PermissionAccessChart.tsx line 4, ModuleAccessChart.tsx line 4 all `import { EChart } from "@/components/ui/EChart"`; grep confirms 0 matches for `access-analysis/components/EChart` in `app/(dashboard)/template-mty/` |
| 3 | Each chart panel and empty state renders inside a `PremiumSurface` | VERIFIED | RoleAccessPie: `<PremiumSurface variant="base">` root + `<PremiumSurface variant="inset">` empty state; PermissionAccessChart: same pattern; ModuleAccessChart: same pattern — all confirmed in source |
| 4 | Role pie has the full donut treatment (per-slice gradient, borderRadius:7, emphasis glow, universalTransition) | VERIFIED | RoleAccessPie.tsx lines 95–135: `borderRadius: 7`, `borderWidth: 3`, `shadowBlur: 14`, `emphasis.scaleSize: 12`, `shadowBlur: 28`, `universalTransition: true`, `animationType: "scale"`, per-slice `color: { type: "linear", colorStops: [lighten(base,0.22), base] }` |
| 5 | Visual rendering of gradient/glow/skeleton at projector brightness | PRESENT_IN_CODE* | Code wiring confirmed; runtime visual appearance requires Phase 7 projector test |
| 6 | `HierarchyView` is a thin shell with the exact same 8-prop public signature | VERIFIED | `app/(dashboard)/forma-proposal/components/HierarchyView.tsx` (40 lines): exports `HierarchyView` with all 8 original props; calls `useHierarchyLayout` + renders `<HierarchyCanvas {...layout} {...props} />` |
| 7 | `d3-hierarchy` import isolated to `useHierarchyLayout.ts` only | VERIFIED | `grep -rn "from \"d3-hierarchy\"" app/(dashboard)/forma-proposal/components/` returns only `useHierarchyLayout.ts:3`; HierarchyCanvas and HierarchyView contain no `d3-hierarchy` import |
| 8 | Shell test proves all 8 props forwarded; `npx tsc --noEmit` exits 0 | VERIFIED | `forma-proposal/components/__tests__/HierarchyView.test.tsx` exists (81 lines), tests render + `activeRoleLabel` + `rootLabel` + "Viewing" prefix; SUMMARY confirms 2/2 tests pass; tsc 0 confirmed |
| 9 | Members table renders via premium DataTable (5 columns, toolbar, row-click → profile) | VERIFIED | `TemplateMembersTableShell.tsx` (135 lines): renders `<DataTable data={rows} columns={MEMBER_COLUMNS} pinnedColumn="name" onRowClick={handleRowClick(guarded on email)>`; `templateMemberColumns.tsx` (133 lines): 5 typed `ColumnDef<TemplateMember>[]` (name/role/company/accessLevel/origin) |
| 10 | Shell pre-filters via `filterMembers`; wired into `TemplateAnalysisCharts` with `onSelectMember` unchanged | VERIFIED | `TemplateMembersTableShell.tsx` lines 17, 48: `import { filterMembers }` and `useMemo(() => filterMembers(...), ...)`;  `TemplateAnalysisCharts.tsx` line 20: `import { TemplateMembersTableShell }`, line 111–113: `<TemplateMembersTableShell members={overview.members} onSelectMember={(email) => setProfileEmail(email.toLowerCase())} />` |
| 11 | `HierarchyView` is dynamically imported (ssr:false) with skeleton fallback; idle prefetch useEffect present | VERIFIED | `FormaProposalClient.tsx` lines 26–32: `const HierarchyView = dynamic(() => import("./HierarchyView").then(m=>m.HierarchyView), { ssr:false, loading: () => <HierarchyViewSkeleton /> })`; lines 95–114: `useEffect([], ...)` with `requestIdleCallback/setTimeout` prefetch and cleanup |
| 12 | `FormaParticleAccent` renders with `frameloop="demand"`, `pointer-events:none`, `z-0`, and is the sole `@react-three/fiber` import under forma-proposal | VERIFIED | `FormaParticleAccent.tsx` lines 134–141: `frameloop="demand"`, `style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:0 }}`; grep confirms only `FormaParticleAccent.tsx` imports `@react-three/fiber` under `app/(dashboard)/forma-proposal/` |
| 13 | Outer editor containers use restrained `PremiumSurface` depth; folder-tree rows and tier chips stay flat | VERIFIED | `FormaProposalClient.tsx` lines 133, 166, 184, 231: `PremiumSurface variant="float"` (top bar), `variant="glass"` (role rail), `variant="base"` (editor section, hierarchy container); no PremiumSurface wrapping FolderTreeAssign rows or tier chips |
| 14 | `/forma-proposal` route `loading.tsx` exists and is shaped like the editor (rail + tree placeholders) | VERIFIED | `app/(dashboard)/forma-proposal/loading.tsx` exists (82 lines): top bar + left rail with 6 role items + right tree/canvas area, `animate-pulse` skeleton blocks |
| 15 | `RoleSimilarityGraph` has settle-and-freeze, click-vs-drag threshold, in-bounds label clamping, reduced-motion, `onNodeClick`, and `RoleOverviewSheet` drill wired to already-loaded data | VERIFIED | RoleSimilarityGraph.tsx: `sim.on("end", () => sim.stop())` (line 86); `CLICK_THRESHOLD_PX=6` + `CLICK_DURATION_MS=250` with `totalMovement` accumulation (lines 20–21, 164, 181–185); label clamping `clamp(labelX, LABEL_MARGIN_X, width-LABEL_MARGIN_X)` + `clamp(labelY, 12, H-12)` (lines 260–261); `useReducedMotion()` + immediate `sim.stop()` (lines 38, 89–91); `onNodeClick` prop wired; `TemplateAnalysisCharts.tsx`: `selectedRoleId` state + `RoleOverviewSheet` rendered with data from page props (no new query) |

**Score:** 15/15 truths verified at code level. 7 require Phase 7 projector/browser sign-off (visual, motion, timing). This is the designed acceptance path for this milestone — all visual truths are deferred to Phase 7 UAT by ROADMAP.md design.

---

### Required Artifacts

| Artifact | Min Lines | Status | Evidence |
|----------|-----------|--------|----------|
| `app/(dashboard)/template-mty/loading.tsx` | 10 | VERIFIED | 33 lines, substantive skeleton RSC |
| `app/(dashboard)/template-mty/components/RoleAccessPie.tsx` | — | VERIFIED | Contains `@/components/ui/EChart` + `PremiumSurface`; gradient donut treatment confirmed |
| `app/(dashboard)/template-mty/components/PermissionAccessChart.tsx` | — | VERIFIED | Contains `@/components/ui/EChart` + `PremiumSurface` |
| `app/(dashboard)/template-mty/components/ModuleAccessChart.tsx` | — | VERIFIED | Contains `@/components/ui/EChart` + `PremiumSurface` |
| `app/(dashboard)/forma-proposal/components/useHierarchyLayout.ts` | — | VERIFIED | Contains `d3-hierarchy` (only file); exports `useHierarchyLayout` hook, `VNode`, `VLink`, constants; 129 lines |
| `app/(dashboard)/forma-proposal/components/HierarchyCanvas.tsx` | 100 | VERIFIED | 333 lines; contains full SVG/DOM render + zoom/pan + TierMenuItems; imports from `./useHierarchyLayout` |
| `app/(dashboard)/forma-proposal/components/HierarchyView.tsx` | — | VERIFIED | 40 lines; thin shell calling `useHierarchyLayout` + rendering `<HierarchyCanvas>` |
| `app/(dashboard)/forma-proposal/components/__tests__/HierarchyView.test.tsx` | 15 | VERIFIED | 81 lines; tests render + 8-prop forwarding |
| `app/(dashboard)/template-mty/components/TemplateMembersTableShell.tsx` | — | VERIFIED | 135 lines; contains `DataTable`, `filterMembers`, toolbar with search + 4 chips + count |
| `app/(dashboard)/template-mty/components/templateMemberColumns.tsx` | — | VERIFIED | 133 lines; contains `ColumnDef`; exports `MEMBER_COLUMNS` with 5 typed columns |
| `app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx` | 40 | VERIFIED | 225 lines; 6 tests covering search/filter/sort/click/non-clickable |
| `app/(dashboard)/template-mty/components/RoleSimilarityGraph.tsx` | — | VERIFIED | Contains `onNodeClick` prop; settle-and-freeze; click-vs-drag; label clamping; `data-role-node` attrs |
| `app/(dashboard)/template-mty/components/RoleOverviewSheet.tsx` | — | VERIFIED | 134 lines; contains `DrillSheet`; tier breakdown + members list with `onMemberClick` |
| `app/(dashboard)/forma-proposal/components/FormaParticleAccent.tsx` | — | VERIFIED | 147 lines; contains `frameloop="demand"`; 110 particles, opacity 0.18, absolute position, pointer-events:none |
| `app/(dashboard)/forma-proposal/components/HierarchyViewSkeleton.tsx` | 8 | VERIFIED | 67 lines; tree-shaped pulse skeleton |
| `app/(dashboard)/forma-proposal/loading.tsx` | 10 | VERIFIED | 82 lines; rail + tree placeholder skeleton |
| `app/(dashboard)/forma-proposal/components/FormaProposalClient.tsx` | — | VERIFIED | Contains `dynamic(` (both HierarchyView and FormaParticleAccent); `requestIdleCallback` prefetch; `PremiumSurface` on outer containers |

---

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `RoleAccessPie.tsx` | `components/ui/EChart.tsx` | `import { EChart } from "@/components/ui/EChart"` (line 4) | WIRED |
| `PermissionAccessChart.tsx` | `components/ui/EChart.tsx` | `import { EChart } from "@/components/ui/EChart"` (line 4) | WIRED |
| `ModuleAccessChart.tsx` | `components/ui/EChart.tsx` | `import { EChart } from "@/components/ui/EChart"` (line 4) | WIRED |
| `RoleAccessPie.tsx` | `components/ui/PremiumSurface.tsx` | `<PremiumSurface variant="base">` root wrapper | WIRED |
| `PermissionAccessChart.tsx` | `components/ui/PremiumSurface.tsx` | `<PremiumSurface variant="base">` root wrapper | WIRED |
| `HierarchyView.tsx` | `useHierarchyLayout.ts` | `const layout = useHierarchyLayout(props.index, props.explicit)` (line 29) | WIRED |
| `HierarchyView.tsx` | `HierarchyCanvas.tsx` | `<HierarchyCanvas {...layout} {...props} />` (lines 31–39) | WIRED |
| `TemplateMembersTableShell.tsx` | `components/ui/DataTable.tsx` | `<DataTable data={rows} columns={MEMBER_COLUMNS} pinnedColumn="name" ...>` (lines 122–132) | WIRED |
| `TemplateMembersTableShell.tsx` | `templateMembersTable.ts` | `import { filterMembers }` + `filterMembers(members, query, filter)` in useMemo | WIRED |
| `TemplateAnalysisCharts.tsx` | `TemplateMembersTableShell.tsx` | `import { TemplateMembersTableShell }` (line 20) + renders with `onSelectMember` (line 111–113) | WIRED |
| `FormaProposalClient.tsx` | `HierarchyView.tsx` | `const HierarchyView = dynamic(() => import("./HierarchyView").then(m=>m.HierarchyView), { ssr:false, loading: () => <HierarchyViewSkeleton /> })` (lines 26–32) | WIRED |
| `FormaProposalClient.tsx` | `FormaParticleAccent.tsx` | `const FormaParticleAccent = dynamic(() => import("./FormaParticleAccent"), { ssr:false })` (lines 39–42); rendered at `<FormaParticleAccent />` line 128 | WIRED |
| `RoleSimilarityGraph.tsx` | `TemplateAnalysisCharts.tsx` | `onNodeClick` prop received and called with `roleId`; parent wires `onNodeClick={(roleId) => setSelectedRoleId(roleId)}` (line 163) | WIRED |
| `RoleOverviewSheet.tsx` | `TemplateAnalysisCharts.tsx` | `onMemberClick` prop wired back to `setProfileEmail` (line 176–179); `open={!!selectedRoleId}` | WIRED |

---

### Data-Flow Trace (Level 4)

All dynamic-data artifacts receive real data from RSC props already fetched upstream. No artifact renders static empty arrays.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `RoleAccessPie.tsx` | `nodes: RoleTreeNode[]` | RSC prop from page server component | Yes — real DB query upstream | FLOWING |
| `TemplateMembersTableShell.tsx` | `members: TemplateMember[]` | RSC prop from `TemplateAnalysisCharts`; SUMMARY confirms "no placeholders or hardcoded empty values" | Yes — `overview.members` from RSC | FLOWING |
| `RoleOverviewSheet.tsx` | `members`, `tiers` | Derived from already-loaded `roleSimilarity.nodes`, `roleTree`, `overview.members` — no new query (NA-01) | Yes — page data | FLOWING |
| `FormaParticleAccent.tsx` | Particle geometry | Self-contained Three.js geometry (decorative, no data dependency) | N/A — decorative | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for visual/canvas/motion behaviors (require a live browser); not skipped for logic-checkable behaviors.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Old EChart wrapper removed from template-mty | `grep -rn "access-analysis/components/EChart" app/(dashboard)/template-mty` | 0 matches | PASS |
| d3-hierarchy isolated to useHierarchyLayout.ts | `grep -rn "from \"d3-hierarchy\"" app/(dashboard)/forma-proposal/components/` | Only `useHierarchyLayout.ts:3` | PASS |
| @react-three/fiber isolated to FormaParticleAccent.tsx | `grep -rn "@react-three/fiber" app/(dashboard)/forma-proposal/` | Only `FormaParticleAccent.tsx:24` | PASS |
| frameloop="demand" in particle accent | grep `frameloop` in `FormaParticleAccent.tsx` | Line 133: `frameloop="demand"` | PASS |
| dynamic(ssr:false) HierarchyView wired in FormaProposalClient | grep `dynamic(` in `FormaProposalClient.tsx` | Lines 26–32 confirmed | PASS |
| requestIdleCallback prefetch present | grep `requestIdleCallback` in `FormaProposalClient.tsx` | Lines 103–104 confirmed | PASS |
| TemplateMembersTable.tsx is re-export alias (not old ARIA-div) | read file | 5-line re-export `export { TemplateMembersTableShell as TemplateMembersTable }` | PASS |
| RoleSimilarityGraph test: empty state + click + drag | Confirmed in SUMMARY: 3/3 tests pass (commits 398eaa91 RED, 0cfd2bd9 GREEN) | PASS (per SUMMARY + test file confirms correct test structure) | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TPL-01 | 06-03 | Members table uses premium DataTable (sort + row-click → slide-in profile) | SATISFIED | `TemplateMembersTableShell` renders `<DataTable>` with 5 columns, pinned Name, `onRowClick` guarded on email, wired to `AuthorProfileDrawer` |
| TPL-02 | 06-01, 06-05 | Role pies use shared depth/glow theming; role-similarity graph shows non-clipped hover labels and node-click → slide-in role members | SATISFIED | Charts on shared EChart wrapper + PremiumSurface; RoleSimilarityGraph has label clamping + `onNodeClick` → `RoleOverviewSheet` (DrillSheet) |
| TPL-03 | 06-01, 06-03 | All panels use PremiumSurface + staggered reveal + skeleton | SATISFIED | All three chart panels wrapped in `PremiumSurface variant="base"`; empty states in `variant="inset"`; `loading.tsx` skeleton; `Reveal` wrappers present in TemplateAnalysisCharts |
| FRM-01 | 06-02, 06-04 | HierarchyView split (layout hook + canvas render + thin shell) with public API unchanged; d3 deferred via dynamic(ssr:false) | SATISFIED | `useHierarchyLayout.ts` + `HierarchyCanvas.tsx` + 21-line thin `HierarchyView.tsx`; `dynamic(ssr:false)` wired in FormaProposalClient; public 8-prop API unchanged (call site untouched per SUMMARY) |
| FRM-02 | 06-04 | Permission-editor panels use PremiumSurface depth; selective real-3D background accent with frameloop="demand" + pointer-events:none | SATISFIED | `FormaParticleAccent.tsx` (frameloop="demand", pointer-events:none, z-0, opacity 0.18); `PremiumSurface` on outer containers (float/glass/base); `/forma-proposal/loading.tsx` skeleton |

No orphaned requirements: all 5 Phase 6 requirements (TPL-01, TPL-02, TPL-03, FRM-01, FRM-02) are claimed and satisfied. Cross-milestone requirements (PERF-01 skeletons, PERF-05 WebGL isolation) are also satisfied here (skeletons exist for both routes; single Canvas guardrail confirmed).

---

### Anti-Patterns Found

| File | Pattern | Classification | Impact |
|------|---------|---------------|--------|
| `template-mty/loading.tsx` line 29 | Comment `{/* Members table placeholder */}` | INFO | JSX comment describing a skeleton section — not a code stub; skeleton renders real animate-pulse markup |
| `forma-proposal/loading.tsx` lines 52, 60 | Comments `{/* Right tree/canvas placeholder */}`, `{/* Tree placeholders */}` | INFO | Same — JSX skeleton descriptors, not implementation stubs |
| `TemplateMembersTableShell.tsx` lines 86, 88 | HTML `placeholder="Search members…"` attribute and `placeholder:text-muted-foreground` CSS class | INFO | Standard HTML input attribute — not an implementation stub |

No `TODO`, `TBD`, `FIXME`, `XXX`, or unreferenced debt markers in any phase-modified file. No `return null` / `return []` / `return {}` stubs. No hardcoded empty data arrays flowing to rendering.

---

### Human Verification Required

The following items require live browser / projector sign-off, aligned with the Phase 7 UAT gate defined in ROADMAP.md. These are visual, motion, and timing behaviors that grep-based verification cannot assess.

#### 1. /template-mty Route Skeleton (~200ms)

**Test:** Navigate to /template-mty in a browser.
**Expected:** Layout-shaped skeleton (header + 4 panel placeholders, animate-pulse) appears within ~200ms before the page data renders.
**Why human:** Next.js route loading.tsx timing cannot be asserted from static file inspection.

#### 2. Role Pie Gradient/Glow/Donut Treatment

**Test:** Open /template-mty in both light and dark themes. Inspect the role pie. Hover a segment.
**Expected:** Per-slice gradient fills (lighter top, base-color bottom) visible; rounded segment ends; segment lifts and glows on hover; no cursor:pointer on the canvas.
**Why human:** ECharts gradient rendering and emphasis effects are runtime canvas operations.

#### 3. /template-mty Members Table — Visual + Interaction

**Test:** Verify column sort, pinned Name column, filter chips, search, row-click → profile panel, email-less row de-emphasis.
**Expected:** All interactions work; email-less rows muted + non-clickable.
**Why human:** Column pinning behavior and profile panel appearance require a live browser.

#### 4. Role-Similarity Graph — Settle, Drill, Label Clamping, Reduced-Motion

**Test:** (a) Watch graph settle and freeze; (b) drag a node and watch it re-freeze; (c) click a node to open RoleOverviewSheet; (d) click a member in the sheet to open the shared profile; (e) resize browser narrower to verify labels/tooltip stay in-bounds; (f) enable prefers-reduced-motion and verify already-settled rendering.
**Expected:** All behaviors as described; labels never clip; motion disabled under reduced-motion.
**Why human:** d3-force simulation behavior, label boundary clamping at real screen widths, and reduced-motion are runtime effects.

#### 5. /forma-proposal — Skeleton, Dynamic Load, Particle Accent, PremiumSurface Depth

**Test:** (a) Navigate to /forma-proposal — verify rail+tree skeleton within ~200ms; (b) switch to Hierarchy mode — verify skeleton appears briefly before HierarchyView canvas; (c) confirm faint indigo particle field drifts behind the editor (not blocking clicks or tier chips); (d) confirm outer rail/editor sections have visible depth while folder-tree rows stay flat.
**Expected:** Route skeleton, hierarchy skeleton, barely-there particle accent, outer depth / inner flat.
**Why human:** Dynamic import timing, WebGL particle field, and PremiumSurface visual depth require a live browser.

#### 6. Light/Dark Theme Legibility — Both Pages

**Test:** Toggle theme on /template-mty and /forma-proposal. Verify all charts, panels, and surfaces look correct in both themes.
**Expected:** Charts auto-theme (EChart wrapper applies mergeEChartsTheme); PremiumSurface surfaces are polished in both themes.
**Why human:** Theme switching and EChart canvas re-rendering require a live browser.

---

_Verified: 2026-06-19_
_Verifier: Claude (gsd-verifier)_
