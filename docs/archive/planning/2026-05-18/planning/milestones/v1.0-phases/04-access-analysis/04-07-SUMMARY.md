---
phase: 04-access-analysis
plan: 07
subsystem: app/users/dashboard
tags: [dashboard, react-context, pattern-3, xyflow, shadcn-table, csv-export, dash-03, dash-04, dash-05, dash-06, dash-07, dash-09, dash-13]

requires:
  - phase: 04-access-analysis
    plan: 05
    provides: WIDGETS registry contract (locked ids/titles/spans), DashboardClient shell with DndContext + useWidgetOrder + downloadCsv, locked chart deps
  - phase: 04-access-analysis
    plan: 03
    provides: computeAllFindings + DashboardFindings/JunkRoleFinding/DuplicateRoleFinding/OutlierFinding/Severity types
  - phase: 04-access-analysis
    plan: 01
    provides: BulkAccUser.isAccountAdmin (non-optional boolean) for AdminAccessWidget
  - phase: 04-access-analysis
    plan: 02
    provides: BulkAccUser.addedOn (string|null) for RecentlyAddedWidget
provides:
  - FindingsContext + FindingsProvider + useFindings hook (Pattern 3 single-source-of-truth)
  - 6 production widgets: KpiStrip, Recommendations, OutlierCombos, RoleRelationshipFlow, RecentlyAdded, AdminAccess
  - Recommendations CSV with LOCKED column order: Type,Severity,Roles,Members,Modules,SuggestedAction (DASH-13)
  - Findings computed ONCE in DashboardClient via useMemo(() => computeAllFindings(users))
affects: [04-08 drill-down side panel — consumes the same FindingsContext]

tech-stack:
  added: []  # All deps installed in 04-05
  patterns:
    - "Pattern 3 — findings computed once at the page level and shared via React context. Widgets call useFindings() rather than receiving findings as a prop, eliminating prop-drill drift between Recommendations table + future inline severity badges."
    - "Stable empty-findings sentinel during load — FindingsProvider always wraps with at least { junkRoles:[], duplicateRoles:[], outlierCombos:[], roleSeverityIndex:new Map() } so widgets calling useFindings() never throw before data arrives."
    - "Common widget contract — every WIDGETS[id].component accepts (users, workspaceEmails); widgets that don't need them simply ignore the props (typed as optional unknown)."
    - "Inline ToggleGroup — implemented as a 3-button group with aria-pressed instead of pulling shadcn toggle-group (the project does not ship that component) — kept additive to avoid scope creep."

key-files:
  created:
    - app/(dashboard)/users/dashboard/findingsContext.tsx
    - app/(dashboard)/users/dashboard/widgets/KpiStripWidget.tsx
    - app/(dashboard)/users/dashboard/widgets/RecommendationsWidget.tsx
    - app/(dashboard)/users/dashboard/widgets/OutlierCombosWidget.tsx
    - app/(dashboard)/users/dashboard/widgets/RoleRelationshipFlowWidget.tsx
    - app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx
    - app/(dashboard)/users/dashboard/widgets/AdminAccessWidget.tsx
    - .planning/phases/04-access-analysis/04-07-SUMMARY.md
  modified:
    - app/(dashboard)/users/dashboard/widgetRegistry.ts
    - app/(dashboard)/users/dashboard/DashboardClient.tsx

