---
status: fixing
trigger: "Re-test of 02-05 after commit 900f821 still shows Sim α: 0.000 / 25559 nodes / grey canvas / 0 springs at 25k-node ACC hub"
created: 2026-04-29T00:00:00Z
updated: 2026-04-29T00:00:00Z
---

## Current Focus

hypothesis: ROOT CAUSE FOUND — In GPU-physics mode, CosmosGraphRenderer calls graph.start(alpha) to re-warm the simulation but never re-calls graph.render(). Per @cosmos.gl/graph v3 API contract (dist/index.d.ts), start() "only controls the simulation state, not rendering" — only render() spins up the rAF frame loop via startFrames(). Renderer calls render() exactly once during create() with zero data; that loop ends almost immediately (alpha=0 → end() → stopFrames). After that, every re-warm is a dead start() call: simulation state is set but no frames execute → grey canvas, HUD reads progress=0.
test: Replace start(alpha) calls in GPU-physics paths with render(alpha) (link-upload re-warm, drag handlers, setSimulationConfig). Drop the !usePhysics guard on the needsRender→render() block in draw() so physics-mode data uploads also kick the loop.
expecting: After fix, drawing the first frame with data will call render() which calls startFrames() → rAF loop runs → simulation steps fire → α decays from 1 → nodes settle → canvas renders. HUD will show non-zero α and decreasing progress.
next_action: Apply the targeted edit to graphRenderers.ts, run tsc, commit atomically, return checkpoint to user.

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

## Resolution

root_cause: |
  GPU-physics mode never re-spins the @cosmos.gl/graph rAF render loop after the
  initial empty-data render() call. CosmosGraphRenderer.create() calls graph.render()
  once at line 439 with zero points; that triggers startFrames() but the simulation
  immediately ends (alpha=0, no points) and the loop calls stopFrames(). After data
  arrives, the renderer's re-warm path calls graph.start(alpha) — which per v3 API
  docs (and confirmed in dist/index.js line 6398) only sets store.isSimulationRunning=true
  and store.alpha=t. It does NOT call startFrames(). Without startFrames(), the rAF
  loop is dead → no runSimulationStep, no renderFrame, no draw → grey canvas.
  HUD reads graph.progress which the dead loop never updates → shows 0.
  Sites: graphRenderers.ts:579 (link-upload re-warm), :404/:408 (drag handlers),
  :671 (setSimulationConfig), and the !usePhysics guard at :623.
fix: |
  Replace start(alpha) with render(alpha) at all 4 sites in the GPU-physics path,
  and drop the `!this.usePhysics` guard at line 623 so the first data upload in
  physics mode also calls graph.render(). render(alpha) per docs sets alpha AND
  calls startFrames() — single-call API the renderer should have used from the start.
verification: TBD — awaiting human-verify after commit
files_changed:
  - app/(dashboard)/users/AccUsersGraph.tsx (instrumentation only — commit 0914b31)
  - app/(dashboard)/users/graphRenderers.ts (instrumentation only — commit 0914b31; fix pending)
