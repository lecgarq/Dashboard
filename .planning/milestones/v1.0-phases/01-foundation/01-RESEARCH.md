# Phase 1: Foundation - Research

**Researched:** 2026-04-28
**Domain:** Next.js 16 production bundling, WebGL context lifecycle, ACC Admin API hub ID handling, position cache validation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Cache Corruption Prompt
- Show a non-blocking banner at the top of the graph page when position cache contains NaN or Infinity values
- Banner includes a "Rebuild Cache" button — user triggers the rebuild, it's not automatic
- Graph still attempts to render while banner is showing (nodes will be mispositioned, but visible)
- Banner persists across page reloads until the user clicks "Rebuild Cache" — it does not auto-dismiss

#### Cache Rebuild Behavior
- Claude's Discretion: choose the most reliable rebuild approach (clearing cache and re-running physics auto-layout is the expected default)

#### Navigation State Memory
- Remember zoom level and pan position when user navigates away and returns
- Do NOT remember selected node — selection clears on return (clean slate for the detail panel)
- Remember applied filter state on return
- State is persistent across browser sessions (localStorage) — not just in-session

#### Error Recovery
- Physics worker crash at runtime → fall back to static layout (freeze nodes in current position, graph stays readable, no error message unless user interacts)
- API failure (can't fetch user data) → show "Could not load graph data. Try again." with a Retry button
- Non-critical node failure (one node's detail can't load) → isolate to that node with a placeholder/grayed state; rest of graph works normally
- Error logging strategy → Claude's Discretion (console-only vs. pre-wired monitoring hook)

#### Loading Experience
- While graph is loading: show a centered spinner with "Loading graph..." in the canvas area — page header and navigation remain visible (not full-page loading)
- Timeout: if graph hasn't loaded in ~10 seconds, show "This is taking longer than expected. Try reloading." with a Reload button
- Entrance animation: nodes use physics settle animation (start clustered, spread out via simulation) — not instant appear

### Claude's Discretion
- Cache rebuild approach (clearing cache and re-running physics auto-layout is the expected default)
- Error logging strategy (console-only vs. pre-wired monitoring hook)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | Graph module loads correctly when deployed to production — production webpack worker bundling verified with `npm run build && npm start` | Next.js 16 `new Worker(new URL(..., import.meta.url))` pattern is the correct approach; the issue is confirming it survives the webpack build step without 404 on the emitted worker chunk |
| FOUND-02 | User can navigate away and return multiple times without blank canvas — renderer destroy lifecycle prevents WebGL context accumulation | The `destroy()` cleanup in the renderer `useEffect` return exists but may have a timing gap between the RAF loop and renderer disposal; explicit `cancelAnimationFrame` + null-guard sequence must be verified |
| FOUND-03 | `getAccountId(db)` helper centralizes `b.` prefix stripping — new endpoints no longer require manual strip | The strip logic (`project?.apsHubId?.replace(/^b\./, "")`) is duplicated across at least two mutations (`syncAccUser`, `bulkAccSync`); extraction into a shared helper is a pure refactor |
| FOUND-04 | `readPrecomputedPositions` rejects NaN/Infinity and triggers cache rebuild prompt | The function already returns `null` on invalid values but there is no banner UI wired to that result — the UI only shows the "Rebuild Graph Cache" button when `graphQuery.data?.hit === false`, not when positions are corrupt |
</phase_requirements>

---

## Summary

Phase 1 is a hardening phase for an 80%-complete graph module. The codebase is a Next.js 16 app with TypeScript 6, React 19, tRPC 11, and a custom physics-based graph renderer. The graph uses a Web Worker (`accGraphOrganicLayout.worker.ts`) for d3-force simulation, and a Canvas 2D renderer (`CanvasGraphRenderer`). The four requirements are surgical fixes — no new libraries are needed and no architectural changes are required.

The critical production risk (FOUND-01) is the webpack worker chunk emitted by `new Worker(new URL("./accGraphOrganicLayout.worker.ts", import.meta.url), { type: "module" })`. In production builds with Next.js 16's webpack layer, worker files are emitted as separate chunks. If the public path is misconfigured or the worker file is not emitted, the graph gets a 404 on the worker script and silently fails. The existing `next.config.ts` does not have any explicit `webpack` worker configuration, so the default chunk emission behavior applies — this MUST be verified with `npm run build && npm start` before declaring FOUND-01 done.

The other three requirements (FOUND-02, FOUND-03, FOUND-04) are lower-risk code changes with clear boundaries. FOUND-02 requires auditing the RAF loop cancellation order relative to renderer `destroy()`. FOUND-03 is a pure extract-refactor of two identical `replace(/^b\./, "")` lines into a shared `getAccountId(db)` utility. FOUND-04 requires wiring `readPrecomputedPositions`'s `null` return into a new banner state — the validation logic itself already works correctly.

**Primary recommendation:** Start with FOUND-03 (hub ID helper) and FOUND-04 (cache corruption banner) as safe, testable code changes, then tackle FOUND-01 (production worker build) and FOUND-02 (renderer destroy) together as they both require a production build to verify.

---

## Standard Stack

### Core (already installed — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^16.2.4 | Framework + webpack bundler | Already in use; worker bundling is built-in |
| react | 19.2.3 | UI framework | Already in use |
| @trpc/server | ^11.0.0 | Type-safe API layer | Already in use for graph data fetching |
| d3-force | (in worker) | Physics simulation | Already used in `accGraphOrganicLayout.worker.ts` |
| vitest | (dev) | Test runner for unit tests | Already configured — `vitest.config.ts` exists |

### No New Packages Required

All four FOUND requirements are achievable with the existing stack. Do not add new dependencies.

---

## Architecture Patterns

### Recommended Project Structure (relevant files)

```
app/(dashboard)/users/
├── AccUsersGraph.tsx           # Main graph component — FOUND-02, FOUND-04 changes here
├── graphRenderers.ts           # CanvasGraphRenderer — FOUND-02 destroy() audit here
├── accGraphOrganicLayout.worker.ts  # Physics worker — FOUND-01 worker bundle
└── accGraphOrganicLayout.ts    # Layout utilities

server/routers/users.ts         # FOUND-03: extract getAccountId helper here

lib/server/
└── acc-admin.ts                # ACC Admin API client (accountId is a parameter here)

lib/acc/
├── graphSnapshot.ts            # Graph snapshot builder
└── graphSimulation.ts          # Physics simulation (server-side)
```

### Pattern 1: Next.js Web Worker Bundling

**What:** Next.js 16 bundles Web Workers via webpack when you use `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`. This is the standard pattern and it is already used correctly in `AccUsersGraph.tsx` (line 505).

**When to use:** Always — this is the only supported pattern in Next.js for Workers.

**The production risk:** In development (`next dev`), webpack serves the worker inline or as a hot-reloaded chunk. In production (`next build && next start`), the worker is emitted as a static file in `_next/static/chunks/`. The public path must resolve correctly. If the app is deployed behind a CDN or with a non-root `basePath`, the worker URL may 404.

**Verification command:**
```bash
npm run build && npm start
# Then visit /users in browser, open DevTools → Network → filter "worker"
# Must see: GET /_next/static/chunks/[hash].worker.js 200 OK
```

**What the current `next.config.ts` does:** No explicit webpack worker config — relies on Next.js 16 defaults. The `config.output.chunkLoadTimeout = 60000` is set for client chunks but NOT specifically for worker chunks.

### Pattern 2: React useEffect Cleanup for Renderer + RAF Loop

**What:** The current code has two separate `useEffect` hooks — one for renderer init (with `destroy()` in cleanup) and one for the RAF loop (with `cancelAnimationFrame` in cleanup). These run in dependency order, but both effects depend on refs not states, so they run once on mount.

**The gap:** When the component unmounts, React runs cleanup in reverse order. The RAF loop cleanup runs first (cancels the animation frame), then the renderer cleanup runs (calls `destroy()`). This order is correct. BUT: if the RAF callback fires between the RAF cancellation and the renderer destruction (race condition during unmount), `renderer.draw()` is called on a destroyed renderer.

**Fix pattern:**
```typescript
// In the RAF loop effect, guard against null renderer reference
const render = () => {
  const renderer = activeRendererRef.current;
  if (!renderer) return; // Already nulled by renderer cleanup
  // ...
};
```

The renderer cleanup already sets `activeRendererRef.current = null` before calling `destroy()`. This null-guard is the key defense — it is already present in the cleanup but should be verified it happens before `destroy()` is called.

**WebGL context accumulation:** Each `CanvasGraphRenderer` constructor calls `canvas.getContext("2d")` — this does NOT create a new WebGL context. The `CanvasGraphRenderer` uses Canvas 2D, not WebGL. So there is no WebGL context leak from `CanvasGraphRenderer`. The `WebGpuGraphRenderer` is a stub that always returns `null`. The "blank canvas" bug on navigation is more likely a re-initialization race: the worker re-init after a stale `layoutSessionRef` message arrives after the new component mounts.

### Pattern 3: Hub ID Extraction Helper

**What:** The `b.` prefix strip appears twice in `users.ts`:
- Line 1042: `const accountId = project?.apsHubId?.replace(/^b\./, "");`
- Line 1137: `const accountId = project?.apsHubId?.replace(/^b\./, "");`

**The fix:** Extract into a module-level helper function:

```typescript
// In server/routers/users.ts (module scope)
async function getAccountId(db: typeof ctx.db): Promise<string> {
  const project = await db.project.findFirst({ select: { apsHubId: true } });
  const accountId = project?.apsHubId?.replace(/^b\./, "");
  if (!accountId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "APS Hub ID is not configured. Set APS_HUB-ID in Railway environment variables.",
    });
  }
  return accountId;
}
```

**Why this pattern:** The helper throws a consistent `TRPCError` with a useful Railway-specific message. All existing call sites use the same error message pattern. Future endpoints call `getAccountId(ctx.db)` instead of duplicating the logic.

### Pattern 4: Cache Corruption Banner

**What:** `readPrecomputedPositions()` already returns `null` when the position array contains NaN or Infinity (lines 165-174 of `AccUsersGraph.tsx`). But the UI has no banner for this case. When it returns `null`, the code falls back to `computeTopologySeedPositions(rawNodes, null)` — the graph renders but all nodes start from seeded positions (not cached), which is mispositioned but visible.

**The fix:** Add a React state flag that persists via localStorage:

```typescript
// New state in AccUsersGraph
const [positionCacheCorrupt, setPositionCacheCorrupt] = useState<boolean>(() => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("acc-graph-cache-corrupt") === "true";
});
```

**Detection point:** In the `useEffect` that reads `graphQuery.data` (around line 587 of `AccUsersGraph.tsx`):
```typescript
const cachedPositions = readPrecomputedPositions(graph.positions, rawNodes.length * 2);
if (cachedPositions === null && graph.positions !== null && Array.isArray(graph.positions) && graph.positions.length > 0) {
  // Cache exists but is corrupt — positions were present but invalid
  localStorage.setItem("acc-graph-cache-corrupt", "true");
  setPositionCacheCorrupt(true);
} else {
  localStorage.removeItem("acc-graph-cache-corrupt");
  setPositionCacheCorrupt(false);
}
```

**Banner placement:** Rendered as a `position: absolute` banner at the top of the graph container div (inside the `containerRef` div), z-index above the canvas but below the controls. Dismissed only when user clicks "Rebuild Cache" and the mutation succeeds.

**Rebuild cache action:** Call the existing `trpc.users.rebuildAccGraphCache` mutation (already used in the component for the missing-cache case). On success: clear the localStorage flag, set `positionCacheCorrupt` to false, refetch the graph query.

### Pattern 5: Navigation State Persistence (localStorage)

**What:** The locked decision requires zoom/pan/filter state to persist across browser sessions via localStorage. The component currently uses `useRef` for `view` and `targetView` — these are lost on unmount.

**Persistence key design:**
```
"acc-graph-view"    → { x, y, scale }  (zoom/pan)
"acc-graph-filters" → { roles, lastAddedBuckets, adminAccess, modules }
```

**Load on mount:** Read from localStorage in the initial state/ref setup. Guard with `typeof window !== "undefined"`.

**Save on change:** Debounce writes (300ms) to avoid per-frame localStorage writes during pan/zoom. The filter state already uses React state (`setFilters`), so saving can happen in a `useEffect` watching `filters`.

**Clearing selected node on return:** Already the correct behavior — `selectedNode` is React state initialized to `null` and there's no persistence of it, so selection already clears on unmount/remount.

### Pattern 6: Loading Timeout

**What:** The locked decision requires a 10-second timeout showing "This is taking longer than expected. Try reloading." with a Reload button.

**Implementation:** React `useEffect` with `setTimeout` that starts when `isReady === false` and `users.length > 0`. Cancelled if `isReady` becomes `true`. Shows a timeout state overlay instead of the spinner.

```typescript
const [loadingTimedOut, setLoadingTimedOut] = useState(false);
useEffect(() => {
  if (isReady || !users.length) {
    setLoadingTimedOut(false);
    return;
  }
  const timer = setTimeout(() => setLoadingTimedOut(true), 10_000);
  return () => clearTimeout(timer);
}, [isReady, users.length]);
```

### Anti-Patterns to Avoid

- **Adding a worker config object to `next.config.ts` unnecessarily:** The default `new Worker(new URL(...))` pattern is sufficient for Next.js 16. Only add webpack config if the build output verification shows a missing worker chunk.
- **Replacing `localStorage` with `sessionStorage`:** The locked decision explicitly requires cross-session persistence. Use `localStorage` only.
- **Auto-dismissing the corruption banner:** Locked decision says the banner persists until the user clicks "Rebuild Cache."
- **Making the cache rebuild automatic on corrupt detection:** The user must click the button — not automatic.
- **Remembering selected node in localStorage:** Locked decision: selection clears on return.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| localStorage debounce for view state | Custom debounce utility | Inline `setTimeout`/`clearTimeout` pattern | Simple enough inline; no library needed |
| Position validation | Custom NaN detection | `Number.isFinite(value)` already in `readPrecomputedPositions` | Already correct, just needs UI wiring |
| Hub ID stripping | Complex UUID normalization | `apsHubId?.replace(/^b\./, "")` | The `b.` prefix is the only format; regex is correct |

**Key insight:** This phase has no new algorithmic problems. Every fix is wiring existing logic to new places or extracting duplicated code.

---

## Common Pitfalls

### Pitfall 1: Production Worker 404

**What goes wrong:** `npm run build && npm start` shows a blank canvas; DevTools shows `GET /_next/static/chunks/[hash].worker.js 404`.

**Why it happens:** The worker chunk is emitted by webpack but the chunk's public path uses the wrong base URL (e.g., when Next.js can't determine the deployment origin at build time, or when the chunk hash changes between builds and a CDN is caching an old manifest).

