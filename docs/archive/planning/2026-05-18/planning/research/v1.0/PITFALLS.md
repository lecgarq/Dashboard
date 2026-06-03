# Pitfalls Research

**Domain:** WebGL/Canvas graph renderer + ACC data pipeline in Next.js 16 App Router
**Researched:** 2026-04-28
**Confidence:** HIGH — grounded in actual codebase (`AccUsersGraph.tsx`, `graphRenderers.ts`, `graphSnapshot.ts`, `users.ts` router) plus verified external sources

---

## Critical Pitfalls

### Pitfall 1: Worker Transferable Buffer Aliasing After Transfer

**What goes wrong:**
After posting a `Float32Array` or typed array to the Web Worker with transfer semantics (`postMessage(msg, [buffer])`), the original buffer in the main thread is neutered (length becomes 0, all reads return 0 or throw). Code that holds a reference to the old `Float32Array` and reads from it after the transfer silently reads zeros or crashes.

**Why it happens:**
`accGraphOrganicLayout.worker.ts` receives `positions` and `visibleIndices` as transferable buffers on each `init` message. The main thread immediately creates a new `Float32Array` for `posRef.current`, but if any intermediate reference (e.g., a captured closure in `rebuildGrid` or `hitTest`) still points to the transferred buffer object, it reads from a zeroed-out backing store. This is a silent data corruption — no exception is thrown.

**How to avoid:**
Always assign `posRef.current` from the *worker tick response* (`message.positions`), not from the array that was transferred. The current code does this correctly on tick, but any new code that captures `posRef.current` in a closure must ensure the ref is read at call time (`posRef.current[i]`), not captured at closure creation time. Never cache `const buf = posRef.current` in a scope that spans a worker message boundary.

**Warning signs:**
- All nodes render at position `(0, 0)` after a layout restart
- `hitTest` returns no results even though nodes are visible
- Canvas renders a single blob in the top-left corner

**Phase to address:**
Worker communication refactor phase (before adding any new typed-array paths for Cosmos.gl-style data feeds).

---

### Pitfall 2: Canvas Context Loss on Route Navigation Without Renderer Destroy

**What goes wrong:**
Browsers cap the number of simultaneous WebGL/WebGPU contexts at 8–16. When the user navigates away from `/users` and back, Next.js App Router unmounts and remounts the component. If `destroy()` is not called on both `CanvasGraphRenderer` and `WebGpuGraphRenderer` before unmount, contexts accumulate. Safari loses WebGL context when a canvas element is briefly detached from the DOM during transitions. After 8–16 navigations, the browser silently drops context creation and the canvas renders blank.

**Why it happens:**
The current `useEffect` cleanup in `AccUsersGraph.tsx` does call `canvasRendererRef.current?.destroy()` and `webgpuRendererRef.current?.destroy()`. This works correctly when the effect runs synchronously. The risk is in async initialization: the `void (async () => { ... })()` IIFE for WebGPU initialization captures the `disposed` flag, but if the component unmounts *during* the async `WebGpuGraphRenderer.create()` call, the cleanup runs before the renderer is assigned. The IIFE checks `if (disposed) { renderer?.destroy(); return; }`, which is correct — but only if the `disposed` flag is a simple boolean in closure scope (not a ref), which it is. Verify this pattern is preserved in any refactor.

**How to avoid:**
- Keep the `disposed` flag as a plain boolean inside the `useEffect` closure — not as a `useRef` (refs are mutable across renders and could be stale).
- Always call `renderer.destroy()` in the async path after checking `disposed`.
- Add a `data-testid` attribute to the canvas and write a test that navigates to `/users`, away, and back three times — verifying the renderer count stays at 1.

**Warning signs:**
- Blank graph canvas on second or third visit to the page
- DevTools console: `"WARNING: Too many active WebGL contexts. Older context will be lost."` (Chrome) or `"WebGPU device lost"` (Chrome/Safari)
- `rendererFailureReason` state gets set unexpectedly on a revisit

**Phase to address:**
Foundation phase (renderer lifecycle must be correct before adding Cosmos.gl on top).

---

### Pitfall 3: tRPC `getPrecomputedGraph` Returning `positions: number[]` That Cannot Be Directly Used as `Float32Array`

