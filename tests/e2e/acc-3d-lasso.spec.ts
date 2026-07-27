import { expect, test, type Page, type TestInfo } from "@playwright/test";

const GRAPH_URL = "/users/spatial-graph";

async function gotoActivity(page: Page): Promise<void> {
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const api = window.__ACTIVITY_UNIVERSE_TEST__;
      const state = api?.getState();
      return api?.isReady() === true && !!state?.positionsFinite && state.renderedCount > 0;
    },
    undefined,
    { timeout: 120_000 },
  );
}

test("activity lasso selects a visible strict subset and time change clears it", async ({
  page,
}, testInfo: TestInfo) => {
  await gotoActivity(page);
  const total = await page.evaluate(
    () => window.__ACTIVITY_UNIVERSE_TEST__!.getState().renderedCount,
  );

  await page.getByRole("button", { name: "Lasso" }).click();
  const overlay = page.getByTestId("lasso-overlay");
  await expect(overlay).toHaveAttribute("data-active", "true");
  const box = await overlay.boundingBox();
  if (!box) throw new Error("activity lasso overlay has no bounding box");

  const x0 = box.x + box.width * 0.03;
  const x1 = box.x + box.width * 0.46;
  const y0 = box.y + box.height * 0.12;
  const y1 = box.y + box.height * 0.82;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y0, { steps: 10 });
  await page.mouse.move(x1, y1, { steps: 10 });
  await page.mouse.move(x0, y1, { steps: 10 });
  await page.mouse.move(x0, y0, { steps: 10 });
  await page.mouse.up();

  await page.waitForFunction(
    () => (window.__ACTIVITY_UNIVERSE_TEST__?.getState().selectedCount ?? 0) > 0,
    undefined,
    { timeout: 15_000 },
  );
  const selected = await page.evaluate(
    () => window.__ACTIVITY_UNIVERSE_TEST__!.getState().selectedCount,
  );
  expect(selected, "activity lasso is non-empty").toBeGreaterThan(0);
  expect(selected, "activity lasso is a strict subset").toBeLessThan(total);
  await expect(page.getByText(`${selected} of rendered ${total} selected`)).toBeVisible();

  await page.getByTestId("activity-time-range").fill("1");
  await page.waitForFunction(
    () => {
      const s = window.__ACTIVITY_UNIVERSE_TEST__?.getState();
      return s?.selectedBucket === 1 && s.selectedCount === 0;
    },
  );
  await expect(page.getByText(/of rendered .* selected/)).toHaveCount(0);

  await testInfo.attach("activity-lasso", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});

test("activity lasso waits for the visible author filter to reach the canvas", async ({
  page,
}) => {
  await gotoActivity(page);
  await page.getByRole("button", { name: "Open dimensions" }).click();

  const dimensions = page.getByTestId("activity-dimensions-panel");
  const authorSearch = dimensions.getByRole("searchbox", { name: "Search users" });
  const lasso = page.getByRole("button", { name: "Lasso" });
  const searching = dimensions.getByText("Searching…", { exact: true }).last();

  await authorSearch.fill("yanin.corella@hermosillo.com");
  await expect(searching).toBeVisible();
  await expect(lasso).toBeDisabled();

  await expect(searching).toBeHidden({ timeout: 120_000 });
  await expect(dimensions.getByText("1 user matched", { exact: true })).toBeVisible();
  await expect(lasso).toBeEnabled();

  await lasso.click();
  await expect(page.getByTestId("lasso-overlay")).toHaveAttribute("data-active", "true");
});
