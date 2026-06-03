---
status: resolved
trigger: "Stable badge still missing on /users in production after 03-05 shipped"
created: 2026-05-06
updated: 2026-05-07
resolved: 2026-05-07
---

## Current Focus

hypothesis: getSimulationAlpha() returns cosmos.gl's `progress` field, but cosmos.gl v3 defines `progress` as 0=start, 1=end (cooled) — INVERTED from the d3-force `alpha` convention (1=hot, 0=cool) the polling effect assumes. Threshold `alpha < 0.005` is therefore satisfied at hot start (progress≈0) and gated only by `isSimulationRunning`, but FAILS once the sim cools (progress climbs toward 1). Badge can never trigger.
test: Read cosmos.gl v3 docs for `progress` semantics; trace getSimulationAlpha → graph.progress; compare with polling threshold.
expecting: docs confirm 0=start/1=end → fix is to either invert the value in getSimulationAlpha (return `1 - progress` so the docstring "1=hot, 0=cool" actually matches), or invert the threshold in the polling effect.
next_action: invert getSimulationAlpha to return `1 - progress`; verify polling, HUD, and badge JSX still wired to the d3 semantic.

## Symptoms

expected: After /users loads on a WebGL2 machine and the Cosmos GPU sim cools (alpha < 0.005, !isSimulationRunning), a "Stable" badge should fade in (badge JSX at AccUsersGraph.tsx:~2076-2092).
actual: Badge never appears in production after 03-05 shipped, even after sim has visibly settled.
errors: None reported in console.
reproduction: Open /users on WebGL2-capable browser (default Cosmos backend), wait for sim to settle (no drag, no filter changes).
started: Original report pre-03-05; 03-05 shipped (commits 8066525, 092e7a4) but UAT after still fails.

## Eliminated

- hypothesis: 03-05 cosmosReady fix not actually shipped or not in deps array.
  evidence: Read AccUsersGraph.tsx:374-378 (cosmosReady state declared), :906-908 (setCosmosReady(true) immediately after ref assignment), :1190 (`if (!isReady || !cosmosReady) return;`), :1213 (`}, [isReady, isSimStable, cosmosReady]`). All three change sites for setCosmosReady(false) present (:877, :900, :1040). 03-05 fix is correctly in place.
  timestamp: 2026-05-07

- hypothesis: Polling effect never installs setInterval after cosmosReady flips.
  evidence: Effect body unchanged from 03-02; gate is `if (!isReady || !cosmosReady) return;` then non-null cosmos check, then `window.setInterval(..., 100)`. With cosmosReady true and ref non-null after :906-908, setInterval will install. No conditional return between gate and setInterval.
  timestamp: 2026-05-07

- hypothesis: resetStability called continuously by an unintended drag/filter/select listener.
  evidence: resetStability call sites: :973 (Cosmos onNodeSelectCallback positive index — only on click), :1364 (filter change effect — only on filters change), :1578 (Canvas2D drag — gated, also Cosmos rare path), :1684 (Canvas2D handlePointerUp — Canvas2D only). None fire continuously. Pan/zoom branches have explicit "must NOT reheat" comments and DO NOT call resetStability.
  timestamp: 2026-05-07

- hypothesis: Badge JSX not wired to isSimStable.
  evidence: AccUsersGraph.tsx:2076 `aria-label={isSimStable ? "Graph stable" : "Graph updating"}`, :2083 `isSimStable ? "opacity-100" : "opacity-0 pointer-events-none"`. Wiring correct.
  timestamp: 2026-05-07

## Evidence

- timestamp: 2026-05-07 (re-investigation start)
  checked: AccUsersGraph.tsx polling effect (:1189-1213) and setCosmosReady call sites
  found: 03-05 fix verified in place. Polling effect WILL install once cosmosReady flips true. Threshold logic: `const stableNow = alpha < 0.005 && !running;`
  implication: The wake-up bug is fixed. The badge still not appearing means a different mechanism — either the threshold never triggers, or running stays true forever.

