# WS2 v1 — Same-user footprint edges (3D)

**Date:** 2026-05-21
**Status:** Approved (design)
**Scope:** Mirror the shipped 2D same-user edges into the 3D renderer (`GraphCanvas3D`).
**Branch:** `feat/access-analysis-redesign`
**Predecessor:** [`2026-05-20-ws2-same-user-edges-design.md`](./2026-05-20-ws2-same-user-edges-design.md) (2D, complete — commit `039f4cc`)

## 1. Goal

The 2D path renders `same-user` chain edges (one node per `(user × project)`,
~16,934 nodes, ~13,567 edges) via cosmos.gl links. WS2 3D adds the same edges to the
**new** three.js renderer `GraphCanvas3D.tsx`, which is currently **points-only** and
receives no link data. The edge set, derivation, and emphasis logic are reused verbatim;
only the 3D rendering surface is new.

> Note: the *old* `threeGraphRenderer.ts` (used by `AccUsersGraph`) already draws edges
> via `LineSegments` + `shouldRender3dEdges`/`get3dEdgeSampleStep`. It is **prior art, not
> the edit target.** WS2 3D edits the access-analysis redesign renderer `GraphCanvas3D.tsx`.

## 2. Non-goals (explicitly deferred)

- New edge types (shared-project / shared-firm / shared-role).
- A DuckDB/Arrow edge table.
- Toolbar edge toggle.
- LOD / edge sampling / `shouldRender3dEdges`-style culling — built only if profiling
  shows pan/zoom degradation.
- Changes to `sameUserEdges.ts` or `linkEmphasis.ts` (reused as-is).
- Changes to the 2D path or node rendering, except the mode-agnostic emphasis push (§6).

## 3. Data threading (the seam)

`GraphCanvas3D` stays REND-04 pure: it receives **precomputed typed arrays only**, never
`SameUserEdge[]` or any data-layer type. The shell already produces everything needed:

- `links` — flat `Float32Array [s0,t0,s1,t1,…]` (index pairs). **Shared verbatim with 2D.**
- per-link RGBA emphasis buffer from `computeLinkEmphasisColors(edges, activeUserIds)`.
  **Also shared with 2D.**

`GraphCanvas.tsx` forwards `links` + `linkColors` to `GraphCanvas3D` (today it forwards them
to `GraphCanvas2D` only). The 3D handle adapts RGBA → vertex-RGB internally. One emphasis
source of truth; no second derivation path in the shell.

## 4. three.js LineSegments architecture (single draw call)

One `THREE.LineSegments(BufferGeometry, LineBasicMaterial)` added to the scene alongside the
node `InstancedMesh`:

- `position` attribute: `Float32Array(edges * 2 * 3)` — 2 endpoints × xyz, allocated **once**.
- `color` attribute (RGB, stride-3): `Float32Array(edges * 2 * 3)`, `vertexColors: true`.
- material:
  ```ts
  new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,          // see §5 — alpha is encoded in RGB; opacity MUST stay 1
    depthWrite: false,
  });
  ```
