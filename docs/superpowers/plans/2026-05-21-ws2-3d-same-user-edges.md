# WS2 3D Same-User Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the existing same-user chain edges in the 3D renderer (`GraphCanvas3D`) as a single three.js `LineSegments`, mirroring the shipped 2D edges.

**Architecture:** One `LineSegments` (one draw call) added next to the node `InstancedMesh`. Endpoints are rewritten from the same xyz buffer that drives node matrices. Emphasis (base/bright/dim) is encoded as per-vertex RGB by premultiplying alpha into RGB against the black canvas; `LineBasicMaterial.opacity` stays `1` so colors are not double-attenuated. The flat `links` buffer and `computeLinkEmphasisColors` RGBA buffer are shared verbatim with the 2D path.

**Tech Stack:** TypeScript, React, three.js r184 (`LineSegments`, `BufferGeometry`, `LineBasicMaterial`), Vitest (jsdom), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-05-21-ws2-3d-same-user-edges-design.md`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx` | 3D renderer | Add `links`/`linkColors` props; `LineSegments` setup; handle `setLinks`/`setLinkColors`/`getRenderState`; edge endpoint rewrite in `pumpPositions3D` |
| `app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts` | 3D renderer unit tests | three-mock additions (`BufferGeometry`, `BufferAttribute`, `LineSegments`, `LineBasicMaterial`) + 4 edge tests |
| `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` | renderer host | Forward `links`/`linkColors` to `GraphCanvas3D` |
| `app/(dashboard)/users/access-analysis/GraphInteractions.tsx` | interaction layer | Mode-agnostic emphasis push; `setEdgeTestState` in all modes |
| `app/(dashboard)/users/access-analysis/graphTestBridge.ts` | e2e observation bridge | `getRendererState()` reads the active handle in any mode; widened return type |
| `tests/e2e/acc-dc-graph.spec.ts` | e2e gate | 3D edge render-state + 3D isolate-brighten tests + proof shots |

**Not touched (reused as-is):** `sameUserEdges.ts`, `linkEmphasis.ts`.

---

## Task 1: 3D edge rendering in GraphCanvas3D (handle + geometry + endpoint follow)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx`
- Test: `app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts`

### Step 1.1: Add three-mock classes for line rendering

- [ ] In `GraphCanvas3D.test.ts`, add a capture array next to the existing capture vars (after the `let _webglRendererConstructorCount = 0;` line near the top):

```ts
const _capturedLineSegments: any[] = [];
```

- [ ] Inside the `vi.mock("three", ...)` factory, add these classes just before the `return { ...actual, ... }` block (alongside `MockColor`):

```ts
  class FakeBufferAttribute {
    array: Float32Array;
    itemSize: number;
    needsUpdate = false;
    constructor(array: Float32Array, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }

  class MockBufferGeometry {
    attributes: Record<string, FakeBufferAttribute> = {};
    setAttribute(name: string, attr: FakeBufferAttribute) {
      this.attributes[name] = attr;
      return this;
    }
    dispose() {}
  }

  class MockLineBasicMaterial {
    vertexColors = false;
    transparent = false;
    opacity = 1;
    depthWrite = true;
    constructor(opts?: any) {
      if (opts) Object.assign(this, opts);
    }
    dispose() {}
  }

  class MockLineSegments {
    geometry: any;
    material: any;
    visible = true;
    frustumCulled = true;
    renderOrder = 0;
    constructor(geometry: any, material: any) {
      this.geometry = geometry;
      this.material = material;
      _capturedLineSegments.push(this);
    }
  }
```

- [ ] Add the new classes to the returned mock object (extend the existing `return { ...actual, ... }`):

```ts
    BufferGeometry: MockBufferGeometry,
    BufferAttribute: FakeBufferAttribute,
    LineSegments: MockLineSegments,
    LineBasicMaterial: MockLineBasicMaterial,
```

- [ ] In the `beforeEach`, reset the new capture array next to the others:

```ts
  _capturedLineSegments.length = 0;
```