- timestamp: 2026-05-07
  checked: graphRenderers.ts:1148-1159 (getSimulationAlpha and isSimulationRunning impls)
  found: `getSimulationAlpha()` reads `(this.graph as { progress?: number }).progress` and returns it (or 0 if undefined). Docstring claims "1=hot, 0=cool" (d3 convention). HUD at AccUsersGraph.tsx:1069 / :2117 displays this raw value as "Sim α".
  implication: If the docstring is right, threshold `alpha < 0.005` is correct. If the implementation pulls cosmos's actual `progress` field, semantics depend on cosmos.gl v3.

- timestamp: 2026-05-07
  checked: cosmos.gl v3 official docs (Cosmograph API + cosmos.gl storybook) for `progress` semantics.
  found: "The current progress of the simulation, where 0 represents the start of the simulation and 1 represents the end, or undefined if not available." — INVERTED from d3-force alpha. cosmos.gl progress climbs from 0 (hot/start) → 1 (cool/end).
  implication: SECOND ROOT CAUSE FOUND. `getSimulationAlpha()` returns cosmos's progress directly; the docstring inside getSimulationAlpha lies. The polling threshold `alpha < 0.005` is satisfied transiently at hot startup (gated by isSimulationRunning=true so stableNow=false), but once the sim cools, progress is near 1, so `alpha < 0.005` is FALSE forever. The badge cannot fire.

- timestamp: 2026-05-07
  checked: Existing perf-HUD readouts of "Sim α" via getSimulationAlpha()
  found: User-visible HUD already displays the raw value. If the user has previously observed it climbing 0→1 during graph cool-down, that confirms the inversion at runtime. (Footnote in original debug file already flagged "?? 1 / ?? true defaults could mask API drift" — that intuition was correct; this is the drift.)
  implication: A safe fix is to make `getSimulationAlpha()` actually conform to its docstring (return `1 - progress` clamped to [0,1]). Polling threshold and HUD display stay semantically consistent ("1=hot, 0=cool" everywhere), and downstream code is unchanged.

## RE-INVESTIGATION 2026-05-07 (post-03-05 fix)

### Hypothesis-by-hypothesis recap

Per the investigation_hints in the re-spawn brief, all six leads were checked:

1. **cosmosReady wiring** — VERIFIED CORRECT. State declared (:378), set to true at :908 immediately after ref assignment, set to false at all 3 documented teardown/failure sites (:877, :900, :1040), and present in the polling effect's deps (:1213). Gate at :1190 is `if (!isReady || !cosmosReady) return;`.

2. **Polling effect installs setInterval after cosmosReady flips** — YES. Effect body has no other early returns once past the cosmosReady gate; `window.setInterval(..., 100)` is unconditional thereafter.

3. **getSimulationAlpha / isSimulationRunning return-types** — `getSimulationAlpha()` reads `graph.progress` (cosmos.gl v3 field). `isSimulationRunning()` reads `graph.isSimulationRunning` as a boolean property. Both API methods exist on cosmos.gl Graph in v3.

4. **Threshold reachable for 25k-node hub** — NO. Not because the sim is too active, but because the **field semantic is inverted**. `progress` in cosmos.gl v3 = 0 (start) → 1 (end/cooled). The polling check `alpha < 0.005` reads this raw progress value. At cool, progress≈1 → check is false. Badge never flips.

5. **resetStability mis-firing** — Ruled out. All 4 call sites are user-action-bound, none are in a frame loop.

6. **Badge JSX wiring** — Ruled out. Correctly bound to `isSimStable`.

### Second Root Cause

`app/(dashboard)/users/graphRenderers.ts:1148-1153` — `CosmosGraphRenderer.getSimulationAlpha()` returns cosmos.gl v3's `graph.progress` directly. Per cosmos.gl docs, `progress` is **0 at start, 1 at end** (the simulation's completion percentage), the OPPOSITE of d3-force's `alpha` (1=hot, 0=cool) the docstring claims and the polling effect at AccUsersGraph.tsx:1197 assumes.

