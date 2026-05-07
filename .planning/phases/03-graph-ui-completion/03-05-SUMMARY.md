---
phase: 03-graph-ui-completion
plan: 05
subsystem: graph-ui
tags: [ui-02, stability-badge, cosmos, gap-closure]
requires:
  - 03-02 (stability badge dual-path detection, reheat wiring, badge JSX)
provides:
  - cosmosReady React state in AccUsersGraph.tsx
  - Cosmos stability polling effect that actually fires post-async-init
affects:
  - app/(dashboard)/users/AccUsersGraph.tsx
tech-stack:
  added: []
  patterns:
    - "Promote async ref-readiness to React state to wake dependent effects (cosmosReady)"
key-files:
  created: []
  modified:
    - app/(dashboard)/users/AccUsersGraph.tsx
decisions:
  - "Used a single boolean state (cosmosReady) rather than a counter or a useSyncExternalStore — the polling effect only needs a true/false edge once per renderer lifetime"
  - "Added belt-and-suspenders null check on cosmosRendererRef.current after the cosmosReady gate (cosmosReady true implies non-null, but the check is cheap and survives concurrent-mode re-runs)"
  - "Did NOT add cosmosReady to the renderer-init useEffect deps — that effect is keyed by renderBackend and re-keying on readiness would loop"
  - "fallBackToCanvas (runtime GPU loss) and synchronous init-failure branch both reset cosmosReady to false — they are distinct call sites covering distinct failure modes (runtime vs. init)"
metrics:
  duration: "~2min"
  completed: "2026-05-07"
  tasks_completed: 3
  files_modified: 1
requirements: [UI-02]
---

# Phase 03 Plan 05: Cosmos Stability Badge Wake-Up Summary

UAT gap 4 closed by promoting Cosmos renderer-init readiness to React state (`cosmosReady`) so the stability-polling effect re-runs when the async `CosmosGraphRenderer.create(...).then(...)` resolves — previously the effect ran once before init completed, saw a null ref, and silently exited for the rest of the session.

## Changes

### Task 1: cosmosReady state + setter call sites

- **Declaration:** `const [cosmosReady, setCosmosReady] = useState(false);` co-located with `isCosmosLoading` (line ~370).
- **setCosmosReady(true):** Inserted immediately after `cosmosRendererRef.current = renderer;` at the previous line ~896 (now ~898), inside the `.then(({ renderer }) => ...)` block.
- **setCosmosReady(false) reset sites (3, all required):**
  1. `fallBackToCanvas` closure (runtime WebGL2 context loss) — after `setRenderBackend("canvas2d")` near line 868.
  2. Synchronous init-failure branch (`if (!renderer)` after `.then` resolves with null) — after `setRenderBackend("canvas2d")` near line 891.
  3. Renderer-init effect cleanup return — after `cosmosRendererRef.current = null;` near line 1024.

Commit: `8066525`

### Task 2: Polling effect deps

- Gate updated from `if (!isReady) return;` to `if (!isReady || !cosmosReady) return;`.
- Deps array final value: `[isReady, isSimStable, cosmosReady]`.
- Body unchanged from 03-02 (alpha < 0.005 + `!isSimulationRunning()` for 500ms, 100ms cadence).
- Added orientation comment in source explaining why `cosmosReady` is in deps.

Commit: `092e7a4`

### Task 3: Badge + reheat wiring verification (read-only)

All checks passed; no code changes:

| Item                                 | Location                | Status |
| ------------------------------------ | ----------------------- | ------ |
| Badge JSX unconditionally rendered   | line 1998-2015          | OK     |
| `isSimStable` opacity toggle present | line 2009               | OK     |
| Reheat: filter-change effect         | line 1358               | OK     |
| Reheat: Cosmos `onNodeSelectCallback` positive index | line 970     | OK     |
| Reheat: Canvas2D drag pointerdown    | line 1531               | OK     |
| Reheat: Canvas2D handlePointerUp positive select | line 1637   | OK     |
| Pan branch — explicit "must NOT reheat" comment    | line 1537-1538 | OK     |
| handleWheel — explicit "must NOT reheat" comment   | line 1642-1643 | OK     |

No reheat call sites missing. No restoration needed.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint -- "app/(dashboard)/users/AccUsersGraph.tsx"` — emits a pre-existing project warning ("File ignored because no matching configuration was supplied" — empty eslint config). Not introduced by this plan; out of scope (see Deferred Issues).

## UAT Re-Test Status

Manual smoke (per plan verification block) is post-execute and requires user action on a WebGL2 browser. The fix is mechanical and the failing path is well-understood; expected outcomes:

- **Gap 4 (Stable badge on Cosmos):** Expected PASS. The polling effect will now run after async init resolves, observe `alpha < 0.005 && !isSimulationRunning()` for 500ms, and flip `isSimStable` to true.
- **Tests 5-7 (previously badge-blocked):** Expected unblocked. Drag/filter/select reheat paths were already wired in 03-02 and verified intact in Task 3.

## Deviations from Plan

None — plan executed exactly as written across all 3 tasks.

## Deferred Issues

- **Pre-existing lint config gap:** `eslint.config.mjs` exports an empty config; `npm run lint` warns "File ignored because no matching configuration was supplied". Not caused by this plan; flagged for a future tooling-cleanup plan.

## Self-Check: PASSED

- File `app/(dashboard)/users/AccUsersGraph.tsx` — modified and verified.
- Commit `8066525` (Task 1) — present in `git log`.
- Commit `092e7a4` (Task 2) — present in `git log`.
- SUMMARY.md — this file.
