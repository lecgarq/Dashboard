import { test, expect, type Page, type TestInfo } from "@playwright/test";

// The physics shell is now the default graph environment. Skip only when the projector is opted in.
test.beforeEach(() => {
  test.skip(
    process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH === "1",
    "Physics shell is the default; skip only when the projector (=1) is opted in",
  );
});

// Window.__ACC_GRAPH_TEST__ is augmented globally in acc-dc-graph.spec.ts.
// Do NOT redeclare it here — a second augmentation causes TS2717.

const GRAPH_URL = "/users/spatial-graph";

async function gotoGraph(page: Page): Promise<void> {
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  // Bridge installs once features + physics exist.
  await page.waitForFunction(() => !!window.__ACC_GRAPH_TEST__?.isReady(), undefined, {
    timeout: 120_000,
  });
  // Proceed once the graph is visibly rendered with valid positions.
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

/** Switch to 3D so physics positions === the rendered cloud. */
async function switchTo3D(page: Page): Promise<void> {
  if ((await page.evaluate(() => window.__ACC_GRAPH_TEST__?.getMode())) === "3d") return;
  await page.getByTestId("toolbar-mode-toggle").getByRole("button", { name: "3D" }).click();
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getMode() === "3d", undefined, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => (window.__ACC_GRAPH_TEST__?.getPositionsStats().maxAbs ?? 0) > 1,
    undefined,
    { timeout: 60_000 },
  );
}

/** Wait for the physics sim to freeze (alpha below threshold → positions static). */
async function waitForFreeze(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getFrozen() === true, undefined, {
    timeout: 90_000,
  });
}

async function proofShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const body = await page.screenshot({ fullPage: false });
  await testInfo.attach(name, { body, contentType: "image/png" });
}

test.describe("ACC 3D lasso — smoke", () => {
  test("3D lasso: toolbar button is active and a drag selects a non-empty subset", async ({ page }, testInfo) => {
    test.setTimeout(360_000); // cold-boot data load can exceed the 120s default on a loaded box
    await gotoGraph(page);
    await switchTo3D(page);
    await waitForFreeze(page); // screen-space drag needs the fitted, stable view

    // GATE: the post-freeze refit must zoom the camera to the settled spread so the
    // projected cloud fills a meaningful viewport region. Poll because the refit lands
    // a frame or two after `frozen` flips true.
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
    console.log(
      `[3d-lasso] projected cloud=${cloud!.widthPx.toFixed(0)}x${cloud!.heightPx.toFixed(0)}px (n=${cloud!.nodeCount})`,
    );
    expect(cloud!.widthPx, "projected 3D cloud fills a meaningful viewport width").toBeGreaterThan(150);
    expect(cloud!.heightPx, "projected 3D cloud fills a meaningful viewport height").toBeGreaterThan(150);

    const total = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getRenderedNodeCount());

    // Enter lasso mode and assert the button is not disabled.
    const lassoBtn = page.getByTestId("toolbar-lasso");
    await lassoBtn.click();
    await expect(lassoBtn, "lasso toolbar button is not disabled").not.toBeDisabled();
    const overlay = page.getByTestId("lasso-overlay");
    await expect(overlay).toHaveAttribute("data-active", "true");
    const ob = await overlay.boundingBox();
    if (!ob) throw new Error("lasso overlay has no bounding box");

    // Locate the dense cloud region to ensure the lasso box encloses real nodes.
    const dense = await page.evaluate(
      ({ w, h }) => window.__ACC_GRAPH_TEST__!.findDensestScreenPoint(w, h),
      { w: ob.width, h: ob.height },
    );
    expect(dense, "located the dense 3D cloud region").toBeTruthy();
    // eslint-disable-next-line no-console
    console.log(
      `[3d-lasso] dense=(${dense!.x.toFixed(0)},${dense!.y.toFixed(0)}) probeCount=${dense!.count}`,
    );

    // Trace a polygon (≥3 distinct points) that encloses the dense core but is
    // smaller than the disc → strict subset assertion holds.
    const half = 28;
    const cx = ob.x + dense!.x;
    const cy = ob.y + dense!.y;
    const x0 = cx - half;
    const y0 = cy - half;
    const x1 = cx + half;
    const y1 = cy + half;

    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y0, { steps: 10 }); // point 2
    await page.mouse.move(x1, y1, { steps: 10 }); // point 3
    await page.mouse.move(x0, y1, { steps: 10 }); // point 4
    await page.mouse.move(x0, y0, { steps: 10 }); // close polygon
    await page.mouse.up();

    // Wait for a non-empty selection to land.
    await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getSelectedNodeIds().length > 0, undefined, {
      timeout: 15_000,
    });
    const selected = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getSelectedNodeIds().length);
    // eslint-disable-next-line no-console
    console.log(`[3d-lasso] selected ${selected} of ${total} nodes`);

    // Non-empty proper subset.
    expect(selected, "3D lasso selection is non-empty").toBeGreaterThan(0);
    expect(selected, "3D lasso selection is a strict subset (not select-all)").toBeLessThan(total);

    // Selection panel should surface.
    await expect(page.getByTestId("right-panel-stack")).toHaveAttribute("data-top-layer", "lasso-pie");
    await expect(page.getByTestId("selection-panel")).toBeVisible();
    const count = parseInt((await page.getByTestId("selection-count").innerText()).trim(), 10);
    expect(count, "visible selection count matches bridge count").toBe(selected);

    await proofShot(page, testInfo, "after-3d-lasso");
  });
});
