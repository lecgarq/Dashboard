import { expect, test } from "@playwright/test";

const GRAPH_URL = "/users/spatial-graph";

test("2D/3D toggle mounts the 3D space-time cube and restores the 2D universe", async ({
  page,
}) => {
  test.setTimeout(360_000);
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const api = window.__ACTIVITY_UNIVERSE_TEST__;
      const state = api?.getState();
      return api?.isReady() === true && (state?.renderedCount ?? 0) > 0;
    },
    undefined,
    { timeout: 300_000 },
  );

  const toggle3d = page.getByTestId("activity-view-3d");
  await expect(toggle3d).toBeVisible();
  await toggle3d.click();
  await expect(toggle3d).toHaveAttribute("aria-pressed", "true");
  const overlay = page.getByTestId("activity-universe-3d");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator("canvas")).toHaveCount(1);
  // The hidden 2D canvas stops burning GPU on ambient drift while 3D is up.
  await expect
    .poll(() =>
      page.evaluate(() => window.__ACTIVITY_UNIVERSE_TEST__!.getState().ambientActive),
    )
    .toBe(false);

  await page.getByTestId("activity-view-2d").click();
  await expect(page.getByTestId("activity-universe-3d")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.__ACTIVITY_UNIVERSE_TEST__!.getState().ambientActive),
    )
    .toBe(true);
});
