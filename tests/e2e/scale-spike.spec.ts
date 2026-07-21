import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * scale-spike.spec.ts — Phase 37 SCALE-01 measurement run.
 *
 * Drives the flag-gated /users/scale-spike harness on the isolated :3100 prod
 * build (NEXT_PUBLIC_ACC_SCALE_SPIKE=1 + NEXT_PUBLIC_ACC_GRAPH_TEST=1) and
 * records render-track + payload-track numbers to test-results/scale-spike.json.
 *
 * This spec RECORDS; the owner judges. Assertions are honesty invariants only
 * (bridge present, requested count honored, samples non-empty) — never fps
 * thresholds. Orchestrated by scripts/measure-scale-spike.cjs.
 */

const OUTPUT_PATH = "test-results/scale-spike.json";
const COUNT = Number(process.env.SPIKE_N ?? 4_862_301);
const SCENARIO_MS = 12_000;
// Generation (~50M PRNG draws) + 4.86M cosmos init can take minutes cold.
const READY_TIMEOUT_MS = 300_000;

interface SpikeWindow {
  __SCALE_SPIKE__?: {
    isReady(): boolean;
    getInfo(): Record<string, unknown>;
    runScenario(name: string, durationMs?: number): Promise<Record<string, unknown>>;
    runPayload(n?: number): Promise<Record<string, unknown>>;
    getResults(): Record<string, unknown>;
  };
}

async function openSpike(page: Page, query: string): Promise<void> {
  await page.goto(`/users/scale-spike?${query}`, { waitUntil: "commit" });
  await page.waitForFunction(
    () => typeof (window as unknown as SpikeWindow).__SCALE_SPIKE__ !== "undefined",
    undefined,
    { timeout: 60_000 },
  );
  await page.waitForFunction(
    () => (window as unknown as SpikeWindow).__SCALE_SPIKE__!.isReady(),
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );
}

function mergeOutput(patch: Record<string, unknown>): void {
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  const existing = existsSync(OUTPUT_PATH)
    ? (JSON.parse(readFileSync(OUTPUT_PATH, "utf8")) as Record<string, unknown>)
    : {};
  writeFileSync(OUTPUT_PATH, JSON.stringify({ ...existing, ...patch }, null, 2));
}

test.describe.configure({ mode: "serial" });

// Headless Chromium falls back to SwiftShader (software rasterization) — measured
// 0.4–1 fps that had nothing to do with the workshop GPU. Run HEADED with the
// D3D11 ANGLE backend so the numbers are the real hardware's.
test.use({
  headless: false,
  launchOptions: { args: ["--use-angle=d3d11"] },
});

/** Refuse to record software-rasterized numbers as GPU evidence. */
function assertHardwareRenderer(info: Record<string, unknown>): void {
  const renderer = String(info.renderer ?? "");
  expect(renderer, `SwiftShader fallback — not the workshop GPU: ${renderer}`).not.toContain(
    "SwiftShader",
  );
}

test("frozen pass: rest / panzoom / cpuAmbient / payload", async ({ page }) => {
  test.setTimeout(READY_TIMEOUT_MS + SCENARIO_MS * 4 + 240_000);
  await openSpike(page, `n=${COUNT}`);

  const results = await page.evaluate(
    async ({ ms }) => {
      const b = (window as unknown as SpikeWindow).__SCALE_SPIKE__!;
      await b.runScenario("rest", ms);
      await b.runScenario("panzoom", ms);
      await b.runScenario("cpuAmbient", ms);
      const payload = await b.runPayload();
      return { ...b.getResults(), payload } as Record<string, unknown>;
    },
    { ms: SCENARIO_MS },
  );

  const scenarios = results.scenarios as Record<string, { frames: number }>;
  expect(scenarios.rest.frames).toBeGreaterThan(0);
  expect(scenarios.panzoom.frames).toBeGreaterThan(0);
  expect(scenarios.cpuAmbient.frames).toBeGreaterThan(0);
  const payload = results.payload as { count: number; bytesOnWire: number };
  expect(payload.count).toBe(COUNT);
  expect(payload.bytesOnWire).toBeGreaterThan(0);
  const info = (results.info ?? {}) as { count?: number };
  expect(info.count).toBe(COUNT);
  assertHardwareRenderer(info as Record<string, unknown>);

  mergeOutput({ requestedCount: COUNT, frozenPass: results });
});

test("gpu pass: gpuDrift", async ({ page }) => {
  test.setTimeout(READY_TIMEOUT_MS + SCENARIO_MS + 120_000);
  await openSpike(page, `n=${COUNT}&gpu=1`);

  const results = await page.evaluate(
    async ({ ms }) => {
      const b = (window as unknown as SpikeWindow).__SCALE_SPIKE__!;
      await b.runScenario("gpuDrift", ms);
      return b.getResults();
    },
    { ms: SCENARIO_MS },
  );

  const scenarios = results.scenarios as Record<string, { frames: number }>;
  expect(scenarios.gpuDrift.frames).toBeGreaterThan(0);
  assertHardwareRenderer((results.info ?? {}) as Record<string, unknown>);

  mergeOutput({ gpuPass: results });
});
