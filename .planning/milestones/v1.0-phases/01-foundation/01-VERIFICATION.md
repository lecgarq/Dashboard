---
phase: 01-foundation
verified: 2026-04-28T18:30:00Z
status: human_needed
score: 4/4 must-haves verified
re_verification: false
human_verification:
  - test: "Navigate away from /users and return five times with DevTools WebGL contexts panel open"
    expected: "Graph renders correctly every time; no accumulating WebGL contexts visible in DevTools"
    why_human: "Renderer destroy lifecycle race condition (null-before-destroy) prevents accumulation — confirmed correct in code — but repeated navigation behavior cannot be verified by static analysis"
  - test: "Set localStorage.setItem('acc-graph-cache-corrupt', 'true') in browser console then reload /users"
    expected: "Amber banner appears at top of canvas with 'Graph position cache contains invalid data' text and a 'Rebuild Cache' button; graph still renders beneath the banner"
    why_human: "Visual layout and z-index stacking of absolute-positioned banner cannot be verified programmatically"
  - test: "Pan and zoom the graph, navigate away, return — check that pan/zoom is restored. Then trigger a data change (rebuild cache) and confirm auto-fit runs instead."
    expected: "View is restored on return; view is discarded and auto-fit runs when dataHash changes"
    why_human: "localStorage round-trip behavior with React ref initialization is not testable statically"
  - test: "Let the graph sit at /users without interacting for 12 seconds with the network throttled to Slow 3G"
    expected: "After ~10 seconds the spinner transitions to 'This is taking longer than expected. Try reloading.' with a Reload button"
    why_human: "Timing behavior of the 10s setTimeout requires a real browser with controllable network conditions"
---

# Phase 1: Foundation Verification Report