**How to avoid:** Always verify with `npm run build && npm start` locally (not just `next dev`) before marking FOUND-01 complete. Check the Network tab for the worker request. If 404 occurs, the fix is in `next.config.ts` webpack config.

**Warning signs:** Graph spinner never resolves; DevTools Console shows `Failed to construct 'Worker': Script at ... cannot be accessed from origin`.

### Pitfall 2: Layout Session Race on Remount

**What goes wrong:** User navigates away and back quickly. Old worker messages with stale `session` IDs arrive after the new component mounts and overwrite `posRef.current` with garbage positions.

**Why it happens:** The worker `terminate()` call in the old component's cleanup runs async, and a `tick` message from the old session may arrive on the new component's `worker.onmessage` handler before the session ID check filters it out.

**How to avoid:** The existing `message.session !== layoutSessionRef.current` guard (line 510 of `AccUsersGraph.tsx`) already handles this. The fix for FOUND-02 must NOT remove this guard.

**Warning signs:** After navigation, graph briefly shows correct layout then jumps to wrong positions.

### Pitfall 3: Banner Re-triggering on Every Load

**What goes wrong:** The corruption banner is shown every time the graph loads, even after a successful rebuild, because the localStorage flag was not cleared after the rebuild succeeded.

**Why it happens:** The mutation's `onSuccess` callback clears the flag, but if the `graphQuery.refetch()` also returns corrupt data (double corruption), the detection `useEffect` re-sets it.