**What goes wrong:**
`getPrecomputedGraph` returns `positions` as a plain `number[]` from Prisma (stored as a JSON array in PostgreSQL). The client calls `readPrecomputedPositions(graph.positions, rawNodes.length * 2)` which manually copies into a `Float32Array` with a finite-value guard. If a developer adds a new data path that skips `readPrecomputedPositions` and does `new Float32Array(graph.positions)` directly, non-finite values (`NaN`, `Infinity`, `-Infinity`) from a corrupted cache row get loaded into the typed array. The physics worker receives poisoned positions, and the simulation diverges to `Infinity` — all nodes fly off-screen instantly.

**Why it happens:**
Prisma stores `positions` as `Float[]` in the schema (or as JSON). JSON serialization of JavaScript `Infinity` and `NaN` produces `null` in standard JSON. When Prisma deserializes a PostgreSQL `json` column containing nulls back to a JS array, those entries become `null`, which `new Float32Array([null])` converts to `0` — but `JSON.parse(serialized_infinity)` produces `null` which Prisma may store as `0` or leave as `null` depending on column type. The `sanitizeGraphPositions` and `sanitizeGraphNodes` functions in `users.ts` are the correct defense; bypassing them creates silent corruption.

**How to avoid:**
- Never read `graph.positions` without going through `readPrecomputedPositions()` or an equivalent finite-value guard.
- The `sanitizeGraphPositions` function in `users.ts` is the server-side guard; `readPrecomputedPositions` in `AccUsersGraph.tsx` is the client-side guard. Both must remain in place.
- Add a Vitest unit test: given a positions array containing `NaN`, `Infinity`, `-Infinity`, and `null`, `readPrecomputedPositions` must return `null` (fallback), not a corrupted `Float32Array`.

**Warning signs:**
- All nodes render at `(0, 0)` after loading a cached graph
- Physics simulation produces `NaN` velocities on the first tick
- Worker emits `averageVelocity: NaN` in the first few ticks

**Phase to address:**
Data pipeline phase (establish and test the sanitization contract before adding any new position sources).

---

### Pitfall 4: ACC `b.` Hub ID Prefix Stripping Done in Multiple Places

**What goes wrong:**
The ACC Admin API requires bare UUIDs for `accountId`, but the Data Management API (and therefore the `apsHubId` stored in the `Project` table) prefixes hub IDs with `b.`. The strip is currently done inline in every router procedure that reads `apsHubId`:
```
const accountId = project?.apsHubId?.replace(/^b\./, "");
```
If a new procedure (e.g., a dedicated graph refresh endpoint or a future webhooks handler) reads `apsHubId` without stripping, it will receive a persistent `403 Forbidden` from the ACC Admin API that looks like an auth error.

**Why it happens:**
The `b.` stripping is not enforced at the model layer. It is a caller responsibility, replicated three times in `users.ts` alone. Any new developer adding an ACC Admin API call will copy an existing procedure but may not notice the stripping pattern.

**How to avoid:**
Extract `getAccountId(db)` as a shared helper that fetches `apsHubId` from the database and strips `b.` before returning. One call site, one strip, testable in isolation. All new ACC Admin API procedures must use this helper.

**Warning signs:**
- New ACC Admin API calls return `403` or `FORBIDDEN` TRPCError even though credentials are valid
- `toAccRouterError` maps the error to `"forbidden"` code unexpectedly

**Phase to address:**
Backend router phase (before adding any new ACC Admin API endpoints).

---

### Pitfall 5: Web Worker Path Resolution Breaks in Next.js Production Build

**What goes wrong:**
The worker is instantiated with:
```typescript
new Worker(new URL("./accGraphOrganicLayout.worker.ts", import.meta.url), { type: "module" })
```
This pattern relies on Next.js's webpack bundler resolving the `import.meta.url` relative path at build time and emitting the worker as a separate chunk. In development (`npm run dev`), Turbopack handles this differently than webpack in production (`npm run build`). The worker may load correctly in dev but fail silently (the `Worker` constructor throws or the worker script 404s) in the production build.

**Why it happens:**
Next.js uses webpack in production and Turbopack in dev by default. Webpack's `new URL('./worker.ts', import.meta.url)` worker bundling was stabilized but has known edge cases with TypeScript workers and module workers (`{ type: 'module' }`). A known Next.js issue (vercel/next.js#70267) shows that WebGL/worker components that render correctly in `npm run dev` can fail with `npm start` (production mode). The `"use client"` directive does not eliminate this risk — it only controls SSR, not build chunking.