- [ ] The new `buildEdges`/cleanup code calls `scene.remove(...)`, which the existing `MockScene` does not implement. Add a `remove` method to the `MockScene` class in the three mock (next to its `add` method):

```ts
    remove(_obj: any) {}
```

### Step 1.2: Write the failing edge tests

- [ ] Append these tests inside the existing `describe("GraphCanvas3D — ...")` block in `GraphCanvas3D.test.ts`:

```ts
  // Test 13: setLinks builds one LineSegments with correctly sized buffers
  it("Test 13: edges — links prop builds LineSegments with edges*2*3 buffers", () => {
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        links: new Float32Array([0, 1]), // one edge: node0 -> node1
        linkColors: new Float32Array([0.62, 0.72, 0.93, 0.1]),
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    const rs = handle!.getRenderState();
    expect(rs.renderLinks).toBe(true);
    expect(rs.linkCount).toBe(1);
    expect(rs.hasLineGeometry).toBe(true);
    expect(rs.positionAttributeLength).toBe(6); // 1 edge * 2 verts * 3
    expect(rs.colorAttributeLength).toBe(6);
    expect(_capturedLineSegments.length).toBe(1);
    expect(_capturedLineSegments[0].material.opacity).toBe(1); // MUST stay 1
  });

  // Test 14: edge endpoints follow node xyz (raw, no y-flip) on pushPositions
  it("Test 14: edges — endpoints rewritten from the same xyz as nodes", () => {
    const physics = makeFakePhysics(2); // node0 (0,0,0), node1 (10,20,30)
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        links: new Float32Array([0, 1]),
        linkColors: new Float32Array([0.62, 0.72, 0.93, 0.1]),
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    const posAttr = _capturedLineSegments[0].geometry.attributes.position;
    // Initial write uses physics seed positions: node0 (0,0,0), node1 (10,20,30)
    expect(Array.from(posAttr.array)).toEqual([0, 0, 0, 10, 20, 30]);

    handle!.pushPositions(new Float32Array([100, 200, 300, 400, 500, 600]));
    expect(Array.from(posAttr.array)).toEqual([100, 200, 300, 400, 500, 600]);
    expect(posAttr.needsUpdate).toBe(true);
  });

  // Test 15: setLinkColors premultiplies alpha into RGB on both vertices
  it("Test 15: edges — setLinkColors premultiplies alpha into per-vertex RGB", () => {
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        links: new Float32Array([0, 1]),
        linkColors: new Float32Array([0.62, 0.72, 0.93, 0.1]),
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    // bright: rgb * 0.85
    handle!.setLinkColors(new Float32Array([0.62, 0.72, 0.93, 0.85]));
    const colorAttr = _capturedLineSegments[0].geometry.attributes.color;
    const v = Array.from(colorAttr.array) as number[];
    // both vertices identical, each channel = channel * alpha
    expect(v[0]).toBeCloseTo(0.62 * 0.85, 5);
    expect(v[1]).toBeCloseTo(0.72 * 0.85, 5);
    expect(v[2]).toBeCloseTo(0.93 * 0.85, 5);
    expect(v[3]).toBeCloseTo(0.62 * 0.85, 5);
    expect(v[4]).toBeCloseTo(0.72 * 0.85, 5);
    expect(v[5]).toBeCloseTo(0.93 * 0.85, 5);
    expect(colorAttr.needsUpdate).toBe(true);
  });

  // Test 16: no links → no LineSegments, renderLinks false
  it("Test 16: edges — absent links leaves renderLinks false", () => {
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    const rs = handle!.getRenderState();
    expect(rs.renderLinks).toBe(false);
    expect(rs.linkCount).toBe(0);
    expect(rs.hasLineGeometry).toBe(false);
    expect(_capturedLineSegments.length).toBe(0);
  });
```

### Step 1.3: Run the new tests to verify they fail

- [ ] Run: `npx vitest run app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts`
- [ ] Expected: Tests 13–16 FAIL (handle has no `setLinks`/`setLinkColors`/`getRenderState`; `links` prop ignored). Tests 1–12 still PASS.

