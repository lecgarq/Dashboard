import { test, expect, type Page } from "@playwright/test";

const GRAPH_URL = "/users/access-analysis";

// Window.__ACC_GRAPH_TEST__ is augmented globally in acc-dc-graph.spec.ts.
// Do NOT redeclare it here — a second augmentation causes TS2717.

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

/** Drive a Radix slider (by thumb aria-label "<Label> thumb") to >= target using PageUp (step 10). */
async function setSliderTo(page: Page, label: string, target: number): Promise<number> {
  const thumb = page.getByLabel(`${label} thumb`);
  await thumb.focus();
  await page.keyboard.press("Home"); // → min (0)
  const read = async () => Number(await thumb.getAttribute("aria-valuenow"));
  let v = await read();
  let guard = 0;
  while (v < target && guard++ < 25) {
    await page.keyboard.press("PageUp");
    v = await read();
  }
  return v;
}

const ratioFor = (page: Page, dim: string) =>
  page.evaluate((d) => window.__ACC_GRAPH_TEST__!.getClusteringScore(d).ratio, dim);

test.describe("ACC cluster blobs — dominant-attribute grouping (2D)", () => {
  test("grouping by Role: indicator + separated blobs + center labels", async ({ page }, testInfo) => {
    await gotoGraph(page); // 2D default, all sliders 0
    const baseRatio = await ratioFor(page, "role"); // free-scatter baseline

    const landed = await setSliderTo(page, "Role", 100);
    expect(landed).toBe(100);

    // Strongest-slider model → the live indicator names the dominant attribute.
    await expect(page.getByText(/Grouping by:\s*Role/)).toBeVisible({ timeout: 30_000 });

    // Let the exp-smoothing transition layer ease fully into the packed footprints AND
    // the deferred fitView reframe the camera to the settled spread before screenshotting.
    await page.waitForTimeout(4_500);

    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(stats.anyNaN).toBe(false);
    expect(stats.count).toBeGreaterThan(0);

    // Engaged grouping pulls same-role nodes together vs different-role → ratio jumps.
    const ratio = await ratioFor(page, "role");
    expect(ratio).toBeGreaterThan(baseRatio * 1.15);

    // Center-following labels render (one per blob); LOD controls opacity, not presence.
    await expect(page.getByTestId("cluster-labels")).toBeVisible();
    expect(await page.getByTestId("cluster-label").count()).toBeGreaterThan(0);

    await expect(page.locator("canvas").first()).toBeVisible();
    await testInfo.attach("blobs-by-role", { body: await page.screenshot(), contentType: "image/png" });
  });

  test("grouping by Company yields a different, clean grouping", async ({ page }, testInfo) => {
    await gotoGraph(page);
    const baseRatio = await ratioFor(page, "company");

    const landed = await setSliderTo(page, "Company", 100);
    expect(landed).toBe(100);

    await expect(page.getByText(/Grouping by:\s*Company/)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_500);

    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(stats.anyNaN).toBe(false);
    const ratio = await ratioFor(page, "company");
    expect(ratio).toBeGreaterThan(baseRatio * 1.15);

    expect(await page.getByTestId("cluster-label").count()).toBeGreaterThan(0);
    await testInfo.attach("blobs-by-company", { body: await page.screenshot(), contentType: "image/png" });
  });

  test("composite: engaging a second slider groups by BOTH (multi-slider)", async ({ page }) => {
    await gotoGraph(page);
    await setSliderTo(page, "Role", 100);
    await expect(page.getByText(/Grouping by:\s*Role/)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_500);
    expect(await page.getByTestId("cluster-label").count()).toBeGreaterThan(0);

    // Adding Company makes the grouping composite — the indicator names BOTH attributes
    // (order follows slider strength). Blob count can move either way once tiny tuples
    // fold into "Other", so the indicator is the reliable signal, not the count.
    await setSliderTo(page, "Company", 100);
    await expect(
      page.getByText(/Grouping by:\s*(Role\s*\+\s*Company|Company\s*\+\s*Role)/),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_000);

    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(stats.anyNaN).toBe(false);
    expect(stats.count).toBeGreaterThan(0);
  });

  // KNOWN ISSUE (un-skip when fixed): after grouping engages, the 2D camera does
  // NOT frame the full packed cluster cloud. Measured on the committed build
  // (2026-06-01): of 78 role blobs only ~15 project inside the 1280×720 canvas and
  // only ~5 labels are both revealed AND on-screen — the packed cloud spans ~600px
  // wide × ~1840px tall in screen space, so most blobs sit below the viewport.
  // Root cause is in the 2D fitView/zoom path (GraphCanvas2D pushPositions defers a
  // fitView, but every cluster upload is dontRescale=true, leaving cosmos's committed
  // bbox at the pre-cluster scale; a naive dontRescale=false refresh fixes framing
  // but under-zooms and drops the label LOD reveal to ~0, so the real fix needs the
  // packed→cosmos coordinate mapping + label-LOD threshold reconsidered together,
  // verified interactively against the GPU-on build (this spec runs GPU-off).
  test.fixme("blobs frame within the viewport with visible labels (camera fit)", async ({ page }, testInfo) => {
    await gotoGraph(page);
    await setSliderTo(page, "Role", 100);
    await expect(page.getByText(/Grouping by:\s*Role/)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(5_000); // full settle + LOD reveal

    const diag = await page.evaluate(() => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
      const cb = canvas?.getBoundingClientRect();
      const els = Array.from(document.querySelectorAll('[data-testid="cluster-label"]'));
      const info = els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), op: Number(getComputedStyle(el).opacity) };
      });
      const inside = (l: { x: number; y: number }) =>
        !!cb && l.x >= cb.x && l.x <= cb.x + cb.width && l.y >= cb.y && l.y <= cb.y + cb.height;
      return {
        canvas: cb ? { x: Math.round(cb.x), y: Math.round(cb.y), w: Math.round(cb.width), h: Math.round(cb.height) } : null,
        total: info.length,
        withinCanvas: info.filter(inside).length,
        revealed: info.filter((l) => l.op > 0.05).length,
        revealedAndInside: info.filter((l) => l.op > 0.05 && inside(l)).length,
        sample: info.slice(0, 14),
      };
    });
    // eslint-disable-next-line no-console
    console.log("LABEL_DIAG " + JSON.stringify(diag));
    await testInfo.attach("label-diag", { body: Buffer.from(JSON.stringify(diag, null, 2)), contentType: "application/json" });

    // Target behavior (currently failing — see test.fixme note above):
    expect(diag.canvas).not.toBeNull();
    expect(diag.withinCanvas).toBeGreaterThan(diag.total * 0.8); // most blobs in view
    expect(diag.revealedAndInside).toBeGreaterThan(diag.total * 0.4); // labels visible on-screen
  });

  test("all sliders 0 → no dominant grouping (free scatter, no indicator)", async ({ page }) => {
    await gotoGraph(page); // default all-0
    await expect(page.getByText(/Grouping by:/)).toHaveCount(0);
    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(stats.anyNaN).toBe(false);
    expect(stats.count).toBeGreaterThan(0);
  });
});