**How to avoid:**
- After any changes to the worker file or its imports, run `npm run build && npm start` and verify the graph loads on the production build before merging.
- If the worker fails to load in production, the fallback is to use `new Worker('/workers/accGraphOrganicLayout.js')` with a manually-copied file in `/public/workers/` — less elegant but 100% reliable.
- Add a CI check that runs `npm run build` and confirms no webpack worker bundling errors.

**Warning signs:**
- Graph renders correctly on `npm run dev` but shows a perpetual loading spinner on `npm start`
- Browser console shows `"Failed to fetch dynamically imported module"` or a 404 for the worker URL
- Worker's `onmessage` handler never fires in production

**Phase to address:**
Foundation phase — verify the production build works before building any features on top of the worker.

---

### Pitfall 6: ACC Bulk Sync Concurrency Limit Is Fragile Under Hub Growth

**What goes wrong:**
`bulkAccSync` uses `pLimit(3)` — 3 concurrent per-user API fan-outs (projects + roles + products). Each found ACC user fans out to up to 3 paginated API calls. With 10 found users at concurrency 3, that is ~30 in-flight requests, which is within APS's rate limits. If the hub grows to 50+ found users, steady-state request rate approaches APS quota limits. The current retry-on-429 logic in the underlying fetcher provides a safety net, but long sync operations will stall waiting for backoff, and the tRPC mutation will eventually time out at the Railway/Vercel function timeout.

**Why it happens:**
`pLimit(3)` was chosen based on the current hub size. The comment in `users.ts` explicitly documents this reasoning. As the organization adds more ACC projects and users, the fan-out per found user grows (more project pages to paginate), compounding the rate-limit risk at the same concurrency level.

**How to avoid:**
- When hub found-user count exceeds 20, reduce `pLimit` to `1` and add a progress endpoint so the UI can show sync status without blocking on a single long tRPC call.
- The correct architecture for large hubs is a background job (Railway cron or a dedicated `/api/acc-sync` endpoint triggered server-side) that writes progress to the DB and exposes a polling query. The tRPC mutation should orchestrate but not block on completion.
- For v1.0 (read-only graph), document the concurrency limit as a known constraint with the threshold at which it becomes a problem.

**Warning signs:**
- `bulkAccSync` mutations take more than 30 seconds
- `errors` count in the sync result is non-zero
- Railway logs show repeated `429` responses from `management.api.autodesk.com`

