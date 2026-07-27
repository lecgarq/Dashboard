import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const GRAPH_URL = "/users/spatial-graph";
const RUNS = 5;
const OUTPUT_PATH = "test-results/spatial-graph-baseline.json";

declare global {
  interface Window {
    __activityReadyAt?: number;
  }
}

interface RunResult {
  run: number;
  cold: boolean;
  firstPaintMs: number | null;
  navigationToReadyMs: number;
  residentCount: number;
  renderedCount: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measureOnce(page: Page, run: number, cold: boolean): Promise<RunResult> {
  await page.addInitScript(() => {
    function tick(): void {
      const api = window.__ACTIVITY_UNIVERSE_TEST__;
      const state = api?.getState();
      if (api?.isReady() && state?.positionsFinite && state.renderedCount > 0) {
        window.__activityReadyAt = performance.now();
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  await page.goto(GRAPH_URL, { waitUntil: "commit" });
  await page
    .waitForFunction(() => window.__ACTIVITY_UNIVERSE_TEST__ !== undefined, undefined, {
      timeout: 120_000,
    })
    .catch(() => {
      throw new Error(
        "window.__ACTIVITY_UNIVERSE_TEST__ is undefined — build with NEXT_PUBLIC_ACC_GRAPH_TEST=1",
      );
    });
  await page.waitForFunction(() => window.__activityReadyAt !== undefined, undefined, {
    timeout: 300_000,
  });

  return page.evaluate(
    ({ run, cold }) => {
      const paints = performance.getEntriesByType("paint");
      const firstPaintMs =
        paints.find((entry) => entry.name === "first-contentful-paint")?.startTime ??
        paints.find((entry) => entry.name === "first-paint")?.startTime ??
        null;
      const state = window.__ACTIVITY_UNIVERSE_TEST__!.getState();
      return {
        run,
        cold,
        firstPaintMs,
        navigationToReadyMs: window.__activityReadyAt!,
        residentCount: state.residentCount,
        renderedCount: state.renderedCount,
      };
    },
    { run, cold },
  );
}

test("activity universe baseline records median navigation-to-ready over five runs", async ({
  browser,
}) => {
  const results: RunResult[] = [];
  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext({
      storageState: "./playwright/.auth/storageState.json",
    });
    const page = await context.newPage();
    try {
      const result = await measureOnce(page, i + 1, i === 0);
      results.push(result);
      console.log(
        `[activity-baseline] run ${result.run}${result.cold ? " (cold)" : ""}: navigationToReady=${result.navigationToReadyMs.toFixed(1)}ms resident=${result.residentCount} rendered=${result.renderedCount}`,
      );
    } finally {
      await context.close();
    }
  }

  const paintValues = results
    .map((result) => result.firstPaintMs)
    .filter((value): value is number => value !== null);
  const summary = {
    measuredAt: new Date().toISOString(),
    runs: results,
    medianFirstPaintMs: paintValues.length > 0 ? median(paintValues) : null,
    medianNavigationToReadyMs: median(results.map((result) => result.navigationToReadyMs)),
    residentCount: results[0]?.residentCount ?? null,
    renderedCount: results[0]?.renderedCount ?? null,
  };
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  expect(results).toHaveLength(RUNS);
  expect(summary.medianNavigationToReadyMs).toBeGreaterThan(0);
  expect(summary.residentCount).toBeGreaterThan(0);
  expect(summary.renderedCount).toBeGreaterThan(0);
});
