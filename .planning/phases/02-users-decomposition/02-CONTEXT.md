# Phase 2: /users Decomposition - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Decompose the 2,474-line `app/(dashboard)/users/UsersDirectoryClient.tsx` monolith
(25 `useState` hooks, 10 distinct tRPC endpoints) into a Zustand store + a single
data hook + extracted sub-components. This is a **pure refactor with zero
user-visible change**, guarded by a golden-path integration test written *before*
the first extraction.

In scope: the `/users` directory client only. `/users/spatial-graph` and anything
under `users/access-analysis/` are **strictly out of scope** — `git diff --name-only`
must touch zero files there.

PERF-03 (eliminate the hydration-key cache-miss double-fetch via shared query-key
constants + matching `staleTime`) is owned here because the double-fetch lives in
the `/users` data layer.

</domain>

<decisions>
## Implementation Decisions

### Behavior parity (what "unchanged" means)
- **Preserve current behavior bug-for-bug.** If decomposition surfaces a small
  pre-existing bug or quirk, reproduce it exactly — do NOT fix it in this phase.
  Any fix is separate, deliberate work (Phase 4 polish or its own task).
- **Match displayed data exactly.** Every number/list on `/users` (user counts,
  activity, coverage) must render identically to today, even if a value looks
  wrong. Correcting data/logic is never hidden inside a refactor.
- Consequence for planning: the success bar is *provable* parity. The refactor is
  "done" only when behavior + data are observably identical to the pre-refactor
  baseline.

### Protected flows — golden-path safety-net test
The integration test (written BEFORE the first extraction) must assert ALL of:
- **Search by name** — typing narrows the list (same debounce/matching behavior).
- **Filters** — the full filter set narrows the list, and multiple filters
  **combine** correctly. (Real filters today: `filterDept`, `filterJobTitle`,
  `filterCostCenter`, `filterNoProjects`, `filterAccProject`, `filterAccRole`,
  `filterAccModule`, `filterAccModuleTier`, `statusFilter`, `projectAdminFilter`.)
- **Grid/list view + group-by** — switching `ViewMode` (`grid`|`list`) and
  `GroupByField` (`none`|`department`|`jobTitle`|`costCenter`).
- **Person → profile → back** — clicking a person opens the profile panel; closing
  returns to the list.
- **State preservation on close (strict):** after opening and closing a person's
  profile, **filters, search text, AND scroll position are all preserved** — the
  user returns to the exact same spot. This is the strictest assertion in the net
  and the one most visible in a live demo.

### Delivery cadence
- **Incremental, each step verified.** Extract one piece at a time; the full test
  suite stays green after every extraction step. Many small atomic commits so work
  can be stopped or rolled back at any point. (Matches ROADMAP success criterion:
  "the full test count holds after every extraction step.")

### Sign-off / acceptance
- **Automated test + projector click-through.** Not done on green tests alone:
  after the refactor we do a before/after click-through on the real `/users` page
  (projector context) to confirm zero visible change. Plan should include this
  manual UAT step as an explicit acceptance gate, not just `tsc` + test pass.
- Hard gates that still apply: `npx tsc --noEmit` exits 0 (incl. test files);
  full test count holds after every step; each tRPC endpoint fetched at most once
  per `/users` load (PERF-03).

### Claude's Discretion (technical — not for user)
- Zustand store shape / slice boundaries; what goes in the store
  (search/filter/sort/viewMode) vs. local component state.
- The single data-hook composition over the 10 tRPC endpoints.
- Which sub-components to extract and their seams (the ~200-line orchestrator
  shell target).
- Shared query-key constants + `staleTime` values to kill the double-fetch.
- Test framework/harness specifics for the golden-path test.

</decisions>

<specifics>
## Specific Ideas

- Owner is non-technical; the workshop projector demo is the real acceptance test.
  The state-preservation-on-close behavior (filters + search + scroll) is the
  detail most likely to be noticed live, so treat it as non-negotiable.
- Baseline-first discipline: capture the current behavior/data as the reference
  the test pins, since "preserve exactly" is the governing rule.

</specifics>

<deferred>
## Deferred Ideas

- **`/users` feels slow/laggy to load** — owner-reported current annoyance.
  Belongs in **Phase 4 (/users Table & Polish)**, which already plans deferred
  heavy payload + a ~200ms skeleton + reduced initial client payload (PERF-01,
  PERF-04). Do NOT address load speed in this refactor beyond the PERF-03
  double-fetch elimination that is already in this phase's scope.
- Any pre-existing bugs/quirks discovered during decomposition — preserved here,
  candidates for a future deliberate fix (note them if found; do not fix in P2).

</deferred>

---

*Phase: 02-users-decomposition*
*Context gathered: 2026-06-17*
