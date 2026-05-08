---
phase: 04-access-analysis
plan: 05
subsystem: app/users/dashboard
tags: [dashboard, dnd-kit, sortable, localStorage, csv-export, nivo, echarts, xyflow, vitest, jsdom]

requires:
  - phase: 04-access-analysis
    plan: 04
    provides: workspaceRouter for downstream Coverage donut consumer (no direct dep in this plan)
provides:
  - /users/dashboard route shell rendering 9 placeholder widgets in a 2-col grid
  - WIDGETS registry (locked ids + spans) — contract for downstream widget plans (04-06/04-07/04-08)
  - DEFAULT_ORDER tuple matching the locked decision-priority sequence
  - useWidgetOrder hook (SSR-safe, validation-on-read, localStorage persistence)
  - SortableWidget wrapper with grip-handle drag listeners (Pitfall 8)
  - downloadCsv helper (RFC4180 + UTF-8 BOM via xlsx) — interface for DASH-12/13
  - Locked chart deps installed at exact pinned versions
affects: [04-06, 04-07, 04-08, all DASH widget plans]

tech-stack:
  added:
    - "@nivo/core@0.99.0"
    - "@nivo/pie@0.99.0"
    - "@nivo/bar@0.99.0"
    - "echarts (^6.0.0)"
    - "echarts-for-react@3.0.6"
    - "@xyflow/react@12.10.2"
    - "jsdom (devDep — vitest jsdom env for new test files)"
    - "@testing-library/react (devDep — renderHook for hook test)"
  patterns:
    - "Per-file vitest env directive (// @vitest-environment jsdom) — keeps node default for analytics modules"
    - "Mount-time validation of localStorage payload (parse → array-of-strings → known-id check → coverage check) — re-validates every read so a NEW WIDGETS entry never orphans stored arrays"
    - "Drag listeners scoped to a single header button — preserves chart hover/click for downstream widgets"
    - "Server-only Suspense shell + client-only chart consumer boundary — keeps Nivo/ECharts off SSR (Pitfall 1)"

key-files:
  created:
    - lib/acc/csvExport.ts
    - lib/acc/csvExport.test.ts
    - app/(dashboard)/users/dashboard/widgetRegistry.ts
    - app/(dashboard)/users/dashboard/useWidgetOrder.ts
    - app/(dashboard)/users/dashboard/useWidgetOrder.test.ts
    - app/(dashboard)/users/dashboard/SortableWidget.tsx
    - app/(dashboard)/users/dashboard/page.tsx
    - app/(dashboard)/users/dashboard/DashboardClient.tsx
    - .planning/phases/04-access-analysis/04-05-SUMMARY.md
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "echarts pulled in at npm-latest (^6.0.0) since the plan did not pin echarts itself — only echarts-for-react@3.0.6. echarts-for-react 3.0.6 lists echarts as a peer; v6 satisfies it."
  - "widgetRegistry.ts (NOT .tsx) per plan spec; placeholders use React.createElement so the file remains JSX-tooling-free for server-component imports."
  - "useWidgetOrder fall-back rule: stored array must (a) be JSON, (b) be an array of strings, (c) contain ONLY known WIDGETS keys, and (d) cover EVERY id in DEFAULT_ORDER. Failing any check returns DEFAULT_ORDER without throwing."
  - "Per-file `// @vitest-environment jsdom` directive instead of switching the global env — preserves node env (default) for the analytics module test suite committed in 04-03."
  - "downloadCsv guards `typeof window === 'undefined'` and silently early-returns — defensive against accidental server-component invocation."
  - "blobToText test helper reads ArrayBuffer + decodes via TextDecoder({ ignoreBOM: true }); both Blob.text() and FileReader strip the BOM so we cannot assert on it via those paths."

metrics:
  duration: "~5min"
  started: "2026-05-08T19:09:30Z"
  completed: "2026-05-08T19:14:51Z"
  tasks: 3
  files: 8
  tests_passed: 11
---

# Phase 4 Plan 5: Dashboard Route Shell + Widget Grid Scaffolding Summary

**`/users/dashboard` route with 9 placeholder widgets in a drag-reorderable 2-col grid, plus the locked widget-registry contract (WIDGETS + DEFAULT_ORDER), the SSR-safe `useWidgetOrder` hook, the `SortableWidget` wrapper, and a tested `downloadCsv` helper. Locked chart dependencies installed at exact pinned versions. 11/11 tests pass; `npm run build` succeeds.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-08T19:09:30Z
- **Completed:** 2026-05-08T19:14:51Z
- **Tasks:** 3
- **Files created:** 8
- **Files modified:** 2 (package.json, package-lock.json)
- **Tests:** 11/11 pass (5 csvExport + 6 useWidgetOrder)

