/**
 * uat-helpers.ts — Shared helpers for the Phase 7 Pre-Workshop UAT harness.
 *
 * ============================================================
 * RESOLVED DECISIONS (07-RESEARCH.md open questions)
 * ============================================================
 *
 * (a) BUILD ISOLATION — Safe path: stop the :3000 Task Scheduler instance,
 *     build, then serve on :3100 via `next start --port 3100`. Do NOT run
 *     `npm run build` while :3000 is live — it 500s the running app for ~8min.
 *     NEXT_DIST_DIR=.next-uat isolation is UNVERIFIED in this repo (Next.js
 *     should not touch .next/ when NEXT_DIST_DIR differs, but this has not been
 *     confirmed under load). The 07-02 runbook must verify-then-fall-back.
 *     The gate wrapper (run-engineering-gates.cjs) never runs npm run build.
 *
 * (b) NEXT_PUBLIC_NEW_ACCESS_ANALYSIS is NOT required for the UAT build.
 *     The flag appears only in app/(dashboard)/users/page.test.tsx as a test
 *     fixture. The new /access-analysis route (app/(dashboard)/access-analysis/
 *     page.tsx) is the default, not flag-gated. Do not set it in the UAT build.
 *
 * (c) axe-core is pinned to version 4.10.0, injected via CDN:
 *     https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js
 *     No @axe-core/playwright package needed — CDN injection into the
 *     authenticated localhost page exposes window.axe.run().
 *
 * (d) RoleSimilarityGraph node click requires a settle wait. After goto +
 *     waitForLoadState("networkidle"), wait ~2000ms before clicking the first
 *     SVG circle (d3-force simulation freeze per RESEARCH Pitfall 8). The
 *     graph uses a settle-and-freeze behaviour; early clicks miss or land on
 *     wrong positions.
 *
 * (e) The inline fix-and-re-run loop is implemented in Task 3 of this plan
 *     (scripts/uat/run-engineering-gates.cjs). When any engineering gate fails,
 *     the wrapper exits non-zero and prints the exact re-run command.
 *     The executor reads the failing gate, fixes the defect inline (never
 *     touching users/access-analysis/), re-runs only that gate, then re-runs
 *     the full wrapper for a clean all-green report.
 * ============================================================
 */

import type { Page, TestInfo } from "@playwright/test";

// ---------------------------------------------------------------------------
// parseTrpcBatch
// ---------------------------------------------------------------------------

/**
 * Parse a tRPC httpBatchLink POST body. The body is a JSON object keyed "0",
 * "1", … where each value is a call descriptor `{ json: { input } }`.
 *
 * Returns the list of procedure keys (the string keys of the batch object).
 * For a body `{"0":{...},"1":{...}}`, returns ["0","1"].
 *
 * Used to detect duplicate procedure keys across separate batch POSTs
 * (PERF-03 / PERF-04: each tRPC endpoint must appear in at most one batch).
 *
 * @param postData - raw POST body string (JSON). Pass null/undefined to get [].
 */
export function parseTrpcBatch(postData: string | null | undefined): string[] {
  if (!postData) return [];
  try {
    const parsed: unknown = JSON.parse(postData);
    if (typeof parsed !== "object" || parsed === null) return [];
    return Object.keys(parsed);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// injectAxeAndRunContrast
// ---------------------------------------------------------------------------

/**
 * Inject axe-core 4.10.0 from CDN into the page, run the color-contrast rule
 * across the whole DOM, and return violations filtered to serious | critical
 * impact.
 *
 * WCAG AA gate (THM-01): caller asserts the returned array has length 0.
 *
 * Waits up to 5 s for axe to become available on window after injection.
 */
export async function injectAxeAndRunContrast(
  page: Page,
): Promise<Array<{ id: string; impact: string; description: string }>> {
  // CDN injection — pinned version 4.10.0 (RESEARCH Decision c)
  await page.addScriptTag({
    url: "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js",
  });

  // Wait for axe to be available (CDN load may not be synchronous)
  await page.waitForFunction(() => typeof (window as unknown as Record<string, unknown>).axe !== "undefined", {
    timeout: 5_000,
  });

  // Run only the color-contrast rule to keep execution fast
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (opts: unknown) => Promise<{ violations: Array<{ id: string; impact: string; description: string }> }> } }).axe;
    const results = await axe.run({ runOnly: ["color-contrast"] });
    return results.violations;
  });

  return (violations as Array<{ id: string; impact: string; description: string }>).filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
}

// ---------------------------------------------------------------------------
// toggleTheme
// ---------------------------------------------------------------------------

/**
 * Toggle the dashboard theme using the real ThemeToggle button (aria-label
 * "Toggle theme") and the matching menu item. Waits for the relevant HTML
 * class to settle and gives ECharts time to remount via key={resolvedTheme}
 * (RESEARCH Pitfall 3 — ~500ms settle after the HTML class change).
 *
 * @param page - Playwright Page
 * @param theme - "Light" or "Dark" (must match the menuitem text exactly)
 */
export async function toggleTheme(page: Page, theme: "Light" | "Dark"): Promise<void> {
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.getByRole("menuitem", { name: theme }).click();

  if (theme === "Dark") {
    // Wait for next-themes to add html.dark, then give ECharts canvas time to remount
    await page.waitForSelector("html.dark", { timeout: 5_000 });
  } else {
    // Light: html.dark should be absent after the toggle
    await page.waitForFunction(
      () => !document.documentElement.classList.contains("dark"),
      { timeout: 5_000 },
    );
  }

  // ECharts uses key={resolvedTheme} which forces a canvas unmount + remount
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// assertNoHorizontalOverflow
// ---------------------------------------------------------------------------

/**
 * Assert that the page has no horizontal overflow at the current viewport width
 * (1280 px for UAT). Uses a 5 px tolerance to account for sub-pixel rounding.
 *
 * Throws if scrollWidth > clientWidth + 5.
 */
export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  if (scrollWidth > clientWidth + 5) {
    throw new Error(
      `Horizontal overflow detected: scrollWidth=${scrollWidth} > clientWidth=${clientWidth} + 5px tolerance`,
    );
  }
}

// ---------------------------------------------------------------------------
// uatScreenshot
// ---------------------------------------------------------------------------

/**
 * Capture a viewport screenshot and attach it to the Playwright test report.
 * Mirrors the proofShot() pattern in acc-dc-graph.spec.ts.
 *
 * @param page - Playwright Page
 * @param testInfo - Playwright TestInfo (for attach())
 * @param name - Attachment name (e.g. "users-light", "access-analysis-dark")
 */
export async function uatScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const body = await page.screenshot({ fullPage: false });
  await testInfo.attach(name, { body, contentType: "image/png" });
}
