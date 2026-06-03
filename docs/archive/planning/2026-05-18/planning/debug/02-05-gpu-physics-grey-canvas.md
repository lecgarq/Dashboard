---
status: awaiting_human_verify
trigger: "Re-test of 02-05 after commit 900f821 still shows Sim α: 0.000 / 25559 nodes / grey canvas / 0 springs at 25k-node ACC hub"
created: 2026-04-29T00:00:00Z
updated: 2026-04-29T16:35:00Z
---

## Current Focus

hypothesis: THIRD ROOT CAUSE FOUND (slider + deselect regression after a6afd2e).
  Cosmos's render(alpha) re-warms `store.alpha` and re-spins the rAF loop, but
  it does NOT set `store.isSimulationRunning = true`. Only start(alpha) flips
  that flag (dist/index.js:6398). After the initial 25k-node sim cools to
  alpha < ALPHA_MIN, Cosmos's frame() calls end() (line 6573-6611) which sets
  `isSimulationRunning = false`. From then on, runSimulationStep() (line 6553)
  early-exits whenever isSimulationRunning is false → forces are not
  recomputed. Calling render(0.3) after a slider change pumps the loop and
  uploads new config, but `runSimulationStep` skips the force pass → no
  visible motion. Same story for onDragEnd: render(0.05) doesn't reheat the
  sim, so a dropped node just hangs.
test: Add graph.start(alpha) BEFORE graph.render(alpha) at every re-warm
  site (onDragStart, onDragEnd, link-arrival re-warm, setSimulationConfig).
  start() sets isSimulationRunning=true + store.alpha=alpha; render() pumps
  the rAF loop. Both are needed.
expecting: After fix, slider scrub visibly perturbs the graph (alpha=0.3 →
  forces re-evaluate against new repulsion/linkDistance/cluster); released
  drags settle smoothly; click-on / click-off both reheat enough to let the
  same-user highlight refresh and settle without visible drift.
next_action: Edit graphRenderers.ts: pair start(alpha) with render(alpha) at
  4 sites. tsc-clean, atomic commit, return human-verify checkpoint.

## Symptoms

expected: 25k-node ACC hub renders an interactive force-directed layout within ~5s, Sim α decays from ~1 to <0.1, status bar shows non-zero springs, sliders responsive.
actual: Identical post-fix as pre-fix — `Sim α: 0.000 / 25559 nodes`, grey canvas, 0 springs reported, no nodes visible.
errors: None reported (no console errors mentioned).
reproduction: Visit `/users?perf=1` on the real production ACC hub (25,559 nodes after 900f821 — was 25,602 earlier; node count drift unrelated).
started: Reported as "exactly the same" after re-test post-900f821 — was already broken in e840613.

## Eliminated

- hypothesis: H1 fix didn't land
  evidence: 0914b31 instrumentation log shows all 900f821 code paths execute; baseConfig logs correct simulation* keys; PATH-B builds 60814 projected links from 128214 topology rows.
  timestamp: 2026-04-29T00:00:00Z
- hypothesis: H2 stale bundle
  evidence: User did hard reload + cleared .next cache; instrumentation events fire in the expected order.
  timestamp: 2026-04-29T00:00:00Z
- hypothesis: H3 link-projection paths skipped
  evidence: PATH-B fires with linkCount=60814; setLinks reaches Cosmos in draw().
  timestamp: 2026-04-29T00:00:00Z
- hypothesis: H4 Cosmos API key drift on simulation config
  evidence: setConfig({simulationRepulsion, simulationLinkDistance, simulationLinkSpring, simulationCluster}) returns without throwing; baseConfig logs back the documented v3 keys.
  timestamp: 2026-04-29T00:00:00Z
- hypothesis: H7 usePhysics false at runtime
  evidence: Logged usePhysics=true at every checkpoint (Graph create, data-load, draw, setInitialPositions).
  timestamp: 2026-04-29T00:00:00Z

## Evidence

- timestamp: 2026-04-29T00:00:00Z
  checked: git show 900f821 (full diff)
  found: Diff matches commit message exactly. Files touched: AccUsersGraph.tsx (+21 lines), cosmosUtils.test.ts (+61), cosmosUtils.ts (+49), graphRenderers.ts (+12). Two link-projection sites added: line 665 (renderer-init .then) and line 938 (data-load effect). graph.start(1.0) added in draw() at line 549 when usePhysics && linkCount goes 0→N. fitView(800) added on first physics-mode load.

- timestamp: 2026-04-29T00:00:00Z
  checked: AccUsersGraph.tsx data flow: order between renderer-init effect and data-load effect.
  found: Two paths to populate linksRef in GPU mode:
    Path A (line 665-671): Inside CosmosGraphRenderer.create().then() — runs when Cosmos finishes init. Gated by `nodesRef.current.length > 0 && nodeIndexMapRef.current.size > 0`.
    Path B (line 924-944): Inside data-load useEffect keyed on [users, graphQuery.data, ...]. Gated by `usePhysicsRef.current && cosmosRendererRef.current`.
  implication: Both paths LOOK correct. On any ordering (data-then-cosmos, cosmos-then-data), one of the two should fire. A silent failure mode would require a third condition where neither path runs — possible if usePhysicsRef.current is false at the time the data-load effect runs (Cosmos hasn't completed init yet) AND nodesRef.current is empty when the renderer .then() callback fires (data effect hadn't computed it yet) AND the data effect doesn't re-run after Cosmos finishes. That can happen if `users` and `graphQuery.data` references don't change after Cosmos resolves — the data effect won't re-fire.

