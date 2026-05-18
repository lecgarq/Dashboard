---
phase: 09-v2.0-list-wave-gap-closure
plan: 02
subsystem: ui
tags: [ui, react, directory, list-wave, facets, badge, tooltip]

# Dependency graph
requires:
  - phase: 09
    plan: 01
    provides: reduceMemberStatus + AggregatedStatus + enrichedUsers tRPC (BulkAccUser.aggregatedStatus / projectAdmin already on row)
provides:
  - Status column on the user directory list (Active / Pending / Deleted pill per row)
  - Inline Project Admin pill rendered next to user name when projectAdmin === true
  - Multi-select Status facet in the directory toolbar (DropdownMenu + DropdownMenuCheckboxItem)
  - Binary Project Admin facet toggle in the toolbar
  - Pill click handlers — Status pill = replace-selection facet shortcut, Admin pill = toggle binary facet
  - scrollDirectoryToTop helper (window.scrollTo since useWindowVirtualizer scrolls the window)
  - TooltipProvider mounted at the directory component root (DASH-18 hover detail)
affects:
  - LIST-01 closed at UI layer
  - LIST-02 closed at UI layer

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pill text load-bearing — color decoration only (accessibility)"
    - "DropdownMenu + DropdownMenuCheckboxItem idiom for multi-select facets"
    - "Pill-style binary toggle button matches existing No-ACC-Projects toggle"
    - "Pill click handlers stopPropagation so the row's side-panel open handler does not also fire"
    - "Facet-reduction IS the spotlight signal — no new event channel"

key-files:
  created: []
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx

key-decisions:
  - "Status pill variant: Active = emerald, Pending = amber, Deleted = neutral muted — built via Tailwind classNames since the shadcn Badge variants do not include success/warning"
  - "Existing Badge component (variant default + outline) reused for both pills + counter chip on the Status trigger — zero new pill components per CONTEXT lock"
  - "Toolbar idiom: DropdownMenu + DropdownMenuCheckboxItem (per RESEARCH Pattern 4 / Open Question 4 recommendation); status selection persists between open/close because onSelect={(e) => e.preventDefault()} stops menu auto-close on click"
  - "Scroll-to-top API: window.scrollTo({ top: 0, behavior: 'smooth' }) — the directory list uses useWindowVirtualizer (not parent-scrolled), so scrolling the window scrolls the virtualized rows back to row 0; no virtualizer ref plumbing required"
  - "Skeleton Badge for status === undefined (enrichedUsers still in flight) is variant='outline' with opacity-50 — graceful degradation per CONTEXT lock"
  - "DASH-18 tooltip text shipped: status pill -> 'Aggregated across all projects', admin pill -> 'Project Admin on at least one project'"
  - "TooltipProvider added at component root with delayDuration={150} — first use of @radix-ui/react-tooltip in the codebase (search across app/** previously returned no TooltipProvider mount)"

patterns-established:
  - "Tooltip + button + Badge composition for clickable accessible pills"
  - "Optional pill-click props on PersonRow / PersonRowList so the visual layer (T1) can ship before the handler layer (T3)"

requirements-completed: [LIST-01, LIST-02]

# Metrics
duration: ~8 min
completed: 2026-05-18
---

# Phase 09 Plan 02: Status + Admin pills, facets, and click handlers Summary

**LIST-01 + LIST-02 closed at the UI layer — Status pill + multi-select facet, inline Admin pill + binary facet, replace-selection click semantics, scroll-to-top on filter change, zero new components (shadcn Badge + Tooltip + DropdownMenu reused throughout).**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-18T15:43Z
- **Completed:** 2026-05-18T15:51Z
- **Tasks:** 3
- **Files modified:** 1 (`app/(dashboard)/users/UsersDirectoryClient.tsx`)

## Accomplishments