### Step 1.4: Add `links`/`linkColors` to props and handle interface

- [ ] In `GraphCanvas3D.tsx`, extend `GraphCanvas3DHandle` (add to the interface, after `setEventHandlers`):

```ts
  /** Replace the link set (flat [s,t,...] index pairs). Rebuilds line geometry. */
  setLinks(links: Float32Array): void;
  /** Replace per-link RGBA (0–1, length = links/2*4). Premultiplied into vertex RGB. */
  setLinkColors(rgba: Float32Array): void;
  /** Test/diagnostic: derived 3D edge render state. */
  getRenderState(): {
    renderLinks: boolean;
    linkCount: number;
    hasLineGeometry: boolean;
    positionAttributeLength: number;
    colorAttributeLength: number;
  };
```

- [ ] Extend `GraphCanvas3DProps` (after `backgroundColor: string;`):

```ts
  /** Flat link buffer [s0,t0,s1,t1,...] in node-index space. */
  links?: Float32Array;
  /** Initial per-link RGBA (0–1). Length = links.length/2*4. */
  linkColors?: Float32Array;
```

### Step 1.5: Add edge state + builders inside the mount effect

- [ ] In `GraphCanvas3D.tsx`, immediately after the line `let currentNodeColors = props.nodeColors;`, add:

```ts
    // Edge (LineSegments) state — built lazily when links are present.
    let currentXyz: Float32Array = initialXyz;
    let edgeLines: THREE.LineSegments | null = null;
    let edgeGeometry: THREE.BufferGeometry | null = null;
    let edgePositions: Float32Array | null = null; // edges*2*3
    let edgeColors: Float32Array | null = null;     // edges*2*3
    let edgeLinkIndices: Float32Array | null = null; // flat [s,t,...]
    let edgeCount = 0;
```

- [ ] After the existing `loadColors(currentNodeColors);` line, add the initial edge build:

```ts
    // Initial edge load (mirrors the 2D init block; built once, edge set is static).
    if (props.links && props.links.length > 0) {
      buildEdges(props.links);
      if (props.linkColors) applyEdgeColors(props.linkColors);
    }
```

- [ ] Add these three function declarations inside the effect (place them right after the `applyAlphaMask3D` function, before the `fitView` section). Function declarations are hoisted, so the initial-build call above resolves correctly:

```ts
    function buildEdges(links: Float32Array): void {
      if (edgeLines) {
        scene.remove(edgeLines);
        edgeGeometry?.dispose();
        (edgeLines.material as THREE.Material).dispose();
        edgeLines = null;
        edgeGeometry = null;
      }
      edgeLinkIndices = links;
      edgeCount = links.length / 2;
      if (edgeCount === 0) {
        edgePositions = null;
        edgeColors = null;
        return;
      }
      edgePositions = new Float32Array(edgeCount * 2 * 3);
      edgeColors = new Float32Array(edgeCount * 2 * 3);
      edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
      edgeGeometry.setAttribute("color", new THREE.BufferAttribute(edgeColors, 3));
      const edgeMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 1, // alpha is baked into RGB (§5) — MUST stay 1, no double-attenuation
        depthWrite: false,
      });
      edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      edgeLines.frustumCulled = false;
      edgeLines.renderOrder = -1; // draw behind the node spheres
      scene.add(edgeLines);
      writeEdgePositions(currentXyz);
    }

    function writeEdgePositions(xyz: Float32Array): void {
      if (!edgeGeometry || !edgePositions || !edgeLinkIndices || edgeCount === 0) return;
      for (let e = 0; e < edgeCount; e++) {
        const s = edgeLinkIndices[e * 2];
        const t = edgeLinkIndices[e * 2 + 1];
        const so = s * 3;
        const to = t * 3;
        const o = e * 6;
        edgePositions[o] = xyz[so];
        edgePositions[o + 1] = xyz[so + 1];
        edgePositions[o + 2] = xyz[so + 2];
        edgePositions[o + 3] = xyz[to];
        edgePositions[o + 4] = xyz[to + 1];
        edgePositions[o + 5] = xyz[to + 2];
      }
      (edgeGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    function applyEdgeColors(rgba: Float32Array): void {
      if (!edgeGeometry || !edgeColors || edgeCount === 0) return;
      for (let e = 0; e < edgeCount; e++) {
        const a = rgba[e * 4 + 3];
        const pr = rgba[e * 4] * a;
        const pg = rgba[e * 4 + 1] * a;
        const pb = rgba[e * 4 + 2] * a;
        const o = e * 6;
        edgeColors[o] = pr;
        edgeColors[o + 1] = pg;
        edgeColors[o + 2] = pb;
        edgeColors[o + 3] = pr;
        edgeColors[o + 4] = pg;
        edgeColors[o + 5] = pb;
      }
      (edgeGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
```

