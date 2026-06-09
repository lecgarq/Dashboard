import { test, expect } from "@playwright/test";

/**
 * Verifies the access-analysis right rail is user-resizable: dragging the
 * left-edge handle widens the column, and the change is bounded + persisted.
 * Reuses the shared storageState auth + the :3100 webServer from playwright.config.
 */

function colWidth() {
  const h = document.querySelector('[data-testid="sidebar-resize-handle"]');
  const col = h?.parentElement as HTMLElement | null;
  return col ? col.getBoundingClientRect().width : -1;
}

test.describe("Access-analysis right rail", () => {
  test.setTimeout(200_000);

  test("is resizable by dragging the left-edge handle", async ({ page }, testInfo) => {
    await page.goto("/users/spatial-graph");

    // The rail (and its handle) only mount once the graph shell finishes loading.
    const handle = page.getByTestId("sidebar-resize-handle");
    await expect(handle).toBeVisible({ timeout: 150_000 });

    const before = await page.evaluate(colWidth);
    expect(before).toBeGreaterThan(0);

    // Drag the handle LEFT by 160px → the right rail should widen.
    const box = (await handle.boundingBox())!;
    const cy = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, cy);
    await page.mouse.down();
    await page.mouse.move(box.x - 160, cy, { steps: 14 });
    await page.mouse.up();

    const after = await page.evaluate(colWidth);
    // eslint-disable-next-line no-console
    console.log(`[resize] width ${before.toFixed(0)} -> ${after.toFixed(0)}`);
    expect(after, "rail widened by the drag").toBeGreaterThan(before + 80);

    const shot = await page.screenshot({ fullPage: false });
    await testInfo.attach("after-resize", { body: shot, contentType: "image/png" });
  });
});
