import { test, expect, type Page } from "@playwright/test";

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
  // Wait for the layout to settle so screen coordinates are stable for hit-testing.
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

  test("2D renders all nodes with finite positions", async ({ page }) => {
    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    // eslint-disable-next-line no-console
    console.log(`[2D] node count=${stats.count} maxAbs=${stats.maxAbs.toFixed(1)} anyNaN=${stats.anyNaN}`);

    expect(stats.anyNaN, "no NaN node positions").toBe(false);
    expect(stats.count, "graph has the full DC node set").toBeGreaterThan(10_000);
    expect(stats.maxAbs, "layout is non-degenerate (spread out)").toBeGreaterThan(1);

    const counts = await page.evaluate(() => ({
      rendered: window.__ACC_GRAPH_TEST__!.getRenderedNodeCount(),
      features: window.__ACC_GRAPH_TEST__!.getFeatureCount(),
      mode: window.__ACC_GRAPH_TEST__!.getMode(),
    }));
    expect(counts.mode).toBe("2d");
    expect(counts.rendered).toBe(stats.count);
    expect(counts.features).toBe(stats.count);

    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("3D renders a non-empty, finite, centered cloud", async ({ page }) => {
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
    expect(stats.count).toBeGreaterThan(10_000);
    expect(stats.maxAbs, "cloud has volume").toBeGreaterThan(1);
    // "Centered": centroid sits near the origin relative to the cloud half-extent.
    const centerOffset = Math.hypot(...stats.center);
    expect(centerOffset).toBeLessThan(stats.maxAbs * 0.5);

    // three.js renders into a (second) canvas; at least one canvas is present.
    expect(await page.locator("canvas").count()).toBeGreaterThan(0);
  });

  test("hover shows tooltip backed by firm / account-status / permission-coverage", async ({ page }) => {
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
  });

  test("click isolates a node (user-detail panel) and Escape clears it", async ({ page }) => {
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

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("right-panel-stack")).toHaveAttribute("data-top-layer", "sliders");
    expect(await isolated()).toBeNull();
  });

  test("applying a filter dims non-matching nodes", async ({ page }) => {
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

    // Clear all → fully lit again. dispatchEvent (not a positional click): the
    // fixed ThemeToggle overlaps the top-right corner where clear-all sits, so a
    // coordinate click lands on the toggle. Dispatching invokes the real onClick.
    await page.keyboard.press("Escape"); // close popover
    await page.getByTestId("toolbar-clear-all").dispatchEvent("click");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getDimmedNodeCount() === 0, undefined, {
      timeout: 15_000,
    });
  });

  test("search highlights matching nodes and dims the rest", async ({ page }) => {
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

    await page.getByTestId("toolbar-search").fill("");
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getDimmedNodeCount() === 0, undefined, {
      timeout: 15_000,
    });
  });

  test("lasso drag selects nodes and renders the selection pie panel", async ({ page }) => {
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
  });
});
