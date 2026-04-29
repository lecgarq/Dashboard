---
status: investigating
trigger: "Re-test of 02-05 after commit 900f821 still shows Sim α: 0.000 / 25559 nodes / grey canvas / 0 springs at 25k-node ACC hub"
created: 2026-04-29T00:00:00Z
updated: 2026-04-29T13:30:00Z
---

## Current Focus

hypothesis: SECOND ROOT CAUSE FOUND (drag/pick regression after a8cd0db).
  CosmosGraphRenderer.setSimulationConfig() calls graph.setConfig(partial). Per
  cosmos.gl v3 source (dist/index.js line 5780-5784), setConfig() RESETS the
  config to defaults (ze(this.config)) before applying only the provided keys.
  This wipes enableDrag, onDragStart/End, onPointClick, onBackgroundClick,
  onPointMouseOver/Out — every callback we wired in baseConfig.
  AccUsersGraph calls setSimulationConfig on init (line 689) AND on every
  slider change. So as soon as Cosmos finishes initializing, our drag+pick
  config is wiped. Render-loop fix (a8cd0db) made the sim alive enough to
  notice the dead handlers.
test: Switch setSimulationConfig to use setConfigPartial (which is a partial
  merge per dist/index.js line 5793-5797). Verify that drag and click work.
expecting: After fix, dragging a node yanks it (Cosmos D3 drag fires),
  clicking a node fires onPointClick → onNodeSelectCallback → side panel
  opens, clicking background fires onBackgroundClick → side panel closes.
next_action: Apply targeted edit to setSimulationConfig in graphRenderers.ts,
  run tsc, commit atomically, return checkpoint to user.

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

## Resolution

root_cause: |
  TWO root causes (compounding):
  (1) Render loop dead — fixed in a8cd0db (start→render swap).
  (2) Drag/pick handlers wiped by setConfig destructive merge — addressed by
      switching setSimulationConfig to setConfigPartial. cosmos.gl v3's
      setConfig(t) resets the entire config object to defaults before applying
      provided keys, blowing away enableDrag, onPointClick, onBackgroundClick,
      onDragStart, onDragEnd, onPointMouseOver, onPointMouseOut on every call.
      setSimulationConfig is invoked on Cosmos init and on every slider change.
fix: |
  (1) a8cd0db: render(alpha) replaces start(alpha) at all GPU-physics sites.
  (2) THIS COMMIT: setSimulationConfig prefers setConfigPartial (true partial
      merge) over setConfig (destructive). Fallback to setConfig only when
      setConfigPartial is not exposed (older builds).
verification: TBD — awaiting human-verify after commit (drag a node, click a node, click background)
files_changed:
  - app/(dashboard)/users/graphRenderers.ts (a8cd0db: render swap; this commit: setConfigPartial)
  - app/(dashboard)/users/AccUsersGraph.tsx (instrumentation only — commit 0914b31)
