---
phase: 01-foundation
plan: "04"
subsystem: infra
tags: [webpack, nextjs, webworker, d3-force, production-build]

# Dependency graph
requires:
  - phase: 01-01
    provides: getAccountId helper ensuring bare UUID passed to ACC Admin API
  - phase: 01-02
    provides: renderer lifecycle fix and cache corruption detection banner
  - phase: 01-03
    provides: navigation state persistence, loading timeout, API error recovery

provides:
  - Production build verified: worker chunk emitted to /_next/static/chunks/
  - Human-verified: graph canvas loads at /users in npm start mode
  - FOUND-01 confirmed: worker script returns 200 OK in DevTools Network tab
  - FOUND-02 confirmed: no blank canvas after repeated navigation (5 round-trips)
  - FOUND-03 confirmed: getAccountId strip confirmed, no b. prefix in users.ts
  - FOUND-04 confirmed: cache corruption banner appears on localStorage flag
  - Plan 03 persistence fix: localStorage view survives remount (hash-keyed)

affects: [02-cosmos-renderer, any phase touching AccUsersGraph.tsx or next.config.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "new Worker(new URL(..., import.meta.url)) pattern works natively with Next.js 16 + webpack 5 — no worker-loader needed"
    - "Worker chunk hash-named as [hash].worker.js under /_next/static/chunks/ in production builds"

key-files:
  created: []
  modified:
    - next.config.ts (no change required — worker chunk emitted correctly without config change)

key-decisions:
  - "next.config.ts unchanged — Next.js 16 webpack 5 natively handles new Worker(new URL(..., import.meta.url)) without workerPublicPath or worker-loader"
  - "localStorage view key (acc-graph-view) discarded on dataHash change so stale pan/zoom does not restore to wrong data — fix applied in companion commit 637a228"

patterns-established:
  - "Production build verification is gate before merging any phase that touches the graph worker path"
  - "Human checkpoint (type=checkpoint:human-verify) used as final gate — human runs DevTools Network check for worker 200 OK"

requirements-completed: [FOUND-01]

# Metrics
duration: ~30min
completed: "2026-04-28"
---

# Phase 1 Plan 04: Production Build Verification Summary

**Production webpack build confirmed emitting worker chunk (7712.7f71ab5f8fff1e26.js → 200 OK); all four FOUND requirements verified in npm start mode by human checkpoint approval**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-28T17:47:34Z
- **Completed:** 2026-04-28T~18:15:00Z
- **Tasks:** 2 (Task 1 auto + checkpoint human-verify)
- **Files modified:** 0 (next.config.ts unchanged; fix applied in companion commit)

## Accomplishments

- Production build ran cleanly — worker chunk `7712.7f71ab5f8fff1e26.js` emitted to `/_next/static/chunks/` without any webpack config changes
- Human-verified via DevTools Network: worker script returned 200 OK with correct Content-Type
- Renderer lifecycle (FOUND-02), hub ID safety (FOUND-03), and corruption banner (FOUND-04) all confirmed working in production mode
- localStorage view/filter persistence (Plan 03 companion fix) verified surviving page remount — commit 637a228 applied during this plan's execution

## Task Commits

Each task was committed atomically:

1. **Task 1: Run production build and check for worker chunk emission** - `178f422` (chore)
2. **Fix: Persist data hash to localStorage so saved view survives remount** - `637a228` (fix — deviation auto-fix applied during verification)

**Plan metadata:** (docs commit to follow with SUMMARY.md, STATE.md, ROADMAP.md)

## Files Created/Modified

- `next.config.ts` — No change required; native webpack 5 support confirmed
- `src/components/graph/AccUsersGraph.tsx` — localStorage view hash key fix (637a228)

## Decisions Made

- `next.config.ts` left unchanged: Next.js 16's built-in webpack 5 handles `new Worker(new URL(..., import.meta.url))` natively. Adding `workerPublicPath` or `worker-loader` would have been unnecessary complexity.
- The Plan 03 localStorage persistence bug (stale view restored on data change) was caught during human checkpoint verification and fixed inline (637a228) rather than deferring — correctness requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale saved view restoring to wrong data after remount**
- **Found during:** Human checkpoint verification (Task 2)
- **Issue:** `acc-graph-view` key in localStorage did not encode the current `dataHash`, so panning/zooming on dataset A, then navigating away and back with dataset B still restored dataset A's viewport position
- **Fix:** Persisted `dataHash` alongside view state; `loadSavedView()` discards saved view when hash mismatches; `localStorage.removeItem` called on hash change so auto-fit runs for new data
- **Files modified:** `src/components/graph/AccUsersGraph.tsx`
- **Verification:** Human confirmed view persistence works after fix; approved checkpoint
- **Committed in:** `637a228` (fix: persist data hash to localStorage so saved view survives remount)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in Plan 03 persistence logic caught during production verification)
**Impact on plan:** Fix was required for correctness — stale viewport is a visible UX bug. No scope creep; directly related to Plan 03 state persistence work being verified here.

## Issues Encountered

None beyond the auto-fixed deviation above. Production build was clean on first run; no webpack config changes were needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 1 is complete. All four FOUND requirements are verified working in production:
- FOUND-01: Worker chunk emitted and served 200 OK
- FOUND-02: No blank canvas on repeated navigation
- FOUND-03: getAccountId strips b. prefix, bare UUID guaranteed
- FOUND-04: Cache corruption banner renders from localStorage flag

Phase 2 (Cosmos.gl Renderer) can begin. Pre-existing risk to track: confirm `@cosmos.gl/graph` v2.6.4 compatibility with React 19 / Next.js 16 before installing.

---
*Phase: 01-foundation*
*Completed: 2026-04-28*