### Step 1.6: Make endpoints follow node positions each tick

- [ ] In `pumpPositions3D`, immediately after `mesh.instanceMatrix.needsUpdate = true;`, add:

```ts
      currentXyz = xyz;
      writeEdgePositions(xyz);
```

### Step 1.7: Expose the new handle methods

- [ ] In the `handle` object literal, after the `setEventHandlers` entry, add:

```ts
      setLinks: (links: Float32Array) => {
        buildEdges(links);
        writeEdgePositions(currentXyz);
      },
      setLinkColors: (rgba: Float32Array) => {
        applyEdgeColors(rgba);
      },
      getRenderState: () => ({
        renderLinks: edgeLines !== null && edgeLines.visible === true && edgeCount > 0,
        linkCount: edgeCount,
        hasLineGeometry: edgeGeometry !== null,
        positionAttributeLength: edgePositions ? edgePositions.length : 0,
        colorAttributeLength: edgeColors ? edgeColors.length : 0,
      }),
```

### Step 1.8: Dispose edge resources on unmount

- [ ] In the cleanup return, after `material.dispose();`, add:

```ts
      if (edgeLines) {
        scene.remove(edgeLines);
        edgeGeometry?.dispose();
        (edgeLines.material as THREE.Material).dispose();
      }
```

### Step 1.9: Run the tests to verify they pass

- [ ] Run: `npx vitest run app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts`
- [ ] Expected: all tests PASS (1–16), including the REND-04 purity scan (Test 8) — no data-layer imports were added.

### Step 1.10: Commit

```bash
git add "app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts"
git commit -m "feat(acc-graph): render same-user edges as LineSegments in 3d"
```

---

## Task 2: Forward links/linkColors through GraphCanvas to the 3D renderer

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.tsx`
- Test: `app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts`

### Step 2.1: Write the failing wiring test

- [ ] Append to the `describe` block in `GraphCanvas3D.test.ts`:

```ts
  // Test 17: GraphCanvas forwards links + linkColors to BOTH renderers.
  // The 2D block already forwards these, so assert the occurrence count is 2
  // (one for GraphCanvas2D, one for GraphCanvas3D) — distinguishes the new wiring.
  it("Test 17: GraphCanvas passes links/linkColors props to GraphCanvas3D", () => {
    expect((CANVAS_SRC.match(/links=\{props\.links\}/g) ?? []).length).toBe(2);
    expect((CANVAS_SRC.match(/linkColors=\{props\.linkColors\}/g) ?? []).length).toBe(2);
  });
```

### Step 2.2: Run it to verify failure

- [ ] Run: `npx vitest run app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts -t "Test 17"`
- [ ] Expected: FAIL (props not yet forwarded to `GraphCanvas3D`).

### Step 2.3: Forward the props

- [ ] In `GraphCanvas.tsx`, in the `<GraphCanvas3D ... />` element (inside `container3DRef`), add the two props alongside `backgroundColor={bg}`:

```tsx
          links={props.links}
          linkColors={props.linkColors}
