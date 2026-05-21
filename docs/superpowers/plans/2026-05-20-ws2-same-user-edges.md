# WS2 v1 — Same-user footprint edges (2D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render always-on `same-user` chain edges (one identity's nodes across projects) in the cosmos.gl 2D graph, emphasized on hover/isolate/selection, fully covered by the e2e harness.

**Architecture:** Edges are a pure, deterministic function of the existing `nodeId` list (`userId::projectId`). The shell derives them once and hands the renderer precomputed Float32Array link + color buffers (REND-04 purity preserved). `GraphInteractions` recomputes per-link colors on focus change (union of hovered ∪ isolated ∪ lasso user ids) and pushes them via the 2D handle. No DuckDB table, no cliques, 2D only.

**Tech Stack:** TypeScript, React 19, cosmos.gl `@cosmos.gl/graph` 3.0.0-beta.9 (`setLinks`/`setLinkColors`/`renderLinks`, RGBA in **0–1 floats**), Vitest (unit), Playwright `@playwright/test` (e2e).

**Spec:** `docs/superpowers/specs/2026-05-20-ws2-same-user-edges-design.md`

**Carried clarifications:**
1. Edge-count invariant: `validUniqueNodeCount = nodeIds.length - malformedCount - duplicateCount`; `edges.length = validUniqueNodeCount - distinctValidUsers` (= `Σ(validProjectNodeCountForUser - 1)`).
2. cosmos.gl link RGBA is **0–1 floats** (matches `setPointColors` usage in this repo: node colors are `0.62,0.72,0.93,1`). Dev assertions: every color value finite and within `[0,1]`; `links.length === edges.length*2`; `colors.length === edges.length*4`.
3. The e2e isolate test must target a known user with ≥2 project nodes (≥1 same-user edge) — never a single-project user.

---

## File structure

| File | Responsibility |
|------|----------------|
| `app/(dashboard)/users/access-analysis/sameUserEdges.ts` | NEW — `parseNodeId`, `deriveSameUserEdges`, `toCosmosLinks` (pure) |
| `app/(dashboard)/users/access-analysis/sameUserEdges.test.ts` | NEW — unit tests for the above |
| `app/(dashboard)/users/access-analysis/linkEmphasis.ts` | NEW — `computeLinkEmphasisColors`, `countBrightEdges`, `assertLinkArrays`, color constants (pure) |
| `app/(dashboard)/users/access-analysis/linkEmphasis.test.ts` | NEW — unit tests for the above |
| `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` | MODIFY — `renderLinks:true`; handle `setLinks`/`setLinkColors`; init links+base colors; dev assertions |
| `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` | MODIFY — thread `links` + `linkColors` props to the 2D renderer |
| `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` | MODIFY — derive edges from features; build links + base colors; pass down; push edge stats to bridge |
| `app/(dashboard)/users/access-analysis/GraphInteractions.tsx` | MODIFY — compute union activeUserIds; push emphasis colors via handle; report brightCount |
| `app/(dashboard)/users/access-analysis/graphTestBridge.ts` | MODIFY — `setEdgeTestState`, `getEdgeStats`, `getBrightEdgeCount`, `getEdgeSample` |
| `tests/e2e/acc-dc-graph.spec.ts` | MODIFY — edge assertions + isolate-brighten test + proof shot |

---