**How to avoid:** Clear the localStorage flag ONLY after `graphQuery.refetch()` resolves AND `readPrecomputedPositions` returns non-null. The detection logic must run after the refetch, not just after the mutation.

**Warning signs:** Banner re-appears immediately after clicking "Rebuild Cache."

### Pitfall 4: View State Persistence Causing Wrong Zoom on First Load

**What goes wrong:** User opens the graph for the first time after data change (new members added). The graph auto-fits to the new data but then immediately snaps back to the last saved view (which covers a smaller/different graph).

**Why it happens:** `zoomToFit({ immediate: true })` runs after data loads, but the saved view from localStorage is loaded first and overrides it.

**How to avoid:** Only restore the saved view if `lastAutoFitHashRef.current === graph.dataHash`. If the data hash changed, clear the saved view and let auto-fit run. The existing `lastAutoFitHashRef` comparison logic (line 605) is the right gate.

**Warning signs:** Graph zooms into empty space after data update.

### Pitfall 5: Filter State Hydration Mismatch

**What goes wrong:** The component initializes `filters` state from localStorage, but the filter options (roles, modules, etc.) haven't loaded yet. The active filters reference role names that don't exist in the current data, causing 0 visible nodes on first render.

**Why it happens:** `filterOptions` depends on `graphQuery.data`, which loads asynchronously. If the saved filter names no longer exist in the current data, `nodeMatchesFilters` returns `false` for all nodes.