key-decisions:
  - "Pattern 3 implemented exactly as designed in 04-RESEARCH.md: FindingsProvider wraps the widget grid; widgets call useFindings(); findings recompute via useMemo only when the users array reference changes (refetch produces a new reference automatically — no key prop needed)."
  - "FindingsProvider always wraps (with empty sentinel during load) instead of conditionally mounting. This avoids any race where a widget mounts before findings are available and throws from useFindings()."
  - "Recommendations Modules column derived from per-user `allModules` lookup (built in widget via useMemo) rather than passed as a prop. The analytics module's per-finding `affectedMembers` plus this lookup is enough to compose the union of modules at render time."
  - "Recently-added inline tooltip caveat: Per 04-02 SUMMARY (Path A), no fallback was used — real ACC `created_at` plumbed end-to-end. The widget shows a small 'Based on ACC join date' info marker rather than the deferred Path B 'first sync detection' caveat."
  - "Account-admin filter is strict `=== true` (not truthy). Pitfall 6 mitigation — legacy cache rows with default-false `isAccountAdmin` are excluded automatically."
  - "RoleRelationshipFlowWidget renders ONLY roles that appear in a duplicate finding (avoids a 1000-node disconnected mass when there are no duplicates). Empty state: 'No duplicate-role pairs detected.'"
  - "Inline 3-button toggle for Recently-added windows (7d/30d/90d) instead of shadcn ToggleGroup — that component is not present in components/ui (only Tabs/Button/Card/Table/Sheet/etc.). Adding it would have been scope creep; native button + aria-pressed is sufficient."
  - "Common widget signature accepts optional users/workspaceEmails. Widgets that need neither (Outliers, Flow) declare `_props` and ignore them — keeps the cross-widget call site uniform `<Body users={users} workspaceEmails={workspaceEmails} />`."
  - "Refresh button uses tRPC utils.invalidate (matches 04-06's lift); since users is the dep of the findings useMemo, invalidation → new query → new array reference → findings recomputes automatically."

metrics:
  duration: "~7min"
  started: "2026-05-08T19:18:24Z"
  completed: "2026-05-08T19:25:35Z"
  tasks: 3
  files_created: 7
  files_modified: 2

requirements-completed: [DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-09, DASH-13]
---

# Phase 4 Plan 7: Findings-driven Widgets + Pattern-3 FindingsContext Summary

**6 production widgets shipped (KPI, Recommendations, Outliers, Flow, Recent, Admins) plus the FindingsContext that makes findings a single source of truth for the dashboard. computeAllFindings is computed ONCE in DashboardClient and consumed by widgets via `useFindings()`. Recommendations CSV column order locked per DASH-13. Build + tsc pass.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-08T19:18:24Z
- **Completed:** 2026-05-08T19:25:35Z
- **Tasks:** 3
- **Files created:** 7
- **Files modified:** 2

## Task Commits

| # | Description | Commit |
|---|-------------|--------|
| 1 | FindingsContext + KpiStripWidget + RecommendationsWidget (locked CSV columns) | `ff14f81` |
| 2 | OutlierCombos + RoleRelationshipFlow + RecentlyAdded + AdminAccess widgets | `aaa3184` |
| 3 | Wire FindingsProvider + register all 6 remaining widgets in WIDGETS | `e687e33` |

## Pattern 3 (FindingsContext) Wiring

```
DashboardClient
  ├─ usersQuery = trpc.users.bulkAccSummary.useQuery()
  ├─ workspaceQuery = trpc.workspace.getDirectory.useQuery()
  ├─ findings = useMemo(() => computeAllFindings(users, new Date()), [users])
  └─ <FindingsProvider findings={findings ?? EMPTY_FINDINGS}>
        <DndContext><SortableContext>
          {WIDGETS} → <Body users={users} workspaceEmails={workspaceEmails} />
        </SortableContext></DndContext>
     </FindingsProvider>
```

**Consumer matrix (which widgets use which surface):**

| Widget | useFindings() | users prop | workspaceEmails prop |
|--------|---------------|-----------|----------------------|
| coverage (04-06) | — | yes | yes |
| tiers (04-06) | — | yes | — |
| heatmap (04-06) | — | yes | — |
| **kpi** (this plan) | yes | yes | — |
| **recommendations** (this plan) | yes | yes | — |
| **outliers** (this plan) | yes | — | — |
| **flow** (this plan) | yes | — | — |
| **recent** (this plan) | — | yes | — |
| **admins** (this plan) | — | yes | — |

Six widgets (4 from this plan + heatmap-when-04-08-adds-inline-badges) read from `useFindings()`. Computing findings inside any widget is now an anti-pattern — `useFindings()` is the only legitimate read path.

## How 04-08 (Drill-down) Integrates

When 04-08 wires the side panel:

1. RecommendationsWidget already exposes `onSelect?: (finding: JunkRoleFinding | DuplicateRoleFinding) => void`. 04-08 hoists a `selectedFinding` state in DashboardClient, passes the setter as `onSelect`, and renders `<DashboardSidePanel finding={selectedFinding} />` outside the SortableContext.
2. Other widgets that want to be clickable (heatmap cells, flow nodes) consume `useFindings()` to map their internal click target → finding payload.
3. Inline severity badges in the heatmap/flow read `findings.roleSeverityIndex.get(role)` — already populated by 04-03's `computeAllFindings`. No new analytics work needed.

