/* eslint-disable no-console */
/**
 * Phase 4 Plan 07 — Perf Pre-Flight (PERF-GATE)
 *
 * Measures FPS + memory-proxy of the Cosmos.gl spatial graph at the live
 * Hermosillo node count plus 2x / 5x synthetic-folder-node multipliers.
 * Emits the raw numbers; PERF-GATE.md GO/NO-GO is filled in afterward.
 *
 * Approach used: OPTION A (Playwright headless Chromium).
 * Cosmos.gl v3 alpha NOTE: getSimulationAlpha() returns (1 - progress) — i.e.
 * INVERTED from d3 alpha. Not consumed here directly; flagged for any future
 * "settled" gate that reads alpha.
 *
 * Status: SCRIPT-READY-BUT-DEFERRED.
 *
 * Per Luis directive 2026-05-12 ("continue with the next waves, don't wait
 * for verification, we will verify it at the end") this script is NOT
 * executed during automated plan execution. The decision in PERF-GATE.md
 * stays `GRAPH-04-GATE=PENDING-MANUAL-PERF-MEASUREMENT` until a real run
 * captures numbers at phase-end manual UAT.
 *
 * To run manually:
 *   1. Start the dev server: `npm run dev` (defaults to http://localhost:3000)
 *   2. Sign in once in a regular browser so the session cookie exists.
 *   3. Export the auth cookie via DevTools → Application → Cookies, save the
 *      whole storageState JSON to .secrets/playwright-storage.json
 *      (or set PERF_PREFLIGHT_STORAGE_STATE env var to a custom path).
 *   4. node scripts/perf-preflight.cjs
 *
 * Output:
 *   - console.log lines: `[perf] {mult}x nodes={N} fps={F} heapMB={M}`
 *   - Updates the "Raw Console Output" + "Measurements" sections of
 *     .planning/phases/04-folders-folder-role-permissions/PERF-GATE.md
 *     ONLY if invoked with --write-gate (defensive — never overwrite the
 *     gate file accidentally).
 */

const path = require('path');
const fs = require('fs');

const GRAPH_URL = process.env.PERF_PREFLIGHT_URL || 'http://localhost:3000/users';
const STORAGE_STATE = process.env.PERF_PREFLIGHT_STORAGE_STATE
  || path.join(__dirname, '..', '.secrets', 'playwright-storage.json');
const SAMPLE_MS = Number(process.env.PERF_PREFLIGHT_SAMPLE_MS || 5000);
const MULTIPLIERS = [1, 2, 5];
const PERF_GATE_PATH = path.join(
  __dirname,
  '..',
  '.planning',
  'phases',
  '04-folders-folder-role-permissions',
  'PERF-GATE.md',
);
const WRITE_GATE = process.argv.includes('--write-gate');

async function main() {
  console.log('[perf] approach=OPTION-A (Playwright headless Chromium)');
  console.log(`[perf] target url=${GRAPH_URL} sampleMs=${SAMPLE_MS}`);

  let playwright;
  try {
    playwright = require('playwright');
  } catch (err) {
    console.error('[perf] FATAL: playwright not resolvable. Run `npm i -D playwright` first.');
    console.error(err.message);
    process.exit(1);
  }

  if (!fs.existsSync(STORAGE_STATE)) {
    console.error(`[perf] FATAL: storage state file missing at ${STORAGE_STATE}`);
    console.error('[perf] Export an authenticated session via Playwright codegen or DevTools → cookies.');
    process.exit(2);
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    storageState: STORAGE_STATE,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('pageerror', (err) => console.error('[perf][page-error]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[perf][page-console]', msg.text());
  });

  await page.goto(GRAPH_URL, { waitUntil: 'networkidle', timeout: 60_000 });

  // Wait for the cosmos canvas to mount.
  const canvasHandle = await page.waitForSelector('canvas', { timeout: 30_000 });
  // Give the simulation a beat to start.
  await page.waitForTimeout(2000);

  const measurements = [];
  for (const mult of MULTIPLIERS) {
    if (mult > 1) {
      const injected = await injectSyntheticFolderNodes(page, mult);
      console.log(`[perf] injection mult=${mult}x requested injected=${injected.injected} totalAfter=${injected.total}`);
      // Let the layout breathe.
      await page.waitForTimeout(2000);
    }
    const sample = await sampleFpsAndMemory(page, SAMPLE_MS);
    measurements.push({ multiplier: mult, ...sample });
    console.log(`[perf] ${mult}x nodes=${sample.nodeCount} fps=${sample.fps.toFixed(1)} heapMB=${sample.heapMB.toFixed(1)}`);
  }

  await browser.close();

  if (WRITE_GATE) {
    writeGateMeasurements(measurements);
    console.log(`[perf] wrote measurements into ${PERF_GATE_PATH}`);
  } else {
    console.log('[perf] dry run — pass --write-gate to update PERF-GATE.md');
  }
}