## Task 1: Pure edge derivation (`sameUserEdges.ts`)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/sameUserEdges.ts`
- Test: `app/(dashboard)/users/access-analysis/sameUserEdges.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// sameUserEdges.test.ts
import { describe, it, expect } from "vitest";
import { parseNodeId, deriveSameUserEdges, toCosmosLinks } from "./sameUserEdges";

describe("parseNodeId", () => {
  it("splits on the first '::'", () => {
    expect(parseNodeId("a@x.com::proj-1")).toEqual({ userId: "a@x.com", projectId: "proj-1" });
  });
  it("returns null for malformed ids", () => {
    expect(parseNodeId("noseparator")).toBeNull();
    expect(parseNodeId("::proj")).toBeNull();
    expect(parseNodeId("user::")).toBeNull();
    expect(parseNodeId("")).toBeNull();
  });
});

describe("deriveSameUserEdges", () => {
  it("one user / one project → 0 edges", () => {
    const r = deriveSameUserEdges(["u1::p1"]);
    expect(r.edges).toHaveLength(0);
    expect(r.distinctValidUsers).toBe(1);
    expect(r.distinctUsersWithEdges).toBe(0);
  });

  it("one user / three projects → 2 chain edges in deterministic order", () => {
    const r = deriveSameUserEdges(["u1::p3", "u1::p1", "u1::p2"]);
    // sorted by nodeId: u1::p1(idx1), u1::p2(idx2), u1::p3(idx0)
    expect(r.edges.map((e) => [e.sourceIndex, e.targetIndex])).toEqual([
      [1, 2],
      [2, 0],
    ]);
    expect(r.edges.every((e) => e.userId === "u1" && e.edgeType === "same-user")).toBe(true);
  });

  it("two users → two separated chains, no cross-user edges", () => {
    const r = deriveSameUserEdges(["u1::p1", "u2::p1", "u1::p2", "u2::p2"]);
    expect(r.edges).toHaveLength(2);
    expect(new Set(r.edges.map((e) => e.userId))).toEqual(new Set(["u1", "u2"]));
    expect(r.edges.every((e) => e.sourceIndex !== e.targetIndex)).toBe(true);
  });

  it("skips malformed nodeIds and counts them", () => {
    const r = deriveSameUserEdges(["u1::p1", "bad", "u1::p2"]);
    expect(r.malformedCount).toBe(1);
    expect(r.edges).toHaveLength(1);
  });

  it("reports duplicate nodeIds and does not corrupt chains", () => {
    const r = deriveSameUserEdges(["u1::p1", "u1::p1", "u1::p2"]);
    expect(r.duplicateCount).toBe(1);
    expect(r.edges).toHaveLength(1); // p1 (first occ, idx0) -> p2 (idx2)
    expect(r.edges[0]).toMatchObject({ sourceIndex: 0, targetIndex: 2 });
  });

  it("has no self-edges or duplicate edges", () => {
    const r = deriveSameUserEdges(["u1::p1", "u1::p2", "u1::p3"]);
    const seen = new Set(r.edges.map((e) => `${e.sourceIndex}-${e.targetIndex}`));
    expect(seen.size).toBe(r.edges.length);
    expect(r.edges.some((e) => e.sourceIndex === e.targetIndex)).toBe(false);
  });

  it("satisfies the edge-count invariant", () => {
    const ids = ["u1::p1", "u1::p2", "u2::p1", "bad", "u1::p1", "u3::p1"];
    const r = deriveSameUserEdges(ids);
    const validUnique = ids.length - r.malformedCount - r.duplicateCount;
    expect(r.edges.length).toBe(validUnique - r.distinctValidUsers);
  });
});

describe("toCosmosLinks", () => {
  it("flattens to [s0,t0,s1,t1,...] Float32Array", () => {
    const r = deriveSameUserEdges(["u1::p1", "u1::p2"]);
    const links = toCosmosLinks(r.edges);
    expect(links).toBeInstanceOf(Float32Array);
    expect(Array.from(links)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/sameUserEdges.test.ts"`
Expected: FAIL — `Cannot find module './sameUserEdges'`.

- [ ] **Step 3: Write the implementation**