**Phase to address:**
Data pipeline phase — establish the sync concurrency budget and document the threshold before building the graph UI that triggers syncs.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline `b.` hub ID stripping at each call site | No refactor needed now | 403 errors on any new ACC endpoint that misses the strip | Never — extract a helper now |
| `positions` stored as `Float[]` in Prisma JSON, not a typed binary format | Simple to read/write | Sanitization required on every read path; JSON round-trip loses `NaN`/`Infinity` | Acceptable for v1.0; migrate to binary if position array grows >10k elements |
| `pLimit(3)` hardcoded in `bulkAccSync` | Works for current hub size | Will hit APS rate limits as hub grows; tRPC timeout risk | Document threshold (>20 found users); acceptable for v1.0 |
| Canvas 2D as primary renderer with WebGPU as progressive enhancement | Broad browser support | Canvas 2D will not handle >2000 nodes at 60fps; WebGPU is still experimental in some browsers | Correct approach for v1.0 — explicitly document the node-count ceiling |
| Physics simulation running in worker on every tick, even when graph is stable | Simple to implement | Wasted CPU when `averageVelocity` is near zero | Add auto-pause when `averageVelocity < 0.0001` for several consecutive ticks |
| Graph data stored as plain JSON in `accMemberCache.data` | Easy to query | No schema enforcement; shape drift is invisible until runtime | Acceptable for v1.0; add Zod parse at the router boundary |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| APS Admin API `accountId` | Using the raw `apsHubId` from Prisma (prefixed `b.xxxxxxx`) | Always strip `b.` prefix; extract as a shared `getAccountId(db)` helper |
| APS Admin API — user search | Calling `fetchAccUserByEmail` per user in `bulkAccSync` (O(users × hub_size) API calls) | Prefetch all hub users once with `fetchAllAccUsers`, build a `Map<email, user>`, then do in-memory lookups — already fixed in current code; do not revert |
| tRPC `getPrecomputedGraph` — `positions` field | Using `graph.positions` directly as `Float32Array` | Always pass through `readPrecomputedPositions()` with expected length and finite-value validation |
| Web Worker — transferable buffers | Reading a `Float32Array` after transferring its buffer to the worker | Assign `posRef.current` exclusively from worker tick responses; never read a reference that was transferred |
| Prisma JSON columns for `accGraphLayoutCache.nodes` | Casting Prisma JSON directly to typed interfaces | Use `as unknown as YourType` with runtime validation; the `buildAccGraphSnapshot` return type is authoritative |
| NextAuth session in tRPC `adminProcedure` | Calling ACC Admin API procedures from a `publicProcedure` | All ACC Admin API routes must use `adminProcedure`; the 2-legged token is server-only and must never reach the client |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `rebuildGrid` called on every mouse move during pan | Stuttery pan on large graphs | `rebuildGrid` is already throttled by `isDragging` path, but should only run on pointer-up, not pointer-move | >500 nodes with active filters |
| `filterOptions` useMemo re-derives on every `graphQuery.data` reference change | React re-renders the entire filter panel on each worker tick | Memoize on `graphQuery.data?.dataHash`, not on the full `graphQuery.data` object reference | Any tick frequency >10/s |
| `readPrecomputedPositions` allocates a new `Float32Array` on every data load | GC pause on large graphs | Call it only once per data load, not on every `refreshKey` change | >2000 nodes |
| `buildAccGraphSnapshot` called twice in `getPrecomputedGraph` — once to get `currentDataHash` and once potentially inside `rebuildAccGraphCache` | Double CPU cost on snapshot build | Refactor to build snapshot once and pass through; acceptable for v1.0 given infrequent cache checks | Snapshots >1000 nodes |
| `organicWorkerRef.current.postMessage` sending full position arrays on every `visibility` update | Worker message queue backlog under rapid filter toggling | Debounce filter changes (already done via React state batching); do not send visibility updates more than once per 16ms | Any rapid filter toggle |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing the APS 2-legged token to the client | Token can be used to call any APS endpoint on behalf of the app, including write operations | `get2LeggedAutodeskToken()` is called only in `adminProcedure` server context; never return the token in a tRPC response |
| `saveGraphLayout` accepting client-written positions | Client could inject malformed positions into the `accGraphLayoutCache`, corrupting all users' graph views | Already disabled with `throw new TRPCError({ code: "BAD_REQUEST" })` — do not re-enable; all layout writes must go through `rebuildAccGraphCache` |
| ACC member data in `accMemberCache.data` accessible via `bulkAccSummary` to any admin | Email addresses, project memberships, and role assignments exposed | `bulkAccSummary` is correctly gated to `adminProcedure`; ensure the new graph module route follows the same gate |
| `apsHubId` stored in Prisma `Project` table without validation | A corrupted `apsHubId` causes all ACC API calls to fail with misleading errors | Validate `apsHubId` format (should be UUID after stripping `b.`) at the point of setting it, not at each call site |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state distinction between "graph cache not built" and "data still loading" | User sees a spinner with no actionable path forward | Current code distinguishes `graphCacheNeedsBuild` from loading — preserve this bifurcation in any UI refactor |
| Physics simulation running continuously even on a stable layout | Visible micro-jitter on nodes, distracting for analysis | Implement auto-pause when `averageVelocity < 0.0005` for 5+ consecutive seconds; show "Stable" badge |
| Filter panel appearing over the graph when activated on small screens | Controls obscure the graph on laptops | Filter panel is already positioned left with `w-64`; on screens <1200px this will overlap graph nodes — add `hidden` below a breakpoint with a slide-in alternative |
| Side panel overlapping the controls button (top-right) at small widths | User cannot access controls when a node is selected | Side panel is positioned top-right at `w-72`; controls button is also top-right — they will overlap; move side panel to top-left or add z-index ordering |
| "Rebuild Graph Cache" button fires `rebuildAccGraphCache` then re-fetches, but does not prevent double-click | Two concurrent rebuild mutations can corrupt the `accGraphLayoutCache` singleton | `isRefreshingRef.current` guard already exists; verify it is checked before enabling the button in any new rebuild UI |

---

## "Looks Done But Isn't" Checklist