/**
 * Walk the visible graph DOM looking for any global hook the renderer
 * exposed. If nothing is exposed, fall back to a no-op (we still measure
 * FPS, but the node count stays at the rendered scene's count).
 *
 * The current renderer (app/(dashboard)/users/AccUsersGraph.tsx) does NOT
 * expose a window.__cosmosGraph debug surface as of Phase 4. Injection is
 * therefore a no-op in this script — manual UAT must either (a) patch the
 * renderer to expose `window.__cosmosGraph` (single-line dev-only hook) or
 * (b) use Option B (HTML harness) for realistic injection.
 */
async function injectSyntheticFolderNodes(page, multiplier) {
  return page.evaluate(async (m) => {
    const hook = (window).__cosmosGraph;
    if (!hook || typeof hook.addSyntheticNodes !== 'function') {
      return { injected: 0, total: (hook && hook.nodes && hook.nodes.length) || 0, skipped: 'no-hook' };
    }
    const before = hook.nodes.length;
    const target = Math.round(before * m) - before;
    const injected = hook.addSyntheticNodes(target, { kind: 'folder' });
    return { injected, total: hook.nodes.length };
  }, multiplier);
}

async function sampleFpsAndMemory(page, durationMs) {
  return page.evaluate(async (ms) => {
    // FPS via rAF counting.
    const start = performance.now();
    let frames = 0;
    await new Promise((resolve) => {
      function tick(now) {
        frames += 1;
        if (now - start >= ms) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    const fps = (frames / (elapsed / 1000));

    // Memory proxy: performance.memory.usedJSHeapSize (Chromium only, JS heap NOT GPU memory).
    const mem = (performance).memory;
    const heapMB = mem ? mem.usedJSHeapSize / (1024 * 1024) : Number.NaN;

    // Node count probe — best effort.
    const hook = (window).__cosmosGraph;
    const nodeCount = (hook && hook.nodes && hook.nodes.length) || -1;

    return { fps, heapMB, nodeCount };
  }, durationMs);
}

function writeGateMeasurements(measurements) {
  const existing = fs.existsSync(PERF_GATE_PATH) ? fs.readFileSync(PERF_GATE_PATH, 'utf8') : '';
  const rows = measurements
    .map((m) => `| ${m.multiplier}×         | ${m.nodeCount}        | ${m.fps.toFixed(1)}          | ${m.heapMB.toFixed(1)}               |`)
    .join('\n');
  const block = `<!-- BEGIN AUTO-MEASURED -->\n${rows}\n<!-- END AUTO-MEASURED -->`;
  let next;
  if (existing.includes('<!-- BEGIN AUTO-MEASURED -->')) {
    next = existing.replace(/<!-- BEGIN AUTO-MEASURED -->[\s\S]*?<!-- END AUTO-MEASURED -->/, block);
  } else {
    next = `${existing}\n\n## Auto-measured rows (most recent run)\n\n${block}\n`;
  }
  fs.writeFileSync(PERF_GATE_PATH, next, 'utf8');
}

main().catch((err) => {
  console.error('[perf] FATAL', err);
  process.exit(99);
});