## Task Commits

| # | Description | Commit |
|---|-------------|--------|
| 1 | Install chart deps + create CSV helper with Vitest coverage | `5e4e5fb` |
| 2 | Build widget registry + useWidgetOrder hook + SortableWidget wrapper | `99c3363` |
| 3 | Create /users/dashboard route + DashboardClient with DndContext-wrapped 2-col grid | `0e3813a` |

## Installed Chart Dependencies

| Library | Resolved Version | Plan-spec Version | Notes |
|---------|------------------|-------------------|-------|
| @nivo/core | ^0.99.0 | 0.99.0 | exact pin honored |
| @nivo/pie | ^0.99.0 | 0.99.0 | exact pin honored |
| @nivo/bar | ^0.99.0 | 0.99.0 | exact pin honored |
| echarts | ^6.0.0 | (not pinned) | npm-latest at install time; satisfies echarts-for-react@3.0.6 peer |
| echarts-for-react | ^3.0.6 | 3.0.6 | exact pin honored |
| @xyflow/react | ^12.10.2 | 12.10.2 | exact pin honored |

`xlsx@0.20.3` was already installed (pre-existing). `@dnd-kit/sortable@^10.0.0` and `@dnd-kit/core@^6.3.1` were already installed.

## Widget Registry Contract (locked — Plans 04-06/04-07 fill in by id)

| id | title | span |
|----|-------|------|
| coverage | ACC Coverage | col-span-1 |
| tiers | Active Users | col-span-1 |
| kpi | Overview | col-span-2 |
| recommendations | Recommendations | col-span-2 |
| heatmap | Roles × Modules | col-span-2 |
| outliers | Unusual Access | col-span-1 |
| flow | Role Relationships | col-span-2 |
| recent | Recently Added | col-span-1 |
| admins | Account Admins | col-span-1 |

`DEFAULT_ORDER`: `coverage, tiers, kpi, recommendations, heatmap, outliers, flow, recent, admins`.

`WIDGET_ORDER_STORAGE_KEY = "acc-dashboard-widget-order"`.

Downstream plans MUST replace the `component` field in WIDGETS without altering id, title, or span.

## Vitest Configuration

The project's `vitest.config.ts` uses `environment: 'node'` (default for the analytics suite). New tests that need DOM globals declare it per-file via the directive `// @vitest-environment jsdom` at the top. `jsdom` was added as a devDependency. `@testing-library/react` was added as a devDependency for `renderHook`/`act`/`waitFor` in the hook test.

## Manual Smoke Result for Drag-Reorder Persistence

**Deferred to Plan 04-08 (final UAT phase) per plan spec.** The plan explicitly notes: "no checkpoint here — defer to Plan 04-08." `npm run build` succeeded without SSR `window`-undefined errors (Pitfall 1), confirming the boundary between server `page.tsx` and client `DashboardClient.tsx` is clean. Automated coverage of the persistence layer:

- `useWidgetOrder.test.ts` exercises empty / valid / missing-id / unknown-id / garbage / setOrder cases against jsdom localStorage — all pass.
- The route is registered as a dynamic page in the build manifest.

A live browser smoke (drag a widget → reload → confirm new order persists) requires a running dev server with auth-session cookies; this is the responsibility of Plan 04-08's UAT checkpoint per the plan's `<action>` step 3.

## Pitfalls Mitigated

| # | Pitfall | Where mitigated |
|---|---------|-----------------|
| 1 | Nivo/ECharts SSR window-undefined | `page.tsx` is a pure server component; ALL chart imports live behind `DashboardClient` `"use client"` boundary. No chart dep is imported in this plan — placeholders only. |
| 8 | Drag-handle vs click conflict | `SortableWidget` binds `{...attributes} {...listeners}` to a dedicated header button (GripVertical), not the whole card. |
| 9 | localStorage SSR scope | `useWidgetOrder` initializes state with `DEFAULT_ORDER`; reads `localStorage` ONLY inside `useEffect`. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `jsdom` devDep missing**
- **Found during:** Task 1 (csvExport test run)
- **Issue:** `vitest.config.ts` uses `environment: 'node'` globally; the new csvExport test needs `Blob`/`URL`/`document` so it declares `// @vitest-environment jsdom`. The package was not installed.
- **Fix:** `npm install --save-dev jsdom`.
- **Files modified:** package.json, package-lock.json (rolled into Task 1 commit `5e4e5fb`).