**How to avoid:** After `graphQuery.data` loads, validate that saved filter values exist in the current `filterOptions`. Drop any filter values not present in the data. Log dropped values in dev.

**Warning signs:** Graph shows "0 of N instances" immediately on load.

---

## Code Examples

### FOUND-01: Verifying Worker Chunk in Production Build

```bash
# Build and start in production mode
npm run build && npm start

# Expected output in browser DevTools → Network (filter: worker)
# GET /_next/static/chunks/[hash].worker.js   200 OK
# Content-Type: application/javascript

# If you see:
# GET /_next/static/chunks/[hash].worker.js   404 Not Found
# → The worker is not being emitted. Check webpack config.
```

### FOUND-03: getAccountId Helper

```typescript
// Source: code analysis of server/routers/users.ts lines 1039-1042, 1136-1137

// BEFORE (duplicated in two mutations):
const project = await ctx.db.project.findFirst({ select: { apsHubId: true } });
const accountId = project?.apsHubId?.replace(/^b\./, "");
if (!accountId) {
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "APS Hub ID is not configured. Set APS_HUB-ID in Railway environment variables.",
  });
}

// AFTER (extracted helper at module scope, before usersRouter):
async function getAccountId(db: PrismaClient): Promise<string> {
  const project = await db.project.findFirst({ select: { apsHubId: true } });
  const accountId = project?.apsHubId?.replace(/^b\./, "");
  if (!accountId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "APS Hub ID is not configured. Set APS_HUB-ID in Railway environment variables.",
    });
  }
  return accountId;
}

// In each mutation:
const accountId = await getAccountId(ctx.db);
```