- [ ] **Worker production build:** Graph worker loads correctly with `npm run build && npm start`, not just `npm run dev`. Verify worker file appears in `.next/` output and loads without 404.
- [ ] **Renderer destroy on unmount:** Navigate to `/users`, then navigate away, then back — verify DevTools shows only one active canvas context, not accumulating.
- [ ] **`b.` strip in all ACC Admin API calls:** Any new procedure reading `apsHubId` must strip the prefix. Verify with a grep: `grep -r "apsHubId" server/` — every hit must be followed by `.replace(/^b\./, "")`.
- [ ] **Position sanitization on all read paths:** Any new code reading `graph.positions` must go through `readPrecomputedPositions()`. Verify no direct `new Float32Array(graph.positions)` calls.
- [ ] **`adminProcedure` gate on all ACC routes:** Run `grep -r "accMember\|accGraph\|acc_admin\|fetchAllAccUsers" server/` — every tRPC procedure touching ACC data must use `adminProcedure`, not `protectedProcedure`.
- [ ] **Filter panel accessible on sub-1280px screens:** Open the graph at 1024px viewport width — verify filter panel does not permanently overlap the canvas.
- [ ] **Physics auto-pause:** After graph stabilizes (`averageVelocity < 0.0005`), CPU usage from the worker thread should drop to near zero. Verify in Task Manager or Chrome DevTools Performance tab.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Worker buffer neutered silently | LOW | Add a guard at the top of `restartOrganicLayout`: if `posRef.current.length === 0` after init, fall back to `computeTopologySeedPositions`; restart the layout session |
| WebGPU contexts exhausted | MEDIUM | Reload the page (context pool is cleared); add `beforeunload` handler that calls `renderer.destroy()` to proactively release contexts |
| `positions` in DB contain non-finite values | LOW | Call `users.invalidateGraphLayout` mutation (already exists), then `users.rebuildAccGraphCache`; this rebuilds from ACC member cache |
| ACC bulk sync times out on Railway | MEDIUM | Break the sync into batches of 10 emails; create a `/api/acc-sync-batch` endpoint that can be called iteratively from the UI with progress tracking |
| `b.` strip missing on a new endpoint | LOW | Add the strip; the error is always `403 FORBIDDEN` with a clear "Account Admin privileges" message — trace back to the `accountId` construction |
| Worker fails to load in production | HIGH | Switch to the `/public/workers/` static file approach: copy the compiled worker to `public/workers/accGraphOrganicLayout.js` as a build step and reference it as `new Worker('/workers/accGraphOrganicLayout.js')` |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Worker buffer neutering | Physics worker phase | Unit test: post init with transfer, verify posRef reads correctly from tick response |
| Canvas context leak on navigation | Foundation / renderer lifecycle | Integration test: navigate away and back 5 times, verify single active context |
| Non-finite positions bypassing sanitization | Data pipeline phase | Vitest: `readPrecomputedPositions` with NaN/Infinity input returns null |
| `b.` prefix missing on new ACC endpoints | Backend router phase | Code review checklist; grep assertion in CI |
| Worker fails in production build | Foundation phase | CI: `npm run build` + smoke test with `npm start` |
| ACC sync timeout on large hubs | Data pipeline phase | Document threshold; test with >20 found users in staging |
| Filter panel / side panel overlap | Graph UI phase | Screenshot test at 1024px viewport width |

---

## Sources

- Codebase: `C:\LECG\Dashboard\app\(dashboard)\users\AccUsersGraph.tsx` — actual renderer lifecycle, worker init, and position read patterns
- Codebase: `C:\LECG\Dashboard\server\routers\users.ts` — ACC Admin API call patterns, `b.` strip, sanitization functions, `pLimit(3)` concurrency
- Codebase: `C:\LECG\Dashboard\lib\acc\graphSnapshot.ts` — position normalization, `normalizeAccGraphPositions`, `buildAccGraphSnapshot`
- [cosmos.gl v2.0 migration notes](https://github.com/cosmograph-org/cosmos/blob/main/cosmos-2-0-migration-notes.md) — Float32Array data format requirements, index-based event handling
- [Next.js WebGL client component production issue](https://github.com/vercel/next.js/issues/70267) — Worker loading difference between `npm run dev` and `npm start`
- [WebGL context loss — Too many active contexts](https://github.com/pmndrs/react-three-fiber/discussions/2457) — Browser limit of 8–16 contexts; importance of `destroy()` on unmount
- [APS rate limiting — Retry-After header](https://aps.autodesk.com/blog/rate-limiting) — APS returns 429 with `Retry-After`; exponential backoff required
- [ACC Admin API — GET Projects and Project Users](https://aps.autodesk.com/blog/acc-admin-api-get-projects-and-project-users) — Pagination patterns, `accountId` format
- [MDN — WebGL context lost event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event) — Context recovery requirements

---
*Pitfalls research for: WebGL/Canvas graph renderer + ACC data pipeline in Next.js 16 App Router*
*Researched: 2026-04-28*