- `frustumCulled = false`; low `renderOrder` so node spheres draw on top of the lines.
- Built when links first arrive (mount effect, mirroring 2D's init block). `setLinks` is
  exposed on the handle for parity, but in practice the edge set is static for the view, so
  buffers are allocated once.

## 5. RGBA → vertex-RGB premultiplication (the emphasis model)

`LineBasicMaterial` has **no per-edge alpha** (same constraint the renderer already documents
for nodes as Pitfall 6: `MeshBasicMaterial.opacity` is global). Emphasis is therefore encoded
as **per-vertex RGB brightness against the black 3D canvas**, by premultiplying alpha into RGB.

For each link `i` with per-link RGBA `[r, g, b, a]`:

```
vertexRGB = [r * a, g * a, b * a]   // identical on BOTH endpoints → solid segment
```

This reproduces the three tiers as brightness (the canvas is pure black in dark mode — the
locked theme):

- bright ≈ `rgb * 0.85`
- base  ≈ `rgb * 0.10`
- dim   ≈ `rgb * 0.03`

**Critical: `LineBasicMaterial.opacity` MUST be `1`, not an additional dimming factor.**
Because alpha is already baked into RGB, a sub-1 material opacity would *double-attenuate*:
bright would land below its intended level, base would become nearly invisible, and dim
(0.03) could disappear entirely. The material opacity is `transparent: true, opacity: 1`
purely so the premultiplied-vs-black colors blend correctly.

The RGBA→RGB premultiply + per-vertex duplication is **inline arithmetic** in
`GraphCanvas3D` (it takes `Float32Array` → `Float32Array`, imports nothing new) so the
REND-04 purity scan stays green. `countBrightEdges` remains the shared source, so
bright-count semantics are byte-for-byte identical to the 2D path.

## 6. Position updates — same normalized buffer as nodes

Line endpoints must be rewritten from the **same normalized 3D position buffer used to build
the node matrices**, never from stale initial positions. The new renderer uses raw xyz with
**no y-flip** (unlike the old `threeGraphRenderer`), so endpoints land exactly on node sphere
centers.

Inside `pumpPositions3D`, after writing node matrices, rewrite the edge `position` attribute
from that same `xyz` and set `geometry.attributes.position.needsUpdate = true`. Edges follow
the **existing node-write cadence**: the renderer already rewrites all node matrices each tick
with a one-shot `fitView` on freeze, and edges piggyback on that exact gate.

**Acceptance rule:**
- After layout freeze / position normalization, node centers and line endpoints share the
  **same xyz source**.
- The final frozen frame rewrites **both** the node matrices **and** the edge position
  attribute, so static lines match the fitted layout.

Emphasis (color) updates are position-independent and pushed by `GraphInteractions` on focus
change (§7).

## 7. Mode-agnostic emphasis push

`GraphInteractions` already computes the union `activeUserIds = hovered ∪ isolated ∪ lasso`
and one `computeLinkEmphasisColors(edges, activeUserIds)` RGBA buffer. Today the push is gated
`mode === "2d"`, so 3D gets nothing. The effect becomes **mode-agnostic**:

- Push the RGBA buffer to whichever handle is active. Both `GraphCanvas2DHandle` and
  `GraphCanvas3DHandle` expose `setLinkColors(rgba)` with the same per-link RGBA signature
  (the 3D handle expands internally per §5).
- **Always** call `setEdgeTestState({ brightCount: countBrightEdges(edges, activeUserIds) })`
  regardless of mode, so `getBrightEdgeCount()` is correct in 3D.

## 8. Performance (13,567 edges)

- 27,134 vertices → **one draw call**. Position + color buffers ≈ 326 KB each, allocated once
  and mutated in place (no `segments.push` rebuild churn that forced the old renderer's
  sampling).
- Per-tick cost: O(edges) float writes, same order as the node-matrix writes already
  happening each tick — negligible; 60fps expected.
- **No LOD / sampling / `shouldRender3dEdges` in v1.** If profiling later shows pan/zoom
  degradation, the old renderer's `get3dEdgeSampleStep` + drop-during-camera-move is the
  documented fallback lever.

## 9. e2e + bridge coverage

### 3D render state (derived — three.js has no cosmos `renderLinks` config)

`GraphCanvas3DHandle.getRenderState()` returns:

```ts
{
  renderLinks: boolean;          // lineSegments exists && lineSegments.visible === true && linkCount > 0
  linkCount: number;             // edges.length
  hasLineGeometry: boolean;      // BufferGeometry built
  positionAttributeLength: number;
  colorAttributeLength: number;
}
```

`graphTestBridge.getRendererState()` is extended to read the 3D handle in 3D mode (today it
returns `null` unless mode is `2d`).

### Spec assertions (`tests/e2e/acc-dc-graph.spec.ts`), 3D mode

- `renderLinks === true`
- `linkCount === edgeCount`
- `positionAttributeLength === edgeCount * 2 * 3`
- `colorAttributeLength === edgeCount * 2 * 3`
- isolating a node brightens **exactly** that user's footprint edges
  (`getBrightEdgeCount()` equals that user's chain length)
- after clearing isolate/selection/search, `getBrightEdgeCount()` returns to 0
- renderer-independent edge-stat checks reused: `selfEdges === 0`, `duplicates === 0`,
  `danglingEndpoints === 0`, `malformedNodeIds` correct
- existing 3D non-regression checks (node count, no NaN, hover/click) still pass
- attach an `after-edges-3d` proof screenshot

### Unit tests (`GraphCanvas3D.test.ts`)

- Extend the three mock with `BufferGeometry`, `Float32BufferAttribute`, `LineSegments`,
  `LineBasicMaterial`.
- Links set → `LineSegments` created; `positionAttributeLength === edges * 2 * 3`.
- `pushPositions` rewrites edge endpoints from the supplied xyz (endpoints follow nodes).
- `setLinkColors(rgba)` → `colorAttributeLength === edges * 2 * 3`; premultiply correct
  (bright vertex brighter than dim vertex; `rgb * a` math verified like the node alpha test).
- `getRenderState()` reports `renderLinks`, `linkCount`, and attribute lengths correctly.
- Existing REND-04 purity scan still passes (no new forbidden terms; no data-layer import).

## 10. Components & files

| File | Change |
|------|--------|
| `GraphCanvas3D.tsx` | `LineSegments` setup (`opacity:1`); handle `setLinks` / `setLinkColors` (inline RGBA→vertex-RGB premultiply) / `getRenderState`; edge position rewrite in `pumpPositions3D` from the same xyz as node matrices |
| `GraphCanvas.tsx` | forward `links` + `linkColors` props to `GraphCanvas3D` |
| `GraphInteractions.tsx` | emphasis push made mode-agnostic; `setEdgeTestState` called in all modes |
| `graphTestBridge.ts` | `getRendererState()` handles 3D mode; render-state shape extended |
| `GraphCanvas3D.test.ts` | three-mock additions + edge unit tests |
| `tests/e2e/acc-dc-graph.spec.ts` | 3D edge assertions + `after-edges-3d` proof shot |
| `sameUserEdges.ts` | **no change** (reused) |
| `linkEmphasis.ts` | **no change** (reused) |

## 11. Definition of done (commit gate)

Commit `feat(acc-graph): render same-user footprint edges in 3d` only when:

- `GraphCanvas3D` unit tests (including new edge tests) pass (`npm run test`)
- e2e harness passes (`npm run test:e2e`) including the new 3D edge assertions
- existing 2D **and** 3D non-regression checks still pass
- `after-edges-3d` proof screenshot attached
