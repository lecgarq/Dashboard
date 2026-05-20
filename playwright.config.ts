import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the Access Analysis spatial graph.
 *
 * Isolation: the repo's prod server may already be running on :3000 (Task
 * Scheduler). This suite starts its OWN Next dev server on E2E_PORT (3100) with
 * NEXT_DIST_DIR=.next-e2e so it never touches the prod .next directory.
 *
 * Auth: playwright/global-setup.ts mints a NextAuth session cookie and writes
 * playwright/.auth/storageState.json, which every test loads via `use.storageState`.
 */

const PORT = process.env.E2E_PORT ?? "3100";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./playwright/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    storageState: "./playwright/.auth/storageState.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    viewport: { width: 1600, height: 1000 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --webpack --port ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_ACC_GRAPH_TEST: "1",
      NEXT_PUBLIC_NEW_ACCESS_ANALYSIS: "1",
      NEXT_DIST_DIR: ".next-e2e",
      PORT,
    },
  },
});