```

### Step 2.4: Run to verify pass

- [ ] Run: `npx vitest run app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts`
- [ ] Expected: all tests PASS (1–17).

### Step 2.5: Commit

```bash
git add "app/(dashboard)/users/access-analysis/GraphCanvas.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts"
git commit -m "feat(acc-graph): forward link buffers to the 3d renderer"
```

---

## Task 3: Mode-agnostic emphasis push in GraphInteractions

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphInteractions.tsx`

> Both `GraphCanvas2DHandle` and `GraphCanvas3DHandle` expose `setLinkColors(rgba: Float32Array)` with identical signatures, so the union type can call it without narrowing.

### Step 3.1: Make the emphasis effect push to whichever handle is active

- [ ] In `GraphInteractions.tsx`, replace the existing emphasis effect (the `useEffect` that begins `const root = graphRef.current;` and computes `computeLinkEmphasisColors` — currently gated `root.mode === "2d"`) with:

```ts
  // Push per-link emphasis colors to the active renderer (2D or 3D) on focus change.
  // Both handles accept the same per-link RGBA buffer; the 3D handle premultiplies
  // alpha into vertex RGB internally. brightCount is mirrored to the bridge in all modes.
  useEffect(() => {
    const handle = graphRef.current?.handle ?? null;
    const rgba = computeLinkEmphasisColors(edges, activeUserIds);
    if (handle) handle.setLinkColors(rgba);
    setEdgeTestState({ brightCount: countBrightEdges(edges, activeUserIds) });
    // rendererReady: re-apply once the async handle exists.
  }, [edges, activeUserIds, graphRef, mode, rendererReady]);
```

### Step 3.2: Typecheck the union call

- [ ] Run: `npx tsc --noEmit -p tsconfig.json`
- [ ] Expected: no new type errors from `GraphInteractions.tsx` (the `setLinkColors` call resolves against both handle variants).

> If the pre-existing tree has unrelated tsc errors, scope the check: confirm none reference `GraphInteractions.tsx`, `GraphCanvas3D.tsx`, `GraphCanvas.tsx`, or `graphTestBridge.ts`.

### Step 3.3: Run the access-analysis unit suite for regressions

- [ ] Run: `npx vitest run app/(dashboard)/users/access-analysis`
- [ ] Expected: PASS (no behavioral unit test asserts the 2D-only gate; e2e in Task 5 is the behavioral gate).

### Step 3.4: Commit

```bash
git add "app/(dashboard)/users/access-analysis/GraphInteractions.tsx"
git commit -m "feat(acc-graph): push edge emphasis to the active renderer in any mode"
```

---

## Task 4: Bridge getRendererState reads the active handle in any mode

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/graphTestBridge.ts`

### Step 4.1: Widen the API return type

- [ ] In `graphTestBridge.ts`, in the `GraphTestApi` interface, replace the `getRendererState` signature with:

```ts
  getRendererState(): {
    renderLinks: boolean;
    linkCount: number;
    hasLineGeometry?: boolean;
    positionAttributeLength?: number;
    colorAttributeLength?: number;
  } | null;
```

### Step 4.2: Read the active handle regardless of mode

- [ ] Replace the `getRendererState()` implementation in `buildApi()` with:

```ts
    getRendererState() {
      const root = shell.graphRef?.current;
      if (!root || !root.handle) return null;
      return root.handle.getRenderState();
    },
```

### Step 4.3: Typecheck

- [ ] Run: `npx tsc --noEmit -p tsconfig.json`
- [ ] Expected: no new errors from `graphTestBridge.ts`. The union `getRenderState()` return is assignable to the widened type (2D omits the optional 3D fields).

### Step 4.4: Commit

```bash
git add "app/(dashboard)/users/access-analysis/graphTestBridge.ts"
git commit -m "feat(acc-graph): expose 3d edge render state via the test bridge"
```

---

## Task 5: e2e coverage for 3D edges

**Files:**
- Modify: `tests/e2e/acc-dc-graph.spec.ts`

### Step 5.1: Widen the local Bridge type

- [ ] In `acc-dc-graph.spec.ts`, replace the `getRendererState` line in the `type Bridge = { ... }` block with:

```ts
  getRendererState(): {
    renderLinks: boolean;
    linkCount: number;
    hasLineGeometry?: boolean;
    positionAttributeLength?: number;
    colorAttributeLength?: number;
  } | null;
