import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * spatial-graph-baseline.spec.ts — Phase 24 (PERF-04) baseline capture.
 *
 * Measures /users/spatial-graph first-paint AND time-to-graph-rendered on the
 * isolated :3100 prod build (NEXT_PUBLIC_ACC_GRAPH_TEST=1), N=5 runs, each in a
 * fresh browser context so client caches don't compound. Run 1 is the cold run.
 *
 * HONESTY CAVEAT: with the test flag on, GraphCanvas.tsx forces the GPU 2D sim
 * OFF (frozen/static-layer path) — this measures that path, not live :3000
 * behavior. Valid for regression comparison only via this identical script
 * (Phase 28 re-runs it as-is). See 24-BASELINE.md for the full record.
 *
 * Orchestrated by scripts/measure-spatial-graph-baseline.cjs, which runs this
 * spec via `npx playwright test spatial-graph-baseline --config
 * playwright.verify.config.ts` and merges its JSON output with an environment
 * record (cosmos.gl version, BUILD_ID, commit hash).
 */

// Local (non-global) window typing — tests/e2e/acc-dc-graph.spec.ts already
// augments `Window.__ACC_GRAPH_TEST__` globally with a wider `Bridge` type in
// this same tsc program; a second incompatible global augmentation would
// conflict (TS2717). Cast `window as unknown as BaselineWindow` locally instead.
interface BaselineWindow {
  __ACC_GRAPH_TEST__?: {
    isReady(): boolean;
    getRenderedNodeCount(): number;
    getFeatureCount(): number;
  };
  __baselineReadyAt?: number;
}

const GRAPH_URL = "/users/spatial-graph";
const RUNS = 5;
const OUTPUT_PATH = "test-results/spatial-graph-baseline.json";

interface RunResult {
  run: number;
  cold: boolean;
  firstPaintMs: number | null;
  timeToGraphRenderedMs: number;
  nodeCount: number;
  featureCount: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function measureOnce(page: Page, run: number, cold: boolean): Promise<RunResult> {
  // Polls from as early as possible in the page lifecycle (before app JS runs)
  // so the recorded timestamp is relative to navigation start, not to whenever
  // Playwright happens to call page.evaluate after goto resolves.
  await page.addInitScript(() => {
    const w = window as unknown as BaselineWindow;
    function tick() {
      const b = w.__ACC_GRAPH_TEST__;
      if (b && b.isReady() && b.getRenderedNodeCount() > 0) {
        w.__baselineReadyAt = performance.now();
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  await page.goto(GRAPH_URL, { waitUntil: "commit" });

  // Skip-guard: fail with a clear message if the server wasn't built with the
  // test flag, instead of hanging until the outer timeout. Generous timeout —
  // AccessAnalysisShell (which installs the bridge on mount) only mounts after
  // the DuckDB warm-up loading screen resolves (~15-20s+ cold, CONCERNS.md §3.1).
  await page
    .waitForFunction(
      () => typeof (window as unknown as BaselineWindow).__ACC_GRAPH_TEST__ !== "undefined",
      undefined,
      { timeout: 60_000 },
    )
    .catch(() => {
      throw new Error(
        "window.__ACC_GRAPH_TEST__ is undefined — server not built with NEXT_PUBLIC_ACC_GRAPH_TEST=1",
      );
    });

  await page.waitForFunction(
    () => (window as unknown as BaselineWindow).__baselineReadyAt !== undefined,
    undefined,
    { timeout: 300_000 },
  );

  return page.evaluate(
    ({ run, cold }) => {
      const paints = performance.getEntriesByType("paint");
      const firstPaintMs =
        paints.find((p) => p.name === "first-contentful-paint")?.startTime ??
        paints.find((p) => p.name === "first-paint")?.startTime ??
        null;
      const w = window as unknown as BaselineWindow;
      const bridge = w.__ACC_GRAPH_TEST__!;
      return {
        run,
        cold,
        firstPaintMs,
        timeToGraphRenderedMs: w.__baselineReadyAt!,
        nodeCount: bridge.getRenderedNodeCount(),
        featureCount: bridge.getFeatureCount(),
      };
    },
    { run, cold },
  );
}

test("spatial-graph baseline: median first-paint + time-to-graph-rendered over 5 runs", async ({
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
      // eslint-disable-next-line no-console
      console.log(
        `[baseline] run ${result.run}${result.cold ? " (cold)" : ""}: firstPaint=${result.firstPaintMs}ms timeToGraphRendered=${result.timeToGraphRenderedMs.toFixed(1)}ms nodes=${result.nodeCount}`,
      );
    } finally {
      await context.close();
    }
  }

  const firstPaintValues = results
    .map((r) => r.firstPaintMs)
    .filter((v): v is number => v != null);
  const graphRenderedValues = results.map((r) => r.timeToGraphRenderedMs);

  const summary = {
    timestamp: new Date().toISOString(),
    runs: results,
    medianFirstPaintMs: firstPaintValues.length > 0 ? median(firstPaintValues) : null,
    medianTimeToGraphRenderedMs: median(graphRenderedValues),
    nodeCount: results[0]?.nodeCount ?? null,
    featureCount: results[0]?.featureCount ?? null,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  expect(results).toHaveLength(RUNS);
  expect(summary.medianTimeToGraphRenderedMs).toBeGreaterThan(0);
});
