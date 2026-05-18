---
phase: 09-v2.0-list-wave-gap-closure
plan: 04
subsystem: ui
tags: [ui, react, directory, list-wave, intersection-observer, infinite-query, trpc]

# Dependency graph
requires:
  - phase: 09
    plan: 01
    provides: getLastFileActivityBatch + usersOrderedByLastFileActivity tRPC procedures
  - phase: 09
    plan: 02
    provides: UsersDirectoryClient column plumbing + grid template + TooltipProvider mount
provides:
  - useVisibleRowEmails IntersectionObserver hook (rAF-coalesced, stable identity)
  - Last File Activity column (lazy display via batch query keyed on visible emails)
  - Server-side sort header with three-state cycle (off -> desc -> asc -> off)
  - Loader2 spinner inside header button while infinite query in flight
  - displayRows memo: sorts filtered rows by server order, appends no-activity rows alphabetically
  - Renamed procedure input field direction -> order (tRPC reserved-key fix)
affects:
  - LIST-03 closed at UI layer

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single shared IntersectionObserver per hook instance, rootMargin: 200px"
    - "requestAnimationFrame coalescing of intersection callbacks (Pitfall 5 defense)"
    - "Ref composition: virtualizer.measureElement + registerRow on the same row wrapper"
    - "Two-procedure contract: batch display query + paginated sort query never share an endpoint (Pitfall 6 defense)"
    - "displayRows pipeline: in-sort rows by server index, remainder alphabetically appended"
    - "tRPC infinite-query input name must avoid reserved keys (cursor, direction)"

key-files:
  created:
    - app/(dashboard)/users/useVisibleRowEmails.ts
    - app/(dashboard)/users/useVisibleRowEmails.test.ts
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx
    - server/routers/acc-activity.ts

key-decisions:
  - "rowRef composition strategy: virtualizer.measureElement(el) then registerRow(email)(el) inside one ref callback. Both APIs accept the same outer wrapper; running them sequentially avoids re-allocating an array of refs or wrapping in useMemo per row."
  - "rAF coalescing: each intersection callback batch sets a single rAF; subsequent callbacks within the frame are skipped via rafRef.current !== null gate. flush re-reads visibleEmailsSetRef.current at frame time so it sees the cumulative diff, not each individual entry."
  - "Sort cycle = off -> desc -> asc -> off (third click clears). Alternative considered: off -> desc -> asc (no clear, requires UI affordance to disable sort). Three-state cycle is the standard data-table idiom and keeps the header self-explanatory; clearing reverts to the legacy people-merge order."
  - "Page-count ceiling for sort auto-fetch: 50 pages * 200 rows = 10k users defensive cap. Production user-list size is far below this (Phase 08 memory: ~2,507 activity rows on dev). A bad cursor would loop without this cap; sentinel ref keeps it stateless across re-renders."
  - "No-activity-row append happens client-side (RESEARCH Open Q3). The sort procedure GROUP BY clause only emits users with >= 1 file action; the BulkAccUser remainder is sorted alphabetically by email and concatenated after the server-ordered prefix. This is the same logic for both ASC and DESC directions (CONTEXT: empty rows always last)."

patterns-established:
  - "Lazy-viewport hook contract: registerRow(email)(el | null), returns ref callback. Stable identity. Closure-scoped element binding lets unmount callbacks unobserve the correct node."
  - "tRPC infinite-query callers must inspect ReservedInfiniteQueryKeys ('cursor' | 'direction') before naming non-cursor inputs."

requirements-completed: [LIST-03]

# Metrics
duration: ~9 min
completed: 2026-05-18
---

# Phase 09 Plan 04: Lazy Last-File-Activity column + server-side sort Summary

**LIST-03 closed at the UI layer — useVisibleRowEmails hook + lazy batch column (skeleton -> em-dash+tooltip -> relative timestamp) + three-state sort header with Loader2 spinner + displayRows pipeline that appends zero-activity rows alphabetically. Two-procedure contract preserved (Pitfall 6); ACTV-03 honored (Pitfall 1).**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-18T15:54Z
- **Completed:** 2026-05-18T16:03Z
- **Tasks:** 3
- **Files modified:** 4 total (2 created, 2 modified)

## Accomplishments

