import { test, expect, type Page, type TestInfo } from "@playwright/test";

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

const GRAPH_URL = "/users/access-analysis";

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

  test("default layout loads volumetric with finite, non-runaway positions", async ({ page }, testInfo) => {
    // Smoke/regression only — proven deterministically elsewhere:
    //   - clustering MATH (ratios)            → physicsClustering.test.ts
    //   - post-freeze normalization to ≈350   → physicsLayer.test.ts
    // This is a NO-FREEZE gate, so coordinates are still at the raw ANCHOR_RADIUS
    // scale (~16000); we only assert the real 16,934-node graph loads, is
    // volumetric with depth, has no NaN, and has not exploded to runaway values.
    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getLayoutStats());
    // eslint-disable-next-line no-console
    console.log(
      `[layout default] n=${stats.nodeCount} x=${stats.xRange.toFixed(1)} y=${stats.yRange.toFixed(1)} z=${stats.zRange.toFixed(1)} anyNaN=${stats.anyNaN}`,
    );
    expect(stats.anyNaN, "no NaN positions").toBe(false);
    expect(stats.nodeCount, "renders the full DC node set").toBe(EXPECTED_NODE_COUNT);
    expect(stats.xRange, "x spread").toBeGreaterThan(1);
    expect(stats.yRange, "y spread").toBeGreaterThan(1);
    expect(stats.zRange, "z spread (depth)").toBeGreaterThan(1);
    // Meaningful depth — not a flat disc.
    expect(stats.zRange).toBeGreaterThan(0.2 * Math.max(stats.xRange, stats.yRange));

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

  test("moving the project slider does not crash the graph (smoke)", async ({ page }, testInfo) => {
    // SMOKE only — clustering math is proven in physicsClustering.test.ts. Here we
    // just confirm a real slider interaction keeps the graph valid (no NaN, full
    // node set, finite clustering score). We do NOT wait for a full re-settle or a
    // target ratio — that would add minutes of physical settling to the suite.
    const thumb = page.getByLabel("Project thumb");
    await thumb.focus();
    await page.keyboard.press("End"); // Radix slider: End → max (100)

    // Let the rAF-coalesced slider→physics push apply; do NOT wait for full freeze.
    await page.waitForTimeout(1_500);

    const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    const score = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getClusteringScore("project").ratio);
    // eslint-disable-next-line no-console
    console.log(`[slider smoke] anyNaN=${pos.anyNaN} count=${pos.count} score=${score.toFixed(3)}`);
    expect(pos.anyNaN, "no NaN after slider change").toBe(false);
    expect(pos.count, "node set intact after slider change").toBe(EXPECTED_NODE_COUNT);
    expect(Number.isFinite(score), "clustering score stays finite").toBe(true);
    await expect(page.locator("canvas").first()).toBeVisible();
    await proofShot(page, testInfo, "after-project-slider");
  });

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
    expect(initial.mode, "default color mode is role (visually informative)").toBe("role");
    expect(initial.stats.length, "RGBA buffer is nodeCount*4").toBe(EXPECTED_NODE_COUNT * 4);
    expect(initial.stats.nodeCount).toBe(EXPECTED_NODE_COUNT);
    expect(initial.stats.allAlphaOne, "alpha stays 1 (dimming is mask-only)").toBe(true);
    // role has many categories → the graph loads meaningfully colored, not monochrome.
    expect(initial.stats.distinctColors, "role splits into many colors").toBeGreaterThan(2);

    // Switch to external → buffer must change, stay valid; a 2-class dim yields
    // 1–2 colors (monochrome on the current all-internal snapshot). Still selectable.
    await page.selectOption('[data-testid="toolbar-color-mode"]', "external");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getColorMode() === "external", undefined, {
      timeout: 15_000,
    });
    const external = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorStats());
    // eslint-disable-next-line no-console
    console.log(`[color] external len=${external.length} distinct=${external.distinctColors} sig=${external.signature}`);
    expect(external.length, "buffer length unchanged across modes").toBe(EXPECTED_NODE_COUNT * 4);
    expect(external.allAlphaOne, "alpha still 1 after recolor").toBe(true);
    expect(external.signature, "external coloring differs from role").not.toBe(initial.stats.signature);
    expect(external.distinctColors, "internal/external yields 1–2 colors").toBeGreaterThanOrEqual(1);
    expect(external.distinctColors, "internal/external is at most 2 categories").toBeLessThanOrEqual(2);
    await expect(page.locator("canvas").first(), "2D still renders after recolor").toBeVisible();

    // Back to role → deterministic return to the original signature (role → external → role).
    await page.selectOption('[data-testid="toolbar-color-mode"]', "role");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getColorMode() === "role", undefined, {
      timeout: 15_000,
    });
    const back = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorStats());
    expect(back.signature, "recoloring is deterministic (role → external → role)").toBe(
      initial.stats.signature,
    );

    // Parity: the SAME buffer feeds the 3D renderer — switching to 3D leaves the
    // color signature identical, and 3D still renders.
    await page.getByTestId("toolbar-mode-toggle").getByRole("button", { name: "3D" }).click();
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
    await page.getByTestId("toolbar-mode-toggle").getByRole("button", { name: "3D" }).click();
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

  test("lasso drag selects nodes and renders the selection pie panel", async ({ page }, testInfo) => {
    await waitForFreeze(page); // screen-space drag needs the fitted, stable view
    await page.getByTestId("toolbar-lasso").click();
    const overlay = page.getByTestId("lasso-overlay");
    await expect(overlay).toHaveAttribute("data-active", "true");

    const box = await canvasBox(page);
    // Draw a large rectangle covering the central region so it encloses many nodes.
    const x0 = box.x + box.width * 0.2;
    const y0 = box.y + box.height * 0.2;
    const x1 = box.x + box.width * 0.8;
    const y1 = box.y + box.height * 0.8;

    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y0, { steps: 12 });
    await page.mouse.move(x1, y1, { steps: 12 });
    await page.mouse.move(x0, y1, { steps: 12 });
    await page.mouse.move(x0, y0, { steps: 12 });
    await page.mouse.up();

    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getSelectedNodeIds().length > 0, undefined, {
      timeout: 15_000,
    });
    const selected = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getSelectedNodeIds().length);
    // eslint-disable-next-line no-console
    console.log(`[lasso] selected ${selected} nodes`);
    expect(selected).toBeGreaterThan(0);

    await expect(page.getByTestId("right-panel-stack")).toHaveAttribute("data-top-layer", "lasso-pie");
    await expect(page.getByTestId("selection-panel")).toBeVisible();
    const count = parseInt((await page.getByTestId("selection-count").innerText()).trim(), 10);
    expect(count).toBeGreaterThan(0);

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
});

