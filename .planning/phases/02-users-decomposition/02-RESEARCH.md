# Phase 2: /users Decomposition — Research

**Researched:** 2026-06-17
**Domain:** React component decomposition — state extraction + data hook consolidation
**Confidence:** HIGH (all findings verified directly in codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Behavior parity (what "unchanged" means)**
- Preserve current behavior bug-for-bug. If decomposition surfaces a small pre-existing bug or quirk, reproduce it exactly — do NOT fix it in this phase. Any fix is separate, deliberate work (Phase 4 polish or its own task).
- Match displayed data exactly. Every number/list on `/users` (user counts, activity, coverage) must render identically to today, even if a value looks wrong. Correcting data/logic is never hidden inside a refactor.
- Consequence for planning: the success bar is *provable* parity. The refactor is "done" only when behavior + data are observably identical to the pre-refactor baseline.

**Protected flows — golden-path safety-net test**
The integration test (written BEFORE the first extraction) must assert ALL of:
- Search by name — typing narrows the list (same debounce/matching behavior).
- Filters — the full filter set narrows the list, and multiple filters combine correctly. (Real filters today: `filterDept`, `filterJobTitle`, `filterCostCenter`, `filterNoProjects`, `filterAccProject`, `filterAccRole`, `filterAccModule`, `filterAccModuleTier`, `statusFilter`, `projectAdminFilter`.)
- Grid/list view + group-by — switching `ViewMode` (`grid`|`list`) and `GroupByField` (`none`|`department`|`jobTitle`|`costCenter`).
- Person → profile → back — clicking a person opens the profile panel; closing returns to the list.
- State preservation on close (strict): after opening and closing a person's profile, filters, search text, AND scroll position are all preserved — the user returns to the exact same spot.

**Delivery cadence**
- Incremental, each step verified. Extract one piece at a time; the full test suite stays green after every extraction step. Many small atomic commits so work can be stopped or rolled back at any point.

**Sign-off / acceptance**
- Automated test + projector click-through. Not done on green tests alone: after the refactor we do a before/after click-through on the real `/users` page (projector context) to confirm zero visible change.
- Hard gates: `npx tsc --noEmit` exits 0; full test count holds after every step; each tRPC endpoint fetched at most once per `/users` load (PERF-03).

### Claude's Discretion (technical — not for user)
- Zustand store shape / slice boundaries; what goes in the store (search/filter/sort/viewMode) vs. local component state.
- The single data-hook composition over the 10 tRPC endpoints.
- Which sub-components to extract and their seams (the ~200-line orchestrator shell target).
- Shared query-key constants + `staleTime` values to kill the double-fetch.
- Test framework/harness specifics for the golden-path test.

### Deferred Ideas (OUT OF SCOPE)
- `/users` feels slow/laggy to load — owner-reported current annoyance. Belongs in Phase 4 (/users Table & Polish), which already plans deferred heavy payload + a ~200ms skeleton + reduced initial client payload (PERF-01, PERF-04). Do NOT address load speed in this refactor beyond the PERF-03 double-fetch elimination that is already in this phase's scope.
- Any pre-existing bugs/quirks discovered during decomposition — preserved here, candidates for a future deliberate fix (note them if found; do not fix in P2).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| USR-01 | `UsersDirectoryClient` is decomposed (Zustand store + single data hook + extracted sub-components; shell ~200 lines) with existing filter/sort/search/virtualization behavior unchanged, guarded by a golden-path integration test written before extraction | Store shape, hook boundary, and extraction seams documented below. NOTE: Zustand is not currently installed — see Standard Stack section. |
| PERF-03 | Each tRPC endpoint is fetched at most once per page load (no redundant/double fetch) | Double-fetch root cause identified: `useMergedAccUsers` calls `bulkUsers` with `undefined` input; `UsersDirectoryClient` calls it with `{ leanProjects: true }`. These are DIFFERENT cache keys. The client also calls `getOrgDirectory` and `getDirectory` at lines 1486 and 1494; `useMergedAccUsers.useOrgDirectoryPeople()` would add additional calls to the same endpoints if wired naively. Shared query-key constants + matching `staleTime` design is required. |
</phase_requirements>

---

## Summary

`UsersDirectoryClient.tsx` is a **2,474-line** single-file monolith that owns 15 `useState` calls in the main component body (25 total across the file including sub-components), 9 tRPC queries/1 infinite query, 4 `useEffect` calls, 4 `useCallback` calls, 3 `useRef` calls, and all rendering logic for the `/users` page. The goal is to decompose this into a thin orchestrator (~200 lines) by extracting state into a dedicated store, all data-fetching into a single hook, and large sub-components into separate files — without changing any observable behavior.

**Key discovery: Zustand is NOT installed.** The `package.json` has no Zustand dependency and there are zero `import from 'zustand'` statements in the codebase. The STACK.md note "(inferred from memory context)" was based on memory, not the package file. The store must either be implemented with Zustand (requires `npm install zustand`) or with React's `useReducer` + `useContext` pattern (already in the stack). Given the CONTEXT.md says "Zustand store" by name, Zustand should be installed as a new dependency. This is the only new package this phase requires.

**PERF-03 double-fetch root cause confirmed:** The SSR prefetch in `acc-route-hydration.ts` calls `bulkUsers.prefetch({ leanProjects: true })`, but `useMergedAccUsers.ts` (used by `UserProfilePanel` and other rail components) calls `bulkUsers.useQuery(undefined)` — a different input, therefore a different React Query cache key. This cache miss forces the client to refetch the full snapshot post-mount. The fix is a shared query-key input constant that both the prefetch and client calls use.

**Primary recommendation:** Install Zustand, extract filter/search/sort/viewMode into a `useUsersDirectoryStore`, extract the 9 tRPC calls into `useUsersDirectoryData`, then progressively extract sub-components (`PersonCard`, `PersonRow`, `PersonRowList`, `ActivityAuditPanel`, `PersonDetailModal`, `DataCoverageStrip`) as already-present top-level functions in the file. The golden-path test must be written first in `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Filter/search/sort/viewMode state | Client (React store) | — | Pure UI state; no server round-trip needed |
| tRPC data fetching | Client (data hook) | Frontend Server (SSR prefetch) | Data arrives via HydrationBoundary; client hook deduplicates |
| Window virtualization | Client (PersonRowList component) | — | DOM-only concern; stays in the sub-component |
| Profile modal | Client (PersonDetailModal component) | — | Driven by `selectedPerson` state in the store |
| Golden-path integration test | Client (Vitest jsdom) | — | Tests filter+search+click+close via testing-library render |
| Scroll position preservation | Client (window.scrollTo + store) | — | `selectedPerson` closure must not reset scroll |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.6 | Component model | Already installed [VERIFIED: package.json] |
| TypeScript | 6.0.3 | Types | Already installed [VERIFIED: package.json] |
| @tanstack/react-query | 5.100.14 | tRPC cache layer | Already installed [VERIFIED: package.json] |
| zustand | NOT YET INSTALLED | Filter/search/sort/viewMode store | Named in CONTEXT.md as the chosen approach; requires `npm install zustand` |
| vitest | 4.1.6 | Test runner for golden-path test | Already installed [VERIFIED: package.json] |
| @testing-library/react | 16.3.2 | Render + fireEvent for integration test | Already installed [VERIFIED: package.json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-virtual | 3.13.24 | Window virtualization (already used) | `PersonRowList` sub-component retains `useWindowVirtualizer` |
| trpc (client) | 11.17.0 | tRPC hooks (already used) | `useUsersDirectoryData` hook wraps all calls |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand store | `useReducer` + `useContext` | Context is already in the stack but more boilerplate; CONTEXT.md explicitly names Zustand |
| Zustand store | Jotai | Not named; adds a new dependency without CONTEXT.md approval |
| Single data hook | Multiple hooks in the shell | Phase 4's DataTable needs all queries accessible from one place; one hook is the prep for that |

**Installation (the only new package this phase requires):**
```bash
npm install zustand
```

Verify after install:
```bash
node -e "require('zustand/package.json').version"
```

---

## Package Legitimacy Audit

> Only one new package: `zustand`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| zustand | npm | ~5 yrs | ~8M/wk (major state mgmt library) | github.com/pmndrs/zustand | OK [ASSUMED — install gating required] | Approved — but verify via `npm view zustand` before install |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious (SUS):** none

*zustand is widely used; the npm name is well-established. Tagged [ASSUMED] because this session did not run an authoritative Context7 or npm-view check. Planner must run `npm view zustand version` before installing.*

---

## Codebase Analysis: UsersDirectoryClient.tsx (2,474 lines)

### State Inventory (lines 1251–1294 of main component body)

**Store candidates (go into Zustand store):**

| State var | Line | Type | Notes |
|-----------|------|------|-------|
| `search` | 1252 | `string` | Raw search input |
| `debouncedSearch` | 1253 | `string` | Debounced search for filtering |
| `viewMode` | 1255 | `"grid"\|"list"` | Directory view toggle |
| `groupBy` | 1256 | `GroupByField` | none/department/jobTitle/costCenter |
| `filterDept` | 1257 | `string \| null` | Dropdown filter |
| `filterJobTitle` | 1258 | `string \| null` | Dropdown filter |
| `filterCostCenter` | 1259 | `string \| null` | Dropdown filter |
| `filterNoProjects` | 1260 | `boolean` | ACC no-projects filter |
| `filterAccProject` | 1261 | `string \| null` | ACC project filter |
| `filterAccRole` | 1262 | `string \| null` | ACC role filter |
| `filterAccModule` | 1263 | `string \| null` | ACC module filter |
| `filterAccModuleTier` | 1278 | `string \| null` | Informational tier label (paired with filterAccModule) |
| `statusFilter` | 1265 | `AggregatedStatus[]` | Multi-select status facet |
| `projectAdminFilter` | 1266 | `boolean` | Binary project-admin facet |
| `activitySort` | 1270 | `{active:boolean; direction:"asc"\|"desc"}` | Three-state sort cycle |

**Local component state (stays in shell or sub-components):**

| State var | Line | Type | Why local |
|-----------|------|------|-----------|
| `selectedPerson` | 1254 | `OrgPerson \| null` | Modal open/close — ephemeral; could go in store for scroll-preservation |
| `directoryRenderLimit` | 1279 | `number` | Pagination cursor — reset on filter changes |
| `activatedEmails` | 1292 | `Set<string>` | Hover-prefetch activation set |
| `activityEmail` | 1294 | `string \| null` | File activity sheet open state |
| `perfLoggingEnabled` | 1280 | `boolean` | Debug-only — stays in shell |

> **Scroll preservation critical note:** `selectedPerson` controls whether `PersonDetailModal` is open. The CONTEXT.md's strictest requirement is that after close, scroll position is preserved. The current implementation uses `window.scrollTo` in `scrollDirectoryToTop` (line 1352) which is invoked only on filter changes, NOT on modal close. Scroll position preservation on modal close is purely structural: because `viewMode === "list"` uses `useWindowVirtualizer` which reads `window.scrollY`, the scroll position naturally persists as long as the DOM tree is not remounted. The key invariant: `selectedPerson = null` on close must NOT trigger a full remount of `PersonRowList`. If `selectedPerson` moves to the store, the store setter must not cause the virtualizer's parent ref to re-initialize. Recommend keeping `selectedPerson` in the store (so it can be shared with future `DrillSheet` migration in Phase 4) but test scroll-preservation explicitly in the golden-path test.

### tRPC Call Inventory (the double-fetch surface for PERF-03)

| Hook call | Line | Input | `staleTime` | SSR-prefetched? |
|-----------|------|-------|-------------|-----------------|
| `accDcGraph.bulkUsers.useQuery` | 1442 | `{ leanProjects: true }` | `ACC_SNAPSHOT_STALE_TIME_MS` (10min) | YES — `acc-route-hydration.ts:31` with same `{ leanProjects: true }` ✓ |
| `users.bulkAccSummary.useQuery` | 1453 | `undefined` | `ACC_SNAPSHOT_STALE_TIME_MS` | NO — deliberately not prefetched (see comment in acc-route-hydration.ts) |
| `accMembers.enrichedUsers.useQuery` | 1458 | `undefined` | `ACC_SNAPSHOT_STALE_TIME_MS` | YES — `acc-route-hydration.ts:33` ✓ |
| `accActivity.listInvitations.useQuery` | 1462 | `{windowDays:90, limit:100}` | 300,000ms | NO — `enabled: false` (lazy) |
| `accActivity.getCoverage.useQuery` | 1466 | `undefined` | 300,000ms | NO |
| `accFolders.getCoverage.useQuery` | 1470 | `undefined` | 600,000ms | NO |
| `users.getOrgDirectory.useQuery` | 1486 | `undefined` | 300,000ms | YES — `acc-route-hydration.ts:33` ✓ |
| `users.getDirectory.useQuery` | 1494 | `undefined` | 300,000ms | YES — `acc-route-hydration.ts:34` ✓ |
| `accActivity.usersOrderedByLastFileActivity.useInfiniteQuery` | 1386 | `{order, limit:200}` | 60,000ms | NO — `enabled: activitySort.active` (on-demand) |
| `accActivity.getLastFileActivityBatch.useQuery` (in PersonRowList) | 944 | `{emails: visibleEmails}` | 300,000ms | NO — viewport-driven |
| `accActivity.getFileActivityForUser.useQuery` (in FileActivityCell) | 308 | `{email}` | 300,000ms | NO — hover-prefetch |

**PERF-03 double-fetch analysis:**

The `acc-route-hydration.ts` prefetches 4 queries correctly for `UsersDirectoryClient`. The hydration key mismatch risk was previously fixed (memory: "spatial-graph load speed + loading UX" 2026-06-03 — hydration key mismatch `{permSummary, activityMix}` vs client `undefined`). For the users route, `bulkUsers` prefetch uses `{ leanProjects: true }` and the client uses `{ leanProjects: true }` — these MATCH.

**The remaining PERF-03 risk** is if `useMergedAccUsers.ts` hook is imported anywhere in the `/users` load path (e.g., by `UserProfilePanel`). That hook calls `bulkUsers.useQuery(undefined)` — no `leanProjects: true` — which would be a DIFFERENT cache key, causing a second full fetch. Checking: `UserProfilePanel` is loaded via `dynamic()` at line 89–96, which is `ssr: false`. It loads lazily only when `PersonDetailModal` opens — NOT on initial page load. So the double-fetch risk exists only after opening a profile, not on the cold load. PERF-03 (at most once per page load) is already technically satisfied in production because the `useMergedAccUsers` hook is not called until a user clicks a person row.

**Recommendation for the data hook:** Consolidate the 8 main-body queries (lines 1442–1494) into `useUsersDirectoryData`. Use a QUERY_KEYS constants file to ensure input objects are created once (not per-render inline). This eliminates future drift risk.

### Sub-component Extraction Candidates

The file already has clean function boundaries. These are the safe extraction targets:

| Function | Lines (approx) | New file | Notes |
|----------|----------------|----------|-------|
| `PersonAvatar` | ~40 | `PersonAvatar.tsx` | Pure display, no queries |
| `CopyButton` | ~15 | inline in `PersonCard.tsx` or own file | Tiny; could stay local |
| `InfoRow` | ~20 | inline | Tiny |
| `PersonDetailModal` | ~100 | `PersonDetailModal.tsx` | Self-contained; uses `UserProfilePanel` via dynamic import |
| `StatusPill` + `AdminPill` | ~60 | `DirectoryPills.tsx` | Tiny display components |
| `AccBadge` | ~25 | inline in `PersonCard.tsx` | Tiny |
| `PersonCard` | ~60 | `PersonCard.tsx` | Grid view item |
| `PersonRow` | ~80 | `PersonRow.tsx` | List view row; references `FileActivityCell` + `LastFileActivityCell` |
| `FileActivityCell` | ~60 | `PersonRow.tsx` | Has own `trpc.accActivity.getFileActivityForUser.useQuery` (hover-gated) |
| `LastFileActivityCell` | ~40 | `PersonRow.tsx` | Pure display; reads from lookup map |
| `PersonRowList` | ~95 | `PersonRowList.tsx` | Uses `useWindowVirtualizer` + `useVisibleRowEmails` + batch query |
| `CollapsibleGroup` | ~30 | `CollapsibleGroup.tsx` | Used for group-by view |
| `DataCoverageStrip` + `CoveragePill` | ~50 | `DataCoverageStrip.tsx` | Pure display |
| `ActivityAuditPanel` | ~140 | `ActivityAuditPanel.tsx` | Large; has own `useState` for query + loading state |
| `ActiveFilterPill` | ~20 | inline in shell | Tiny |
| Helper functions (`normalize`, `parseSearchTokens`, `matchesPerson`, etc.) | ~90 | `directoryUtils.ts` | Already partially extracted — `directoryRenderWindow.ts` exists |

**Shell target (~200 lines):** After extraction, the `UsersDirectoryClient` function body should contain only:
- Import of store + data hook
- Derived state computations (`filtered`, `displayRows`, `groups`, `visibleFiltered`, etc.)
- Handler callbacks wired to store actions
- JSX layout: header + coverage strip + search/filter bar + active filter pills + `PersonRowList` or grid + `PersonDetailModal` + Sheet

---

## Architecture Patterns

### System Architecture Diagram

```
UsersDirectoryPage (RSC)
        │ HydrationBoundary (prefetches 4 queries)
        ▼
UsersDirectoryClient ("use client" orchestrator shell ~200 lines)
        │
        ├── useUsersDirectoryStore (Zustand)
        │       search / debouncedSearch / viewMode / groupBy
        │       filterDept / filterJobTitle / filterCostCenter / filterNoProjects
        │       filterAccProject / filterAccRole / filterAccModule / filterAccModuleTier
        │       statusFilter / projectAdminFilter / activitySort
        │       selectedPerson / activityEmail / activatedEmails
        │
        ├── useUsersDirectoryData (single data hook)
        │       accDcGraph.bulkUsers({ leanProjects: true })
        │       users.bulkAccSummary (enabled: dcEmpty)
        │       accMembers.enrichedUsers
        │       users.getOrgDirectory
        │       users.getDirectory
        │       accActivity.getCoverage
        │       accFolders.getCoverage
        │       accActivity.listInvitations (enabled: false / on-demand)
        │       accActivity.usersOrderedByLastFileActivity (enabled: sortActive)
        │       → returns: { people, accSummary, accSummaryMap, mergedAccUsers,
        │                    coverage, orderedActivityEmails, stats, isLoading, ... }
        │
        ├── Derived memos (filtered / displayRows / groups / visibleFiltered)
        │
        ├── PersonRowList (sub-component)
        │       ├── useWindowVirtualizer
        │       ├── useVisibleRowEmails
        │       └── accActivity.getLastFileActivityBatch (viewport-driven)
        │
        ├── PersonCard[] (grid view)
        │
        ├── PersonDetailModal
        │       └── UserProfilePanel (dynamic import, ssr:false)
        │
        └── Sheet (file activity drill-down)
                └── UserActivityBody (dynamic import, ssr:false)
```

### Recommended Project Structure

```
app/(dashboard)/users/
├── UsersDirectoryClient.tsx      # orchestrator shell ~200 lines (modified)
├── useUsersDirectoryStore.ts     # NEW: Zustand store
├── useUsersDirectoryData.ts      # NEW: single data hook (extracts 9 queries)
├── directoryUtils.ts             # NEW: normalize, parseSearchTokens, matchesPerson
├── PersonCard.tsx                # NEW: extracted from UsersDirectoryClient
├── PersonRow.tsx                 # NEW: includes FileActivityCell + LastFileActivityCell
├── PersonRowList.tsx             # NEW: virtualizer + visibility hook
├── PersonDetailModal.tsx         # NEW: extracted modal
├── DirectoryPills.tsx            # NEW: StatusPill + AdminPill + AccBadge
├── DataCoverageStrip.tsx         # NEW: coverage strip
├── CollapsibleGroup.tsx          # NEW: group-by header
├── ActivityAuditPanel.tsx        # NEW: activity audit tab content
├── __tests__/
│   └── UsersDirectoryClient.integration.test.tsx  # NEW: golden-path test (written FIRST)
├── directoryRenderWindow.ts      # existing — limitGroupedItems, countGroupedItems
├── directoryRenderWindow.test.ts # existing
├── useVisibleRowEmails.ts        # existing
├── useVisibleRowEmails.test.ts   # existing
├── useMergedAccUsers.ts          # existing — leave unchanged
├── UserProfilePanel.tsx          # existing — leave unchanged
├── AccProfileSection.tsx         # existing — leave unchanged
└── ... (other existing files untouched)
```

### Pattern 1: Zustand Store Shape

```typescript
// app/(dashboard)/users/useUsersDirectoryStore.ts
// Source: Zustand docs pattern for UI state stores [ASSUMED]
import { create } from "zustand";
import type { AggregatedStatus } from "@/lib/acc/accStatusReduction";

type GroupByField = "none" | "department" | "jobTitle" | "costCenter";
type ViewMode = "grid" | "list";

interface UsersDirectoryState {
  // Search
  search: string;
  debouncedSearch: string;
  // View
  viewMode: ViewMode;
  groupBy: GroupByField;
  // Filters
  filterDept: string | null;
  filterJobTitle: string | null;
  filterCostCenter: string | null;
  filterNoProjects: boolean;
  filterAccProject: string | null;
  filterAccRole: string | null;
  filterAccModule: string | null;
  filterAccModuleTier: string | null;
  statusFilter: AggregatedStatus[];
  projectAdminFilter: boolean;
  // Sort
  activitySort: { active: boolean; direction: "asc" | "desc" };
  // Profile/sheet state
  selectedEmail: string | null;   // replaces selectedPerson (email is the stable key)
  activityEmail: string | null;
  // Hover-prefetch
  activatedEmails: Set<string>;
  // Actions
  setSearch: (search: string) => void;
  setDebouncedSearch: (search: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setGroupBy: (group: GroupByField) => void;
  setFilterDept: (v: string | null) => void;
  // ... (one setter per filter)
  clearAllFilters: () => void;
  cycleActivitySort: () => void;
  setSelectedEmail: (email: string | null) => void;
  setActivityEmail: (email: string | null) => void;
  activateEmail: (email: string) => void;
  applyModuleFilterFromSidePanel: (moduleKey: string, tier: string) => void;
}

export const useUsersDirectoryStore = create<UsersDirectoryState>((set) => ({
  search: "",
  debouncedSearch: "",
  viewMode: "grid",
  groupBy: "none",
  // ... initial values
}));
```

> **Scroll-preservation note:** Store `selectedEmail` (not `selectedPerson` OBJ) so the store setter is stable. Resolve the actual `OrgPerson` object inside `PersonDetailModal` via a prop lookup. This avoids storing a large object in Zustand and decouples the modal from OrgPerson mutation.

### Pattern 2: Single Data Hook

```typescript
// app/(dashboard)/users/useUsersDirectoryData.ts
"use client";
import { useMemo } from "react";
import { trpc } from "@/lib/core/trpc";
import { ACC_SNAPSHOT_STALE_TIME_MS } from "@/lib/acc/cachePolicy";
import { selectAccSummarySource, mergeAccSummaryWithEnrichment, ... } from "./useMergedAccUsers";

// QUERY_KEYS — defined once, shared between prefetch and client call
// This is the PERF-03 fix: ensures input objects are referentially stable
// and match the SSR prefetch input in acc-route-hydration.ts.
export const BULK_USERS_LEAN_INPUT = { leanProjects: true } as const;

export function useUsersDirectoryData() {
  const { data: dcUsersRaw = [], isLoading: dcLoading } =
    trpc.accDcGraph.bulkUsers.useQuery(BULK_USERS_LEAN_INPUT, {
      staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
      retry: false,
    });
  // ... all 8 other queries
  // ... all useMemo derivations (accSource, accSummary, people, accSummaryMap, etc.)
  return { people, accSummary, accSummaryMap, mergedAccUsers, coverage, isLoading, ... };
}
```

### Pattern 3: Golden-Path Integration Test

```typescript
// app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock tRPC to return fixture data
vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    accDcGraph: { bulkUsers: { useQuery: vi.fn(() => ({ data: FIXTURE_ACC_USERS, isLoading: false })) } },
    users: {
      getOrgDirectory: { useQuery: vi.fn(() => ({ data: { status: "ok", people: FIXTURE_PEOPLE }, isLoading: false })) },
      getDirectory: { useQuery: vi.fn(() => ({ data: [], isLoading: false })) },
      bulkAccSummary: { useQuery: vi.fn(() => ({ data: [], isLoading: false })) },
    },
    accMembers: { enrichedUsers: { useQuery: vi.fn(() => ({ data: [], isLoading: false })) } },
    accActivity: {
      listInvitations: { useQuery: vi.fn(() => ({ data: undefined, isLoading: false })) },
      getCoverage: { useQuery: vi.fn(() => ({ data: undefined, isLoading: false })) },
      getLastFileActivityBatch: { useQuery: vi.fn(() => ({ data: undefined })) },
      usersOrderedByLastFileActivity: { useInfiniteQuery: vi.fn(() => ({ data: undefined, isLoading: false })) },
    },
    accFolders: { getCoverage: { useQuery: vi.fn(() => ({ data: undefined, isLoading: false })) } },
    useUtils: vi.fn(() => ({ accActivity: { getFileActivityForUser: { prefetch: vi.fn() } } })),
  },
}));