```ts
// sameUserEdges.ts
export interface ParsedNodeId {
  userId: string;
  projectId: string;
}

/** Split on the FIRST "::". Returns null for malformed ids (no "::", empty side). */
export function parseNodeId(nodeId: string): ParsedNodeId | null {
  const idx = nodeId.indexOf("::");
  if (idx <= 0 || idx + 2 >= nodeId.length) return null;
  return { userId: nodeId.slice(0, idx), projectId: nodeId.slice(idx + 2) };
}

export interface SameUserEdge {
  sourceIndex: number;
  targetIndex: number;
  sourceNodeId: string;
  targetNodeId: string;
  userId: string;
  edgeType: "same-user";
}

export interface DeriveResult {
  edges: SameUserEdge[];
  malformedCount: number;
  duplicateCount: number;
  distinctValidUsers: number;
  distinctUsersWithEdges: number;
}

/**
 * Same-user chain edges, derived purely from the nodeId list. Indices reference
 * positions in the SAME `nodeIds` array (= cosmos point-index space). Chain
 * topology only (no cliques, no self-edges, no duplicate edges). First occurrence
 * of a duplicate nodeId wins; later duplicates are counted and ignored.
 */
export function deriveSameUserEdges(nodeIds: readonly string[]): DeriveResult {
  const seen = new Set<string>();
  let malformedCount = 0;
  let duplicateCount = 0;
  const groups = new Map<string, Array<{ index: number; nodeId: string }>>();

  for (let i = 0; i < nodeIds.length; i++) {
    const nodeId = nodeIds[i];
    const parsed = parseNodeId(nodeId);
    if (!parsed) {
      malformedCount++;
      continue;
    }
    if (seen.has(nodeId)) {
      duplicateCount++;
      continue;
    }
    seen.add(nodeId);
    const arr = groups.get(parsed.userId);
    if (arr) arr.push({ index: i, nodeId });
    else groups.set(parsed.userId, [{ index: i, nodeId }]);
  }

  const edges: SameUserEdge[] = [];
  let distinctUsersWithEdges = 0;
  for (const [userId, members] of groups) {
    if (members.length < 2) continue;
    members.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
    distinctUsersWithEdges++;
    for (let k = 0; k < members.length - 1; k++) {
      edges.push({
        sourceIndex: members[k].index,
        targetIndex: members[k + 1].index,
        sourceNodeId: members[k].nodeId,
        targetNodeId: members[k + 1].nodeId,
        userId,
        edgeType: "same-user",
      });
    }
  }

  return {
    edges,
    malformedCount,
    duplicateCount,
    distinctValidUsers: groups.size,
    distinctUsersWithEdges,
  };
}

/** Flatten edges to cosmos.gl link buffer: [s0,t0,s1,t1,...] as Float32Array. */
export function toCosmosLinks(edges: readonly SameUserEdge[]): Float32Array {
  const out = new Float32Array(edges.length * 2);
  for (let i = 0; i < edges.length; i++) {
    out[i * 2] = edges[i].sourceIndex;
    out[i * 2 + 1] = edges[i].targetIndex;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/sameUserEdges.test.ts"`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/sameUserEdges.ts" "app/(dashboard)/users/access-analysis/sameUserEdges.test.ts"