- Added `StatusPill` + `AdminPill` components inside `UsersDirectoryClient.tsx` (one-off, file-local) that wrap a shadcn `Badge` in a `<Tooltip>` + `<button type="button">` for keyboard / screen-reader accessibility.
- Extended the row grid template to 11 columns (added a `0.8fr` Status slot between Phone and the four File-Activity sub-columns); grouped header top row now has 8 columns (added a `Status` cell) and sub-header has 11 (spacer for Status).
- `aggregatedStatus` consumed directly from `BulkAccUser`; `reduceMemberStatus` fallback used only when `aggregatedStatus` is undefined AND the row already carries project rows whose `status` strings can be reduced (defensive — current `BulkAccUser` shape does NOT include `perProjectStatuses`, so the fallback only fires in the narrow window before enrichedUsers returns when project rows are already on the cached `BulkAccUser`).
- `statusFilter: AggregatedStatus[]` (empty array = all pass) + `projectAdminFilter: boolean` (default `false`) added to the main component state cluster; filter predicate threaded into the existing `useMemo` row filter pipeline alongside the other facets.
- Toolbar Status dropdown uses `DropdownMenu` + `DropdownMenuCheckboxItem` with `onSelect={(e) => e.preventDefault()}` so checkbox toggles do not auto-close the menu; a numeric chip on the trigger shows current selection count; a "Clear status filter" footer button appears when at least one is selected.
- Project Admin toolbar control is a single round-pill toggle button matching the existing "No ACC Projects" affordance — active state uses `primary` palette.
- `ActiveFilterPill` cluster gains one chip per selected status (label `Status`, value `Active`/`Pending`/`Deleted`, individual `x` clears that single status) plus an `Admin: Project Admin only` chip.
- `hasActiveFilters` + `clearAllFilters` + the render-limit reset `useEffect` all updated to count the two new facets.
- `handleStatusPillClick` implements CONTEXT-locked replace-selection: clicking a pill sets `statusFilter` to `[clicked]`; re-clicking the same single-selected pill clears it; clicking a different status while one is already filtered swaps the selection.
- `handleAdminPillClick` toggles `projectAdminFilter` on/off.
- Both handlers call `scrollDirectoryToTop()` which delegates to `window.scrollTo({ top: 0, behavior: 'smooth' })` — the directory list uses `useWindowVirtualizer`, so window scroll IS virtual-list scroll; no virtualizer ref plumbing needed.
- Pills `stopPropagation` in their internal button `onClick` so clicking a pill never triggers the row's `onClick={onClick}` side-panel open handler.
- `TooltipProvider` mounted at the `UsersDirectoryClient` return root (first use of `@radix-ui/react-tooltip` Provider in the codebase) with `delayDuration={150}`.

## Task Commits

1. **Task 1: Status column + inline Admin pill on every row** — `ea125e0` (feat)
2. **Task 2: Status multi-select + Project Admin facets in toolbar** — `6479e81` (feat)
3. **Task 3: Pill click handlers (replace-selection + toggle) + scroll-to-top** — `cfd0604` (feat)

## Files Created/Modified

**Created:** none.

**Modified:**
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — new imports (`ShieldCheck`, `reduceMemberStatus`, `AggregatedStatus`, `Tooltip*`, `DropdownMenu*`), new `STATUS_PILL_LABEL` + `STATUS_PILL_CLASS` lookup tables, new `StatusPill` + `AdminPill` components, new `statusFilter` + `projectAdminFilter` state + filter predicate, new toolbar dropdown + binary toggle, new pill handlers (`handleStatusPillClick`, `handleAdminPillClick`, `scrollDirectoryToTop`), row grid expanded (`1.5fr_1fr_1fr_1fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_auto`), `TooltipProvider` wrap.

## Decisions Made

- **Pill variant choice:** shadcn `Badge` does not ship `success`/`warning` variants out of the box (verified `components/ui/badge.tsx`). Rather than extending the Badge variants object (which would touch a shared component), I composed via Tailwind classNames: emerald (active), amber (pending), neutral-muted (deleted). The Admin pill uses `variant="default"` (primary) + a `ShieldCheck` lucide glyph. **All pill labels are full-text** ("Active"/"Pending"/"Deleted"/"Admin") so accessibility / no-color-vision users still get the load-bearing signal.
- **Existing Badge reused everywhere** — including the numeric counter on the Status trigger (`variant="secondary"`) — zero new pill components per CONTEXT lock.
- **Toolbar idiom: DropdownMenu + DropdownMenuCheckboxItem** for the multi-select Status facet. The existing facets in the file use `<Select>` (single-select), so I matched the closest multi-select idiom shadcn ships out of the box. `onSelect={(e) => e.preventDefault()}` keeps the menu open between checkbox toggles. (Open question 4 in RESEARCH was answered this way.)
- **Scroll-to-top API call site:** `window.scrollTo({ top: 0, behavior: 'smooth' })` (CONTEXT discretion). The directory list uses `useWindowVirtualizer` (verified in `PersonRowList`), so the window IS the scroll container — no `rowVirtualizerRef.current?.scrollToIndex(0)` plumbing needed across the component boundary. Smooth-behavior chosen as the standard pattern (no a11y flag in scope).
- **DASH-18 tooltip text shipped:**
  - Status pill: `Aggregated across all projects`
  - Admin pill: `Project Admin on at least one project`