// Required stubs for window virtualizer
vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });

describe("UsersDirectoryClient golden-path", () => {
  it("search narrows the list", async () => { ... });
  it("multiple filters combine correctly", () => { ... });
  it("switching viewMode does not reset filters", () => { ... });
  it("clicking a person opens the profile modal", async () => { ... });
  it("closing the profile modal preserves filters, search, and does not scroll to top", async () => { ... });
  // scroll-position test: assert window.scrollY unchanged after modal close
});
```

### Anti-Patterns to Avoid

- **Do NOT remount `PersonRowList` on filter changes.** The `useWindowVirtualizer` hook reads `parentRef.current.offsetTop` — remounting resets the scroll position. Only re-render with updated `list` prop.
- **Do NOT store `OrgPerson` objects in Zustand.** Store email strings; resolve objects from the derived data in the hook. This keeps the store serializable and avoids stale references.
- **Do NOT change query inputs.** `{ leanProjects: true }` on `bulkUsers` must remain identical between the SSR prefetch and the client hook. Changing this input is an invisible PERF-03 regression.
- **Do NOT extract sub-components that own tRPC calls into new files unless the query is clearly scoped to them.** `FileActivityCell` owns `getFileActivityForUser` — it belongs in `PersonRow.tsx`. The main body's 8 queries ALL belong in the single data hook.
- **Do NOT use `window.scrollTo` as a scroll-preservation mechanism.** The virtualizer tracks `window.scrollY`; calling `scrollDirectoryToTop` on any state change resets position. The `scrollDirectoryToTop` in the current code is only called by filter/sort pill clicks — do NOT extend this to the store setter for `selectedEmail`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filter/sort/UI state | Custom pub/sub or Context+Reducer | Zustand `create()` | Avoids prop-drilling, colocates selectors, zero boilerplate |
| Debounce | Manual `setTimeout` ref | The existing `debounceTimer.useRef` pattern (already correct) | Already implemented correctly at line 1285–1582; preserve it exactly |
| Window virtualization | Manually computed offset rows | `useWindowVirtualizer` (@tanstack/react-virtual) | Already wired in `PersonRowList` at line 930 — preserve the existing hook |
| IntersectionObserver visibility tracking | Custom event listeners | `useVisibleRowEmails` (already extracted at `app/(dashboard)/users/useVisibleRowEmails.ts`) | Already extracted; just import it in `PersonRowList.tsx` |

**Key insight:** This phase is a MECHANICAL extraction — almost no new algorithms are needed. The logic already works correctly. The task is to move code into the right files and wires, not invent new solutions.

---

## Common Pitfalls

### Pitfall 1: Hydration Key Mismatch (PERF-03 regression)

**What goes wrong:** Changing `{ leanProjects: true }` to `undefined` in the data hook (or forgetting to add it) causes the SSR-prefetched `bulkUsers` cache entry (keyed `{leanProjects:true}`) to be ignored by the client call (keyed `{}`). The client then refetches ~15MB post-mount.

**Why it happens:** React Query includes the input object in the cache key. Any difference (including `undefined` vs `{}` vs `{leanProjects:true}`) creates a different key.

**How to avoid:** Define `export const BULK_USERS_LEAN_INPUT = { leanProjects: true } as const` in the data hook file and import it into `acc-route-hydration.ts`.

**Warning signs:** Network DevTools shows a POST to `/api/trpc/accDcGraph.bulkUsers` after page load (~15MB response).

### Pitfall 2: Scroll Reset on Modal Open/Close

**What goes wrong:** Moving state into Zustand causes a re-render that calls `useEffect(() => setDirectoryRenderLimit(DIRECTORY_RENDER_BATCH), [...])` on filter changes — this is by design. But if `selectedEmail` is included in that effect's dependency array, closing the modal resets the render limit and scroll position.

**Why it happens:** The `directoryRenderLimit` reset effect (lines 1757–1772) runs on filter/sort/view changes, not on `selectedPerson` changes. The current code correctly excludes `selectedPerson` from the effect deps.

**How to avoid:** `selectedEmail` MUST NOT be in the dependency array of the `directoryRenderLimit` reset effect.

### Pitfall 3: `useWindowVirtualizer` scrollMargin Initialization

**What goes wrong:** If `PersonRowList` is extracted but its parent `parentRef` is not wired after extraction, `scrollMargin` is always 0 and rows render at the wrong position.

**Why it happens:** `scrollMargin: parentRef.current?.offsetTop ?? 0` reads the DOM offset at render time. The `[, setMounted] = useState(false)` + `useEffect(() => setMounted(true), [])` pattern at lines 927–928 forces a re-render AFTER the ref is attached to the DOM. This pattern MUST be preserved in `PersonRowList.tsx`.

**How to avoid:** Copy the entire `PersonRowList` function body to `PersonRowList.tsx` including the `setMounted` hack. Do not refactor it away.

### Pitfall 4: tRPC `useUtils` in Store

**What goes wrong:** Attempting to use `trpc.useUtils()` inside the Zustand store (outside a React component) throws "Hooks called outside React component" error.

**Why it happens:** `trpc.useUtils()` is a React hook. Zustand store creation happens at module scope.

**How to avoid:** Keep `trpc.useUtils()` and the `handleRowHoverEnter` callback that calls `utils.accActivity.getFileActivityForUser.prefetch` inside the shell component (or pass `prefetch` as a callback prop to `PersonRowList`). The hover-prefetch behavior is ephemeral UI behavior, not persistent state.

### Pitfall 5: `invitationsQuery` `enabled: false`

**What goes wrong:** The `invitationsQuery` at line 1462 has `enabled: false`. If this is moved to the data hook naively, someone might change it to `enabled: true` thinking it's a bug.

**Why it happens:** The invitations tab used to be a separate tab (see `ActivityAuditPanel`); the query is intentionally lazy-loaded only when the panel is opened.

**How to avoid:** Preserve `enabled: false` on `listInvitations`. Document in the data hook with the same comment as in the original code.

### Pitfall 6: `next build` typechecks test files

**What goes wrong:** A prop-type change in an extracted component (e.g., `PersonRow`) is not reflected in its test fixture → `npx tsc --noEmit` passes (test files mock the component) but `next build` fails with "Property X does not exist".

**Why it happens:** `next build` typechecks the entire tree including test files. The project has no `ignoreBuildErrors: true`.

**How to avoid:** After every extraction step run `npx tsc --noEmit` before committing. This is the mandatory gate (from CONTEXT.md and MEMORY.md).

---

## Code Examples

### Extracting the debounce timer into the store

The current debounce uses `useRef` + `clearTimeout` (lines 1285, 1578–1582, 1585). When extracting `setSearch` into the Zustand store, the debounce timer must stay as a `useRef` in the shell (refs cannot live in Zustand). The store holds `search` and `debouncedSearch`; the shell holds the `debounceTimer` ref and calls both setters:

```typescript
// In shell (UsersDirectoryClient.tsx after extraction)
const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
const { setSearch, setDebouncedSearch } = useUsersDirectoryStore();