## Recently-added Caveat

**Caveat tooltip status:** NOT shown as a fallback warning because Plan 04-02 chose Path A (real ACC `created_at` via HQ v1). The widget shows a small **"Based on ACC join date"** info marker (Info icon + tooltip text) for transparency, but does NOT show the deferred Path-B "first sync detection" caveat — that path was never taken.

Caveat behaviour for legacy cache rows: users with `addedOn === null` (legacy rows pre-04-02 sync) are excluded from every window. After the next live `Sync All to ACC`, the field auto-populates per 04-02 SUMMARY's distribution promise.

## Account-admin vs Project-admin Sanity Check

- **AdminAccessWidget filter:** `users.filter(u => u.isAccountAdmin === true)` (strict equality — pitfall 6 mitigation).
- **Distinction from project admin:**
  - `BulkAccUser.isAccountAdmin: boolean` ← HQ v1 `role === "account_admin"` (per 04-01 SUMMARY).
  - `BulkAccProject.isAdmin: boolean` ← per-project `accessLevels.projectAdmin`.
  - These are independent. A user can be account-admin without project-admin and vice versa. Widget surfaces ONLY the former.
- **Sanity-check expectation post-sync:** account-admin count should be small (typically a handful per Workspace tenant) and a strict subset of "users with any per-project admin grant". Pre-sync (legacy default-false everywhere), the widget will show "No account-level admins found." — that's the correct deterministic fallback per 04-01.

## DASH Requirement Surfacing

| Req | Surface | Location |
|-----|---------|----------|
| DASH-03 | Junk-role tiered findings | RecommendationsWidget Type=Junk rows |
| DASH-04 | Duplicate-role pairs | RecommendationsWidget Type=Duplicate rows + RoleRelationshipFlowWidget edges |
| DASH-05 | <5% module-set outliers | OutlierCombosWidget |
| DASH-06 | 7d/30d/90d toggle | RecentlyAddedWidget |
| DASH-07 | Account-admins only | AdminAccessWidget |
| DASH-09 | Recommendations + inline badge surface | RecommendationsWidget + roleSeverityIndex via useFindings (consumed by 04-08-coupled charts) |
| DASH-13 | Locked CSV column order | RecommendationsWidget.handleDownload — exactly `Type,Severity,Roles,Members,Modules,SuggestedAction` |

## Pitfalls Mitigated

| # | Pitfall | Where mitigated |
|---|---------|-----------------|
| 1 | Nivo/ECharts SSR window-undefined | All new widgets are `"use client"`. RoleRelationshipFlowWidget imports `@xyflow/react/dist/style.css` only inside the client module. |
| 4 | lastSignIn null/undefined branches | Not consumed in this plan — analytics already handle it (see 04-03). RecentlyAdded keys on `addedOn`, which 04-02 normalizes. |
| 6 | Account-admin flag not plumbed | Closed in 04-01; AdminAccessWidget consumes the boolean directly. |
| 7 | addedOn not plumbed | Closed in 04-02; RecentlyAddedWidget filters on it directly with date-fns. |
| 8 | Drag-handle vs click conflict | Inherited from 04-05 SortableWidget — drag listeners scoped to header grip button only. RecommendationsWidget rows are clickable for `onSelect` without interfering. |
| 10 | Memoization across 25k-user hub | `findings = useMemo(computeAllFindings, [users])` ensures O(1) per render except when users reference changes. RecommendationsWidget moduleLookup also memoized. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Coordination] DashboardClient already lifted by 04-06**

- **Found during:** Task 3 (verification of widgetRegistry update)
- **Issue:** Plan instructed me to add `findings = useMemo(...)` and FindingsProvider into a vanilla DashboardClient. The parallel 04-06 plan had ALREADY lifted `usersQuery` + `workspaceQuery` and replaced placeholder body with `<Body {...widgetProps} />`. The first task-3 attempt would have collided.
- **Fix:** Rebased my edit to add `import { computeAllFindings }`, `import { FindingsProvider }`, the `findings` useMemo, and the FindingsProvider wrapper around the existing `<DndContext>` — strictly additive on top of 04-06's structure. Did not touch the existing usersQuery / workspaceQuery / widgetProps logic.
- **Files modified:** `app/(dashboard)/users/dashboard/DashboardClient.tsx`
- **Verification:** `npx tsc --noEmit` clean; `npm run build` succeeded.
- **Commit:** `e687e33`

