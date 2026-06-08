import { test, expect, type Page, type TestInfo } from "@playwright/test";

// The physics shell is now the default graph environment. Skip only when the projector is opted in.
test.beforeEach(() => {
  test.skip(process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH === "1", "Physics shell is the default; skip only when the projector (=1) is opted in");
});

/**
 * Current DC snapshot size (accDcGraph.bulkUsers → one node per user×project).
 * Asserted exactly per the verification standard; bump this if the dataset changes.
 */
const EXPECTED_NODE_COUNT = 16_942;

/** Capture a full-page screenshot and attach it to the HTML report as a proof artifact. */
async function proofShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const body = await page.screenshot({ fullPage: false });
  await testInfo.attach(name, { body, contentType: "image/png" });
}

/**
 * Step 1 verification — DC graph layout + renderer fitting.
 *
 * These tests drive the REAL browser (page.mouse.*) against the live cosmos.gl /
 * three.js renderers. Because the graph is a single WebGL canvas with no per-node
 * DOM, assertions about what rendered are read through window.__ACC_GRAPH_TEST__
 * (an observation bridge, flag-gated by NEXT_PUBLIC_ACC_GRAPH_TEST). Hover/click
 * use real mouse events first and fall back to the bridge's faithful handler
 * invocation (same production closures) only if the WebGL hit-test misses.
 */

const GRAPH_URL = "/users/spatial-graph";

// Minimal typing for the bridge surface we use here.
type Bridge = {
  isReady(): boolean;
  getFrozen(): boolean;
  getMode(): "2d" | "3d";
  getRenderedNodeCount(): number;
  getFeatureCount(): number;
  getPositionsStats(): {
    count: number;
    anyNaN: boolean;
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    maxAbs: number;
  };
  getLayoutStats(): {
    nodeCount: number;
    xRange: number;
    yRange: number;
    zRange: number;
    anyNaN: boolean;
  };
  getClusteringScore(dim: string): {
    ratio: number;
    sameMean: number;
    crossMean: number;
    sampledPairs: number;
  };
  getColorMode(): string;
  getColorStats(): {
    length: number;
    nodeCount: number;
    allAlphaOne: boolean;
    distinctColors: number;
    signature: number;
  };
  getFirstNodeId(): string | null;
  getCentermostNodeId(): string | null;
  getNodeScreenPosition(id: string): { x: number; y: number } | null;
  getSampleSearchPrefix(): string | null;
  getTooltipState(): {
    visible: boolean;
    index: number | null;
    feature: {
      nodeId: string;
      firmName: string;
      accountStatus: string;
      permissionCoverage: string;
    } | null;
  };
  getSelectedNodeIds(): string[];
  getIsolatedNodeId(): string | null;
  getDimmedNodeCount(): number;
  getHighlightedNodeCount(): number;
  simulateHover(id: string): boolean;
  simulateClick(id: string): boolean;
  findDensestScreenPoint(w: number, h: number): { x: number; y: number; count: number } | null;
  getProjectedCloudSize(): { widthPx: number; heightPx: number; nodeCount: number; zoom: number } | null;
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
  getRendererState(): {
    renderLinks: boolean;
    linkCount: number;
    hasLineGeometry?: boolean;
    positionAttributeLength?: number;
    colorAttributeLength?: number;
    nodeColorAttributeLength?: number;
    nodeColorNodeCount?: number;
    nodeColorDistinctColors?: number;
    nodeColorSignature?: number;
    nodeColorAllFinite?: boolean;
    nodeColorNeedsUpdate?: boolean;
  } | null;
};

declare global {
  interface Window {
    __ACC_GRAPH_TEST__?: Bridge;
  }
}

async function gotoGraph(page: Page): Promise<void> {
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  // Bridge installs once features + physics exist.
  await page.waitForFunction(() => !!window.__ACC_GRAPH_TEST__?.isReady(), undefined, {
    timeout: 120_000,
  });
  // SMOKE gate: proceed as soon as the graph is visibly rendered with VALID
  // positions — do NOT block on a perfect physics freeze. Waiting for a full
  // settle here runs once per test (beforeEach) and adds minutes to the suite;
  // the clustering MATH is proven deterministically in physicsClustering.test.ts.
  // Tests that drive a REAL positional mouse opt into waitForFreeze() instead.
  await page.waitForFunction(
    () => {
      const b = window.__ACC_GRAPH_TEST__;
      if (!b) return false;
      const s = b.getPositionsStats();
      return s.count > 0 && !s.anyNaN && s.maxAbs > 1;
    },
    undefined,
    { timeout: 90_000 },
  );
}

/**
 * Opt-in stabilization for tests that read a node's screen pixel and drive the
 * REAL mouse to it (hover, click-isolate, 2D edge-isolate). Only these need the
 * layout frozen so spaceToScreen() coordinates stop moving between read + click.
 * Smoke/regression tests that observe state through the bridge must NOT call this.
 */
async function waitForFreeze(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getFrozen() === true, undefined, {
    timeout: 90_000,
  });
}

/** Visible graph canvas origin (both 2D + 3D canvases overlay the same region). */
async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("graph canvas not found");
  return box;
}

