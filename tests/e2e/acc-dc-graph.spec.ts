import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ROUTES = ["/users/spatial-graph", "/users/access-analysis"] as const;
const FIXTURE_COUNT = 180;
const MONTH_COUNT = 3;
const MONTH_SIZE = 60;

async function gotoActivity(page: Page, route: string = ROUTES[0]): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.__ACTIVITY_UNIVERSE_TEST__?.isReady() === true,
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () => {
      const state = window.__ACTIVITY_UNIVERSE_TEST__?.getState();
      return !!state && state.positionsFinite && state.renderedCount > 0 && state.positionMaxAbs > 0;
    },
    undefined,
    { timeout: 30_000 },
  );
}

async function activityState(page: Page) {
  return page.evaluate(() => window.__ACTIVITY_UNIVERSE_TEST__!.getState());
}

async function proofShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
}

test.describe("activity universe contract", () => {
  test("both graph aliases render the finite, populated activity fixture", async ({ page }) => {
    for (const route of ROUTES) {
      await gotoActivity(page, route);
      const state = await activityState(page);
      expect(state.ready, route).toBe(true);
      expect(state.residentCount, route).toBe(FIXTURE_COUNT);
      expect(state.renderedCount, route).toBe(FIXTURE_COUNT);
      expect(state.positionsFinite, route).toBe(true);
      expect(state.positionMaxAbs, route).toBeGreaterThan(0);
      expect(state.monthCount, route).toBe(MONTH_COUNT);
      await expect(page.locator("canvas").first(), route).toBeVisible();
      await expect(page.getByTestId("activity-dimensions-panel"), route).toBeVisible();
    }
  });

  test("dimensions compose with exact-month, All, and playback truth", async ({ page }, testInfo) => {
    await gotoActivity(page);
    const initial = await activityState(page);
    expect(initial.temporalMode).toBe("all");
    expect(initial.selectedMonth).toBeNull();
    expect(initial.activeCount).toBe(FIXTURE_COUNT);

    await page.getByTestId("activity-group-by-select").selectOption("module");
    await page.getByTestId("activity-color-by-select").selectOption("verb");
    const beforeMorph = (await activityState(page)).morphCount;
    await page.getByLabel("Grouping strength thumb").focus();
    await page.keyboard.press("End");
    await page.waitForFunction(
      ({ before }) => {
        const s = window.__ACTIVITY_UNIVERSE_TEST__?.getState();
        return !!s && s.groupBy === "module" && s.colorBy === "verb" && s.strength === 100 && s.morphCount > before;
      },
      { before: beforeMorph },
    );

    await page.getByTestId("activity-time-range").fill("1");
    await page.waitForFunction(
      ({ month, count }) => {
        const s = window.__ACTIVITY_UNIVERSE_TEST__?.getState();
        return s?.temporalMode === "month" && s.selectedMonth === month && s.activeCount === count;
      },
      { month: 1, count: MONTH_SIZE },
    );
    const month = await activityState(page);
    expect(month.renderedCount).toBe(MONTH_SIZE);
    expect(month.groupBy).toBe("module");
    expect(month.colorBy).toBe("verb");
    expect(month.strength).toBe(100);
    await expect(page.getByTestId("activity-time-label")).toHaveText("Feb 2026");
    await expect(page.getByTestId("activity-time-count")).toHaveText("60 / 180 events");

    const legendTotal = (await page.getByTestId("activity-color-legend").locator("li").allTextContents())
      .map((text) => Number(text.match(/([\d,]+)\s*$/)?.[1].replaceAll(",", "") ?? 0))
      .reduce((sum, value) => sum + value, 0);
    expect(legendTotal, "legend counts describe the active month").toBe(MONTH_SIZE);

    await page.getByTestId("activity-time-all").click();
    await page.waitForFunction(
      (count) => window.__ACTIVITY_UNIVERSE_TEST__?.getState().activeCount === count,
      FIXTURE_COUNT,
    );
    expect((await activityState(page)).selectedMonth).toBeNull();

    await page.getByTestId("activity-time-play").click();
    await page.waitForFunction(
      () => {
        const s = window.__ACTIVITY_UNIVERSE_TEST__?.getState();
        return s?.playing === true && s.selectedMonth === 0;
      },
    );
    await page.waitForFunction(
      () => {
        const s = window.__ACTIVITY_UNIVERSE_TEST__?.getState();
        return s?.playing === false && s.selectedMonth === 2;
      },
      undefined,
      { timeout: 6_000 },
    );
    expect((await activityState(page)).activeCount).toBe(MONTH_SIZE);

    await page.getByTestId("activity-time-all").click();
    await page.getByTestId("activity-time-play").click();
    await page.waitForFunction(() => window.__ACTIVITY_UNIVERSE_TEST__?.getState().playing === true);
    await page.getByTestId("activity-time-range").fill("1");
    await page.waitForFunction(() => window.__ACTIVITY_UNIVERSE_TEST__?.getState().playing === false);

    await proofShot(page, testInfo, "activity-time-dimensions");
  });
});

test.describe("activity universe reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("keeps static month stepping and removes autoplay", async ({ page }) => {
    await gotoActivity(page);
    expect((await activityState(page)).reducedMotion).toBe(true);
    await expect(page.getByTestId("activity-time-play")).toBeDisabled();

    const range = page.getByTestId("activity-time-range");
    await range.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => {
        const s = window.__ACTIVITY_UNIVERSE_TEST__?.getState();
        return s?.selectedMonth === 1 && s.activeCount === 60;
      },
    );
    expect((await activityState(page)).playing).toBe(false);
  });
});