**2. [Rule 3 — Coordination] WidgetCommonProps contract pre-existed**

- **Found during:** Task 2 (initial widget signatures)
- **Issue:** 04-06 had already published a `WidgetCommonProps = { users, workspaceEmails }` contract on the registry. My initial widget signatures used different shapes (e.g. `RecommendationsWidget({ onSelect })` only) which broke `ComponentType<WidgetCommonProps>` type narrowing.
- **Fix:** Added users/workspaceEmails (optional where unused, ignored when not needed) to every widget signature. RecommendationsWidget now takes `users` and derives the `moduleLookup` Map internally instead of receiving it as a prop.
- **Files modified:** RecommendationsWidget.tsx, OutlierCombosWidget.tsx, RoleRelationshipFlowWidget.tsx
- **Verification:** `npx tsc --noEmit` clean across all 9 widgets after the fix.
- **Commit:** `aaa3184`

**3. [Plan-shortcut] Inline toggle in lieu of shadcn ToggleGroup**

- **Found during:** Task 2 (RecentlyAddedWidget)
- **Issue:** Plan calls for `shadcn ToggleGroup type="single"` for the 7d/30d/90d selector. The project's `components/ui/` does not ship a toggle-group component (only button/card/table/badge/etc.). Adding shadcn-toggle-group would require pulling a new radix dep.
- **Fix:** Implemented an inline 3-button group with `aria-pressed` for accessibility. Functionally identical for this scope.
- **Files modified:** RecentlyAddedWidget.tsx
- **Commit:** `aaa3184`

**4. [Rule 1 — Bug] Stale `findings` reference if FindingsProvider conditionally mounts**

- **Found during:** Task 3 design
- **Issue:** Initial design conditionally mounted FindingsProvider only when `findings !== null`. This caused a hidden race: widgets that call useFindings() during the loading skeleton (Skeleton replaces body but only inside the SortableWidget — the FindingsProvider must wrap whether or not findings exist).
- **Fix:** FindingsProvider always wraps; passes a stable empty sentinel `{ junkRoles:[], duplicateRoles:[], outlierCombos:[], roleSeverityIndex:new Map() }` while findings is null. Widgets see a deterministic empty-findings shape during loading, eliminating any throw path.
- **Files modified:** DashboardClient.tsx
- **Commit:** `e687e33`

---

**Total deviations:** 4 (3 auto-fixed Rule 3 — coordination + missing component dep; 1 Rule 1 — context-mount race fix). All required for the cross-plan contract to land cleanly.

## Verification

- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — passes; `/users/dashboard` appears in dynamic route table; no SSR `window`/`document` errors
- [x] All 6 widget files + findingsContext.tsx exist
- [x] WIDGETS registry maps all 9 ids to real components (no placeholders)
- [x] DashboardClient calls computeAllFindings via useMemo
- [x] Recommendations CSV header line = `Type,Severity,Roles,Members,Modules,SuggestedAction`
- [x] AdminAccessWidget filters by `isAccountAdmin === true`
- [x] RecentlyAddedWidget defaults to 30d, supports 7/30/90
- [ ] Manual smoke (open /users/dashboard and download every CSV) — **DEFERRED to Plan 04-08 UAT** per phase plan

## Self-Check: PASSED

Files exist:
- FOUND: app/(dashboard)/users/dashboard/findingsContext.tsx
- FOUND: app/(dashboard)/users/dashboard/widgets/KpiStripWidget.tsx
- FOUND: app/(dashboard)/users/dashboard/widgets/RecommendationsWidget.tsx
- FOUND: app/(dashboard)/users/dashboard/widgets/OutlierCombosWidget.tsx
- FOUND: app/(dashboard)/users/dashboard/widgets/RoleRelationshipFlowWidget.tsx
- FOUND: app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx
- FOUND: app/(dashboard)/users/dashboard/widgets/AdminAccessWidget.tsx

Commits exist:
- FOUND: ff14f81 (Task 1)
- FOUND: aaa3184 (Task 2)
- FOUND: e687e33 (Task 3)

---
*Phase: 04-access-analysis*
*Completed: 2026-05-08*
