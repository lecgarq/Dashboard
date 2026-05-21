# WS2 v1 — Same-user footprint edges (2D)

**Date:** 2026-05-20
**Status:** Approved (design)
**Scope:** First concrete shared-attribute edge type for the Access Analysis spatial graph.
**Branch:** `feat/access-analysis-redesign`

## 1. Goal

Each graph node is one **(user × project)** pair (`nodeId = userId::projectId`), ~16,934 nodes.
WS2 v1 adds the first concrete edge type: **`same-user`** — connect the nodes that belong to
the same Autodesk identity across projects, revealing each user's cross-project footprint
(multi-project spread, duplicated access, inactive users still present in many projects).

Edges are a deterministic function of the existing node list. No abstract similarity, no cliques.

## 2. Non-goals (explicitly deferred)

- 3D edges (separate follow-up commit; 3D stays points-only, non-regressed, until 2D lands).
- Shared-project / shared-firm / shared-role edges (need aggregation/capping first).
- A DuckDB/Arrow edge table (derive client-side; add SQL tables only when SQL analytics need them).
- Toolbar edge toggle.
- LOD perf guard — built only if the perf/e2e check shows pan/zoom degradation.

## 3. Edge derivation (pure, client-side)

New file: `app/(dashboard)/users/access-analysis/sameUserEdges.ts`. No React/DOM/DuckDB imports.

```ts
export interface ParsedNodeId { userId: string; projectId: string }
/** Split on the FIRST "::". Returns null for malformed ids (no "::"). */
export function parseNodeId(nodeId: string): ParsedNodeId | null

export interface SameUserEdge {
  sourceIndex: number;   // index into the SAME nodeIds array cosmos uses
  targetIndex: number;
  sourceNodeId: string;
  targetNodeId: string;
  userId: string;
  edgeType: "same-user";
}

export interface DeriveResult {
  edges: SameUserEdge[];
  malformedCount: number;        // nodeIds with no "::"
  duplicateCount: number;        // nodeIds seen more than once
  distinctUsersWithEdges: number;
}
export function deriveSameUserEdges(nodeIds: readonly string[]): DeriveResult
```

Rules:
- `parseNodeId` is the **single shared parser** used by edges, hover, isolate, and selection
  so userId extraction is consistent everywhere.
- Group node indices by `userId`; drop groups with < 2 nodes.
- Sort each group deterministically by `nodeId`, emit **chain** edges only
  (`node[i] → node[i+1]`). No cliques, no self-edges, no duplicate edges.
- Skip malformed nodeIds (count them in `malformedCount`).
- Detect duplicate nodeIds and report `duplicateCount`; duplicates must NOT silently create
  invalid chains (dedupe by nodeId before chaining; first occurrence wins).

Edge-count invariant: `edges.length === Σ(projectCountForUser − 1)` over users with ≥ 2 nodes
(equivalently `nodeIds.length − distinctUsers − droppedForMalformedOrDup`).

### Unit tests (`sameUserEdges.test.ts`)
- one user / one project → 0 edges
- one user / three projects → 2 chain edges (correct consecutive pairs)
- two users with multiple projects → two separated chains, no cross-user edges
- malformed nodeIds skipped, `malformedCount` correct
- duplicate nodeIds reported in `duplicateCount` and do not corrupt chains
- deterministic output order across runs
- no duplicate edges, no self-edges
- `parseNodeId` splits on first "::" and returns null for malformed input

## 4. Rendering (2D, cosmos.gl) — preserves REND-04 renderer purity

The renderer receives precomputed arrays only; it computes no edge logic.

- `GraphCanvas2D`: set `renderLinks: true`. Handle gains:
  - `setLinks(links: Float32Array)` — flat pairs `[s0,t0,s1,t1,...]` (cosmos API is `Float32Array`).
  - `setLinkColors(rgba: Float32Array)` — RGBA per link `[r,g,b,a, ...]`.
- Dev/runtime assertions before pushing to cosmos:
  - `links.length === edges.length * 2`
  - `colors.length === edges.length * 4`
- On ready, the shell-supplied edges are set once (`setLinks`) with a **base low-alpha** color
  (subtle always-on). Frozen mode → links are visual only, no link force, no layout perturbation.

### Active-user emphasis
Lives in `GraphInteractions` (where hover/isolate/lasso state already is). Pure helper:

```ts
computeLinkEmphasisColors(
  edges: SameUserEdge[],
  activeUserIds: ReadonlySet<string>,
  opts: { base: RGBA; bright: RGBA; dim: RGBA },
): Float32Array
```

`activeUserIds` is a **union** of:
- hovered node's userId,
- isolated/clicked node's userId,
- all userIds in the lasso/selection set.

Coloring:
- focus active (set non-empty): edge.userId ∈ active → **bright**; else → **dim**.
- no focus (empty set): all edges → **base** subtle opacity.

`GraphInteractions` recomputes on any focus change and calls `handle.setLinkColors`. Mirrors the
existing node alpha-mask pattern, one layer over.

## 5. Performance

- Edge count ≈ `nodeIds.length − distinctUsers` → tens of thousands; within cosmos GPU link budget.
- No link force (frozen). Emphasis is an O(edges) color recompute on focus change.
- LOD guard deferred. If perf fails: drop global edges during active drag/zoom, reveal after
  settle, always keep active-user edges. Not in v1.

## 6. e2e coverage (extends the harness, 2D)

Bridge (`graphTestBridge.ts`) additions:
- `getEdgeStats()` → `{ count, selfEdges, duplicates, danglingEndpoints, malformedNodeIds, distinctUsersWithEdges }`
- `getBrightEdgeCount()` → number of currently-brightened edges

Spec assertions (`acc-dc-graph.spec.ts`):
- edge count > 0
- `selfEdges === 0`, `duplicates === 0`, `danglingEndpoints === 0` (all endpoints valid indices)
- link layer is rendered (renderLinks on / links set)
- isolating a node brightens **exactly** that user's footprint edges (`getBrightEdgeCount()` equals
  that user's chain length)
- after clearing isolate/selection/search, `getBrightEdgeCount()` returns to 0 / base state
- all existing 2D checks (16,934 nodes, no NaN, hover/click/filter/search/lasso) still pass
- attach an `after-edges` proof screenshot

## 7. Components & files

| File | Change |
|------|--------|
| `sameUserEdges.ts` | NEW — `parseNodeId`, `deriveSameUserEdges` (pure) |
| `sameUserEdges.test.ts` | NEW — unit tests above |
| `linkEmphasis.ts` | NEW — `computeLinkEmphasisColors` (pure) |
| `GraphCanvas2D.tsx` | `renderLinks:true`; handle `setLinks` + `setLinkColors`; dev assertions |
| `GraphCanvas.tsx` | thread `edges` prop down to 2D |
| `AccessAnalysisShell.tsx` | derive edges from nodeIds; pass to GraphCanvas; provide base colors |
| `GraphInteractions.tsx` | compute union activeUserIds; push emphasis via `setLinkColors` |
| `graphTestBridge.ts` | `getEdgeStats()`, `getBrightEdgeCount()` |
| `tests/e2e/acc-dc-graph.spec.ts` | edge assertions + proof shot |

## 8. Definition of done (commit gate)

Commit `feat(acc-graph): render same-user footprint edges in 2d` only when:
- `sameUserEdges` unit tests pass (`npm run test`)
- e2e harness passes (`npm run test:e2e`) including the new edge assertions
- existing 2D **and** 3D non-regression checks still pass

3D edges follow as a separate, focused commit afterward.