- timestamp: 2026-04-29T00:00:00Z
  checked: buildAccTopologyGraph link shape vs projectTopologyLinksToIndexPairs lookup.
  found: Topology links have source=node-id (user id), target=hub-id ("hub:role:..."). projectTopologyLinksToIndexPairs looks up link.source in nodeIndexById — correct mapping (matches worker's buildProjectedLinks). No mismatch.
  implication: Index/data shape is correct. Not H5 (out-of-range indices) on its face.

- timestamp: 2026-04-29T00:00:00Z
  checked: fitView call at end of draw() when usePhysics && first physics load.
  found: Triggers only when `isFirstLoad = lastNodeCount === 0 && nodeCount > 0` — i.e. exactly once on the frame where node count goes 0→N. After that, fitView never runs again from draw() — even when links arrive on a later frame and graph.start(1.0) re-warms.
  implication: If links arrive on a frame AFTER the first-node-count-frame, the camera was framed for the seeded positions — but if no positions were ever seeded (setInitialPositions wasn't called or posRef was empty), Cosmos uses random initial positions and fitView frames a wider range. Could explain "grey canvas" if initial Cosmos random positions land in [-spaceSize/2, spaceSize/2] = [-2048, 2048] and fitView is run too early relative to that.

- timestamp: 2026-04-29T13:30:00Z
  checked: cosmos.gl v3 setConfig vs setConfigPartial (dist/index.js line 5780-5797).
  found: setConfig(t) does `ze(this.config)` (Object.assign defaults) then `Y(this.config, t)` (apply provided keys). It RESETS the config and then merges. setConfigPartial(t) does only `Y(this.config, t, !0)` — partial merge that preserves untouched keys.
  implication: graphRenderers.ts:677 calls graph.setConfig(partial) inside setSimulationConfig. AccUsersGraph calls setSimulationConfig on Cosmos init (line 689) AND every slider change (line 494, 967). Each call resets enableDrag → false, onDragStart/End → undefined, onPointClick/onBackgroundClick → undefined, onPointMouseOver/Out → undefined. Drag and pick die immediately after the first slider apply on init. Render-loop fix (a8cd0db) made sim alive — exposed dead handlers.

- timestamp: 2026-04-29T16:30:00Z
  checked: cosmos.gl v3 start vs render vs runSimulationStep gating (dist/index.js 6033-6053, 6396-6398, 6537-6539, 6551-6562, 6571-6577, 6605-6612).
  found:
    1. start(alpha) sets `store.isSimulationRunning = true` and `store.alpha = alpha`. Does NOT touch the rAF loop.
    2. render(alpha) calls update(alpha) (which sets store.alpha but NOT isSimulationRunning) and startFrames(). Does NOT call start(); does NOT set isSimulationRunning.
    3. frame() (rAF body, line 6571-6577): when `alpha < K && isSimulationRunning`, calls end().
    4. end() (line 6609-6611): sets `isSimulationRunning = false, simulationProgress = 1`. The rAF loop continues to schedule, but each tick early-exits the simulation step.
    5. runSimulationStep(t) (line 6551-6562): with t=false (the default from renderFrame), the entire force pass is gated on `(t || n && !zoomBusy)` where n=isSimulationRunning. With n=false the force computations never run → no motion.
  implication: After the initial 25k-node sim cools to ALPHA_MIN, end() flips isSimulationRunning to false. From then on, ANY render(alpha) call pumps the rAF loop and updates `store.alpha`, but the per-frame gate keeps forces dormant. Slider changes mutate this.config.simulation* (because setConfigPartial works), but the forces are never re-evaluated. Drag onDragEnd render(0.05) likewise doesn't restart the sim — drag drops have no settle. The fix is to pair start(alpha) + render(alpha) at every re-warm site so the flag is set AND the loop runs.

## Resolution

root_cause: |
  THREE root causes (compounding):
  (1) Render loop dead — fixed in a8cd0db (start→render swap).
  (2) Drag/pick handlers wiped by setConfig destructive merge — fixed in
      a6afd2e (setConfigPartial swap).
  (3) Sim run-flag not re-armed on re-warm — addressed by THIS commit.
      Cosmos's render(alpha) sets store.alpha and calls startFrames(), but
      does NOT set store.isSimulationRunning. Once the initial sim cools
      below ALPHA_MIN, frame() invokes end() which sets isSimulationRunning=false.
      From then on, runSimulationStep early-exits the force pass — sliders
      mutate config values that are never read by a force, drag drops never
      settle, and the canvas appears static even though render(alpha) is
      pumping the loop. Fix: pair start(alpha) (which DOES set the run flag)
      with render(alpha) at every re-warm site.
fix: |
  (1) a8cd0db: render(alpha) replaces start(alpha) at all GPU-physics sites.
  (2) a6afd2e: setSimulationConfig prefers setConfigPartial (true partial merge).
  (3) THIS COMMIT: pair graph.start(alpha) + graph.render(alpha) at all four
      re-warm sites — onDragStart, onDragEnd, link-arrival re-warm in draw(),
      and setSimulationConfig. start() arms isSimulationRunning; render()
      pumps the rAF loop. Both are required after a previous end() call.
verification: TBD — awaiting human-verify after commit (slider scrub visibly perturbs layout; drag drop settles; click-off normalizes)
files_changed:
  - app/(dashboard)/users/graphRenderers.ts (a8cd0db: render swap; a6afd2e: setConfigPartial; this commit: start+render pairing)
  - app/(dashboard)/users/AccUsersGraph.tsx (instrumentation only — commit 0914b31)