### FOUND-04: Corrupt Cache Detection + Banner State

```typescript
// Source: code analysis of AccUsersGraph.tsx readPrecomputedPositions (lines 165-174)

// In the graph data useEffect, after:
const cachedPositions = readPrecomputedPositions(graph.positions, rawNodes.length * 2);

// Add corruption detection:
const hasCachedPositions = Array.isArray(graph.positions) && (graph.positions as unknown[]).length > 0;
const cacheIsCorrupt = hasCachedPositions && cachedPositions === null;
if (cacheIsCorrupt) {
  localStorage.setItem("acc-graph-cache-corrupt", "true");
  setPositionCacheCorrupt(true);
} else if (!cacheIsCorrupt) {
  localStorage.removeItem("acc-graph-cache-corrupt");
  setPositionCacheCorrupt(false);
}
```

### FOUND-02: Renderer + RAF Cleanup Order Verification

```typescript
// Source: AccUsersGraph.tsx renderer useEffect (lines 443-494) + RAF loop (lines 621-682)

// Correct cleanup ORDER (React runs cleanup in reverse effect order):
// 1. RAF loop cleanup: cancelAnimationFrame(rafId.current)
// 2. Renderer cleanup: activeRendererRef.current = null; then .destroy()

// The null-guard in the RAF render function is the critical defense:
const render = () => {
  rafId.current = requestAnimationFrame(render);
  const renderer = activeRendererRef.current;
  if (!renderer) return;  // ← This guard is already present; verify it stays
  // ...
};
```

### Loading Timeout Pattern