git commit -m "feat(acc-graph): pure same-user edge derivation from nodeIds"
```

---

## Task 2: Link emphasis coloring (`linkEmphasis.ts`)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/linkEmphasis.ts`
- Test: `app/(dashboard)/users/access-analysis/linkEmphasis.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// linkEmphasis.test.ts
import { describe, it, expect } from "vitest";
import { deriveSameUserEdges } from "./sameUserEdges";
import {
  computeLinkEmphasisColors,
  countBrightEdges,
  assertLinkArrays,
  DEFAULT_LINK_COLORS,
} from "./linkEmphasis";

const edges = deriveSameUserEdges(["u1::p1", "u1::p2", "u2::p1", "u2::p2"]).edges; // 1 edge per user

describe("computeLinkEmphasisColors", () => {
  it("no focus → all edges use base color, length = edges*4", () => {
    const colors = computeLinkEmphasisColors(edges, new Set());
    expect(colors).toHaveLength(edges.length * 4);
    expect(Array.from(colors.slice(0, 4))).toEqual(DEFAULT_LINK_COLORS.base.slice());
  });

  it("focus → active user's edges bright, others dim", () => {
    const colors = computeLinkEmphasisColors(edges, new Set(["u1"]));
    const u1 = edges.findIndex((e) => e.userId === "u1");
    const u2 = edges.findIndex((e) => e.userId === "u2");
    expect(colors[u1 * 4 + 3]).toBeCloseTo(DEFAULT_LINK_COLORS.bright[3]);
    expect(colors[u2 * 4 + 3]).toBeCloseTo(DEFAULT_LINK_COLORS.dim[3]);
  });

  it("all values are finite and within [0,1]", () => {
    const colors = computeLinkEmphasisColors(edges, new Set(["u1"]));
    for (const v of colors) expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true);
  });
});

describe("countBrightEdges", () => {
  it("returns 0 with no focus", () => {
    expect(countBrightEdges(edges, new Set())).toBe(0);
  });
  it("counts only active-user edges under focus", () => {
    expect(countBrightEdges(edges, new Set(["u1"]))).toBe(1);
  });
});

describe("assertLinkArrays", () => {
  it("passes for matching lengths", () => {
    expect(() => assertLinkArrays(edges.length, new Float32Array(edges.length * 2), new Float32Array(edges.length * 4))).not.toThrow();
  });
  it("throws on length mismatch", () => {
    expect(() => assertLinkArrays(edges.length, new Float32Array(1), new Float32Array(edges.length * 4))).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/linkEmphasis.test.ts"`
Expected: FAIL — `Cannot find module './linkEmphasis'`.

- [ ] **Step 3: Write the implementation**

```ts
// linkEmphasis.ts
import type { SameUserEdge } from "./sameUserEdges";

export type RGBA = readonly [number, number, number, number];

export interface LinkColorOpts {
  base: RGBA;
  bright: RGBA;
  dim: RGBA;
}

// cosmos.gl RGBA is 0–1 floats (matches setPointColors in this repo).
export const DEFAULT_LINK_COLORS: LinkColorOpts = {
  base: [0.62, 0.72, 0.93, 0.1], // subtle always-on
  bright: [0.62, 0.72, 0.93, 0.85],
  dim: [0.62, 0.72, 0.93, 0.03],
};

/** Per-link RGBA buffer. No focus → all base. Focus → active-user bright, rest dim. */
export function computeLinkEmphasisColors(
  edges: readonly SameUserEdge[],
  activeUserIds: ReadonlySet<string>,
  colors: LinkColorOpts = DEFAULT_LINK_COLORS,
): Float32Array {
  const out = new Float32Array(edges.length * 4);
  const hasFocus = activeUserIds.size > 0;
  for (let i = 0; i < edges.length; i++) {
    const c = !hasFocus
      ? colors.base
      : activeUserIds.has(edges[i].userId)
        ? colors.bright
        : colors.dim;
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = c[3];
  }
  if (process.env.NODE_ENV !== "production") {
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`linkEmphasis: color value out of [0,1]: ${v}`);
      }
    }
  }
  return out;
}

/** Number of edges that would be brightened for the given focus set. */
export function countBrightEdges(
  edges: readonly SameUserEdge[],
  activeUserIds: ReadonlySet<string>,
): number {
  if (activeUserIds.size === 0) return 0;
  let n = 0;
  for (const e of edges) if (activeUserIds.has(e.userId)) n++;
  return n;
}

/** Dev guard: link + color buffers must match the edge count. */
export function assertLinkArrays(edgeCount: number, links: Float32Array, colors: Float32Array): void {
  if (links.length !== edgeCount * 2) {
    throw new Error(`links.length (${links.length}) !== edges*2 (${edgeCount * 2})`);
  }
  if (colors.length !== edgeCount * 4) {
    throw new Error(`colors.length (${colors.length}) !== edges*4 (${edgeCount * 4})`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/linkEmphasis.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/linkEmphasis.ts" "app/(dashboard)/users/access-analysis/linkEmphasis.test.ts"
git commit -m "feat(acc-graph): same-user link emphasis coloring"
```

---

## Task 3: Renderer link support (`GraphCanvas2D.tsx`)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx`

