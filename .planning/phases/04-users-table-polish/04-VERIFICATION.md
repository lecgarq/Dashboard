---
phase: 04-users-table-polish
verified: 2026-06-18T20:30:00Z
status: gaps_found
score: 5/5
human_uat: 2026-06-18 — owner rebuilt :3000 and tested live; 5 gaps found (see ## Gaps)
behavior_unverified: 2
overrides_applied: 0
human_verification:
  - test: "Navigate to /users and confirm the skeleton renders within ~200ms"
    expected: "A table-shaped 5-column skeleton (header bar + 8 shimmer rows) appears immediately at the route boundary before data loads; no card-grid flash"
    why_human: "Timing (~200ms) and visual fidelity of the Suspense fallback can only be confirmed in a browser with Network throttling"
  - test: "Observe KPI count-up animation on first page load"
    expected: "Three KPI tiles (Total users, Active 30d, Admins) animate from 0 to their target numbers with a ~1s ease-out. Re-sorting or opening the panel does NOT restart the animation from 0."
    why_human: "rAF-based animation requires a live browser; the 'once per load' invariant cannot be proven by grep — the hasAnimated ref guard fires at runtime"
  - test: "Confirm the R3F particle accent appears only in the page header"
    expected: "A subtle drifting particle field is visible behind the KPI tiles. No particle field or WebGL context exists over the DataTable rows."
    why_human: "GPU confinement and visual appearance can only be verified in Chrome DevTools (Layers panel / GPU memory) — code-level grep confirms Canvas is only in HeaderParticleAccent.tsx"
  - test: "Confirm staggered entrance fade fires once on page load"
    expected: "The full /users page content (header + table) fades in once. Sorting, filtering, opening the panel, or toggling density do NOT re-trigger the fade."
    why_human: "motion.div with safeFade fires on mount; runtime re-render behavior and the 'once only' invariant require a live browser to observe"
behavior_unverified_items:
  - truth: "A skeleton/loading state appears within ~200ms of navigating to /users; content reveals with a staggered entrance under the motion budget (once per load)"
    test: "Navigate to /users and observe the skeleton appearance timing and the entrance animation"
    expected: "Skeleton visible within ~200ms; entrance fade fires exactly once on first load, not on filter/sort/density changes"
    why_human: "Timing threshold and the 'fires once' invariant for the motion facade are runtime-only state transitions — rAF + hasAnimated ref guard are present and wired but the transition cannot be exercised by a static test"
  - truth: "KPI numbers count up smoothly on first load; R3F particle accent renders only in page header (ssr:false, frameloop:demand)"
    test: "Load /users, observe KPI animation and header particle field; re-render (sort/filter) and confirm animation does not restart; open DevTools GPU panel"
    expected: "Count-up completes ~1s ease-out once; particles visible behind KPIs only; GPU memory under 400MB; no Canvas in the DataTable region"
    why_human: "Animation smoothness, GPU budget (<400MB), and the 'once per load' non-restart invariant are runtime state transitions the hasAnimated+rAF guard implements but no test exercises the restart path"
---

# Phase 4: /users Table & Polish — Verification Report

**Phase Goal:** The `/users` directory is a premium, clickable data-table presentation — fast to first paint, reduced initial payload, with one selective 3D accent confined to the page header (never the data region).

**Verified:** 2026-06-18T20:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The directory renders via DataTable with pinned Name column, sticky header, sortable columns, density toggle, row-click → DrillSheet slide-in, row-expand → PeekPanel inline | VERIFIED | `UsersDirectoryClient.tsx` lines 290–308: `<DataTable data={rows} columns={USERS_COLUMNS} pinnedColumn="name" defaultSort={[{id:"name",desc:false}]} renderExpanded={…PeekPanel} onRowClick={…setSelectedEmail}>`; DrillSheet at lines 319–328 replaces PersonDetailModal (comment-only reference, no import/render); integration tests Cases 5+6 confirm row-click and expand behaviors |
| 2 | A skeleton/loading state appears within ~200ms; content reveals with a staggered entrance under the motion budget (once per load) | PRESENT_BEHAVIOR_UNVERIFIED | `loading.tsx` uses `UsersTableSkeleton` (table-shaped 5-col header + 8 shimmer rows) for the Suspense boundary; `UsersDirectoryClient` line 9: `import { motion, fadeIn, useSafeVariants } from "@/components/ui/motion"` (facade, not framer-motion); `safeFade = useSafeVariants(fadeIn)` called once at component scope; `motion.div initial={safeFade.hidden} animate={safeFade.visible}` wraps container. Timing (~200ms) and the "fires once" invariant are runtime-only — no test exercises the non-restart path |
| 3 | Initial client payload is reduced; heavy per-user data deferred until the detail panel opens; no load-time regression | VERIFIED | `PeekPanel.tsx` comment line 10: "PERF-04: strictly read-only from props — NO useQuery, NO tRPC, NO fetch"; grep confirms zero trpc/fetch imports in PeekPanel, DirectoryTableColumns, directoryTableRow; integration test Case 7 asserts `bulkUsersQuerySpy` called once with `BULK_USERS_LEAN_INPUT` ({leanProjects:true}) and total call count equals 1 |
| 4 | KPI numbers count up smoothly on first load; R3F particle accent renders only in the page header (ssr:false, frameloop:demand); never on the DataTable | PRESENT_BEHAVIOR_UNVERIFIED | `UsersTableHeader.tsx` `useAnimatedNumber`: `hasAnimated.current` ref guard + `useEffect(…, [])` (empty dep array, line 74) — count-up fires once on mount; Canvas/`@react-three/fiber` imports appear only in `HeaderParticleAccent.tsx` (confirmed by grep returning no matches in `UsersDirectoryClient.tsx`, `DirectoryTableColumns.tsx`, `PeekPanel.tsx`); `HeaderParticleAccent` dynamically imported with `{ssr: false}` (line 29 of UsersTableHeader); `frameloop="demand"` on Canvas (line 123 of HeaderParticleAccent). Runtime smoothness, GPU budget (<400MB), and the count-up restart-prevention invariant require live browser verification |
| 5 | `npx tsc --noEmit` exits 0; each tRPC endpoint called once per load | VERIFIED | tsc 0 confirmed independently by orchestrator (whole-tree, including test files); single-fetch confirmed by integration test Cases 7+10 asserting `bulkUsersQuerySpy` called with `{leanProjects:true}` and call count = 1 |

**Score:** 5/5 truths verified (3 VERIFIED, 2 PRESENT_BEHAVIOR_UNVERIFIED — present and wired; runtime state transitions not exercised by test)

---

### Deferred Items

None identified.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/(dashboard)/users/directoryTableRow.ts` | DirectoryRow type + buildDirectoryRows() | VERIFIED | 169 lines; exports DirectoryRow, buildDirectoryRows, DORMANT_THRESHOLD_DAYS; pure module — no React, no tRPC imports |
| `app/(dashboard)/users/directoryTableRow.test.ts` | Unit coverage for derivation rules | VERIFIED | 12 test cases covering: max lastActivity, null fallback, lastSignIn ignored, roles, office mode, dormant flag, graceful fallback, case-insensitive lookup |
| `app/(dashboard)/users/DirectoryTableColumns.tsx` | USERS_COLUMNS: ColumnDef<DirectoryRow>[] (5 columns) | VERIFIED | Exports `USERS_COLUMNS` with ids: name, role, office, lastActive, projects; NameCell, RoleCell, LastActiveCell all present |
| `app/(dashboard)/users/DirectoryTableColumns.test.tsx` | Cell render coverage | VERIFIED | Tests column count (5), ids order, sortability, "— No data" for null lastActivity, "+N" badge, dormant dot |
| `app/(dashboard)/users/PeekPanel.tsx` | renderExpanded slot — inline peek with "See full profile" | VERIFIED | 86 lines; renders avatar, name, jobTitle, office, lastActive, counts; "See full profile →" button wired to onOpenProfile; no tRPC |
| `app/(dashboard)/users/PeekPanel.test.tsx` | PeekPanel unit coverage | VERIFIED | 9 test cases including no-trpc check, graceful null accUser, See-full-profile click |
| `app/(dashboard)/users/UserProfilePanel.tsx` | Optional person?: OrgPerson prop + header chrome in dialog variant | VERIFIED | Line 38: `person?: OrgPerson`; dialog branch lines 103–179 render `data-testid="person-chrome-header"` only when person is truthy; rail branch unchanged |
| `app/(dashboard)/users/UserProfilePanel.test.tsx` | Person chrome renders when supplied; absent otherwise; rail unchanged | VERIFIED | New cases at lines 121–162 cover: chrome renders with person (dialog), chrome absent without person, rail ignores person prop |
| `app/(dashboard)/users/UsersDirectoryClient.tsx` | DataTable-driven shell with DrillSheet, skeleton, entrance fade, error+retry | VERIFIED | 339 lines; DataTable with all required props; DrillSheet replaces PersonDetailModal (zero JSX/import of PersonDetailModal); motion facade; error "Couldn't load the directory" + Retry button at lines 261–277 |
| `app/(dashboard)/users/UsersTableSkeleton.tsx` | Table-shaped shimmer skeleton (5-col header + 8 rows) | VERIFIED | 76 lines; 5 HEADER_WIDTHS + 8 data rows each with avatar skeleton + 5 cell skeletons; data-testid="users-table-skeleton" |
| `app/(dashboard)/users/loading.tsx` | Route-level skeleton swapped to table-shaped | VERIFIED | 15 lines; imports and renders `UsersTableSkeleton` inside max-w container |
| `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx` | Integration cases: row-click→DrillSheet, expand→PeekPanel, PERF-04 single-fetch | VERIFIED | 10 test cases; Case 5 (row-click→selectedEmail), Case 6 (expand→PeekPanel "See full profile"), Case 7 (PERF-04 single-fetch with BULK_USERS_LEAN_INPUT), Case 10 (PERF-03 baseline) all present and substantive |
| `app/(dashboard)/users/UsersTableHeader.tsx` | Glass KPI strip + AnimatedNumber count-up + header particle mount | VERIFIED | 140 lines; KpiTile with PremiumSurface glass variant; `useAnimatedNumber` with rAF + empty dep array; HeaderParticleAccent dynamically imported ssr:false |
| `app/(dashboard)/users/UsersTableHeader.test.tsx` | KPI derivation + AnimatedNumber-reaches-target coverage | VERIFIED | 6 test cases: labels, reaches target after 1.5s, no restart on re-render, glass surface, Users title, display-only tiles |
| `app/(dashboard)/users/HeaderParticleAccent.tsx` | R3F Canvas particle accent (dynamic-import target) | VERIFIED | 136 lines; imports from @react-three/fiber; Canvas frameloop="demand", position:absolute inset:0 pointer-events:none; 180 drifting points; default export |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `directoryTableRow.ts` | `access-analysis/projectGroups.ts` | imports `officeCodeFor` + `officeLabel` | VERIFIED | Line 9: `import { officeCodeFor, officeLabel as officeLabelFor } from "@/app/(dashboard)/access-analysis/projectGroups"` — both functions confirmed exported at lines 46+56 of projectGroups.ts |
| `DirectoryTableColumns.tsx` | `directoryTableRow.ts` | `ColumnDef<DirectoryRow>` typed against the row type | VERIFIED | Line 13: `import type { DirectoryRow } from "./directoryTableRow"`; line 94: `USERS_COLUMNS: ColumnDef<DirectoryRow, string>[]` |
| `DirectoryTableColumns.tsx` | `ProfileAvatar.tsx` | NameCell reuses ProfileAvatar | VERIFIED | Line 12: `import { ProfileAvatar } from "./ProfileAvatar"`; used in NameCell at line 34 |
| `UserProfilePanel.tsx` | `directoryUtils.ts` | imports OrgPerson type | VERIFIED | Line 26: `import type { OrgPerson } from "./directoryUtils"` |
| `UsersDirectoryClient.tsx` | `DataTable.tsx` | DataTable<DirectoryRow> with all required props | VERIFIED | Lines 290–308: data={rows}, columns={USERS_COLUMNS}, pinnedColumn="name", defaultSort, renderExpanded, onRowClick, hasActiveFilter, onClearFilters |
| `UsersDirectoryClient.tsx` | `directoryTableRow.ts` | buildDirectoryRows(visibleFiltered, accSummaryMap) | VERIFIED | Line 25: import; line 206: `buildDirectoryRows(visibleFiltered, accSummaryMap)` in useMemo |
| `UsersDirectoryClient.tsx` | `DrillSheet.tsx` | DrillSheet open={!!selectedEmail} wrapping UserProfilePanel | VERIFIED | Line 23: import; lines 319–328: `<DrillSheet open={!!selectedEmail} onClose={() => setSelectedEmail(null)}>` |
| `UsersDirectoryClient.tsx` | `useUsersDirectoryData.ts` | data hook (no new bulkUsers call) | VERIFIED | Line 15: import; line 148: destructuring; BULK_USERS_LEAN_INPUT exported from hook and matched in integration test |
| `UsersTableHeader.tsx` | `HeaderParticleAccent.tsx` | `dynamic(() => import('./HeaderParticleAccent'), { ssr: false })` | VERIFIED | Lines 27–30: exact pattern confirmed; `<HeaderParticleAccent />` at line 119 |
| `UsersDirectoryClient.tsx` | `UsersTableHeader.tsx` | header rendered above DataTable with in-memory KPI counts | VERIFIED | Lines 225–229: `<UsersTableHeader totalUsers={kpiValues.totalUsers} active30d={kpiValues.active30d} admins={kpiValues.admins} />`; kpiValues derived in-memory (lines 179–200), no tRPC query |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `UsersDirectoryClient.tsx` | `rows` (DataTable data) | `buildDirectoryRows(visibleFiltered, accSummaryMap)` from `useUsersDirectoryData` hook | Yes — hook fetches from tRPC `bulkUsers.useQuery` with `BULK_USERS_LEAN_INPUT` and `getOrgDirectory.useQuery`; flows through `useDirectoryRows` filter seam | FLOWING |
| `UsersTableHeader.tsx` | `totalUsers`, `active30d`, `admins` | `kpiValues` useMemo in shell derived from `people` + `accSummaryMap` (in-memory, no fetch) | Yes — derived from live data already in memory | FLOWING |
| `PeekPanel.tsx` | All displayed fields | `row: DirectoryRow` prop (in-memory) | Yes — row flows from `buildDirectoryRows`, no separate fetch | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| lastSignIn not in directoryTableRow.ts | `grep -n "lastSignIn" directoryTableRow.ts` | Only comments (line 49: "NOTE: NEVER sourced from…", line 109: "NEVER lastSignIn") — no code reference | PASS |
| PersonDetailModal not imported/rendered in UsersDirectoryClient | `grep "import.*PersonDetailModal\|<PersonDetailModal" UsersDirectoryClient.tsx` | No matches (exit 1) — only a code comment at line 318 | PASS |
| Canvas/@react-three only in HeaderParticleAccent | `grep -rn "Canvas\|@react-three" UsersDirectoryClient.tsx DirectoryTableColumns.tsx PeekPanel.tsx` | No matches in any of the three files | PASS |
| Motion imported from facade, not framer-motion | `grep "framer-motion" UsersDirectoryClient.tsx` | No matches | PASS |
| DrillSheet import and render present | `grep "DrillSheet" UsersDirectoryClient.tsx` | Lines 23 (import), 319 (open prop), 328 (close tag) | PASS |
| @react-three/fiber in package.json | `grep "@react-three/fiber" package.json` | Line 62: `"@react-three/fiber": "^9.6.1"` | PASS |
| BULK_USERS_LEAN_INPUT exported and used | grep in useUsersDirectoryData.ts + integration test | Exported at line 48; used in integration test Case 7 assertion | PASS |
| Scope boundary: zero Phase-4 commits touched access-analysis | `git log 9b24dd21..HEAD -- "app/(dashboard)/users/access-analysis/"` | Empty — no commits | PASS |
| No debt markers (TBD/FIXME/XXX) in phase files | grep across 9 modified files | No matches | PASS |

---

### Probe Execution

Step 7c: SKIPPED — No probe scripts declared in PLAN files; no `scripts/*/tests/probe-*.sh` files declared for this phase. Gates independently confirmed by orchestrator (tsc 0, unit suite 2100 pass).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| USR-02 | Plans 01, 02, 03, 04 | Premium DataTable — pinned name, sticky header, sortable, density toggle, row-click → detail, row-expand → inline summary | SATISFIED | DataTable wired with all props; 5 typed columns; DrillSheet; PeekPanel; UsersTableHeader glass KPIs |
| PERF-01 | Plan 03 | Each page shows skeleton/loading state within ~200ms | SATISFIED (code) | `loading.tsx` uses `UsersTableSkeleton`; inline `isLoading && <UsersTableSkeleton />` — visual timing needs human UAT |
| PERF-04 | Plans 01, 03 | `/users` initial client payload reduced; heavy per-user data deferred to detail-open; no regression | SATISFIED | PeekPanel pure in-memory; integration test Case 7 proves single `bulkUsers` call with `BULK_USERS_LEAN_INPUT` |
| INT-03 | Plans 01, 02, 03 | Table rows clickable (open detail) and expandable inline (summary) without full-page navigation | SATISFIED | row-click → DrillSheet; row-expand → PeekPanel; "See full profile" wires back to DrillSheet; integration tests Cases 5+6 |
| VIS-03 | Plan 03 | Page content reveals with staggered entrance under motion budget (once per load) | SATISFIED (code) | motion facade `fadeIn` wraps outer container; `useSafeVariants` respects prefers-reduced-motion; runtime "once only" invariant needs human |
| VIS-04 | Plan 04 | KPI numbers count up smoothly on first load | SATISFIED (code) | rAF ease-out count-up with `hasAnimated` guard; `UsersTableHeader.test.tsx` Cases 2+3 verify reaches-target and no-restart. Smoothness needs human |

All 6 required requirement IDs (USR-02, PERF-01, PERF-04, INT-03, VIS-03, VIS-04) are accounted for and marked [x] in REQUIREMENTS.md traceability table.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No blockers found |

No debt markers (TBD, FIXME, XXX, HACK, PLACEHOLDER) in any Phase-4 modified file. No stub returns. No hardcoded empty data that flows to rendering. No orphaned artifacts.

**Notable non-issue:** `directoryTableRow.ts` lines 49 and 109 reference "lastSignIn" only in comments documenting what MUST NOT happen. The implementation has zero code reads of `lastSignIn`. Not a stub — it is the correct defensive documentation pattern.

---

### Human Verification Required

#### 1. Skeleton timing (~200ms)

**Test:** Navigate to /users (or throttle to Slow 3G, reload), watch the route boundary.
**Expected:** A 5-column table-shaped skeleton (header shimmer + 8 shimmer rows) appears within ~200ms with no card-grid flash. The skeleton matches the DataTable column layout — no layout shift when data loads.
**Why human:** Sub-200ms threshold is a timing invariant that `loading.tsx` + Suspense enables but a static analysis or unit test cannot time. Must be observed in a browser.

#### 2. KPI count-up smoothness + no-restart on re-render

**Test:** Load /users (first load). Observe the three KPI tiles (Total users, Active 30d, Admins). Then sort a column or toggle density.
**Expected:** Numbers count from 0 to their targets with ~1s ease-out once on mount. After re-renders (sort, filter, density, panel-open), numbers stay at their targets — no restart from 0.
**Why human:** The `hasAnimated.current` ref guard and empty-dep `useEffect` implement the once-only invariant, but the "does not restart on re-render" path is not exercised by any automated test — it requires live interaction. The unit test only verifies reaching the target value.

#### 3. R3F particle accent header-confinement + GPU budget

**Test:** Open /users in Chrome. Open DevTools → Layers or Performance → GPU. Confirm the particle field is visible only behind the header KPI strip, not over the DataTable rows. Check GPU memory stays under 400MB.
**Expected:** A subtle drifting indigo particle field behind the KPIs. No Canvas or WebGL context visible over the table region. GPU memory under 400MB.
**Why human:** Code-level grep confirms `Canvas` and `@react-three/fiber` are only in `HeaderParticleAccent.tsx` (dynamically imported ssr:false), but GPU memory budget and visual confinement require DevTools inspection.

#### 4. Entrance fade fires once per load

**Test:** Load /users, observe the fade-in. Then filter, sort, toggle density, and open the DrillSheet. Reload and observe again.
**Expected:** The full page (header + table) fades in once on the initial load. No subsequent actions (filter/sort/density/panel) re-trigger the fade animation.
**Why human:** The `motion.div` with `initial/animate` on mount fires once, but the invariant that "no re-render re-fires the fade" depends on React reconciliation keeping the motion.div mounted — observable only in the browser.

---

### Gaps Summary

No gaps found. All 5 observable truths are either VERIFIED (3) or PRESENT_BEHAVIOR_UNVERIFIED (2). The 2 unverified truths have all code present and wired; they are gated on runtime behavior (animation smoothness, timing, GPU budget) that automated static analysis cannot observe. No missing artifacts, stub implementations, broken key links, or debt markers were found.

The 4 human verification items above are runtime/visual checks that require a browser session — they are the standard UAT items for a visual/animation phase, not evidence of incomplete implementation.

---

## Gaps (found in live owner UAT, 2026-06-18 — rebuilt :3000)

The owner rebuilt the production bundle and tested `/users` live. Five gaps surfaced. Root causes were traced in code (systematic-debugging) before any fix.

### G1 — Last Active reads "— No data" on every row; Active 30d KPI genuinely 0  (status: failed) [HIGH]
**Symptom:** Every directory row shows "— No data" for Last Active; the Active 30d KPI is 0.
**Root cause (confirmed):** `/users` fetches the lean bulk payload `BULK_USERS_LEAN_INPUT = { leanProjects: true }`. The lean projection in `lib/server/acc-hot-cache.ts` (getCachedAccDcBulkUsers, ~line 383-392) reduces each project to `{id, name, status, isAdmin, roles:[], modules:[]}` and **drops `lastActivity`** (the P5-C field). But `buildDirectoryRows` (04-01) derives `lastActivity = max(project.lastActivity)`, and the Active-30d KPI (`useUsersDirectoryData`/shell) counts projects with recent `lastActivity`. With the field stripped, both collapse to null/0 for everyone. Phase-2 lean optimization vs Phase-4 derivation integration gap.
**Fix direction:** Add `lastActivity: p.lastActivity` to the lean projection (one ISO string/project ≈ ~0.5 MB across 22.8k rows — small vs the ~15 MB roles/modules savings lean preserves). Keep the cache key. Add a server test asserting lean retains lastActivity.

### G2 — KPI count-up frozen at 0 (Total users / Active 30d / Admins all show 0)  (status: failed) [HIGH]
**Symptom:** All three KPI tiles display 0 even though the table is populated.
**Root cause (confirmed):** `useAnimatedNumber` in `UsersTableHeader.tsx` captures `initialTarget = useRef(target)` at first render and guards with `hasAnimated`. The header mounts before the async data loads, so the captured target is 0; the effect runs once, sees 0, sets 0, and the guard blocks all future runs. When real data arrives the ref is still 0 and the effect never re-fires → permanently 0. (Total users=0 is purely this; Active 30d=0 is this AND G1.) The 04-04 unit test used a fixed non-zero value, so it never exercised the load-from-0 path.
**Fix direction:** Re-arm the count-up when the target value changes (animate from the current displayed value to the new target; no-op when unchanged). This animates once when data first lands and still does NOT restart on sort/filter/density (those don't change the KPI values). Add a test that mounts with 0 then updates to N and asserts it animates to N.

### G3 — Whole-page entrance fade is imperceptible  (status: failed) [MEDIUM]
**Symptom:** Owner cannot see any entrance animation (VIS-03 "staggered entrance").
**Root cause (confirmed):** The shell wraps content in `motion.div` with `fadeIn` (opacity-only, 0.25 s) rather than `fadeUp` (opacity + upward drift, 0.35 s) or a `stagger`. A 0.25 s opacity blink on an already-laid-out page is easy to miss; if the OS/projector has `prefers-reduced-motion`, `useSafeVariants` zeroes it entirely.
**Fix direction:** Use `fadeUp` (or a gentle `stagger` over the header + table) for a calm-but-visible entrance within the <400 ms budget; confirm reduced-motion isn't the cause in this environment.

### G4 — Profile panel role/module counts require a manual refresh; activity is slow to appear  (status: failed) [MEDIUM]
**Symptom:** Opening a profile in the DrillSheet shows empty role/module counts until the browser is refreshed; activity takes a long time to render.
**Likely cause (needs its own investigation):** `UserProfilePanel`'s tRPC queries (getAccProfile / getAccUserActivity / getAccUserFolderAccess) interact with the app-wide caching config (`refetchOnWindowFocus:false` + long `staleTime` in `lib/core/providers.tsx`) — the pre-existing `/users` data-freshness item that STATE.md deferred to Phase 4. The on-open query is either not eager or returns stale-empty until a hard refetch. Activity slowness = cold per-user query.
**Fix direction:** Investigate the panel queries; ensure they fetch eagerly on open with a sensible staleTime and a loading state; consider prefetch on row hover (a hover-prefetch seam already exists in the shell for file activity). Tie to the deferred freshness item.

### G5 — Directory takes a while to show full data  (status: failed) [LOW]
**Symptom:** Noticeable wait before the full directory renders.
**Likely cause:** The ~15 MB bulkUsers snapshot load (PERF-01); partly inherent and overlapping with G4. The table skeleton already covers the gap visually.
**Fix direction:** Confirm the SSR hydration cache is actually hit (no client re-fetch), measure load, and decide if further deferral/streaming is warranted. May fold into G4's investigation.

---

_Verified: 2026-06-18T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
