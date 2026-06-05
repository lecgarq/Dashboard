import { test, expect, type Page } from "@playwright/test";

// The 3D embedding projector is now the default graph environment. This legacy 2D/3D shell
// suite only applies when the legacy shell is explicitly enabled.
test.beforeEach(() => {
  test.skip(process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH !== "0", "Legacy 2D/3D shell — run with NEXT_PUBLIC_ACC_PERSON_GRAPH=0");
});

const GRAPH_URL = "/users/spatial-graph";

// Window.__ACC_GRAPH_TEST__ is augmented globally in acc-dc-graph.spec.ts.
// Do NOT redeclare it here — a second augmentation causes TS2717.

async function gotoGraph(page: Page): Promise<void> {
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  // The FIRST test in a fresh-server run pays the cold next-dev compile + the
  // 16,942-row DC snapshot load, which varies ~95s–2.2min on a loaded dev box. Give
  // readiness a wide margin so this isn't a machine-load flake (see project memory).
  await page.waitForFunction(() => !!window.__ACC_GRAPH_TEST__?.isReady(), undefined, { timeout: 220_000 });
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

// CURATED SLIDER SET (2026-06-02): pared to a single "User name" slider so we can nail
// that one behavior before re-introducing project/role. The dominant-attribute blob
// machinery is attribute-agnostic, so this suite exercises the User-name dim exactly
// the way it used to exercise Role. The grid + camera-fit tests below are SKIPPED until
// project/role return — and they return as an ORGANIC multi-attribute layout, NOT the
// rigid cross-tab grid (Luis: "the form always needs to be organic, not like a fixed grid").
test.describe("ACC cluster blobs — single User-name slider (2D)", () => {
  test("grouping by User name: indicator + organic blobs + center labels", async ({ page }, testInfo) => {
    test.setTimeout(360_000); // cold-boot data load can exceed the 120s default on a loaded box
    await gotoGraph(page); // 2D default, slider 0

    const landed = await setSliderTo(page, "User name", 100);
    expect(landed).toBe(100);

    // Single-slider model → the live indicator names the active attribute.
    await expect(page.getByText(/Grouping by:\s*User name/)).toBeVisible({ timeout: 30_000 });

    // Let the exp-smoothing transition layer ease fully into the packed footprints AND
    // the deferred fitView reframe the camera to the settled spread before screenshotting.
    await page.waitForTimeout(4_500);

    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(stats.anyNaN).toBe(false);
    expect(stats.count).toBeGreaterThan(0);

    // Center-following labels render (one per labeled blob); LOD controls opacity, not presence.
    // NOTE: we intentionally do NOT assert getClusteringScore("user") — the test bridge's
    // categoryValue() resolves through dimensionRegistry, whose RUNTIME_DIMENSION_IDS does
    // not include "user" (the User-name dim lives only in dimensionCatalog). The visual
    // grouping is unaffected; the indicator + rendered labels are the registry-independent
    // proof that the single-slider blob layout engaged.
    await expect(page.getByTestId("cluster-labels")).toBeVisible();
    expect(await page.getByTestId("cluster-label").count()).toBeGreaterThan(0);

    await expect(page.locator("canvas").first()).toBeVisible();
    await testInfo.attach("blobs-by-user", { body: await page.screenshot(), contentType: "image/png" });
  });

  // RETURNS with project/role: a second slider must produce an ORGANIC composite layout,
  // not the cross-tab grid this test asserted. Skipped (not deleted) so the intent — and
  // the axis-header/grid signals it checked — are preserved for the rewrite.
  test.skip("composite: a second slider switches to an organic multi-attribute layout", async () => {
    // re-enable when project/role sliders return (organic form, per feedback_organic_never_grid)
  });

  // RETURNS once the User-name LOD thresholds are validated against real data on an idle
  // machine (e2e is load-flaky on the dev box). The camera-fit assertion was historically
  // a fixme; revalidate the "revealed labels framed" bar for ~3,367 user blobs before
  // re-enabling rather than guessing thresholds blind.
  test.skip("blobs frame within the viewport with visible labels (camera fit)", async () => {
    // revalidate revealed-label thresholds for the single User-name slider, then re-enable
  });

  test("slider 0 → no dominant grouping (free scatter, no indicator)", async ({ page }) => {
    test.setTimeout(360_000); // cold-boot data load can exceed the 120s default on a loaded box
    await gotoGraph(page); // default 0
    await expect(page.getByText(/Grouping by:/)).toHaveCount(0);
    const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(stats.anyNaN).toBe(false);
    expect(stats.count).toBeGreaterThan(0);
  });
});