> No unit test: cosmos.gl needs a real WebGL context (jsdom has none). This task is verified by the e2e harness in Task 6. Keep changes minimal and pure (renderer receives precomputed buffers only).

- [ ] **Step 1: Add link props to `GraphCanvas2DProps`**

In the `GraphCanvas2DProps` interface, add (after `nodeSizes?`):

```ts
  /** Flat cosmos link buffer [s0,t0,s1,t1,...]; same point-index space as positions. */
  links?: Float32Array;
  /** Per-link RGBA (0–1) buffer, length = links.length/2*4. */
  linkColors?: Float32Array;
```

- [ ] **Step 2: Add handle methods to `GraphCanvas2DHandle`**

In the `GraphCanvas2DHandle` interface, add:

```ts
  /** Replace the link set (flat [s,t,...] index pairs). */
  setLinks(links: Float32Array): void;
  /** Replace per-link RGBA colors (0–1). Length must equal (links.length/2)*4. */
  setLinkColors(rgba: Float32Array): void;
```

- [ ] **Step 3: Enable link rendering in the cosmos config**

In the `new Graph(div, { ... })` config object, change `renderLinks: false` to:

```ts
        renderLinks: true,
```

- [ ] **Step 4: Initialize links + colors at load, after `g.setPointColors(...)`**

Immediately after the existing `if (props.nodeSizes) { g.setPointSizes(props.nodeSizes); }` block and before `g.render();` in the init IIFE, add:

```ts
      if (props.links && props.links.length > 0) {
        g.setLinks(props.links);
        if (props.linkColors) {
          if (
            process.env.NODE_ENV !== "production" &&
            props.linkColors.length !== (props.links.length / 2) * 4
          ) {
            throw new Error("GraphCanvas2D: linkColors length must equal (links/2)*4");
          }
          g.setLinkColors(props.linkColors);
        }
      }
```

- [ ] **Step 5: Expose `setLinks` / `setLinkColors` on the handle**

Inside the `props.onHandleReady({ ... })` object (alongside `setColors`), add:

```ts
        setLinks(links: Float32Array): void {
          g!.setLinks(links);
          g!.render();
        },

        setLinkColors(rgba: Float32Array): void {
          if (process.env.NODE_ENV !== "production") {
            for (let i = 0; i < rgba.length; i++) {
              const v = rgba[i];
              if (!Number.isFinite(v) || v < 0 || v > 1) {
                throw new Error(`GraphCanvas2D.setLinkColors: value out of [0,1]: ${v}`);
              }
            }
          }
          g!.setLinkColors(rgba);
          g!.render();
        },
```

- [ ] **Step 6: Typecheck the file**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep GraphCanvas2D` (or rely on `npm run lint`)
Expected: no errors referencing GraphCanvas2D.tsx.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx"
git commit -m "feat(acc-graph): cosmos.gl link rendering support in GraphCanvas2D"
```

---

## Task 4: Wire edges through shell + emphasis in interactions

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.tsx`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`
- Modify: `app/(dashboard)/users/access-analysis/GraphInteractions.tsx`

- [ ] **Step 1: Thread link props through `GraphCanvas.tsx`**

In `GraphCanvasProps`, add (after `height?`):

```ts
  /** Flat cosmos link buffer for the 2D renderer. */
  links?: Float32Array;
  /** Initial per-link RGBA colors for the 2D renderer. */
  linkColors?: Float32Array;
```

Then pass them to the inner `<GraphCanvas2D ...>` (alongside `nodeColors={props.nodeColors}`):

```tsx
          links={props.links}
          linkColors={props.linkColors}
```

- [ ] **Step 2: Derive edges + buffers in `AccessAnalysisShell.tsx` (ShellBody)**

Add imports at the top of the file:

```ts
import { deriveSameUserEdges, toCosmosLinks, type SameUserEdge } from "./sameUserEdges";
import { computeLinkEmphasisColors, assertLinkArrays } from "./linkEmphasis";
import { setEdgeTestState } from "./graphTestBridge";
```