test.describe("ACC DC graph — Step 1 stabilization", () => {
  test.beforeEach(async ({ page }) => {
    await gotoGraph(page);
  });

  test("2D renders all nodes with finite positions", async ({ page }, testInfo) => {
    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    // eslint-disable-next-line no-console
    console.log(`[2D] node count=${stats.count} maxAbs=${stats.maxAbs.toFixed(1)} anyNaN=${stats.anyNaN}`);

    expect(stats.anyNaN, "no NaN node positions").toBe(false);
    expect(stats.count, "2D graph renders the exact DC node set").toBe(EXPECTED_NODE_COUNT);
    expect(stats.maxAbs, "layout is non-degenerate (spread out)").toBeGreaterThan(1);

    const counts = await page.evaluate(() => ({
      rendered: window.__ACC_GRAPH_TEST__!.getRenderedNodeCount(),
      features: window.__ACC_GRAPH_TEST__!.getFeatureCount(),
      mode: window.__ACC_GRAPH_TEST__!.getMode(),
    }));
    expect(counts.mode).toBe("2d");
    expect(counts.rendered).toBe(EXPECTED_NODE_COUNT);
    expect(counts.features).toBe(EXPECTED_NODE_COUNT);

    await expect(page.locator("canvas").first()).toBeVisible();
    await proofShot(page, testInfo, "after-2d-load");
  });

  test("default layout (user blob) loads flat 2D with finite, non-runaway positions", async ({ page }, testInfo) => {
    // Smoke/regression only — proven deterministically elsewhere:
    //   - clustering MATH (ratios)            → physicsClustering.test.ts
    //   - post-freeze normalization to ≈350   → physicsLayer.test.ts
    // The DEFAULT layout is now the ORGANIC USER BLOB: every node is grouped by
    // user name, with z=0 targets for all nodes (descriptorTarget sets out[i*3+2]=0
    // for blob descriptors). The physics sim (d3-force-3d under the test flag) has
    // no z anchors, so the settled layout is intentionally FLAT (zRange ≈ 0).
    // We assert FLATNESS here — not volumetric depth.
    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getLayoutStats());
    // eslint-disable-next-line no-console
    console.log(
      `[layout default] n=${stats.nodeCount} x=${stats.xRange.toFixed(1)} y=${stats.yRange.toFixed(1)} z=${stats.zRange.toFixed(1)} anyNaN=${stats.anyNaN}`,
    );
    expect(stats.anyNaN, "no NaN positions").toBe(false);
    expect(stats.nodeCount, "renders the full DC node set").toBe(EXPECTED_NODE_COUNT);
    expect(stats.xRange, "x spread (blob spreads horizontally)").toBeGreaterThan(1);
    expect(stats.yRange, "y spread (blob spreads vertically)").toBeGreaterThan(1);
    // User-blob is a flat 2D layout: z targets are all 0 → zRange should be negligible.
    expect(stats.zRange, "blob layout is flat (z is intentionally near-zero)").toBeLessThan(
      0.05 * Math.max(stats.xRange, stats.yRange),
    );

    // Coordinates are finite and non-runaway pre-freeze: anyNaN already rules out
    // NaN/Infinity; assert the spread is non-degenerate yet far below a
    // force-explosion ceiling (~6× ANCHOR_RADIUS). The exact post-freeze
    // normalization to LAYOUT_HALF_EXTENT is asserted in physicsLayer.test.ts.
    const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(pos.anyNaN, "coordinates are finite (no NaN/Infinity)").toBe(false);
    expect(pos.maxAbs, "layout is non-degenerate").toBeGreaterThan(1);
    expect(pos.maxAbs, "no runaway/exploding coordinates").toBeLessThan(100_000);
    await proofShot(page, testInfo, "after-default-layout");
  });

  test("moving the user slider does not crash the graph (smoke)", async ({ page }, testInfo) => {
    // SMOKE only — clustering math is proven in physicsClustering.test.ts. Here we
    // just confirm a real slider interaction keeps the graph valid (no NaN, full
    // node set, finite clustering score). We do NOT wait for a full re-settle or a
    // target ratio — that would add minutes of physical settling to the suite.
    // The ONLY curated slider is "User name" (CURATED_SLIDER_IDS = ["user"]).
    const thumb = page.getByLabel("User name thumb");
    await thumb.focus();
    await page.keyboard.press("End"); // Radix slider: End → max (100)

    // Let the rAF-coalesced slider→physics push apply; do NOT wait for full freeze.
    await page.waitForTimeout(1_500);

    const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    const score = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getClusteringScore("user").ratio);
    // eslint-disable-next-line no-console
    console.log(`[slider smoke] anyNaN=${pos.anyNaN} count=${pos.count} score=${score.toFixed(3)}`);
    expect(pos.anyNaN, "no NaN after slider change").toBe(false);
    expect(pos.count, "node set intact after slider change").toBe(EXPECTED_NODE_COUNT);
    expect(Number.isFinite(score), "clustering score stays finite").toBe(true);
    await expect(page.locator("canvas").first()).toBeVisible();
    await proofShot(page, testInfo, "after-user-slider");
  });

  // NOTE: a second-slider-state duplicate-key e2e was added with the composite-key
  // fix (commit 95187af) and removed here. `savePositions` only fires from the
  // physics "end" event, so the regression requires two full 16,942-node settles
  // — settle-bound under local load, redundant with the deterministic unit proof
  // in positionsCache.test.ts ("multi-layout cache: one position row per
  // (set_hash, node_id)"), which parses the real CREATE TABLE schema in its mock
  // and reproduces the original duplicate-key crash before the fix. The cache
  // invariant lives in unit coverage; no e2e re-proof here.

  test("color mode swaps the node color buffer, with 2D/3D parity (smoke)", async ({ page }, testInfo) => {
    // SMOKE — the color MATH is proven in nodeColors.test.ts. Here we confirm the
    // selector swaps the live RGBA buffer fed to BOTH renderers: alpha stays 1
    // (dimming is mask-only), length tracks the node set, and the buffer signature
    // changes deterministically across modes. No freeze wait (bridge read only).
    const initial = await page.evaluate(() => ({
      mode: window.__ACC_GRAPH_TEST__!.getColorMode(),
      stats: window.__ACC_GRAPH_TEST__!.getColorStats(),
    }));
    // eslint-disable-next-line no-console
    console.log(
      `[color] default=${initial.mode} len=${initial.stats.length} distinct=${initial.stats.distinctColors} sig=${initial.stats.signature}`,
    );
    // NOTE: in blob mode the ACTUAL rendered colors come from clusterColorBuffer (one hue
    // per user blob), not from this state. The colorMode select still defaults to "role"
    // and controls non-blob rendering paths; blob overrides it visually.
    expect(initial.mode, "default colorMode state is role").toBe("role");
    expect(initial.stats.length, "RGBA buffer is nodeCount*4").toBe(EXPECTED_NODE_COUNT * 4);
    expect(initial.stats.nodeCount).toBe(EXPECTED_NODE_COUNT);
    expect(initial.stats.allAlphaOne, "alpha stays 1 (dimming is mask-only)").toBe(true);
    // role has many categories → the graph loads meaningfully colored, not monochrome.
    expect(initial.stats.distinctColors, "role splits into many colors").toBeGreaterThan(2);

    // Switch to internalExternal (P4: "external" id was retired, renamed to "internalExternal"
    // in the registry). A 2-class dim yields 1–2 colors on the current snapshot.
    await page.selectOption('[data-testid="toolbar-color-mode"]', "internalExternal");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getColorMode() === "internalExternal", undefined, {
      timeout: 15_000,
    });
    const external = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorStats());
    // eslint-disable-next-line no-console
    console.log(`[color] internalExternal len=${external.length} distinct=${external.distinctColors} sig=${external.signature}`);
    expect(external.length, "buffer length unchanged across modes").toBe(EXPECTED_NODE_COUNT * 4);
    expect(external.allAlphaOne, "alpha still 1 after recolor").toBe(true);
    expect(external.signature, "internalExternal coloring differs from role").not.toBe(initial.stats.signature);
    expect(external.distinctColors, "internal/external yields 1–2 colors").toBeGreaterThanOrEqual(1);
    expect(external.distinctColors, "internal/external is at most 2 categories").toBeLessThanOrEqual(2);
    await expect(page.locator("canvas").first(), "2D still renders after recolor").toBeVisible();

    // Back to role → deterministic return to the original signature.
    await page.selectOption('[data-testid="toolbar-color-mode"]', "role");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getColorMode() === "role", undefined, {
      timeout: 15_000,
    });
    const back = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorStats());
    expect(back.signature, "recoloring is deterministic (role → internalExternal → role)").toBe(
      initial.stats.signature,
    );

    // Parity: the SAME buffer feeds the 3D renderer — switching to 3D leaves the
    // color signature identical, and 3D still renders.
    // 3D-only restore: graph boots into 3D; the 2D/3D toggle was removed.
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getMode() === "3d", undefined, {
      timeout: 20_000,
    });
    await page.waitForFunction(
      () => {
        const b = window.__ACC_GRAPH_TEST__;
        const semantic = b?.getColorStats();
        const renderer = b?.getRendererState();
        return !!semantic
          && !!renderer
          && renderer.nodeColorNodeCount === semantic.nodeCount
          && renderer.nodeColorAttributeLength === semantic.nodeCount * 3
          && renderer.nodeColorDistinctColors! > 1
          && renderer.nodeColorSignature === semantic.signature;
      },
      undefined,
      { timeout: 20_000 },
    );
    const stats3d = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorStats());
    expect(stats3d.signature, "3D shares the 2D color buffer (parity)").toBe(back.signature);
    const renderer3d = await page.evaluate(() => {
      const r = window.__ACC_GRAPH_TEST__!.getRendererState();
      return {
        nodeColorAttributeLength: r?.nodeColorAttributeLength ?? 0,
        nodeColorNodeCount: r?.nodeColorNodeCount ?? 0,
        nodeColorDistinctColors: r?.nodeColorDistinctColors ?? 0,
        nodeColorSignature: r?.nodeColorSignature ?? 0,
        nodeColorAllFinite: r?.nodeColorAllFinite ?? false,
      };
    });
    // eslint-disable-next-line no-console
    console.log(
      `[color][3d] attrLen=${renderer3d.nodeColorAttributeLength} distinct=${renderer3d.nodeColorDistinctColors} sig=${renderer3d.nodeColorSignature}`,
    );
    expect(renderer3d.nodeColorNodeCount, "3D instance-color node count").toBe(EXPECTED_NODE_COUNT);
    expect(renderer3d.nodeColorAttributeLength, "3D instanceColor buffer is nodeCount*3 RGB").toBe(
      EXPECTED_NODE_COUNT * 3,
    );
    expect(renderer3d.nodeColorAllFinite, "3D instanceColor RGB has no NaN/Infinity").toBe(true);
    expect(renderer3d.nodeColorDistinctColors, "3D renderer applies distinct semantic colors").toBeGreaterThan(1);
    expect(renderer3d.nodeColorSignature, "3D renderer RGB signature matches semantic nodeColors").toBe(stats3d.signature);
    expect(await page.locator("canvas").count(), "3D canvas present").toBeGreaterThan(0);
    await proofShot(page, testInfo, "after-color-mode");
  });

  test("3D renders a non-empty, finite, centered cloud", async ({ page }, testInfo) => {
    // 3D-only restore: graph boots into 3D; the 2D/3D toggle was removed.
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getMode() === "3d", undefined, {
      timeout: 20_000,
    });

    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    // eslint-disable-next-line no-console
    console.log(
      `[3D] count=${stats.count} center=(${stats.center.map((c) => c.toFixed(1)).join(",")}) maxAbs=${stats.maxAbs.toFixed(1)}`,
    );

    expect(stats.anyNaN, "no NaN positions in 3D").toBe(false);
    expect(stats.count, "3D cloud holds the full node set").toBe(EXPECTED_NODE_COUNT);
    expect(stats.maxAbs, "cloud has volume").toBeGreaterThan(1);
    // "Centered": centroid sits near the origin relative to the cloud half-extent.
    const centerOffset = Math.hypot(...stats.center);
    expect(centerOffset).toBeLessThan(stats.maxAbs * 0.5);

    // three.js renders into a (second) canvas; at least one canvas is present.
    expect(await page.locator("canvas").count()).toBeGreaterThan(0);
    await proofShot(page, testInfo, "after-3d-load");
  });

  // NOTE: cosmos.gl's WebGL hover hit-test does NOT reliably fire from synthetic
  // Playwright mouse movement (the GPU picking pass is decoupled from DOM pointer
  // events). We attempt a real mouse hover first; if the tooltip doesn't appear we
  // fall back to the bridge's simulateHover, which invokes the SAME production
  // onPointHover closure cosmos.gl itself calls — so the assertion still covers the
  // real handler path, only the pixel-level hit-test is bypassed.
  test("hover shows tooltip backed by firm / account-status / permission-coverage", async ({ page }, testInfo) => {
    await waitForFreeze(page); // real-mouse hit-test needs stable screen coordinates
    const nodeId = await page.evaluate(
      () => window.__ACC_GRAPH_TEST__!.getCentermostNodeId() ?? window.__ACC_GRAPH_TEST__!.getFirstNodeId(),
    );
    expect(nodeId, "a target node exists").toBeTruthy();

    const local = await page.evaluate((id) => window.__ACC_GRAPH_TEST__!.getNodeScreenPosition(id!), nodeId);
    expect(local, "node has a screen position").toBeTruthy();

    // Primary path: real mouse over the node's canvas pixel.
    const box = await canvasBox(page);
    const px = box.x + local!.x;
    const py = box.y + local!.y;
    await page.mouse.move(px - 4, py - 4);
    await page.mouse.move(px, py, { steps: 6 });

    let viaRealMouse = true;
    try {
      await expect(page.getByTestId("node-tooltip")).toBeVisible({ timeout: 4_000 });
    } catch {
      // Fallback: invoke the exact production hover handler cosmos.gl would call.
      viaRealMouse = false;
      await page.evaluate((id) => window.__ACC_GRAPH_TEST__!.simulateHover(id!), nodeId);
      await expect(page.getByTestId("node-tooltip")).toBeVisible({ timeout: 4_000 });
    }
    // eslint-disable-next-line no-console
    console.log(`[hover] tooltip shown via ${viaRealMouse ? "real mouse" : "bridge fallback"}`);

    const tip = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getTooltipState());
    expect(tip.visible).toBe(true);
    expect(tip.feature, "tooltip is bound to a node").toBeTruthy();
    // The three fields the redesign must surface.
    expect(typeof tip.feature!.firmName).toBe("string");
    expect(typeof tip.feature!.accountStatus).toBe("string");
    expect(["known", "partial", "unknown"]).toContain(tip.feature!.permissionCoverage);
    await proofShot(page, testInfo, "after-tooltip");
  });

  test("click isolates a node (user-detail panel) and Escape clears it", async ({ page }, testInfo) => {
    await waitForFreeze(page); // real-mouse hit-test needs stable screen coordinates
    const nodeId = await page.evaluate(
      () => window.__ACC_GRAPH_TEST__!.getCentermostNodeId() ?? window.__ACC_GRAPH_TEST__!.getFirstNodeId(),
    );
    const local = await page.evaluate((id) => window.__ACC_GRAPH_TEST__!.getNodeScreenPosition(id!), nodeId);
    expect(local).toBeTruthy();

    const box = await canvasBox(page);
    await page.mouse.move(box.x + local!.x, box.y + local!.y, { steps: 4 });
    await page.mouse.click(box.x + local!.x, box.y + local!.y);

    const isolated = async () => page.evaluate(() => window.__ACC_GRAPH_TEST__!.getIsolatedNodeId());
    if ((await isolated()) === null) {
      // Fallback to the production onPointClick handler.
      await page.evaluate((id) => window.__ACC_GRAPH_TEST__!.simulateClick(id!), nodeId);
    }

    await expect(page.getByTestId("right-panel-stack")).toHaveAttribute("data-top-layer", "user-detail");
    await expect(page.getByTestId("user-detail-panel")).toBeVisible();
    expect(await isolated()).not.toBeNull();
    // Parity: the rail now shows the same rich ACC profile as /users (or the
    // graceful "not synced" state for a DC-only node). Either way the ACC
    // section header renders inside the detail panel.
    await expect(
      page.getByTestId("user-detail-panel").getByText(/Autodesk ACC/i),
    ).toBeVisible({ timeout: 4_000 });
    await proofShot(page, testInfo, "after-click-isolate");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("right-panel-stack")).toHaveAttribute("data-top-layer", "sliders");
    expect(await isolated()).toBeNull();
  });

  test("applying a filter dims non-matching nodes", async ({ page }, testInfo) => {
    const before = await page.evaluate(() => ({
      dimmed: window.__ACC_GRAPH_TEST__!.getDimmedNodeCount(),
      lit: window.__ACC_GRAPH_TEST__!.getHighlightedNodeCount(),
    }));
    expect(before.dimmed, "no dimming before any filter").toBe(0);

    // Open the Role popover and toggle the first available chip.
    await page.getByTestId("dim-popover-role").click();
    const firstChip = page.locator('[data-testid^="chip-role-"]').first();
    await expect(firstChip).toBeVisible();
    await firstChip.click();

    await page.waitForFunction(
      (prev) => window.__ACC_GRAPH_TEST__!.getDimmedNodeCount() > prev,
      before.dimmed,
      { timeout: 15_000 },
    );

    const after = await page.evaluate(() => ({
      dimmed: window.__ACC_GRAPH_TEST__!.getDimmedNodeCount(),
      lit: window.__ACC_GRAPH_TEST__!.getHighlightedNodeCount(),
    }));
    // eslint-disable-next-line no-console
    console.log(`[filter] dimmed ${before.dimmed}→${after.dimmed}, lit ${before.lit}→${after.lit}`);
    expect(after.dimmed).toBeGreaterThan(0);
    expect(after.lit).toBeGreaterThan(0);
    expect(after.lit).toBeLessThan(before.lit);
    await proofShot(page, testInfo, "after-filter");

    // Clear all → fully lit again. A real positional click must work now that the
    // ThemeToggle no longer overlaps the toolbar's clear-all link.
    await page.keyboard.press("Escape"); // close popover
    await page.getByTestId("toolbar-clear-all").click();
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getDimmedNodeCount() === 0, undefined, {
      timeout: 15_000,
    });
  });

  test("search highlights matching nodes and dims the rest", async ({ page }, testInfo) => {
    const prefix = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getSampleSearchPrefix());
    expect(prefix, "a searchable name prefix exists").toBeTruthy();

    const total = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getRenderedNodeCount());

    await page.getByTestId("toolbar-search").fill(prefix!);
    await page.waitForFunction(
      (t) => {
        const lit = window.__ACC_GRAPH_TEST__!.getHighlightedNodeCount();
        return lit > 0 && lit < t;
      },
      total,
      { timeout: 15_000 },
    );

    const res = await page.evaluate(() => ({
      lit: window.__ACC_GRAPH_TEST__!.getHighlightedNodeCount(),
      dimmed: window.__ACC_GRAPH_TEST__!.getDimmedNodeCount(),
    }));
    // eslint-disable-next-line no-console
    console.log(`[search "${prefix}"] lit=${res.lit} dimmed=${res.dimmed} of ${total}`);
    expect(res.lit).toBeGreaterThan(0);
    expect(res.dimmed).toBeGreaterThan(0);
    expect(res.lit + res.dimmed).toBe(total);
    await proofShot(page, testInfo, "after-search");

    await page.getByTestId("toolbar-search").fill("");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getDimmedNodeCount() === 0, undefined, {
      timeout: 15_000,
    });
  });

  test("lasso drag selects a proper subset and renders the selection pie panel", async ({ page }, testInfo) => {
    await waitForFreeze(page); // screen-space drag needs the fitted, stable view

    // GATE: the post-freeze refit must zoom the camera to the settled ≈±350 spread.
    // If it leaves the camera framing the pre-normalization ~16k spread, the whole
    // cloud collapses to a few on-screen pixels and a lasso box can only ever
    // select all-or-nothing — making the strict-subset assertion below meaningless.
    // Poll because the refit lands a frame or two after `frozen` flips true.
    await page.waitForFunction(
      () => {
        const s = window.__ACC_GRAPH_TEST__!.getProjectedCloudSize();
        return !!s && s.widthPx > 150 && s.heightPx > 150;
      },
      undefined,
      { timeout: 30_000 },
    );
    const cloud = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getProjectedCloudSize());
    // eslint-disable-next-line no-console
    console.log(`[lasso] projected cloud=${cloud!.widthPx.toFixed(0)}x${cloud!.heightPx.toFixed(0)}px (n=${cloud!.nodeCount})`);
    expect(cloud!.widthPx, "projected cloud fills a meaningful viewport width (not an 8px speck)").toBeGreaterThan(150);
    expect(cloud!.heightPx, "projected cloud fills a meaningful viewport height (not an 8px speck)").toBeGreaterThan(150);

    // The fitted cloud's position varies per run (random settle + outlier-skewed
    // fitView), so the old 60% rectangle enclosed ALL 16,934 nodes and could not
    // catch a select-all regression — and no FIXED sub-region reliably hits the
    // disc. We locate the dense cloud per-run via small-box probing
    // (findDensestScreenPoint, using the renderer's own raw screen-pixel
    // findPointsInPolygon path) and lasso a box around it that is smaller than the disc:
    // it captures the dense core while excluding the outer ring + outliers → strict
    // subset.
    //
    // CRITICAL: coordinates are relative to the LASSO OVERLAY box, where pointer
    // offsetX/Y originate — NOT page.locator("canvas").first(), which is a
    // full-viewport background canvas in a different frame.
    const total = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getRenderedNodeCount());

    await page.getByTestId("toolbar-lasso").click();
    const overlay = page.getByTestId("lasso-overlay");
    await expect(overlay).toHaveAttribute("data-active", "true");
    const ob = await overlay.boundingBox();
    if (!ob) throw new Error("lasso overlay has no bounding box");

    const dense = await page.evaluate(
      ({ w, h }) => window.__ACC_GRAPH_TEST__!.findDensestScreenPoint(w, h),
      { w: ob.width, h: ob.height },
    );
    expect(dense, "located the dense cloud region").toBeTruthy();
    // eslint-disable-next-line no-console
    console.log(`[lasso] dense=(${dense!.x.toFixed(0)},${dense!.y.toFixed(0)}) probeCount=${dense!.count}`);

    const half = 28; // smaller than the rendered disc → strict subset
    const cx = ob.x + dense!.x;
    const cy = ob.y + dense!.y;
    const x0 = cx - half;
    const y0 = cy - half;
    const x1 = cx + half;
    const y1 = cy + half;

    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y0, { steps: 10 });
    await page.mouse.move(x1, y1, { steps: 10 });
    await page.mouse.move(x0, y1, { steps: 10 });
    await page.mouse.move(x0, y0, { steps: 10 });
    await page.mouse.up();

    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getSelectedNodeIds().length > 0, undefined, {
      timeout: 15_000,
    });
    const selected = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getSelectedNodeIds().length);
    // eslint-disable-next-line no-console
    console.log(`[lasso] selected ${selected} of ${total} nodes`);
    // PROPER SUBSET — the discrimination assertions a select-all bug would fail.
    expect(selected, "selection is non-empty").toBeGreaterThan(0);
    expect(selected, "selection is a strict subset (not select-all)").toBeLessThan(total);

    await expect(page.getByTestId("right-panel-stack")).toHaveAttribute("data-top-layer", "lasso-pie");
    await expect(page.getByTestId("selection-panel")).toBeVisible();
    const count = parseInt((await page.getByTestId("selection-count").innerText()).trim(), 10);
    expect(count, "visible selection count is a non-empty subset").toBeGreaterThan(0);
    expect(count).toBeLessThan(total);

    // Pie/donut charts render as SVGs inside the selection panel.
    await expect(page.locator('[data-testid="selection-panel"] svg').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('[data-testid="selection-panel"] svg path').count()).toBeGreaterThan(0);
    await proofShot(page, testInfo, "after-lasso");
  });

  test("same-user edges are well-formed and rendered", async ({ page }, testInfo) => {
    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getEdgeStats());
    // eslint-disable-next-line no-console
    console.log(`[edges] count=${stats.count} selfEdges=${stats.selfEdges} dup=${stats.duplicates} dangling=${stats.danglingEndpoints} usersWithEdges=${stats.distinctUsersWithEdges}`);

    expect(stats.count, "graph has same-user edges").toBeGreaterThan(0);
    expect(stats.selfEdges, "no self-edges").toBe(0);
    expect(stats.duplicates, "no duplicate edges").toBe(0);
    expect(stats.danglingEndpoints, "all endpoints reference real nodes").toBe(0);
    expect(stats.distinctUsersWithEdges).toBeGreaterThan(0);

    expect(await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getBrightEdgeCount())).toBe(0);

    // Render guard: edges must be SET in cosmos AND link rendering enabled — the
    // data-only checks above pass even if renderLinks is false, so assert the
    // effective renderer state to catch a silent renderLinks regression.
    const render = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getRendererState());
    expect(render, "2D renderer state available").toBeTruthy();
    expect(render!.renderLinks, "cosmos link rendering is enabled").toBe(true);
    expect(render!.linkCount, "links are set to match the edge count").toBe(stats.count);

    await proofShot(page, testInfo, "after-edges");
  });

  test("3D edges: link layer is rendered with buffers matching the edge count", async ({ page }, testInfo) => {
    const edgeCount = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getEdgeStats().count);
    expect(edgeCount, "graph has same-user edges").toBeGreaterThan(0);

    // 3D-only restore: graph boots into 3D; the 2D/3D toggle was removed.
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

  test("3D edges: isolating a multi-project user brightens exactly their footprint", async ({ page }, testInfo) => {
    const sample = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getEdgeSample());
    expect(sample, "a multi-project user exists").toBeTruthy();
    expect(sample!.expectedBrightCount, "sample user has >=1 edge").toBeGreaterThan(0);

    // 3D-only restore: graph boots into 3D; the 2D/3D toggle was removed.
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

  test("isolating a multi-project user brightens exactly their footprint edges", async ({ page }, testInfo) => {
    await waitForFreeze(page); // real-mouse hit-test needs stable screen coordinates
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

    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getBrightEdgeCount() === 0, undefined, {
      timeout: 15_000,
    });
  });

  // ── P4 assertions ──────────────────────────────────────────────────────────

  test("P4: sidebar shows Primary group expanded and advanced groups collapsed", async ({ page }, testInfo) => {
    // Primary group is always open → its title heading is visible in the DOM.
    const primaryGroup = page.getByTestId("slider-group-Primary");
    await expect(primaryGroup, "Primary slider group is present").toBeVisible();
    // A primary dim label ("Project") must be visible inside it.
    await expect(primaryGroup.getByText("Project"), "Project slider visible in Primary group").toBeVisible();

    // Affiliation advanced group is collapsed by default → its toggle button has aria-expanded=false.
    const affiliationGroup = page.getByTestId("slider-group-Affiliation");
    await expect(affiliationGroup, "Affiliation group is present").toBeVisible();
    const affiliationToggle = affiliationGroup.getByRole("button");
    await expect(affiliationToggle, "Affiliation group starts collapsed").toHaveAttribute("aria-expanded", "false");

    // The "Company / firm" slider label must NOT be visible while the Affiliation group is collapsed.
    // (It lives inside affiliationGroup; when closed the rows are not rendered.)
    await expect(affiliationGroup.getByText("Company / firm")).not.toBeVisible();

    // Click the Affiliation header → group expands, "Company / firm" becomes visible.
    await affiliationToggle.click();
    await expect(affiliationToggle, "Affiliation group expands on click").toHaveAttribute("aria-expanded", "true");
    await expect(affiliationGroup.getByText("Company / firm"), "Company / firm label visible after expand").toBeVisible();

    await proofShot(page, testInfo, "after-p4-sidebar-groups");
  });

  test("P4: Access & permissions advanced group shows '1 active' badge (module dim default-on)", async ({ page }, testInfo) => {
    // The organic default preset has module at 0.15 (15 > 0) and isAdmin at 0 by default.
    // module is the only dim in "Access & permissions" that is active → badge reads "1 active".
    const accessGroup = page.getByTestId("slider-group-Access & permissions");
    await expect(accessGroup, "Access & permissions group is present").toBeVisible();
    await expect(accessGroup.getByText("1 active"), "badge shows 1 active dim in Access & permissions").toBeVisible();
    await proofShot(page, testInfo, "after-p4-active-badge");
  });

  test("P4: dimension search filters visible sliders", async ({ page }, testInfo) => {
    const searchBox = page.getByTestId("dimension-search");
    await expect(searchBox, "dimension search input is visible").toBeVisible();

    // Typing "company" should make Company / firm appear (search opens groups).
    await searchBox.fill("company");
    await expect(page.getByText("Company / firm").first(), "Company / firm appears in search results").toBeVisible();

    // "User name" slider should NOT appear when query is "company" (doesn't match).
    await expect(page.getByLabel("User name thumb"), "User name slider hidden while searching 'company'").not.toBeVisible();

    // Clear search → User name thumb returns (it is the only curated slider).
    await searchBox.fill("");
    await expect(page.getByLabel("User name thumb"), "User name slider returns after clearing search").toBeVisible();

    await proofShot(page, testInfo, "after-p4-dimension-search");
  });

  test("P4: color-mode select lists registry-derived options and switching changes the node color buffer", async ({ page }, testInfo) => {
    // Verify registry-derived options are present in the color-mode select.
    const select = page.locator('[data-testid="toolbar-color-mode"]');
    await expect(select, "color-mode select is visible").toBeVisible();
    const optionValues = await select.evaluate((el) =>
      Array.from((el as HTMLSelectElement).options).map((o) => o.value),
    );
    // eslint-disable-next-line no-console
    console.log(`[P4 color] options=${optionValues.join(",")}`);
    expect(optionValues, "color-mode options include 'role'").toContain("role");
    expect(optionValues, "color-mode options include 'company'").toContain("company");
    expect(optionValues, "color-mode options include 'isAdmin'").toContain("isAdmin");
    expect(optionValues, "color-mode options include 'status'").toContain("status");

    // Capture baseline (default = role).
    const baseline = await page.evaluate(() => ({
      mode: window.__ACC_GRAPH_TEST__!.getColorMode(),
      stats: window.__ACC_GRAPH_TEST__!.getColorStats(),
    }));
    expect(baseline.mode, "default color mode is role").toBe("role");

    // Switch to 'company' → bridge reports mode change and buffer signature differs.
    await page.selectOption('[data-testid="toolbar-color-mode"]', "company");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getColorMode() === "company", undefined, {
      timeout: 15_000,
    });
    const companyStats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorStats());
    // eslint-disable-next-line no-console
    console.log(`[P4 color] company len=${companyStats.length} distinct=${companyStats.distinctColors} sig=${companyStats.signature}`);
    expect(companyStats.length, "RGBA buffer length unchanged").toBe(EXPECTED_NODE_COUNT * 4);
    expect(companyStats.allAlphaOne, "alpha still 1 after recolor").toBe(true);
    expect(companyStats.signature, "company coloring differs from role").not.toBe(baseline.stats.signature);
    await expect(page.locator("canvas").first(), "canvas still rendered after color mode switch").toBeVisible();

    // Return to role → signature is deterministic.
    await page.selectOption('[data-testid="toolbar-color-mode"]', "role");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getColorMode() === "role", undefined, {
      timeout: 15_000,
    });
    const backStats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorStats());
    expect(backStats.signature, "returning to role restores original signature").toBe(baseline.stats.signature);

    await proofShot(page, testInfo, "after-p4-color-mode");
  });

  test("P4: Free preset relaxes layout without NaN or degenerate collapse", async ({ page }, testInfo) => {
    // Capture baseline positions under the organic (default) preset.
    const before = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getLayoutStats());
    expect(before.anyNaN, "baseline layout has no NaN").toBe(false);
    expect(before.nodeCount, "baseline has full node set").toBe(EXPECTED_NODE_COUNT);

    // Apply the Free / No semantic clustering preset via the preset bar.
    const freeBtn = page.getByTestId("preset-bar").getByRole("button", { name: "Free / No semantic clustering" });
    await expect(freeBtn, "Free preset button is visible").toBeVisible();
    await freeBtn.click();

    // Wait briefly for the rAF-coalesced slider→physics push to apply.
    // We do NOT wait for full freeze — same as the slider smoke test.
    await page.waitForTimeout(1_500);

    // Assert via the existing bridge: positions are finite, non-collapsed, non-runaway.
    const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    const layout = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getLayoutStats());
    // eslint-disable-next-line no-console
    console.log(
      `[P4 free] n=${pos.count} anyNaN=${pos.anyNaN} maxAbs=${pos.maxAbs.toFixed(1)} x=${layout.xRange.toFixed(1)} y=${layout.yRange.toFixed(1)} z=${layout.zRange.toFixed(1)}`,
    );

    // Positions must be finite (no NaN from a bad preset application).
    expect(pos.anyNaN, "Free preset: no NaN positions").toBe(false);
    expect(pos.count, "Free preset: node set intact").toBe(EXPECTED_NODE_COUNT);
    // Layout must be non-degenerate (not an origin-collapsed globe artifact).
    expect(pos.maxAbs, "Free preset: layout is non-degenerate (spread out)").toBeGreaterThan(1);
    expect(pos.maxAbs, "Free preset: no runaway explosion").toBeLessThan(100_000);
    // The layout is always user-blob (z=0 targets), so x/y must spread but z stays flat.
    expect(layout.xRange, "Free preset: x spread is non-degenerate").toBeGreaterThan(1);
    expect(layout.yRange, "Free preset: y spread is non-degenerate").toBeGreaterThan(1);
    expect(layout.zRange, "Free preset: blob layout stays flat (z intentionally near-zero)").toBeLessThan(
      0.05 * Math.max(layout.xRange, layout.yRange),
    );
    await expect(page.locator("canvas").first(), "canvas still rendered after Free preset").toBeVisible();

    await proofShot(page, testInfo, "after-p4-free-preset");
  });

  test("P6: riskScore advanced slider engages without breaking the graph (smoke)", async ({ page }, testInfo) => {
    // SMOKE only — riskScore clustering math is proven in unit tests. Here we just
    // confirm engaging the new advanced "Risk score" slider (which defaults OFF)
    // keeps the graph valid: no NaN, full node set, finite clustering score. We do
    // NOT wait for a full re-settle — mirrors the project slider smoke above.
    // The Risk family group is collapsed by default → expand it first (like the P4
    // "Affiliation" group expand), then drive its slider.
    await page.getByTestId("slider-group-Risk").getByRole("button").click();

    const thumb = page.getByLabel("Risk score thumb");
    await thumb.focus();
    await page.keyboard.press("End"); // Radix slider: End → max (100)

    // Let the rAF-coalesced slider→physics push apply; do NOT wait for full freeze.
    await page.waitForTimeout(1_500);

    const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    const score = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getClusteringScore("riskScore").ratio);
    // eslint-disable-next-line no-console
    console.log(`[P6 risk slider smoke] anyNaN=${pos.anyNaN} count=${pos.count} score=${score.toFixed(3)}`);
    expect(pos.anyNaN, "no NaN after riskScore slider change").toBe(false);
    expect(pos.count, "node set intact after riskScore slider change").toBe(EXPECTED_NODE_COUNT);
    expect(Number.isFinite(score), "riskScore clustering score stays finite").toBe(true);
    await expect(page.locator("canvas").first()).toBeVisible();
    await proofShot(page, testInfo, "after-p6-risk-slider");
  });

  test("P6: riskScore ordered color mode swaps the node color buffer (smoke)", async ({ page }, testInfo) => {
    // SMOKE — the ordered-ramp color MATH is proven in nodeColors.test.ts. Here we
    // confirm the new "riskScore" color mode swaps the live RGBA buffer: alpha stays
    // 1 (dimming is mask-only), length tracks the node set, the signature differs
    // from role, and the ordered ramp spans ≥2 risk levels on real data. 2D only to
    // stay fast/robust — 3D parity is already covered by the role color-mode test.
    const select = page.locator('[data-testid="toolbar-color-mode"]');
    await expect(select, "color-mode select is visible").toBeVisible();
    const optionValues = await select.evaluate((el) =>
      Array.from((el as HTMLSelectElement).options).map((o) => o.value),
    );
    // eslint-disable-next-line no-console
    console.log(`[P6 color] options=${optionValues.join(",")}`);
    expect(optionValues, "color-mode options include 'riskScore'").toContain("riskScore");

    // Capture baseline (default = role).
    const baseline = await page.evaluate(() => ({
      mode: window.__ACC_GRAPH_TEST__!.getColorMode(),
      stats: window.__ACC_GRAPH_TEST__!.getColorStats(),
    }));
    expect(baseline.mode, "default color mode is role").toBe("role");

    // Switch to 'riskScore' → bridge reports mode change; buffer recolors.
    await page.selectOption('[data-testid="toolbar-color-mode"]', "riskScore");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getColorMode() === "riskScore", undefined, {
      timeout: 15_000,
    });
    const riskStats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorStats());
    // eslint-disable-next-line no-console
    console.log(`[P6 color] riskScore len=${riskStats.length} distinct=${riskStats.distinctColors} sig=${riskStats.signature}`);
    expect(riskStats.length, "RGBA buffer is nodeCount*4").toBe(EXPECTED_NODE_COUNT * 4);
    expect(riskStats.allAlphaOne, "alpha stays 1 (dimming is mask-only)").toBe(true);
    expect(riskStats.signature, "riskScore coloring differs from role").not.toBe(baseline.stats.signature);
    // Ordered ramp over real risk levels → at least 2 distinct colors.
    expect(riskStats.distinctColors, "ordered risk ramp spans ≥2 levels").toBeGreaterThanOrEqual(2);
    await expect(page.locator("canvas").first(), "canvas still rendered after riskScore recolor").toBeVisible();

    // Return to role → deterministic return to the original signature.
    await page.selectOption('[data-testid="toolbar-color-mode"]', "role");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getColorMode() === "role", undefined, {
      timeout: 15_000,
    });
    const back = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorStats());
    expect(back.signature, "recoloring is deterministic (role → riskScore → role)").toBe(baseline.stats.signature);

    await proofShot(page, testInfo, "after-p6-risk-color-mode");
  });

  test("P7: a risk facet masks nodes without changing the node count (smoke)", async ({ page }, testInfo) => {
    // beforeEach already ran gotoGraph(page) → bridge ready, graph rendered.
    const RISK_IDS = [
      "externalHighPerm",
      "staleButActive",
      "externalProjectAdmin",
      "broadFolderAccess",
      "highActivityHighPerm",
    ];

    const total = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getRenderedNodeCount());
    const before = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getDimmedNodeCount());
    expect(before, "no dimming before any facet").toBe(0);
    expect(total, "graph rendered with nodes").toBeGreaterThan(0);

    // Open the Risk & Access disclosure by clicking the clickable <summary>.
    await page.getByTestId("toolbar-risk-access").click();

    // Read live counts; pick a risk flag that yields a PROPER subset (0 < count < total).
    const counts: Record<string, number> = {};
    for (const id of RISK_IDS) {
      const txt = (await page.getByTestId(`risk-count-${id}`).textContent())?.trim() ?? "0";
      counts[id] = Number.parseInt(txt, 10) || 0;
    }
    const candidates = RISK_IDS.filter((id) => counts[id] > 0 && counts[id] < total).sort(
      (a, b) => counts[b] - counts[a],
    );
    // eslint-disable-next-line no-console
    console.log(`[P7] risk counts=${JSON.stringify(counts)} total=${total} chosen=${candidates[0] ?? "(none)"}`);
    expect(
      candidates.length,
      `at least one risk flag is a proper subset (counts=${JSON.stringify(counts)}, total=${total})`,
    ).toBeGreaterThan(0);
    const chosen = candidates[0];

    // Toggle that facet → mask dims the non-matching nodes.
    await page.getByTestId(`risk-facet-${chosen}`).click();
    await page.waitForFunction(
      (prev) => window.__ACC_GRAPH_TEST__!.getDimmedNodeCount() > prev,
      before,
      { timeout: 15_000 },
    );

    const after = await page.evaluate(() => ({
      total: window.__ACC_GRAPH_TEST__!.getRenderedNodeCount(),
      dimmed: window.__ACC_GRAPH_TEST__!.getDimmedNodeCount(),
    }));
    // eslint-disable-next-line no-console
    console.log(`[P7] after facet '${chosen}': dimmed=${after.dimmed} of ${after.total}`);
    expect(after.total, "node COUNT unchanged (mask, not filter-out)").toBe(total);
    expect(after.dimmed, "some nodes dimmed").toBeGreaterThan(0);
    expect(after.dimmed, "not everything dimmed").toBeLessThan(after.total);
    await proofShot(page, testInfo, "after-p7-risk-facet");

    // Close the disclosure, then Clear all → dimming fully restored to 0.
    await page.getByTestId("toolbar-risk-access").click();
    await page.getByTestId("toolbar-clear-all").click();
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getDimmedNodeCount() === 0, undefined, {
      timeout: 15_000,
    });
  });

  // ── P0 regressions: physics responsiveness + camera stability + highlight ────

  test("P0: nudging a non-dominant slider re-animates the graph (reheat)", async ({ page }, testInfo) => {
    // Defect A regression. The OLD reheat gate keyed off max(allSliders), which is
    // sticky under the organic preset, so a non-dominant slider move never
    // restarted the sim. Use a real keyboard NUDGE (not End/max) on a low-default
    // dim so the scalar max stays unchanged — proving the per-dimension delta fix.
    await waitForFreeze(page); // ensure a frozen baseline first
    expect(await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getFrozen())).toBe(true);

    // "Company / firm" defaults low/zero in the organic preset (advanced group).
    // Drive ONE supra-threshold change: PageUp = +10 units = 0.10 normalized, which
    // exceeds SKIP_THRESHOLD (0.02) in a single rAF-coalesced flush. (Single arrow
    // steps are 0.01 each — below the anti-thrash threshold — and never reheat; a
    // real drag moves >2 units/frame, like this PageUp.) Company stays non-dominant,
    // so max(allSliders) is unchanged — exactly the case the old scalar-max gate skipped.
    await page.getByTestId("slider-group-Affiliation").getByRole("button").click();
    const thumb = page.getByLabel("Company / firm thumb");
    await thumb.focus();
    await thumb.press("PageUp");

    // The fix must reheat → the sim briefly unfreezes. Poll for frozen=false.
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getFrozen() === false, undefined, {
      timeout: 10_000,
    });

    const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    // eslint-disable-next-line no-console
    console.log(`[P0 reheat] anyNaN=${pos.anyNaN} count=${pos.count} maxAbs=${pos.maxAbs.toFixed(1)}`);
    expect(pos.anyNaN, "no NaN after non-dominant reheat").toBe(false);
    expect(pos.count, "node set intact after reheat").toBe(EXPECTED_NODE_COUNT);
    await expect(page.locator("canvas").first()).toBeVisible();
    await proofShot(page, testInfo, "after-p0-nondominant-slider");
  });

  test("P0: selecting a node does not move the camera (2D projected size stable)", async ({ page }, testInfo) => {
    // Defect B regression. Selection must not reframe the camera. With the fixed-
    // width panel column, isolating a node no longer resizes the graph, so the
    // projected cloud size + zoom stay put.
    await waitForFreeze(page);
    await page.waitForFunction(
      () => {
        const s = window.__ACC_GRAPH_TEST__!.getProjectedCloudSize();
        return !!s && s.widthPx > 150 && s.heightPx > 150;
      },
      undefined,
      { timeout: 30_000 },
    );
    const before = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getProjectedCloudSize());
    const id = await page.evaluate(
      () => window.__ACC_GRAPH_TEST__!.getCentermostNodeId() ?? window.__ACC_GRAPH_TEST__!.getFirstNodeId(),
    );
    await page.evaluate((nid) => window.__ACC_GRAPH_TEST__!.simulateClick(nid!), id);
    await expect(page.getByTestId("right-panel-stack")).toHaveAttribute("data-top-layer", "user-detail");

    const after = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getProjectedCloudSize());
    // eslint-disable-next-line no-console
    console.log(
      `[P0 camera] before=${before!.widthPx.toFixed(0)}x${before!.heightPx.toFixed(0)}@${before!.zoom.toFixed(3)} after=${after!.widthPx.toFixed(0)}x${after!.heightPx.toFixed(0)}@${after!.zoom.toFixed(3)}`,
    );
    // Camera unchanged → projected width + zoom within a tight tolerance (no refit).
    expect(Math.abs(after!.widthPx - before!.widthPx)).toBeLessThan(before!.widthPx * 0.05);
    expect(Math.abs(after!.zoom - before!.zoom)).toBeLessThan(Math.max(0.01, before!.zoom * 0.05));
    await proofShot(page, testInfo, "after-p0-select-camera-stable");

    await page.keyboard.press("Escape");
  });

  test("P0: isolating a multi-project user lights its footprint (not just one node)", async ({ page }, testInfo) => {
    // Defect C regression. Isolate must light the clicked node AND its same-user
    // footprint, so >1 node stays lit for a multi-project user.
    const sample = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getEdgeSample()); // a multi-project user
    expect(sample, "a multi-project user exists").toBeTruthy();

    await page.evaluate((nid) => window.__ACC_GRAPH_TEST__!.simulateClick(nid), sample!.nodeId);
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getHighlightedNodeCount() > 1, undefined, {
      timeout: 15_000,
    });
    const lit = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getHighlightedNodeCount());
    // eslint-disable-next-line no-console
    console.log(`[P0 footprint] lit=${lit} for user=${sample!.userId}`);
    expect(lit, "footprint lit, not a single isolated node").toBeGreaterThan(1);
    await proofShot(page, testInfo, "after-p0-footprint-lit");

    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getDimmedNodeCount() === 0, undefined, {
      timeout: 15_000,
    });
  });

  // ── 2D infographic access-map smoke ────────────────────────────────────────

  test("access map boots in 2D with legend + grouped-by Role + labels overlay", async ({ page }, testInfo) => {
    // beforeEach already ran gotoGraph(page) → bridge ready, graph rendered with
    // valid positions. This smoke test asserts the THEME/GPU-INDEPENDENT DOM that
    // always mounts once the shell is ready — no GPU or positional assertions.

    // The 2D toggle is always rendered in the toolbar segmented control.
    await expect(page.getByTestId("toolbar-mode-2d")).toBeVisible();

    // The Legend component mounts once the color bucketing resolves (pure DOM,
    // no WebGL dependency). Allow up to 20s for the initial data load.
    await expect(page.getByTestId("graph-legend")).toBeVisible({ timeout: 20_000 });

    // By default the grouping dim is "role" → COLOR_MODE_LABELS["role"] = "Role".
    // The span only renders when groupedByLabel is non-empty, so this assertion
    // simultaneously confirms the shell passed a real label to the Toolbar.
    await expect(page.getByTestId("toolbar-grouped-by")).toContainText("Role");

    // The MapClusterLabels overlay container is attached to the DOM once the shell
    // mounts in 2D mode. We assert ATTACHED (not visible) because under the test
    // flag the GPU 2D sim is OFF and chip projection can be mis-seeded/scattered,
    // making individual chip visibility unreliable in e2e.
    await expect(page.getByTestId("map-cluster-labels")).toBeAttached({ timeout: 20_000 });

    await proofShot(page, testInfo, "after-access-map-2d-smoke");
  });

  // ── Embedding-map (flag-OFF default) smoke ─────────────────────────────────

  test("embedding map: no edges, no 3D toggle, click reveals neighbor-matches panel", async ({ page }, testInfo) => {
    // beforeEach already ran gotoGraph(page) → bridge ready, static-layer positions
    // loaded. ACC_3D_GRAPH_ENABLED is false in the e2e build (NEXT_PUBLIC_ACC_3D_GRAPH
    // unset), so the shell boots into the 2D embedding map:
    //   - Legend renders (color-by-company bucketed model)
    //   - show3DToggle=false → neither toolbar-mode-2d nor toolbar-mode-3d mounts
    //   - deriveSameUserEdges is bypassed (edges=[]) → linkCount=0 in the renderer
    //   - NeighborMatchesPanel mounts when isolatedNodeIndex !== null + neighbors loaded

    // (a) Legend renders once color bucketing resolves.
    await expect(page.getByTestId("graph-legend")).toBeVisible({ timeout: 20_000 });

    // (b) The 2D/3D mode toggle is hidden on the embedding map (show3DToggle=false).
    // Both buttons live inside the {show3DToggle ? ... : null} guard in Toolbar.tsx
    // — assert the 3D button is absent (count=0, not merely hidden).
    expect(await page.locator('[data-testid="toolbar-mode-3d"]').count()).toBe(0);

    // (c) No edges: ACC_3D_GRAPH_ENABLED=false → edges=[], toCosmosLinks([]) → links=[].
    // The 2D renderer never calls setLinks, so linkCountRef stays 0. getRendererState()
    // delegates to GraphCanvas2D.handle.getRenderState() → { renderLinks, linkCount }.
    // Guard with ?. in case the handle is not yet wired (unlikely post-gotoGraph, but safe).
    const linkCount = await page.evaluate(
      () => window.__ACC_GRAPH_TEST__?.getRendererState?.()?.linkCount ?? 0,
    );
    expect(linkCount, "embedding map renders zero links (no same-user edges)").toBe(0);

    // (d) Clicking a node reveals the NeighborMatchesPanel. Use the bridge's
    // simulateClick (same production onPointClick closure) to guarantee a hit on a
    // real node — real canvas click at a fixed pixel is layout-dependent and
    // unreliable. The panel only renders when !ACC_3D_GRAPH_ENABLED &&
    // isolatedNodeIndex !== null && neighbors.length > 0 (instanceNeighbors query).
    // The task confirms the DB is pre-populated with embedding + neighbor data.
    const nodeId = await page.evaluate(
      () => window.__ACC_GRAPH_TEST__!.getCentermostNodeId() ?? window.__ACC_GRAPH_TEST__!.getFirstNodeId(),
    );
    expect(nodeId, "a target node exists in the embedding map").toBeTruthy();

    await page.evaluate((id) => window.__ACC_GRAPH_TEST__!.simulateClick(id!), nodeId);

    // Wait for the neighbor-matches panel to appear (tRPC round-trip for instanceNeighbors).
    await expect(page.locator('[data-testid="neighbor-matches"]')).toBeVisible({ timeout: 15_000 });

    await proofShot(page, testInfo, "after-embedding-map-smoke");
  });
});