```

### Step 5.2: Add the 3D render-state test

- [ ] Add this test inside the `test.describe("ACC DC graph — Step 1 stabilization", ...)` block, after the existing `"same-user edges are well-formed and rendered"` test:

```ts
  test("3D edges: link layer is rendered with buffers matching the edge count", async ({ page }, testInfo) => {
    const edgeCount = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getEdgeStats().count);
    expect(edgeCount, "graph has same-user edges").toBeGreaterThan(0);

    await page.getByTestId("toolbar-mode-toggle").getByRole("button", { name: "3D" }).click();
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getMode() === "3d", undefined, {
      timeout: 20_000,
    });

    const render = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getRendererState());
    expect(render, "3D renderer state available").toBeTruthy();
    expect(render!.renderLinks, "3D line layer is rendered").toBe(true);
    expect(render!.linkCount, "link count matches edge count").toBe(edgeCount);
    expect(render!.positionAttributeLength, "position buffer is edges*2*3").toBe(edgeCount * 2 * 3);
    expect(render!.colorAttributeLength, "color buffer is edges*2*3").toBe(edgeCount * 2 * 3);

    await proofShot(page, testInfo, "after-edges-3d");
  });
```

### Step 5.3: Add the 3D isolate-brighten test

- [ ] Add this test directly after the one from Step 5.2. (3D has no reliable WebGL screen-position hit-test, so it drives the production click handler via the bridge — the same closure the raycaster calls.)

```ts
  test("3D edges: isolating a multi-project user brightens exactly their footprint", async ({ page }, testInfo) => {
    const sample = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getEdgeSample());
    expect(sample, "a multi-project user exists").toBeTruthy();
    expect(sample!.expectedBrightCount, "sample user has >=1 edge").toBeGreaterThan(0);

    await page.getByTestId("toolbar-mode-toggle").getByRole("button", { name: "3D" }).click();
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getMode() === "3d", undefined, {
      timeout: 20_000,
    });

    expect(await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getBrightEdgeCount())).toBe(0);

    await page.evaluate((id) => window.__ACC_GRAPH_TEST__!.simulateClick(id), sample!.nodeId);
    await page.waitForFunction(
      (expected) => window.__ACC_GRAPH_TEST__!.getBrightEdgeCount() === expected,
      sample!.expectedBrightCount,
      { timeout: 15_000 },
    );
    await proofShot(page, testInfo, "after-edge-isolate-3d");

    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getBrightEdgeCount() === 0, undefined, {
      timeout: 15_000,
    });
  });
```

### Step 5.4: Run the e2e suite

- [ ] Run: `npm run test:e2e`
- [ ] Expected: PASS — both new 3D tests plus all existing 2D/3D non-regression tests. Proof shots `after-edges-3d` and `after-edge-isolate-3d` attached to the HTML report.

### Step 5.5: Commit

```bash
git add tests/e2e/acc-dc-graph.spec.ts
git commit -m "test(acc-graph): e2e coverage for 3d same-user edges"
```

---

## Task 6: Full gate + definition of done

**Files:** none (verification only)

### Step 6.1: Full unit suite

- [ ] Run: `npm run test`
- [ ] Expected: all unit tests PASS (no regressions in the access-analysis suite or elsewhere).

### Step 6.2: Full e2e suite

- [ ] Run: `npm run test:e2e`
- [ ] Expected: all e2e tests PASS, including the two new 3D edge tests and existing 2D edge tests.

### Step 6.3: Confirm definition-of-done (spec §11)

- [ ] `GraphCanvas3D` unit tests (incl. new edge tests) pass.
- [ ] e2e harness passes incl. new 3D edge assertions.
- [ ] Existing 2D **and** 3D non-regression checks still pass.
- [ ] `after-edges-3d` proof screenshot present in the report.

> No squash needed — each task already committed atomically. The branch is `feat/access-analysis-redesign`; do not merge or push without explicit instruction.