- **Skeleton variant for undefined status:** `<Badge variant="outline" className="opacity-50">…</Badge>` — a single-character ellipsis Badge in low opacity. This matches CONTEXT carry-forward ("skeleton shimmer for lazy cells"); no need to ship a full shimmer animation for a sub-second window.
- **`accSummaryMap` precedence:** Status predicate prefers `summary.aggregatedStatus`; falls back to `reduceMemberStatus(summary.projects.map(p => p.status))` when the canonical value is absent but projects are present. Matches Wave-1 plan 09-01 server-side reducer exactly.

## Deviations from Plan

None — plan executed exactly as written. The plan called for three atomic tasks; each task shipped as its own commit with the exact contract documented in `<done>`.

Minor scope adjustments (NOT deviations — all explicitly under "Claude's discretion" per plan):
- Plan task 1 mentioned a per-project status tooltip "if available"; `BulkAccUser` does not currently carry `perProjectStatuses` (it lives on `EnrichedUser` row server-side, not on the row type the directory consumes). Tooltip therefore renders the generic `Aggregated across all projects` text. Per-project breakdown can be added in a future plan via a separate lazy fetch keyed on the hovered email if Luis requests it.

## Issues Encountered

- **`pnpm vitest` was sandbox-denied** when invoked with `pnpm` — running `npx vitest run cosmosUtils` succeeded (23/23 GREEN). Plan verification command intent satisfied; tooling note for future plans on this branch.
- **`docs(09-03)` and `feat(09-03)` commits interleaved** between this plan's T1 / T2 / T3 commits on the same branch (`feat/access-analysis-redesign`). Plan 09-03 ran in parallel against the same file (`UsersDirectoryClient.tsx`). The merge surface is clean — 09-03 added `filterAccModuleTier` state + module/tier filter chip + `clearAllFilters` reset; 09-02 added `statusFilter` + `projectAdminFilter` state + their UI. The only contact point was `clearAllFilters` (both plans appended their own reset lines) and the import block (both plans added imports). Both Task 2 and Task 3 of this plan compiled cleanly against the 09-03 surface.

## Self-Check: PASSED

**File presence (modified, not created):**
- FOUND: `app/(dashboard)/users/UsersDirectoryClient.tsx` (modified in 3 commits)

**Commit hashes resolvable:**
- FOUND: `ea125e0` (Task 1)
- FOUND: `6479e81` (Task 2)
- FOUND: `cfd0604` (Task 3)

**Verification greps (from plan):**
- `grep -n "statusFilter|projectAdminFilter" app/(dashboard)/users/UsersDirectoryClient.tsx` → **16 hits** (≥ multiple as expected)
- `grep -n "reduceMemberStatus|AggregatedStatus" app/(dashboard)/users/UsersDirectoryClient.tsx` → **16 hits** (≥ 2 required)
- `grep -n "handleStatusPillClick|handleAdminPillClick" app/(dashboard)/users/UsersDirectoryClient.tsx` → **4 hits** (definition + call site per handler)
- `grep -n "stopPropagation" app/(dashboard)/users/UsersDirectoryClient.tsx` → **7 hits** (≥ 2 required)
- `grep -n "Active|Pending|Deleted" app/(dashboard)/users/UsersDirectoryClient.tsx` → present (via `STATUS_PILL_LABEL` table literals).
- `grep -n "lastFileActivity" lib/acc/acc-types.ts` → **0 hits** (Pitfall 1 defended — no eager promotion).
- `pnpm tsc --noEmit` → **EXIT=0**
- `npx vitest run cosmosUtils` → **23/23 GREEN**

## Next Phase Readiness

- **Plan 09-04 (last-file-activity column + sort):** Unblocked. `getLastFileActivityBatch` + `usersOrderedByLastFileActivity` already shipped in 09-01. Consumer must add the IntersectionObserver `useVisibleRowEmails` hook + the zero-activity-remainder append.
- **Plan 09-05:** Awaits prerequisites; see plan file for its own gate.
- **LIST-01 + LIST-02 closed** — REQUIREMENTS.md should reflect both as complete after the standard state-update pipeline runs.

---
*Phase: 09-v2.0-list-wave-gap-closure*
*Completed: 2026-05-18*