Inside `ShellBody`, after the `nodeColors` memo, add:

```ts
  const edgeData = useMemo(() => deriveSameUserEdges(features.map((f) => f.nodeId)), [features]);
  const edges: SameUserEdge[] = edgeData.edges;
  const links = useMemo(() => toCosmosLinks(edges), [edges]);
  const baseLinkColors = useMemo(() => {
    const colors = computeLinkEmphasisColors(edges, new Set());
    assertLinkArrays(edges.length, links, colors);
    return colors;
  }, [edges, links]);

  useEffect(() => {
    setEdgeTestState({ derive: edgeData, nodeCount: features.length });
  }, [edgeData, features.length]);
```

- [ ] **Step 3: Pass edges + buffers into the JSX**

In the `<GraphCanvas ... />` element add:

```tsx
              links={links}
              linkColors={baseLinkColors}
```

In the `<GraphInteractions ... >` element add:

```tsx
            edges={edges}
```

- [ ] **Step 4: Add emphasis wiring to `GraphInteractions.tsx`**

Add imports:

```ts
import { useMemo } from "react";
import type { SameUserEdge } from "./sameUserEdges";
import { parseNodeId } from "./sameUserEdges";
import { computeLinkEmphasisColors, countBrightEdges } from "./linkEmphasis";
import { setInteractionTestState, setEdgeTestState } from "./graphTestBridge";
```

(Adjust the existing React import to include `useMemo` if not already; the file already imports `setInteractionTestState`.)

Add `edges` to `GraphInteractionsProps` (after `rendererReady`):

```ts
  /** Same-user edges (cosmos index space) for link emphasis. */
  edges: SameUserEdge[];
```

Destructure `edges` in the component body alongside the others.

After the existing `usePredicateEngine({ ... })` call, add:

```ts
  // Union of users in focus: hovered ∪ isolated ∪ lasso selection.
  const activeUserIds = useMemo(() => {
    const s = new Set<string>();
    const add = (idx: number | null): void => {
      if (idx == null) return;
      const f = features[idx];
      if (!f) return;
      const p = parseNodeId(f.nodeId);
      if (p) s.add(p.userId);
    };
    add(hoveredIndex);
    add(isolatedNodeIndex);
    if (lassoSelection) for (const i of lassoSelection) add(i);
    return s;
  }, [hoveredIndex, isolatedNodeIndex, lassoSelection, features]);

  // Push per-link emphasis colors to the 2D renderer on any focus change.
  useEffect(() => {
    const root = graphRef.current;
    const handle = root && root.mode === "2d" ? root.handle : null;
    if (!handle) return;
    handle.setLinkColors(computeLinkEmphasisColors(edges, activeUserIds));
    setEdgeTestState({ brightCount: countBrightEdges(edges, activeUserIds) });
    // rendererReady: re-apply once the async handle exists.
  }, [edges, activeUserIds, graphRef, mode, rendererReady]);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "GraphCanvas|GraphInteractions|AccessAnalysisShell"`
Expected: no errors in these files.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/GraphCanvas.tsx" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx" "app/(dashboard)/users/access-analysis/GraphInteractions.tsx"
git commit -m "feat(acc-graph): wire same-user edges + focus emphasis into 2D graph"
```

---

## Task 5: Test bridge edge observers (`graphTestBridge.ts`)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/graphTestBridge.ts`

- [ ] **Step 1: Add an edge state singleton + setter**

Add an import at the top:

```ts
import type { DeriveResult } from "./sameUserEdges";
```

Add a new singleton + setter (next to `interaction`):

```ts
interface EdgeState {
  derive: DeriveResult | null;
  nodeCount: number;
  brightCount: number;
}

const edgeState: EdgeState = { derive: null, nodeCount: 0, brightCount: 0 };

export function setEdgeTestState(patch: Partial<EdgeState>): void {
  if (!isGraphTestEnabled()) return;
  Object.assign(edgeState, patch);
}
```

- [ ] **Step 2: Extend the `GraphTestApi` interface**