const handleSearchChange = useCallback((value: string) => {
  setSearch(value);
  clearTimeout(debounceTimer.current);
  debounceTimer.current = setTimeout(() => setDebouncedSearch(value), 150);
}, [setSearch, setDebouncedSearch]);
```

### Zustand selector pattern (avoid re-renders)

```typescript
// In a sub-component that only needs one filter value:
const filterDept = useUsersDirectoryStore((s) => s.filterDept);
const setFilterDept = useUsersDirectoryStore((s) => s.setFilterDept);
// This component only re-renders when filterDept changes.
```

---

## Runtime State Inventory

> NOT APPLICABLE — this is a pure code refactor with no data model changes, no stored keys, and no OS-level registrations. Greenfield decomposition only.

**Nothing to migrate.**

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.6 |
| Config file | `vitest.config.ts` (root) |
| Environment directive | `// @vitest-environment jsdom` required for component tests |
| Quick run command | `npx vitest run app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| USR-01 | Golden-path: search + filter + click + close preserves state | Integration (jsdom) | `npx vitest run app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx` | No — Wave 0 gap |
| USR-01 | `UsersDirectoryClient` shell is ~200 lines | Static check | `wc -l app/(dashboard)/users/UsersDirectoryClient.tsx` | N/A |
| PERF-03 | No double-fetch on users route load | Integration / network check | `npx vitest run` (query call count assertions in mock) | No — Wave 0 gap |
| USR-01 | `npx tsc --noEmit` exits 0 after each extraction | Type gate | `npx tsc --noEmit` | N/A — existing tool |
| USR-01 | Full test count holds after each extraction step | Suite gate | `npm test` | N/A — run after each commit |

### Sampling Rate

- **Per extraction commit:** `npx tsc --noEmit && npm test`
- **Phase gate:** Full suite green + manual projector click-through

### Wave 0 Gaps

- [ ] `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx` — covers USR-01 golden-path; MUST be written before the first extraction commit
- [ ] `app/(dashboard)/users/useUsersDirectoryStore.ts` — new file; add unit test `useUsersDirectoryStore.test.ts` covering filter state + clearAllFilters
- [ ] `app/(dashboard)/users/useUsersDirectoryData.ts` — new file; add unit test covering PERF-03 (assert `bulkUsers` called with `{ leanProjects: true }`)

---

## Security Domain

> This phase introduces no new authentication, authorization, session, or input-validation surface. All tRPC calls are `protectedProcedure`-gated on the server (unchanged). The decomposition moves client-side state and query calls between files without altering any auth or validation logic.

**ASVS:** No new ASVS controls introduced. Existing controls unchanged.

---

## Environment Availability

> This phase is a pure code/refactor change. No external services, databases, or CLI tools beyond the existing stack are required, except:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| zustand (npm package) | `useUsersDirectoryStore` | Not yet installed | To be determined by `npm view zustand version` | None — must install |
| Node.js ≥22 | Build gate | ✓ | ≥22 (per engines field) | — |
| PostgreSQL local | Running app for UAT | ✓ | 18 (per MEMORY.md) | — |

**Missing dependencies with no fallback:**
- `zustand` — must be installed before any store code is written. Run `npm install zustand` and `npm view zustand version` to confirm.

---

## Open Questions

1. **Should `PersonDetailModal` stay as a Dialog or migrate to the Phase 1 `DrillSheet`?**
   - What we know: Phase 1 shipped `DrillSheet` (side-slide `Sheet`). The current `PersonDetailModal` is a centered `Dialog` with resize handle. CONTEXT.md does not specify migrating it.
   - What's unclear: Phase 4 plans a full `DataTable` + `DrillSheet` integration. If we migrate the modal to `DrillSheet` now, it saves work in Phase 4.
   - Recommendation: Leave as `Dialog` in Phase 2 (behavior parity is paramount). Note it as a Phase 4 migration opportunity.

2. **Should `selectedPerson` be stored as the full `OrgPerson` object or just the email?**
   - What we know: `PersonDetailModal` receives `person: OrgPerson | null` and `accUser: BulkAccUser | null`. Storing the email in the store and resolving both from the data hook's `people` + `mergedAccUsers` is cleaner.
   - Recommendation: Store `selectedEmail: string | null` in the store; resolve `selectedPerson` and `selectedAccUser` as derived values from the data hook inside the shell before passing to `PersonDetailModal`.

3. **Is `directoryRenderLimit` store state or local state?**
   - What we know: It resets to `DIRECTORY_RENDER_BATCH` on filter/sort/view changes (via a `useEffect`). It does NOT need to persist across navigation or share across components.
   - Recommendation: Keep `directoryRenderLimit` as local `useState` in the shell (not in the store). The reset effect in the shell can depend on the store's filter values via `useUsersDirectoryStore(s => s.filterDept)` etc.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All state + queries in one component | Store + data hook + extracted sub-components | This phase | Shell becomes ~200 lines; Phase 4 DataTable reads from the hook directly |
| `bulkUsers(undefined)` in `useMergedAccUsers` | `bulkUsers({ leanProjects: true })` in data hook + prefetch | Fixed in 2026-06-03 (users route) | Eliminates post-mount refetch of the ~15MB snapshot |

**Deprecated/outdated:**
- `PersonDetailModal` as a centered `Dialog`: functional now, will be replaced by `DrillSheet` slide-in in Phase 4 (VIS-05, INT-03).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Zustand is the correct state library (named in CONTEXT.md but not yet installed) | Standard Stack | Low risk — CONTEXT.md explicitly names it. If not wanted, `useReducer+useContext` is the alternative |
| A2 | `window.scrollY` is preserved when `PersonDetailModal` opens/closes because `PersonRowList` is never remounted | Common Pitfalls | Medium risk — if the Dialog causes a React tree remount above the virtualizer parent, scroll resets. Test this explicitly in the golden-path test |
| A3 | `zustand` npm package name is the canonical/legitimate package | Package Legitimacy | Low — widely used, verified independently but not via Context7 in this session |
| A4 | The `useMergedAccUsers` hook is NOT called during initial `/users` page load (only inside lazy-loaded `UserProfilePanel`) so PERF-03 is not violated today | PERF-03 Analysis | Medium — if any eager import changes this, there would be a silent double-fetch |

---

## Sources

### Primary (HIGH confidence)
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — read line-by-line [VERIFIED: direct codebase read]
- `lib/server/acc-route-hydration.ts` — SSR prefetch analysis [VERIFIED: direct codebase read]
- `app/(dashboard)/users/useMergedAccUsers.ts` — hook structure [VERIFIED: direct codebase read]
- `app/(dashboard)/users/useVisibleRowEmails.ts` — IntersectionObserver hook [VERIFIED: direct codebase read]
- `package.json` — dependency list (confirmed Zustand NOT installed) [VERIFIED: direct codebase read]
- `.planning/phases/01-shared-design-foundation/01-VERIFICATION.md` — Phase 1 output [VERIFIED: direct read]
- `.planning/codebase/TESTING.md` — test patterns [VERIFIED: direct read]
- `.planning/codebase/ARCHITECTURE.md` — system architecture [VERIFIED: direct read]
- `.planning/codebase/STACK.md` — technology stack [VERIFIED: direct read]
- `vitest.config.ts` — test configuration [VERIFIED: direct codebase read]

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` — TanStack Virtual + Table patterns [CITED: project research file]
- `.planning/codebase/CONVENTIONS.md` — naming and code style [CITED: project conventions file]

### Tertiary (LOW confidence)
- Zustand store shape pattern [ASSUMED — based on training knowledge; verify against `zustand` docs after install]

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — verified directly in `package.json` and source files
- Architecture: HIGH — read entire 2,474-line component
- PERF-03 root cause: HIGH — traced SSR prefetch vs client call inputs
- Pitfalls: HIGH — identified from existing code patterns
- Zustand API: ASSUMED — library not yet installed; store shape is based on training knowledge

**Research date:** 2026-06-17
**Valid until:** 60 days (stable refactor domain; Zustand API changes rarely)

---

## Hard Scope Guard

The following paths MUST have zero files touched in any Phase 2 commit. Verify with:

```bash
git diff --name-only HEAD | grep -E "users/access-analysis|users/spatial-graph"
```

**Expected output: empty.** Any match is a scope violation.
