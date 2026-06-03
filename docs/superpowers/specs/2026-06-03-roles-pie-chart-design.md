# Access Analysis → Roles Pie Chart (from scratch)

**Date:** 2026-06-03
**Branch:** feat/access-analysis-redesign
**Status:** Approved (design)

## Goal

Replace the entire `/access-analysis` page with a single visualization: a pie
chart of roles. Each slice is one role; slice size = **people per role**, i.e.
the number of `(user, project)` assignments that hold that role. All roles are
shown (no "Other" bucket).

This is a deliberate, drastic scope reduction. The previous page (filter bar +
paginated user table + summary/risk/trend panels backed by four API routes) is
removed. All removed code remains recoverable in git history.

## Non-goals

- No filtering, search, pagination, CSV export, or drill-down.
- No new API route, TanStack Query, or Zustand store.
- No change to the separate cosmos graph at `/users/access-analysis`.
- No change to data ingestion or the DC snapshot.

## Data

`loadInstanceView()` (`lib/server/accessInstanceView.ts`) already returns one
`AccessInstance` per `(user, project)`, each carrying `roles: string[]` (display
names, resolved via `mergeRoleNames` — DC role table is empty, names come from
live `AccRole`). The page is a **server component** and already calls this, so
roles are counted on the server and only a small `{name, value}[]` array crosses
to the client.

"People per role" matches the existing `roleCount` logic in `aggregations.ts`
(increment once per role per instance) — so semantics stay consistent with the
rest of the system even though that file is being deleted.

## Architecture (Approach A — server-computed pie)

```
page.tsx (server)
  └─ loadInstanceView()            // existing, cached 5 min
       └─ roleCounts(rows)         // NEW pure fn → [{name, value}] desc
            └─ <RolesPieChart />   // NEW client component (uses EChart wrapper)
```

### New files
- `app/(dashboard)/access-analysis/roleCounts.ts`
  - `roleCounts(rows: AccessInstance[]): { name: string; value: number }[]`
  - Flattens every instance's `roles[]`, counts occurrences, sorts descending.
  - Pure, no I/O. Returns `[]` for empty input.
- `app/(dashboard)/access-analysis/components/RolesPieChart.tsx`
  - `"use client"`; props `{ data: {name,value}[]; assignments: number }`.
  - Renders a full pie via the existing `EChart` wrapper.
  - All slices shown; legend `type: "scroll"` (handles many roles).
  - Tooltip: `{b}: {c} ({d}%)`. Heading: "Role distribution — N assignments
    across M roles". Dark zinc theme to match the app (`#09090b` bg, `#a1a1aa`
    text), matching the existing `donut()` styling.

### Rewritten files
- `page.tsx` — server component: load view, compute `roleCounts`, render the
  chart inside a minimal page shell (`bg-zinc-950`, centered max-width). Drops
  the `FilterBar` / `UserTable` imports and the `filterOptions` plumbing.
- `page.test.tsx` — render test asserting the page renders the chart container
  and heading.
- `types.ts` — trim to `AccessInstance` + `ModuleId` (the only exports still
  consumed, by `accessInstanceView.ts` and `roleCounts.ts`). Remove
  `FilterState`, `EMPTY_FILTERS`, `Category`, `SummaryDTO` (orphaned once the
  dashboard/API/aggregations are deleted — verified no other importers).

### Kept (still needed)
- `lib/server/accessInstanceView.ts`, `modules.ts` (+ test), `types.ts`
  (trimmed), `components/EChart.tsx` (+ test), `loading.tsx`.

### Deleted (dead island — verified no external importers)
- Dashboard: `AccessAnalysisDashboard.tsx` (+ test).
- Components: `FilterBar`, `UserTable`, `CountTiles` (+test), `CompositionDonuts`,
  `RiskCards` (+test), `ModuleAccessChart`, `Rankings` (+test), `Trends`,
  `MultiSelectCombobox` (+test), `ActiveFilterChips`, `DetailTable` (+test).
- Helpers: `queries.ts`, `store.ts`, `filters.ts`, `filterParams.ts`,
  `aggregations.ts`, `trends.ts`, `csv.ts`, `userRows.ts` (each + its test).
- API routes: `app/api/access-analysis/{summary,members,trends,users}/route.ts`
  (+ `summary/__tests__/route.test.ts`).
- E2E: `tests/e2e/access-analysis-redesign.spec.ts` (drives the removed UI/API).

## Edge cases / error handling
- Empty data → `roleCounts` returns `[]`; chart shows an empty-state message
  ("No role assignments found") instead of a blank canvas.
- Instances with no roles contribute nothing (skipped naturally).
- Many roles → scrollable legend prevents overflow; tooltip carries the detail.

## Testing & verification
- Unit: `roleCounts.test.ts` — duplicate counting, multi-role instances each
  counted, descending sort, empty input.
- Render: `page.test.tsx` + a light `RolesPieChart` render test (mock ECharts).
- Gates: `npx tsc --noEmit` clean; `npm test` green; production rebuild
  (`npm run build`) since deploy = rebuild of the current checkout. Update
  `.gsd/TECHNICAL_DEBT.md`.

## Risk
Deletion is the risky part, not the pie. Each deleted file's importers were
grepped across the repo (excluding `.next-*` artifacts); the old UI + 4 API
routes form a closed island referencing only themselves. The shared
`types.ts`/`modules.ts` are kept for `loadInstanceView`.