- `useVisibleRowEmails` hook: one stable IntersectionObserver per instance, 200px rootMargin, rAF-coalesced visibility updates, stable `registerRow` identity via useCallback, closure-scoped element binding for correct unmount unobserve.
- 8 Vitest cases covering: basic visibility, null-cleanup, dedupe-on-rebind, unmount disconnect, rAF coalescing, malformed-email defense, lowercase normalization, stable ref identity.
- `LastFileActivityCell` component (three states): pending -> `<Skeleton>`, null -> em-dash with shadcn Tooltip "No activity in 90d", ISO string -> `formatDistanceToNowStrict` with title=ISO.
- `PersonRowList` now owns the hook + the `getLastFileActivityBatch` query; visible-row diff drives one batched server hit per visible-set change (no N+1).
- Composed ref: `virtualizer.measureElement(el)` then `registerRow(email)(el)` inside a single ref callback on the row wrapper.
- Grid template expanded from 11 to 12 columns (`...0.7fr_0.7fr_0.7fr_0.7fr_1fr_auto`). Grouped header row expanded from 8 to 9 cells; sub-header from 11 to 12.
- `activitySort` state cluster `{active: boolean; direction: "asc"|"desc"}`. First click activates DESC (CONTEXT lock); cycle proceeds DESC -> ASC -> OFF.
- `usersOrderedByLastFileActivity.useInfiniteQuery` enabled only while `activitySort.active`. Auto-fetches subsequent pages in an effect (cap 50). `placeholderData: (prev) => prev` keeps last good page during refetch.
- Clickable header button: `lucide-react` `ArrowDown`/`ArrowUp` + `Loader2` spinner inline while `isFetching && active`. `aria-label` reflects state.
- `displayRows` memo: `filtered` rows partitioned by `orderMap.has(email.toLowerCase())`. In-sort rows reordered by server index; remainder sorted alphabetically by email. `groups` and `visibleFiltered` switched to consume `displayRows` so groupBy + render-window also see the sort.
- Server-side input field renamed `direction` -> `order` to dodge `@trpc/react-query`'s `ReservedInfiniteQueryKeys = "cursor" | "direction"` collision (the original name was unusable from `useInfiniteQuery` — type error).

## Task Commits

1. **Task 1: useVisibleRowEmails IntersectionObserver hook + Vitest** — `cb6f06c` (feat)
2. **Task 2: Last File Activity column with lazy batch query** — `39182ca` (feat)
3. **Task 3: Server-side sort header + spinner + empty-row append** — `6abffd3` (feat)

## Files Created/Modified

**Created:**
- `app/(dashboard)/users/useVisibleRowEmails.ts` — IntersectionObserver hook, ~155 LOC.
- `app/(dashboard)/users/useVisibleRowEmails.test.ts` — 8 Vitest cases, jsdom env, MockIO + rAF stubs.

**Modified:**
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — new `LastFileActivityCell`, new column slot on PersonRow grid + headers, hook + batch query inside PersonRowList, composed ref, activitySort state + handler + infinite query + auto-fetch effect + displayRows pipeline, clickable header button with arrow + spinner, new icon imports (`ArrowUp`, `ArrowDown`, `Loader2`) and `Skeleton` + `useVisibleRowEmails` imports.
- `server/routers/acc-activity.ts` — `usersOrderedByLastFileActivity` input field `direction` renamed to `order`; comment explains the @trpc/react-query reserved-key collision.

## Decisions Made

