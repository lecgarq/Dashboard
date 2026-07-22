import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const GRAPH_URL = "/users/spatial-graph";
const OUTPUT_PATH = "test-results/activity-universe-hard-gate.json";
const SCENARIO_MS = 12_000;
const FPS_FLOOR = 50;

test.use({
  headless: false,
  launchOptions: { args: ["--use-angle=d3d11"] },
});

test("activity universe sustains the headed D3D11 Tier-0 hard gate", async ({ page }) => {
  test.setTimeout(360_000);
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const api = window.__ACTIVITY_UNIVERSE_TEST__;
      const state = api?.getState();
      return (
        api?.isReady() === true &&
        !!state?.positionsFinite &&
        state.renderedCount > 0 &&
        state.renderer.length > 0 &&
        state.lastWindowFps !== null
      );
    },
    undefined,
    { timeout: 300_000 },
  );

  const before = await page.evaluate(() => window.__ACTIVITY_UNIVERSE_TEST__!.getState());
  const sample = await page.evaluate(
    (durationMs) =>
      new Promise<{ elapsedMs: number; frames: number; fps: number }>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number): void => {
          frames += 1;
          const elapsedMs = now - start;
          if (elapsedMs >= durationMs) {
            resolve({ elapsedMs, frames, fps: (frames * 1_000) / elapsedMs });
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    SCENARIO_MS,
  );
  const after = await page.evaluate(() => window.__ACTIVITY_UNIVERSE_TEST__!.getState());

  const evidence = {
    measuredAt: new Date().toISOString(),
    scenarioMs: SCENARIO_MS,
    fpsFloor: FPS_FLOOR,
    residentCount: after.residentCount,
    renderedCount: after.renderedCount,
    renderer: after.renderer,
    sample,
    before: {
      ambientActive: before.ambientActive,
      ambientTier: before.ambientTier,
      lastWindowFps: before.lastWindowFps,
    },
    after: {
      ambientActive: after.ambientActive,
      ambientTier: after.ambientTier,
      lastWindowFps: after.lastWindowFps,
    },
  };
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));

  expect(evidence.renderer, `SwiftShader fallback: ${evidence.renderer}`).not.toContain("SwiftShader");
  expect(evidence.renderer, `D3D11 renderer required: ${evidence.renderer}`).toMatch(/D3D11/i);
  expect(before.ambientActive).toBe(true);
  expect(after.ambientActive).toBe(true);
  expect(before.ambientTier).toBe(0);
  expect(after.ambientTier).toBe(0);
  expect(sample.elapsedMs).toBeGreaterThanOrEqual(10_000);
  expect(sample.frames).toBeGreaterThan(0);
  expect(sample.fps).toBeGreaterThanOrEqual(FPS_FLOOR);
});