```typescript
// Source: locked decision — ~10 second timeout

const [loadingTimedOut, setLoadingTimedOut] = useState(false);

useEffect(() => {
  if (isReady || !users.length) {
    setLoadingTimedOut(false);
    return;
  }
  const timer = window.setTimeout(() => setLoadingTimedOut(true), 10_000);
  return () => window.clearTimeout(timer);
}, [isReady, users.length]);

// In JSX, replace the spinner overlay with timeout message:
{!isReady && loadingTimedOut ? (
  <TimeoutOverlay onReload={() => window.location.reload()} />
) : !isReady ? (
  <SpinnerOverlay />
) : null}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Next.js `webpackDevMiddleware` worker | `new Worker(new URL(..., import.meta.url))` with webpack 5 | webpack 5 / Next.js 12+ | Worker bundling now works via standard URL constructor |
| `canvas.getContext("webgl")` explicit cleanup | Canvas 2D contexts are garbage collected by browser | Browser spec | No explicit context destroy needed for Canvas 2D; only relevant for WebGL |
| Manual `b.` strip at call site | Centralized `getAccountId(db)` helper | Phase 1 (this work) | New endpoints automatically get the correct bare UUID |

---

## Open Questions

1. **Does the production worker chunk get a correct public path in Railway?**
   - What we know: The worker is initialized with `new Worker(new URL("./accGraphOrganicLayout.worker.ts", import.meta.url), { type: "module" })` — Next.js 16 webpack should handle this.
   - What's unclear: Railway's deployment URL and whether `next start` infers the correct public path for the worker chunk without explicit configuration.
   - Recommendation: Run `npm run build && npm start` locally before deploying. If the worker chunk has a `/_next/static/chunks/` path in the built output, it will work on Railway (Railway serves static files from the `.next` directory).

2. **Is the "blank canvas on navigation" caused by WebGL context exhaustion or by worker session race?**
   - What we know: `CanvasGraphRenderer` uses Canvas 2D (not WebGL), so WebGL context limits do not apply. The `WebGpuGraphRenderer` is a stub returning null. The worker IS terminated on cleanup.
   - What's unclear: Whether the blank canvas is due to the RAF loop starting before `graphQuery.data` arrives on re-mount (showing the spinner) vs. a true render failure.
   - Recommendation: When verifying FOUND-02, test by navigating away/back 5 times with DevTools open. If the canvas is blank but the spinner is not showing, it's a render failure. If the spinner is showing indefinitely, it's a data fetch / worker session issue.

3. **Should `getAccountId` accept `PrismaClient` or the `ctx.db` type?**
   - What we know: `ctx.db` in the router is typed via tRPC context as the Prisma client instance.
   - What's unclear: Whether extracting to module scope breaks the TypeScript type without importing `PrismaClient` explicitly.
   - Recommendation: Type the parameter as the result of `ReturnType<typeof createContext>["db"]` or use `Parameters<typeof ctx.db.project.findFirst>[0]` to avoid importing Prisma directly. Alternatively, accept the helper inline in each procedure using `ctx.db` directly — simpler and avoids the type inference problem.

---

## Sources

### Primary (HIGH confidence)
- Code analysis of `C:/LECG/Dashboard/app/(dashboard)/users/AccUsersGraph.tsx` — full component, 1421 lines, renderer lifecycle, RAF loop, worker init, readPrecomputedPositions
- Code analysis of `C:/LECG/Dashboard/app/(dashboard)/users/graphRenderers.ts` — CanvasGraphRenderer, destroy(), WebGpuGraphRenderer stub
- Code analysis of `C:/LECG/Dashboard/app/(dashboard)/users/accGraphOrganicLayout.worker.ts` — full worker, session management, d3-force simulation
- Code analysis of `C:/LECG/Dashboard/server/routers/users.ts` — hub ID strip duplication at lines 1042 and 1137
- Code analysis of `C:/LECG/Dashboard/next.config.ts` — no explicit worker webpack config
- Code analysis of `C:/LECG/Dashboard/lib/server/acc-admin.ts` — `accountId` is a parameter (already bare UUID at API boundary)
- `C:/LECG/Dashboard/package.json` scripts: `"build": "next build --webpack"`, `"start": "next start -H 0.0.0.0 --port 3000"`, `"test": "vitest run"`
- `C:/LECG/Dashboard/vitest.config.ts` — test environment: node, globals: true

### Secondary (MEDIUM confidence)
- Next.js 16 webpack worker bundling behavior — inferred from `new Worker(new URL(..., import.meta.url))` pattern and knowledge of webpack 5 asset modules; not verified against Next.js 16 changelogs specifically
- React 19 `useEffect` cleanup ordering — multiple cleanups run in reverse registration order (React docs behavior, consistent across versions)

### Tertiary (LOW confidence)
- Railway deployment public path inference — not verified; based on general Next.js deployment knowledge

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing codebase fully analyzed, no new dependencies
- Architecture patterns: HIGH — all patterns derived from actual source code, not generalizations
- Pitfalls: HIGH (FOUND-01, FOUND-02, FOUND-03) / MEDIUM (FOUND-04 edge cases) — based on code analysis; production worker build not yet empirically confirmed

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (stable stack, 30-day validity)