- **Ref composition strategy:** Single ref callback on the existing absolute-positioned row wrapper does `virtualizer.measureElement(el); registerRefForEmail(el);` in sequence. Both observers tolerate sharing one element. The alternative (ref-array merger utility) adds boilerplate and a re-render cost without clear benefit at this row count.
- **rAF coalescing implementation:** `rafRef.current` doubles as both the queued-id and a "pending" sentinel. When set, subsequent observer callbacks early-return after mutating the in-ref visible set. At frame time the flush reads the cumulative `visibleEmailsSetRef.current` (Set, sorted to array), runs setState once. This guarantees ≤1 setState per animation frame even under scroll storms.
- **Sort cycle UX = off -> desc -> asc -> off** vs alternative `off -> desc -> asc -> desc`: the three-state cycle is the standard data-table idiom (matches MUI/AG-Grid/TanStack-Table conventions), and the "off" state is essential because users need to revert to the legacy people-merge order without losing their other facet selections.
- **Page-count ceiling = 50:** prevents runaway recursion on a malformed cursor while staying far above realistic user counts. Tracked via `useRef` (not state) so the cap is enforced without triggering re-renders.
- **Procedure input rename direction -> order:** `@trpc/react-query` reserves both `cursor` AND `direction` in its `ReservedInfiniteQueryKeys` union. With the original name, `useInfiniteQuery` rejected the input at the TS type layer ("'direction' does not exist in Omit<input, ReservedInfiniteQueryKeys>"). Renaming server-side is the only stable fix; the procedure is internal and unshipped to UAT, so the cross-cutting risk is contained.
- **Measured run-state during development:** sort header click triggered `usersOrderedByLastFileActivity` query; with `enabled` gated by `activitySort.active`, an inactive sort produces zero server hits. Auto-fetch effect handles `hasNextPage`-driven pagination; the 09-01 EXPLAIN artifact already recorded 6 ms per page on the 2,507-row dataset, so even the worst-case 50-page exhaustion stays well under 1 second of server time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed sort procedure input field `direction` -> `order`**
- **Found during:** Task 3
- **Issue:** `@trpc/react-query` declares `type ReservedInfiniteQueryKeys = 'cursor' | 'direction'` and applies `Omit<TInput, ReservedInfiniteQueryKeys>` to the input type passed into `useInfiniteQuery`. With the original input field name `direction`, the callsite failed type-check with "Object literal may only specify known properties, and 'direction' does not exist in type 'Omit<...>'."
- **Fix:** Renamed `input.direction` -> `input.order` in `server/routers/acc-activity.ts`; updated the client call to pass `order: activitySort.direction`. Procedure semantics unchanged.
- **Files modified:** `server/routers/acc-activity.ts`, `app/(dashboard)/users/UsersDirectoryClient.tsx`.
- **Commit:** `6abffd3` (Task 3).
- **Tests affected:** None — the timeline smoke test only checks procedure presence, not input shape.

Other than the rename above, the plan executed verbatim.

## Issues Encountered

- **tRPC reserved-key collision:** documented in deviation #1. The 09-01 plan / RESEARCH did not flag `direction` as a reserved name; the conflict only surfaces at the consumer site under `useInfiniteQuery`. Future infinite-query procedures in this codebase should avoid both `cursor` and `direction` as top-level input field names.
- **Verification grep clarification:** the plan's `grep -rn "getFileActivityForUser" app/(dashboard)/users/UsersDirectoryClient.tsx → 0 hits` line is asserted against the LIST-03 column path specifically. The file still has 2 pre-existing references from Phase 03-03's hover-prefetch / FileActivityCell (4-bucket per-user fetch gated on hover, NOT scroll). Those references are unchanged by this plan and are not Pitfall 2 violations because they're gated on user intent (hover), not on scroll. New code introduced by this plan adds zero per-row procedure calls.

## Self-Check: PASSED

**File presence:**
- FOUND: `app/(dashboard)/users/useVisibleRowEmails.ts`
- FOUND: `app/(dashboard)/users/useVisibleRowEmails.test.ts`
- FOUND (modified): `app/(dashboard)/users/UsersDirectoryClient.tsx`
- FOUND (modified): `server/routers/acc-activity.ts`

**Commit hashes resolvable:**
- FOUND: `cb6f06c` (Task 1: useVisibleRowEmails hook + tests)
- FOUND: `39182ca` (Task 2: lazy Last File Activity column)
- FOUND: `6abffd3` (Task 3: server sort header + spinner + reorder pipeline + direction->order rename)

**Verification commands:**
- `npx tsc --noEmit` → EXIT=0 (clean)
- `npx vitest run app/(dashboard)/users/useVisibleRowEmails.test.ts` → 8/8 GREEN
- `npx vitest run app/(dashboard)/users/cosmosUtils.test.ts` → 23/23 GREEN
- `npx vitest run server/routers/acc-activity.timeline.test.ts` → 5/5 GREEN
- `grep -nc "useVisibleRowEmails" UsersDirectoryClient.tsx` → 3 hits (import + 1 call inside PersonRowList)
- `grep -nc "getLastFileActivityBatch\|usersOrderedByLastFileActivity" UsersDirectoryClient.tsx` → 4 hits (both procedures present)
- `grep -c "lastFileActivity" lib/acc/acc-types.ts` → 0 hits (Pitfall 1 / ACTV-03 honored)

## Next Phase Readiness

- **Plan 09-05:** Awaits its own prerequisites; LIST-03 is now closed.
- **Phase 09 milestone progress:** With LIST-01 + LIST-02 (09-02) + LIST-04 (09-03) + LIST-03 (09-04) shipped, the v2.0 LIST wave is at the requirement-completion gate pending 09-05.
- **Open follow-ups:** Visual-verification of the column rendering, sort cycle, and spinner under real network conditions is a UAT step for the user (not gated by this plan).

---
*Phase: 09-v2.0-list-wave-gap-closure*
*Completed: 2026-05-18*