Add to `GraphTestApi`:

```ts
  getEdgeStats(): {
    count: number;
    selfEdges: number;
    duplicates: number;
    danglingEndpoints: number;
    malformedNodeIds: number;
    distinctUsersWithEdges: number;
  };
  getBrightEdgeCount(): number;
  getEdgeSample(): { nodeId: string; userId: string; expectedBrightCount: number } | null;
```

- [ ] **Step 3: Implement the three methods in `buildApi()`**

Add inside the returned object:

```ts
    getEdgeStats() {
      const d = edgeState.derive;
      if (!d) {
        return { count: 0, selfEdges: 0, duplicates: 0, danglingEndpoints: 0, malformedNodeIds: 0, distinctUsersWithEdges: 0 };
      }
      const n = edgeState.nodeCount;
      let selfEdges = 0;
      let danglingEndpoints = 0;
      const seenPairs = new Set<string>();
      let duplicates = 0;
      for (const e of d.edges) {
        if (e.sourceIndex === e.targetIndex) selfEdges++;
        if (e.sourceIndex < 0 || e.sourceIndex >= n || e.targetIndex < 0 || e.targetIndex >= n) {
          danglingEndpoints++;
        }
        const a = Math.min(e.sourceIndex, e.targetIndex);
        const b = Math.max(e.sourceIndex, e.targetIndex);
        const key = `${a}-${b}`;
        if (seenPairs.has(key)) duplicates++;
        else seenPairs.add(key);
      }
      return {
        count: d.edges.length,
        selfEdges,
        duplicates,
        danglingEndpoints,
        malformedNodeIds: d.malformedCount,
        distinctUsersWithEdges: d.distinctUsersWithEdges,
      };
    },
    getBrightEdgeCount() {
      return edgeState.brightCount;
    },
    getEdgeSample() {
      const d = edgeState.derive;
      if (!d || d.edges.length === 0) return null;
      const userId = d.edges[0].userId;
      let expectedBrightCount = 0;
      for (const e of d.edges) if (e.userId === userId) expectedBrightCount++;
      return { nodeId: d.edges[0].sourceNodeId, userId, expectedBrightCount };
    },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep graphTestBridge`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/graphTestBridge.ts"
git commit -m "test(acc-graph): expose edge stats + bright count via test bridge"
```

---

## Task 6: e2e edge coverage (`acc-dc-graph.spec.ts`)

**Files:**
- Modify: `tests/e2e/acc-dc-graph.spec.ts`

- [ ] **Step 1: Extend the `Bridge` type**

In the `Bridge` type, add:

```ts
  getEdgeStats(): {
    count: number;
    selfEdges: number;
    duplicates: number;
    danglingEndpoints: number;
    malformedNodeIds: number;
    distinctUsersWithEdges: number;
  };
  getBrightEdgeCount(): number;
  getEdgeSample(): { nodeId: string; userId: string; expectedBrightCount: number } | null;
```

- [ ] **Step 2: Add the edge-integrity test (inside the `describe` block)**

```ts
  test("same-user edges are well-formed and rendered", async ({ page }, testInfo) => {
    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getEdgeStats());
    // eslint-disable-next-line no-console
    console.log(`[edges] count=${stats.count} selfEdges=${stats.selfEdges} dup=${stats.duplicates} dangling=${stats.danglingEndpoints} usersWithEdges=${stats.distinctUsersWithEdges}`);

    expect(stats.count, "graph has same-user edges").toBeGreaterThan(0);
    expect(stats.selfEdges, "no self-edges").toBe(0);
    expect(stats.duplicates, "no duplicate edges").toBe(0);
    expect(stats.danglingEndpoints, "all endpoints reference real nodes").toBe(0);
    expect(stats.distinctUsersWithEdges).toBeGreaterThan(0);

    // No focus yet → nothing brightened.
    expect(await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getBrightEdgeCount())).toBe(0);
    await proofShot(page, testInfo, "after-edges");
  });
