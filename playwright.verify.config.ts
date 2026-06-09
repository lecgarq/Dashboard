import { defineConfig, devices } from "@playwright/test";

/**
 * playwright.verify.config.ts — Runs the cluster-label proof against a PRODUCTION test
 * build served by `next start` on :3100 (NEXT_DIST_DIR=.next-e2e, built with
 * NEXT_PUBLIC_ACC_GRAPH_TEST=1). This sidesteps the webpack-dev `pg`/`fs` bundling error
 * in the default config's `next dev` webServer — production build externalizes pg fine.
 *
 * Start the server yourself first (see scripts comment), then:
 *   E2E_BASE_URL=http://localhost:3100 npx playwright test acc-cluster-labels \
 *     --config playwright.verify.config.ts
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./playwright/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 360_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    storageState: "./playwright/.auth/storageState.json",
    trace: "off",
    screenshot: "on",
    video: "off",
    viewport: { width: 1600, height: 1000 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // No webServer: a production `next start` on :3100 is started out-of-band.
});
