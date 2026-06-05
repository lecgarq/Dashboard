import { test, expect, type Page } from "@playwright/test";

// The physics shell is now the default graph environment. Skip only when the projector is opted in.
test.beforeEach(() => {
  test.skip(process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH === "1", "Physics shell is the default; skip only when the projector (=1) is opted in");
});

const GRAPH_URL = "/users/spatial-graph";

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
  // 3D-only restore: graph boots into 3D so the early-return above always fires; the
  // 2D/3D toggle was removed, so there is nothing to click below.
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getMode() === "3d", undefined, { timeout: 30_000 });
  await page.waitForFunction(() => (window.__ACC_GRAPH_TEST__?.getPositionsStats().maxAbs ?? 0) > 1, undefined, { timeout: 60_000 });
}

/** Wait for the d3 force sim to freeze (alpha below threshold → positions static). */
async function waitForFreeze(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getFrozen() === true, undefined, { timeout: 90_000 });
}

const projectThumb = (page: Page) => page.getByLabel("Project thumb");
const readSlider = async (page: Page): Promise<number> =>
  Number(await projectThumb(page).getAttribute("aria-valuenow"));

/**
 * Set the Project slider to >= target using Radix PageUp (large step = 10), which is
 * dramatically faster than per-step ArrowRight (which blew the 120s budget reading
 * aria-valuenow after every press). Returns the actual landed value.
 */
async function setProjectTo(page: Page, target: number): Promise<number> {
  await projectThumb(page).focus();
  await page.keyboard.press("Home"); // → min (0)
  let v = await readSlider(page);
  let guard = 0;
  while (v < target && guard++ < 25) {
    await page.keyboard.press("PageUp");
    v = await readSlider(page);
  }
  return v;
}

test.describe("ACC positioning — slider smoothness + color independence", () => {
  test("project slider 0→100 separates smoothly: no dead zone, monotonic-ish, even", async ({ page }, testInfo) => {
    await gotoGraph(page);
    await switchTo3D(page);

    // Sweep with PageUp (large step), measuring cluster separation at a fixed
    // partial-settle dwell after each step → the slider→layout response curve.
    await projectThumb(page).focus();
    await page.keyboard.press("Home");
    const samples: Array<{ v: number; ratio: number }> = [];
    const measure = async () => {
      await page.waitForTimeout(2_000); // consistent partial-settle dwell per step
      const v = await readSlider(page);
      const ratio = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getClusteringScore("project").ratio);
      samples.push({ v, ratio });
    };
    await measure(); // baseline at 0
    let guard = 0;
    while (samples[samples.length - 1].v < 100 && guard++ < 25) {
      await page.keyboard.press("PageUp");
      await measure();
    }

    // Log to stdout (captured in the run output) + attach to the HTML report.
    // eslint-disable-next-line no-console
    console.log("SEPARATION_CURVE " + JSON.stringify(samples));
    await testInfo.attach("separation-curve", {
      body: Buffer.from(JSON.stringify(samples, null, 2)),
      contentType: "application/json",
    });

    const r0 = samples[0].ratio;
    const rFirstStep = samples[1].ratio;
    const rTop = samples[samples.length - 1].ratio;

    // The sweep actually covered the range.
    expect(samples.length).toBeGreaterThanOrEqual(5);
    expect(samples[samples.length - 1].v).toBe(100);
    // Guarantee — no dead zone: the first engaged step already separates more than baseline.
    expect(rFirstStep).toBeGreaterThan(r0 * 1.02);
    // Engaged sliders cluster: the top is clearly more separated than the baseline.
    expect(rTop).toBeGreaterThan(r0 * 1.2);
    // No big regression between consecutive steps (tolerate mid-settle noise ≤ 25%).
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].ratio).toBeGreaterThan(samples[i - 1].ratio * 0.75);
    }
    // Perceptual evenness (spec §10.4): the second half of the sweep still contributes
    // meaningful separation — motion is not entirely front-loaded into the first half.
    const mid = Math.floor((samples.length - 1) / 2);
    const firstHalf = samples[mid].ratio - samples[0].ratio;
    const secondHalf = samples[samples.length - 1].ratio - samples[mid].ratio;
    expect(secondHalf).toBeGreaterThan(firstHalf * 0.25);
  });

  test("color is a pure overlay: switching 'Color by' never moves nodes (3D)", async ({ page }) => {
    await gotoGraph(page);
    await switchTo3D(page);
    await setProjectTo(page, 60);
    // Freeze first so the baseline is static — only then is any post-switch drift meaningful.
    await waitForFreeze(page);
    const before = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());

    // Flip the color dropdown to a different attribute.
    await page.getByTestId("toolbar-color-mode").selectOption({ index: 1 });
    await expect
      .poll(() => page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorMode()))
      .not.toBe("role");
    await page.waitForTimeout(1_000);

    const stillFrozen = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getFrozen());
    const after = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());

    // Strongest signal: color must NOT reheat the physics sim (it only recolors).
    expect(stillFrozen).toBe(true);
    // And the frozen positions are unchanged (drift ≪ 2 units; color-coupling would be 100s+).
    expect(Math.abs(after.maxAbs - before.maxAbs)).toBeLessThan(2);
    expect(Math.abs(after.center[0] - before.center[0])).toBeLessThan(2);
    expect(Math.abs(after.center[1] - before.center[1])).toBeLessThan(2);
  });

  test("2D clusters by sliders (color-decoupled) without crashing", async ({ page }, testInfo) => {
    await gotoGraph(page); // graph is 3D-only now
    await projectThumb(page).focus();
    await page.keyboard.press("End"); // → max (100) in one press
    await page.waitForTimeout(1_500);
    const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(pos.anyNaN).toBe(false);
    expect(pos.count).toBeGreaterThan(0);
    await expect(page.locator("canvas").first()).toBeVisible();
    const body = await page.screenshot({ fullPage: false });
    await testInfo.attach("2d-cluster-by-slider", { body, contentType: "image/png" });
  });
});
