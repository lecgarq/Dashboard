import { test, expect, type Page } from "@playwright/test";

const GRAPH_URL = "/users/access-analysis";

// NOTE: Window.__ACC_GRAPH_TEST__ is already augmented globally in acc-dc-graph.spec.ts.
// Do NOT redeclare it here — a second augmentation with a local Bridge type causes TS2717.
// All bridge calls below resolve to that existing global type, which is a superset of
// the surface this spec needs.

async function gotoGraph(page: Page): Promise<void> {
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__ACC_GRAPH_TEST__?.isReady(), undefined, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const b = window.__ACC_GRAPH_TEST__;
    if (!b) return false;
    const s = b.getPositionsStats();
    return s.count > 0 && !s.anyNaN && s.maxAbs > 1;
  }, undefined, { timeout: 90_000 });
}

/** Switch to 3D so physics.getPositions() === the rendered cloud. */
async function switchTo3D(page: Page): Promise<void> {
  if ((await page.evaluate(() => window.__ACC_GRAPH_TEST__?.getMode())) === "3d") return;
  await page.getByTestId("toolbar-mode-toggle").click();
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getMode() === "3d", undefined, { timeout: 30_000 });
  await page.waitForFunction(() => (window.__ACC_GRAPH_TEST__?.getPositionsStats().maxAbs ?? 0) > 1, undefined, { timeout: 60_000 });
}

/** Drive the Project slider to an exact value via keyboard, reading aria-valuenow. */
async function setProjectSlider(page: Page, target: number): Promise<void> {
  const thumb = page.getByLabel("Project thumb");
  await thumb.focus();
  const read = async () => Number(await thumb.getAttribute("aria-valuenow"));
  let cur = await read();
  let guard = 0;
  while (cur < target && guard++ < 250) { await page.keyboard.press("ArrowRight"); cur = await read(); }
  while (cur > target && guard++ < 250) { await page.keyboard.press("ArrowLeft"); cur = await read(); }
}

async function ratioAt(page: Page, value: number): Promise<number> {
  await setProjectSlider(page, value);
  await page.waitForTimeout(1_200);
  return page.evaluate(() => window.__ACC_GRAPH_TEST__!.getClusteringScore("project").ratio);
}

test.describe("ACC positioning — slider smoothness + color independence", () => {
  test("project slider 0→100 separates smoothly: no dead zone, monotonic, even-ish", async ({ page }, testInfo) => {
    await gotoGraph(page);
    await switchTo3D(page);

    const samples: Array<{ v: number; ratio: number }> = [];
    for (const v of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      samples.push({ v, ratio: await ratioAt(page, v) });
    }
    await testInfo.attach("separation-curve", {
      body: Buffer.from(JSON.stringify(samples, null, 2)),
      contentType: "application/json",
    });

    const r0 = samples[0].ratio;
    const r10 = samples[1].ratio;
    const r100 = samples[10].ratio;

    // Guarantee 1 — no dead zone: the first 10-pt step already increases separation.
    expect(r10).toBeGreaterThan(r0 * 1.02);
    // Engaged sliders cluster: max is clearly more separated than rest.
    expect(r100).toBeGreaterThan(r0 * 1.2);
    // Monotonic-ish: no large regression between consecutive steps (force jitter ≤ 15%).
    for (let i = 2; i < samples.length; i++) {
      expect(samples[i].ratio).toBeGreaterThan(samples[i - 1].ratio * 0.85);
    }
    // Perceptual evenness (spec §10.4): the second half of the sweep (50→100) still
    // contributes meaningful separation — not all motion is front-loaded into 0→50.
    const firstHalf = samples[5].ratio - samples[0].ratio;
    const secondHalf = samples[10].ratio - samples[5].ratio;
    expect(secondHalf).toBeGreaterThan(firstHalf * 0.33);
  });

  test("color is a pure overlay: switching 'Color by' never moves nodes (3D)", async ({ page }) => {
    await gotoGraph(page);
    await switchTo3D(page);
    await setProjectSlider(page, 60);
    await page.waitForTimeout(1_500);
    const before = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());

    const select = page.getByTestId("toolbar-color-mode");
    await select.selectOption({ index: 1 });
    await expect
      .poll(() => page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorMode()))
      .not.toBe("role");
    await page.waitForTimeout(800);

    const after = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(after.maxAbs).toBeCloseTo(before.maxAbs, 3);
    expect(after.center[0]).toBeCloseTo(before.center[0], 3);
    expect(after.center[1]).toBeCloseTo(before.center[1], 3);
  });

  test("2D clusters by sliders (color-decoupled) without crashing", async ({ page }, testInfo) => {
    await gotoGraph(page);
    await setProjectSlider(page, 100);
    await page.waitForTimeout(1_500);
    const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(pos.anyNaN).toBe(false);
    expect(pos.count).toBeGreaterThan(0);
    await expect(page.locator("canvas").first()).toBeVisible();
    const body = await page.screenshot({ fullPage: false });
    await testInfo.attach("2d-cluster-by-slider", { body, contentType: "image/png" });
  });
});
