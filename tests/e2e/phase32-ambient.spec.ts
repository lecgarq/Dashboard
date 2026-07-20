import { expect, test, type Page } from "@playwright/test";

type AmbientTier = 0 | 1 | 2;
type AmbientStats = {
  tier: AmbientTier;
  nodeCount: number;
  animatedNodeCount: number;
  lastWindowFps: number | null;
  positionVersion: number;
  edgeCount: number;
  linkRenderer: "cosmos-native";
};
type Phase32Bridge = {
  isReady(): boolean;
  getFirstNodeId(): string | null;
  getIsolatedNodeId(): string | null;
  getAmbientStats(): AmbientStats | null;
  exerciseAmbientController(): { sequence: AmbientTier[]; recoveredTier: AmbientTier } | null;
  simulateClick(nodeId: string): boolean;
};

async function gotoGraph(page: Page, route = "/users/spatial-graph"): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => (window.__ACC_GRAPH_TEST__ as unknown as Phase32Bridge | undefined)?.isReady(),
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () => {
      const stats = (window.__ACC_GRAPH_TEST__ as unknown as Phase32Bridge | undefined)?.getAmbientStats();
      return !!stats && stats.nodeCount > 22_000 && stats.edgeCount > 1_000;
    },
    undefined,
    { timeout: 120_000 },
  );
}

async function expectPopulatedWebGlFramebuffer(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  const frame = await page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll("canvas")).find((candidate) =>
      candidate.getContext("webgl2"),
    );
    if (!canvas) return null;
    const gl = canvas.getContext("webgl2");
    if (!gl) return null;
    const rect = canvas.getBoundingClientRect();
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let opaquePixels = 0;
    let coloredPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 0) opaquePixels += 1;
      if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) {
        coloredPixels += 1;
      }
    }
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      bufferWidth: gl.drawingBufferWidth,
      bufferHeight: gl.drawingBufferHeight,
      opaquePixels,
      coloredPixels,
    };
  });

  expect(frame).not.toBeNull();
  expect(frame!.bufferWidth).toBeGreaterThanOrEqual(frame!.cssWidth);
  expect(frame!.bufferHeight).toBeGreaterThanOrEqual(frame!.cssHeight);
  expect(frame!.opaquePixels).toBeGreaterThan(frame!.bufferWidth * frame!.bufferHeight * 0.9);
  // Nodes alone occupy roughly 12k pixels at this viewport. This threshold pins
  // the native similarity web itself, so counters cannot hide a blank link pass.
  expect(frame!.coloredPixels).toBeGreaterThan(50_000);
}

test.describe("Phase 32 ambient life", () => {
  test("both production aliases render the same living graph surface", async ({ page }) => {
    for (const route of ["/users/spatial-graph", "/users/access-analysis"]) {
      await gotoGraph(page, route);
      // The legacy alias canonicalizes to the spatial-graph URL after rendering.
      await expect(page).toHaveURL(/\/users\/spatial-graph$/);
      await expect(page.getByTestId("similarity-web")).toBeAttached();
      await expectPopulatedWebGlFramebuffer(page);
    }
  });

  test("records the full-data 10-second gate and observes degradation hysteresis", async ({ page }) => {
    await gotoGraph(page);
    const result = await page.evaluate(async () => {
      const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase32Bridge;
      const controller = bridge.exerciseAmbientController(); // ends reset at Tier 0
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const before = bridge.getAmbientStats();
      const startedAt = performance.now();
      let frames = 0;
      await new Promise<void>((resolve) => {
        const tick = (now: number): void => {
          frames += 1;
          if (now - startedAt >= 10_000) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const elapsedMs = performance.now() - startedAt;
      return {
        before,
        after: bridge.getAmbientStats(),
        controller,
        fps: (frames * 1_000) / elapsedMs,
        elapsedMs,
      };
    });

    expect(result.before?.nodeCount).toBeGreaterThan(22_000);
    expect(result.before?.edgeCount).toBeGreaterThan(1_000);
    expect(result.before?.linkRenderer).toBe("cosmos-native");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(10_000);
    expect(result.controller?.sequence).toEqual([0, 1, 2, 1]);
    expect(result.controller?.recoveredTier).toBe(1);

    const fullModePassed =
      result.fps >= 50 && result.before?.tier === 0 && result.after?.tier === 0;
    expect(
      fullModePassed || (result.after?.tier ?? 0) > 0,
      `fps=${result.fps.toFixed(1)} must either hold Tier 0 or visibly degrade`,
    ).toBe(true);
    console.log(JSON.stringify({ phase32AmbientGate: result }));
  });

  test("reduced motion stays static while click focus remains functional", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoGraph(page);
    const first = await page.evaluate(() => {
      const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase32Bridge;
      return bridge.getAmbientStats();
    });
    await page.waitForTimeout(500);
    const second = await page.evaluate(() => {
      const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase32Bridge;
      return bridge.getAmbientStats();
    });
    expect(first?.animatedNodeCount).toBe(0);
    expect(second?.animatedNodeCount).toBe(0);
    expect(second?.positionVersion).toBe(first?.positionVersion);

    const clicked = await page.evaluate(() => {
      const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase32Bridge;
      const nodeId = bridge.getFirstNodeId();
      return nodeId ? { nodeId, handled: bridge.simulateClick(nodeId) } : null;
    });
    expect(clicked?.handled).toBe(true);
    await page.waitForFunction(
      (nodeId) =>
        (window.__ACC_GRAPH_TEST__ as unknown as Phase32Bridge).getIsolatedNodeId() === nodeId,
      clicked?.nodeId,
    );
    await expect(page.getByTestId("similarity-web")).toBeAttached();
  });

  test("grouping morph keeps the web mounted, pauses ambient, and resumes cleanly", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await gotoGraph(page);
    await page.getByTestId("group-by-select").selectOption("role");
    const slider = page.getByRole("slider", { name: "Grouping strength thumb" });
    await expect(slider).toBeVisible();
    const box = await slider.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width * 0.35, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height / 2, { steps: 8 });
    await page.waitForFunction(
      () =>
        (window.__ACC_GRAPH_TEST__ as unknown as Phase32Bridge).getAmbientStats()?.animatedNodeCount === 0,
    );
    await expect(page.getByTestId("similarity-web")).toBeAttached();
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        ((window.__ACC_GRAPH_TEST__ as unknown as Phase32Bridge).getAmbientStats()?.animatedNodeCount ?? 0) > 0,
      undefined,
      { timeout: 3_000 },
    );
    expect(consoleErrors).toEqual([]);
  });
});