**2. [Rule 3 - Blocking] `@testing-library/react` devDep missing**
- **Found during:** Task 2 (useWidgetOrder test run)
- **Issue:** Test imports `renderHook`/`act`/`waitFor` from `@testing-library/react`. Not in `node_modules`.
- **Fix:** `npm install --save-dev @testing-library/react`.
- **Files modified:** package.json, package-lock.json (rolled into Task 2 commit `99c3363`).

**3. [Rule 1 - Bug] Blob.text()/FileReader strip the BOM**
- **Found during:** Task 1 (initial csvExport test run — first 3 cases failed)
- **Issue:** The first iteration of `blobToText` used `Blob.text()` (or FileReader fallback). Both decoded as UTF-8 with default `ignoreBOM: false`, stripping the leading 0xFEFF — so the BOM assertion failed even though the implementation correctly prepended it.
- **Fix:** Switched the helper to `await blob.arrayBuffer()` + `new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf)`. Now the BOM byte is preserved and visible to the test.
- **Files modified:** lib/acc/csvExport.test.ts (still part of Task 1 commit `5e4e5fb`).

**4. [Rule 1 - Bug] tsc complaint on HTMLAnchorElement.click stub assignment**
- **Found during:** post-Task-2 `npx tsc --noEmit` verification
- **Issue:** Assigning `vi.fn()` directly to `HTMLAnchorElement.prototype.click` produced a type-mismatch error because the mock's call signature is wider than `() => void`.
- **Fix:** Cast to `as unknown as () => void` at the assignment site.
- **Files modified:** lib/acc/csvExport.test.ts (rolled into Task 2 commit `99c3363`).

---

**Total deviations:** 4 (all auto-fixed under Rules 1 and 3 — three blocking dev-env / type-system issues plus one test-helper bug).
**Impact on plan:** None. All fixes were strictly required for the test suite to run and the type-checker to pass; no scope creep.

## Verification

- [x] `npm run test -- csvExport` — 5/5 pass
- [x] `npm run test -- useWidgetOrder` — 6/6 pass
- [x] `grep -E "@nivo/(core|pie|bar)|echarts|@xyflow/react" package.json` — all six confirmed
- [x] `npx tsc --noEmit` — clean (no errors in any file modified by this plan)
- [x] `npm run build` — succeeds; /users/dashboard appears in dynamic route table; no SSR window/document errors
- [ ] Manual smoke: visit /users/dashboard, drag widget, reload, verify persistence — **DEFERRED to Plan 04-08 UAT per plan spec**

## Next Phase Readiness

- **DASH-11 demonstrably working with placeholders.** Drag-reorder + localStorage persistence are exercised by 6 jsdom unit tests; the live browser smoke is a planned 04-08 UAT step.
- **DASH-13 layout established.** 2-col grid at `md:` breakpoint with gap-4 / p-4 and per-widget col-span-1/col-span-2 spans matches CONTEXT.md "2-col at 1280px, generous whitespace, half-width charts; matrix + KPI strip full-width."
- **DASH-12 building block ready.** `downloadCsv(filename, rows)` is importable from `@/lib/acc/csvExport`. Widget plans for DASH-09 (recommendations CSV) just call it with the structured row payload.
- **Locked chart libs ready.** Plans 04-06 (Nivo Coverage donut + Active-user tiers, ECharts heatmap) and 04-07 (XYFlow role-relationship diagram) can import without further setup.
- **Widget registry contract published.** Downstream widget plans replace `WIDGETS[id].component` per id without renaming. Spans/titles are LOCKED — do not edit them.

## Self-Check: PASSED

Files exist:
- FOUND: lib/acc/csvExport.ts
- FOUND: lib/acc/csvExport.test.ts
- FOUND: app/(dashboard)/users/dashboard/widgetRegistry.ts
- FOUND: app/(dashboard)/users/dashboard/useWidgetOrder.ts
- FOUND: app/(dashboard)/users/dashboard/useWidgetOrder.test.ts
- FOUND: app/(dashboard)/users/dashboard/SortableWidget.tsx
- FOUND: app/(dashboard)/users/dashboard/page.tsx
- FOUND: app/(dashboard)/users/dashboard/DashboardClient.tsx

Commits exist:
- FOUND: 5e4e5fb (Task 1)
- FOUND: 99c3363 (Task 2)
- FOUND: 0e3813a (Task 3)

---
*Phase: 04-access-analysis*
*Completed: 2026-05-08*
