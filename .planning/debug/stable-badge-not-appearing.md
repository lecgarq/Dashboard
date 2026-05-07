# Stable Badge Not Appearing — Root Cause

## ROOT CAUSE FOUND

### Debug Session
Investigation of UI-02 stability badge missing on `/users` in production. Default renderer on WebGL2-capable machines is Cosmos (AccUsersGraph.tsx:345-347), so the Cosmos detection path is the relevant one for the user's report.

### Root Cause
`app/(dashboard)/users/AccUsersGraph.tsx:1170-1194` — the Cosmos stability-polling effect captures `cosmosRendererRef.current` synchronously at effect-run time and bails out if it is null, but its dependency array `[isReady, isSimStable]` does NOT include any signal that fires when the Cosmos renderer is later assigned. As a result, the polling interval is never installed in the common production timing where `isReady` flips before `CosmosGraphRenderer.create(...)` resolves.

```
useEffect(() => {
  if (!isReady) return;
  const cosmos = cosmosRendererRef.current;
  if (!cosmos) return;          // <-- silent early return
  ...
  const id = window.setInterval(...)
  return () => window.clearInterval(id);
}, [isReady, isSimStable]);     // <-- no re-trigger when renderer arrives
```

### Evidence
1. **Async renderer assignment after isReady.** `CosmosGraphRenderer.create(...)` is awaited inside a `.then()` (AccUsersGraph.tsx:885-896); `cosmosRendererRef.current = renderer` only runs after the promise resolves. Meanwhile the data-load effect calls `setIsReady(true)` at line 1314 in its own synchronous pass — typically before Cosmos creation completes (it's async + fetches WebGL pipeline). The polling effect therefore runs once with `cosmosRendererRef.current == null` and exits.

2. **Canvas2D fallback path also dead in Cosmos mode.** The Canvas2D detector at line 1138-1165 watches `motionMetric.averageVelocity`, but that metric is only fed by the organic-layout worker's `tick` messages (line 1100-1111). The worker effect at line 1080-1083 explicitly returns early when `renderBackend === "cosmos"`, so `hasReceivedTickRef.current` is never set to `true` and `motionMetric.averageVelocity` stays at its initial value. The guard `if (!isReady || !hasReceivedTickRef.current) return;` at line 1139 holds permanently. This eliminates the fallback that would otherwise mask the Cosmos-path bug.

3. **Badge state never flips.** With both detection paths inert, `setIsSimStable(true)` is never called, so the badge JSX at line 1986-2002 stays at `opacity-0 pointer-events-none`. JSX is unconditionally rendered (no feature flag), confirming the issue is the state flag, not the tree.

### Files
- `app/(dashboard)/users/AccUsersGraph.tsx:1170-1194` — Cosmos polling effect (root cause)
- `app/(dashboard)/users/AccUsersGraph.tsx:885-896` — async renderer assignment
- `app/(dashboard)/users/AccUsersGraph.tsx:1080-1132` — worker effect skipped in Cosmos mode
- `app/(dashboard)/users/AccUsersGraph.tsx:1138-1165` — Canvas2D detector (gated by tick guard)
- `app/(dashboard)/users/AccUsersGraph.tsx:345-347` — default `renderBackend = "cosmos"` when WebGL2 available

### Suggested Fix Direction
Make the Cosmos polling effect re-run when the renderer becomes available. Two viable shapes:
- Promote `cosmosRendererRef` to state (or add a `cosmosReady` boolean state set right after `cosmosRendererRef.current = renderer` at line 896) and add it to the effect's dependency array.
- Or, inside the effect, replace the early `return` with a short-poll wait-loop that defers `setInterval` setup until `cosmosRendererRef.current` is non-null (cleaner: a small `setTimeout` retry until ready, then start the 100ms poll).

Either fix should be paired with a sanity check that `getSimulationAlpha()` and `isSimulationRunning()` actually report the expected values once attached — those methods exist (graphRenderers.ts:928, 935) so the `?? 1` / `?? true` defaults aren't the active failure, but they would mask any future API drift.