The 03-05 wake-up fix was necessary but not sufficient. Even with the polling effect now firing post-init, its threshold `alpha < 0.005` evaluates against cosmos's progress-toward-completion, which climbs from 0 to 1 — the threshold can never be true once the sim has actually cooled.

The original debug file's footnote anticipated this: *"the `?? 1` / `?? true` defaults could mask API drift."* That suspicion was right; this is the drift. The `?? 1` default in the polling effect is now also slightly wrong (a missing implementation should be treated as "hot" under the new semantic, which `?? 1` does correctly — keep that default; only the field interpretation needs to change).

### Fix

Make `getSimulationAlpha()` actually conform to its own docstring ("1=hot, 0=cool"):

```ts
getSimulationAlpha(): number {
  if (!this.graph || !this.usePhysics) return 0;
  const value = (this.graph as { progress?: number }).progress;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  // cosmos.gl v3: progress is 0=start, 1=end. Invert + clamp to match the
  // d3-force alpha convention every caller in this codebase assumes.
  const inverted = 1 - value;
  return inverted < 0 ? 0 : inverted > 1 ? 1 : inverted;
}
```

Why this and not invert the threshold in AccUsersGraph.tsx:
- HUD `Sim α` readout uses the same getter (:1069, :2117). Inverting at the source keeps HUD semantically consistent ("1=hot, 0=cool") and matches the existing label "α" (d3 convention).
- Single-site fix; threshold check at :1197 stays readable.
- Default `?? 1` (hot) on polling and `?? 0` (cool) on HUD remain correct under the d3 convention.

## Resolution

root_cause: TWO root causes (sequential): (1) Cosmos polling effect's `[isReady, isSimStable]` deps didn't re-trigger after async renderer init — fixed in 03-05 via cosmosReady state. (2) `CosmosGraphRenderer.getSimulationAlpha()` returns cosmos.gl v3's `progress` field, whose semantic is INVERTED from the d3 `alpha` convention the rest of the codebase assumes — `progress=1` means cooled, but threshold `alpha < 0.005` expects 0=cooled. Polling now fires correctly but threshold can never be true.
fix: graphRenderers.ts:1148-1153 — return `1 - progress` (clamped to [0,1]) so the getter actually conforms to its docstring and to all callers' expectations.
verification: TypeScript build clean expected; HUD `Sim α` will now read 1.0 at hot, fall to ≤0.005 when cool. Badge will fade in 500ms after cool. User must confirm on WebGL2 browser.
files_changed:
  - app/(dashboard)/users/graphRenderers.ts (getSimulationAlpha returns 1 - progress)

## RESOLUTION

**Resolved:** 2026-05-07
**Commit:** `5b14ae9` "fix(stable-badge): invert cosmos.gl progress to match d3 alpha convention"
**Branch:** deploy (Railway auto-deploy)

### UAT Confirmation (production, Railway, Firefox WebGL2/Cosmos path)

- Nodes render: 23,889 visible
- Avg velocity: 0.000000 (sim fully settled)
- Cosmos `Sim α` HUD readout: 0.0000 (post-fix d3 convention — cooled = 0, as the docstring claimed all along)
- **Stable badge appears** top-right when sim is at rest

### Notes

- Earlier "no nodes appear" report during this session was Railway deploy lag (old bundle still cached); recovered automatically once new bundle loaded.
- The 03-05 `cosmosReady` wake-up fix was necessary but not sufficient. The semantic-inversion bug in `getSimulationAlpha()` was the second root cause and only became visible after 03-05 unblocked the polling effect.
- New technical debt logged as TD-008 in `.gsd/TECHNICAL_DEBT.md` (cosmos.gl getter return-type contract — implicit assumption that cosmos.gl field semantics match d3 conventions).