```

- [ ] **Step 3: Add the isolate-brightens-footprint test**

```ts
  test("isolating a multi-project user brightens exactly their footprint edges", async ({ page }, testInfo) => {
    // Clarification 3: target a user with >=1 same-user edge, never a single-project user.
    const sample = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getEdgeSample());
    expect(sample, "a multi-project user exists").toBeTruthy();
    expect(sample!.expectedBrightCount, "sample user has >=1 edge").toBeGreaterThan(0);

    const local = await page.evaluate((id) => window.__ACC_GRAPH_TEST__!.getNodeScreenPosition(id), sample!.nodeId);
    expect(local).toBeTruthy();
    const box = await canvasBox(page);
    await page.mouse.move(box.x + local!.x, box.y + local!.y, { steps: 4 });
    await page.mouse.click(box.x + local!.x, box.y + local!.y);

    if ((await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getIsolatedNodeId())) === null) {
      await page.evaluate((id) => window.__ACC_GRAPH_TEST__!.simulateClick(id), sample!.nodeId);
    }

    await page.waitForFunction(
      (expected) => window.__ACC_GRAPH_TEST__!.getBrightEdgeCount() === expected,
      sample!.expectedBrightCount,
      { timeout: 15_000 },
    );
    await proofShot(page, testInfo, "after-edge-isolate");

    // Clearing isolate returns edges to base (0 brightened).
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getBrightEdgeCount() === 0, undefined, {
      timeout: 15_000,
    });
  });
```

- [ ] **Step 4: Run the edge tests headlessly**

Run: `npm run test:e2e -- --grep "same-user edges|isolating a multi-project"`
Expected: both PASS; console shows `[edges] count=... selfEdges=0 dup=0 dangling=0`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/acc-dc-graph.spec.ts
git commit -m "test(acc-graph): e2e coverage for same-user edges + isolate emphasis"
```

---

## Task 7: Full gate + squash-free verification

**Files:** none (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `npm run test`
Expected: PASS, including `sameUserEdges.test.ts` and `linkEmphasis.test.ts`.

- [ ] **Step 2: Run the full e2e gate**

Run: `npm run test:e2e`
Expected: ALL tests PASS — the original 7 (2D 16,934 nodes / no NaN / hover / click / filter / search / lasso) plus the 2 new edge tests. Artifacts (trace, screenshots incl. `after-edges` + `after-edge-isolate`, HTML report) generated.

- [ ] **Step 3: Confirm no regression in counts**

Verify the `[2D] node count=16934 ... anyNaN=false` and `[edges] ... selfEdges=0 dup=0 dangling=0` lines appear in the run output.

- [ ] **Step 4: Final verification note**

If any check fails, do NOT proceed — fix the underlying cause and re-run from Step 1. Per the spec's definition of done, the feature is complete only when unit tests AND the e2e gate AND existing 2D/3D non-regression checks all pass.

> The per-task commits above already use `feat(acc-graph): ...` / `test(acc-graph): ...`. They collectively deliver the spec's `feat(acc-graph): render same-user footprint edges in 2d`. No squash required unless the reviewer prefers a single commit.

---

## Self-review notes

- **Spec coverage:** §3 derivation → Task 1; §4 rendering + emphasis → Tasks 3–4; §6 e2e (`getEdgeStats` shape, brightEdgeCount, return-to-base, endpoint validity) → Tasks 5–6; clarification #1 invariant → Task 1 invariant test; #2 RGBA 0–1 + finite/range + length assertions → Tasks 2–3; #3 multi-project user target → Task 6 via `getEdgeSample()`.
- **3D, DuckDB table, toolbar toggle, LOD, shared-project/firm edges:** intentionally absent (deferred per spec §2/§5).
- **Type consistency:** `SameUserEdge`, `DeriveResult`, `computeLinkEmphasisColors`, `countBrightEdges`, `assertLinkArrays`, `setEdgeTestState`, `getEdgeStats`, `getBrightEdgeCount`, `getEdgeSample` are defined once and referenced consistently across tasks.