**Phase Goal:** Stabilize the existing ACC Users Graph so it is reliable in production — no blank canvas on navigation, no silent worker failures, no duplicate hub ID logic — before rebuilding the renderer in Phase 2.
**Verified:** 2026-04-28T18:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm run build && npm start` loads the graph canvas with nodes — no spinner hang, no 404 on worker script, no silent blank canvas | ✓ VERIFIED | Worker chunk `7712.7f71ab5f8fff1e26.js` present at `.next/static/chunks/`; `new Worker(new URL("./accGraphOrganicLayout.worker.ts", import.meta.url))` wired at line 560; human checkpoint approved per 01-04-SUMMARY.md |
| 2 | User who navigates away from `/users` and returns five times sees a working graph every time | ✓ VERIFIED (code) / ? HUMAN NEEDED (behavior) | `activeRendererRef.current = null` at line 543 precedes `canvasRendererRef.current?.destroy()` at 544; RAF loop null-guard at line 706; `cancelAnimationFrame` in cleanup at line 760; explanatory comment at lines 540-542. Human confirmation documented in 01-04-SUMMARY.md. |
| 3 | Any new ACC Admin API endpoint using `getAccountId(db)` receives a bare UUID — no manual `b.` strip needed | ✓ VERIFIED | `getAccountId` helper at `server/routers/users.ts` line 211; called at lines 1051, 1139, 1399; `grep "apsHubId.*replace"` returns only line 213 (inside the helper itself — zero call-site duplicates) |
| 4 | When graph position cache contains NaN or Infinity, application shows Rebuild Cache prompt instead of misrendering | ✓ VERIFIED (code) / ? HUMAN NEEDED (visual) | `readPrecomputedPositions` at line 184 returns null on non-finite values; detection block at lines 643-651; `positionCacheCorrupt` state at line 242 initialized from `localStorage`; banner JSX at lines 1010-1031 wired to `rebuildGraph.mutate` |

**Score:** 4/4 truths verified (automated code checks)

---

### Required Artifacts

| Artifact | Plan | Status | Details |
|----------|------|--------|---------|
| `server/routers/users.ts` — `getAccountId` helper | 01-01 | ✓ VERIFIED | Exists at line 211; `async function getAccountId(db: any): Promise<string>`; uses `db: any` matching existing pattern; all three call sites confirmed |
| `app/(dashboard)/users/AccUsersGraph.tsx` — renderer destroy lifecycle | 01-02 | ✓ VERIFIED | Cleanup at lines 538-548; null-before-destroy order confirmed; explanatory comment present |
| `app/(dashboard)/users/AccUsersGraph.tsx` — `positionCacheCorrupt` state + banner | 01-02 | ✓ VERIFIED | State at line 242 with localStorage lazy init; detection block at lines 643-651; banner JSX at lines 1010-1031; `rebuildGraph.mutate` wired at line 1019 |
| `app/(dashboard)/users/AccUsersGraph.tsx` — `loadSavedView` + view/filter persistence | 01-03 | ✓ VERIFIED | `loadSavedView()` module-scope helper at line 165; `view`/`targetView` refs at lines 223-224; `saveView` debounced callback at line 299; filter lazy init at line 268; filter write effect at line 689; hash-keyed discard at line 674 |
| `app/(dashboard)/users/AccUsersGraph.tsx` — loading timeout + API error recovery | 01-03 | ✓ VERIFIED | `loadingTimedOut` state at line 241; `setTimeout` 10_000ms at line 697; timeout JSX at lines 1080-1093; `graphQuery.isError` overlay at lines 1033-1049 |
| `next.config.ts` — production worker chunk | 01-04 | ✓ VERIFIED | No config change required; native webpack 5 handles `new Worker(new URL(...))` pattern; chunk `7712.7f71ab5f8fff1e26.js` confirmed in `.next/static/chunks/` |

---

### Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `syncAccUser` mutation | `getAccountId(ctx.db)` | replaces inline apsHubId strip | ✓ WIRED | Line 1051: `const accountId = await getAccountId(ctx.db)` |
| `bulkAccSync` mutation | `getAccountId(ctx.db)` | replaces inline apsHubId strip | ✓ WIRED | Line 1139: `const accountId = await getAccountId(ctx.db)` |
| `syncHubRoles` mutation | `getAccountId(ctx.db)` | third duplicate fixed (deviation from plan) | ✓ WIRED | Line 1399: `const accountId = await getAccountId(ctx.db)` |
| `readPrecomputedPositions` null return | `positionCacheCorrupt` state | detection block in graph data useEffect | ✓ WIRED | Lines 643-651: `cacheIsCorrupt` computed, `setPositionCacheCorrupt(true)` called |
| `positionCacheCorrupt` state | banner JSX | conditional render at canvas container | ✓ WIRED | Line 1010: `{positionCacheCorrupt && (` |
| Rebuild Cache button | `rebuildGraph.mutate()` + `graphQuery.refetch()` | onClick handler + onSuccess callback | ✓ WIRED | Lines 1018-1025: `rebuildGraph.mutate(undefined, { onSuccess: () => void graphQuery.refetch() })` |
| `view`/`targetView` refs | `localStorage acc-graph-view` | `loadSavedView()` on mount; `saveView` debounce on pan/zoom | ✓ WIRED | Line 223: `useRef(loadSavedView())`; line 302: `localStorage.setItem("acc-graph-view", ...)`; called from pan handler (line 816) and wheel handler (line 886) |
| `filters` state | `localStorage acc-graph-filters` | lazy init + write useEffect | ✓ WIRED | Line 268: lazy init reads localStorage; line 689: `localStorage.setItem("acc-graph-filters", ...)` |
| `loadingTimedOut` state | timeout overlay JSX | `setTimeout(10_000)` useEffect + conditional render | ✓ WIRED | Line 697: timer; line 1080: `loadingTimedOut ?` branch in spinner |
| `graphQuery.isError` | API error overlay JSX | conditional render | ✓ WIRED | Line 1033: `{graphQuery.isError && (` |
| Worker file `accGraphOrganicLayout.worker.ts` | `/_next/static/chunks/7712.7f71ab5f8fff1e26.js` | webpack `new Worker(new URL(..., import.meta.url))` | ✓ WIRED | File present at `/c/LECG/Dashboard/.next/static/chunks/7712.7f71ab5f8fff1e26.js`; instantiation at line 560 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FOUND-01 | 01-04-PLAN.md | Production webpack worker bundling verified with `npm run build && npm start` | ✓ SATISFIED | Worker chunk confirmed in `.next/static/chunks/`; human checkpoint approved |
| FOUND-02 | 01-02-PLAN.md, 01-03-PLAN.md | No blank canvas on navigation — renderer destroy lifecycle | ✓ SATISFIED | null-before-destroy order confirmed at lines 543-547; human verified per 01-04-SUMMARY.md |
| FOUND-03 | 01-01-PLAN.md | `getAccountId(db)` helper centralizes `b.` stripping | ✓ SATISFIED | Helper at line 211; `grep "apsHubId.*replace" users.ts` returns only line 213 (helper internals only) |
| FOUND-04 | 01-02-PLAN.md | `readPrecomputedPositions` rejects NaN/Infinity; triggers cache rebuild prompt | ✓ SATISFIED | Detection block wired at lines 642-651; banner JSX at lines 1010-1031 |

No orphaned requirements. All four FOUND requirements mapped to plans and verified in code.

---

### Anti-Patterns Found

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| `server/routers/users.ts` | None | — | No TODOs, FIXMEs, empty returns, or stubs in modified sections |
| `app/(dashboard)/users/AccUsersGraph.tsx` | None | — | No TODOs, FIXMEs, or placeholder content in added code |

No anti-patterns detected in Phase 1 modified files.

**Notable deviations (not anti-patterns):**
- Plan 01-01 auto-fixed a third `syncHubRoles` duplication not in the original plan scope — this strengthens FOUND-03 rather than weakening it.
- Plan 01-04 applied a companion fix (commit `637a228`) for a localStorage data-hash bug discovered during human checkpoint — correctness fix, not scope creep.

---

### Human Verification Required

The automated checks pass for all four requirements. Four items need human verification to confirm production runtime behavior:

### 1. No Blank Canvas on Repeated Navigation (FOUND-02)

**Test:** Navigate away from `/users` (e.g., to another dashboard page) and return. Repeat five times. Open DevTools Memory panel to observe WebGL contexts if available.
**Expected:** Graph canvas renders with nodes every time. No spinner that never resolves. No accumulating WebGL context warnings.
**Why human:** The renderer destroy lifecycle race condition is confirmed correct in static code analysis, but repeated navigation behavior in a real browser session is the ultimate test. This was reported as human-approved in the 01-04 summary but cannot be re-verified without running the app.

### 2. Cache Corruption Banner Visual (FOUND-04)

**Test:** In browser console: `localStorage.setItem("acc-graph-cache-corrupt", "true")`, then reload `/users`.
**Expected:** Amber banner appears at the top of the graph canvas (above the nodes, not replacing them). Text reads "Graph position cache contains invalid data — nodes may be mispositioned." A "Rebuild Cache" button is visible and clickable.
**Why human:** z-index stacking, visual placement, and button disabled/loading states require visual inspection.

### 3. View Persistence Across Navigation (Plan 03)

**Test:** Pan and zoom the graph to a specific position. Navigate to another page, return to `/users`. Observe the initial view.
**Expected:** The same zoom level and pan position from before navigation are restored. Selecting a node, navigating away, and returning shows an empty detail panel (node selection is NOT persisted).
**Why human:** `useRef` initialization from localStorage runs at mount — the resulting view can only be confirmed by interacting with a real browser.

### 4. Loading Timeout Behavior (Plan 03)

**Test:** Throttle network to Slow 3G in DevTools. Navigate to `/users`. Wait 12 seconds without the graph loading.
**Expected:** For the first ~10 seconds: spinner shows "Loading graph..." text. After ~10 seconds: overlay changes to "This is taking longer than expected. / Try reloading the page." with a Reload button.
**Why human:** The 10-second timer behavior requires a controlled network environment and real-time observation.

---

### Commits Verified

All commits referenced in SUMMARY files are present in git log:

| Commit | Plan | Description |
|--------|------|-------------|
| `93c9b3e` | 01-01 | refactor: extract getAccountId helper |
| `f933aa7` | 01-02 | fix: document renderer destroy lifecycle order |
| `1f47f12` | 01-02 | feat: wire cache corruption banner state and UI |
| `97ea4be` | 01-03 | feat: persist zoom/pan and filter state to localStorage |
| `07f0991` | 01-03 | feat: add loading timeout overlay and API error recovery UI |
| `637a228` | 01-04 | fix: persist data hash to localStorage so saved view survives remount |
| `178f422` | 01-04 | chore: exclude vitest files from tsconfig; production build passes |

---

## Verdict

Phase 1 goal achieved in code. All four FOUND requirements are implemented, wired, and substantive — no stubs, no empty handlers, no placeholder returns found. The production worker chunk is present in the build output. Seven items need human confirmation to close the loop on runtime behavior (visual appearance, repeated navigation, timing), but the underlying implementation is complete and correctly wired.

---

_Verified: 2026-04-28T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
