import { test, expect } from "@playwright/test";

/**
 * UAT-5 repro + permanent regression pin: clicking a role slice/legend entry
 * on the Roles tab must not visually jump the page.
 *
 * Why this must be a real-browser (Playwright) spec, not a Vitest unit test:
 * every panel on the page is wrapped in `Reveal` (framer-motion `whileInView`,
 * IntersectionObserver-driven) and the bug's leading mechanism (confirmed
 * live this session, see below) is a same-panel height collapse -- jsdom
 * cannot reproduce real layout/reflow (IntersectionObserver is stubbed to a
 * no-op in vitest.setup.ts, and jsdom does no layout at all).
 *
 * MEASUREMENT NOTE (found live, this session -- important for anyone
 * extending this spec): the scrollable container's raw `scrollTop` is NOT
 * the right signal here. `/access-analysis`'s page root owns its own scroll
 * via `h-full overflow-y-auto` (page.tsx:12; the dashboard layout root is
 * `fixed inset-0 overflow-hidden`, so `window.scrollY` is always 0 -- project
 * memory "Dashboard page scroll + theme"). A first attempt asserted on that
 * container's `scrollTop` and consistently measured a ~450-500px "jump" --
 * but an isolated A/B test (reverting the code fix, re-measuring with the
 * SAME methodology) reproduced the identical delta on unmodified code,
 * proving that number was actually Playwright's own actionability check
 * auto-scrolling the click target into view, not an app behavior. Once the
 * target button is explicitly scrolled into view BEFORE recording the
 * baseline, `scrollTop` itself never moves (delta 0) even on the buggy code
 * -- because the bug does not move the scroll offset, it moves the CONTENT
 * shown at a fixed offset. The correct signal is the role-legend's own
 * viewport position (`getBoundingClientRect().y`): on the original code this
 * shifted by ~384px on a single role click (PeopleDrillList mounting ABOVE
 * the legend + the legend's own cross-filtered collapse), which is exactly
 * the disorienting "jump" the owner reported, even though the container's
 * scrollTop never changed.
 */
test("clicking a role legend entry does not visually jump the Roles panel", async ({ page }) => {
  await page.goto("/access-analysis");
  // NOTE: `waitForLoadState("networkidle")` never resolves on this page --
  // `/api/events/users` is a long-lived SSE/poll connection (observed ~48-111s
  // per request in this session's dev-server logs), so "network idle" never
  // actually happens. Wait for the tab strip instead, a reliable signal the
  // client bundle has hydrated.
  await expect(page.getByRole("tab", { name: "Roles" })).toBeVisible({ timeout: 60_000 });

  // Roles tab hosts RolesPieChart (role distribution donut + legend), the
  // panel whose slice-click (`toggleDrill` -> `onSliceClick`) is the repro target.
  await page.getByRole("tab", { name: "Roles" }).click();

  const legend = page.getByTestId("role-legend");
  await expect(legend).toBeVisible();

  // Click a genuine single-role row -- NOT "Others (N roles)" (a legend-size
  // toggle, RolesPieChart.tsx's `isOthers` early-return) or a warning row
  // ("Unknown role"/"Multiple roles", which skips the cross-filter callback).
  // Real roles are often NOT the first DOM row: `collapseToTopSlices` folds
  // long tails into "Others" and re-sorts everything (incl. "Others") by
  // value descending, so the largest slice can legitimately be "Others".
  const buttons = legend.locator("button");
  const count = await buttons.count();
  let targetIndex = -1;
  for (let i = 0; i < count; i++) {
    const t = (await buttons.nth(i).textContent()) ?? "";
    if (!t.startsWith("Others (") && !t.includes("Unknown") && !t.includes("Multiple roles")) {
      targetIndex = i;
      break;
    }
  }
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  const roleButton = buttons.nth(targetIndex);

  // Scroll the TARGET BUTTON itself into view first (simulating a presenter
  // who scrolled down to this exact row) so the later click doesn't trigger
  // Playwright's own actionability auto-scroll (see header comment).
  await roleButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const boxBefore = await legend.boundingBox();
  expect(boxBefore).not.toBeNull();

  // Click the same affordance RolesPieChart's toggleDrill fires onSliceClick
  // from (the legend row button; the pie-slice click event calls the same
  // toggleDrill handler, see RolesPieChart.tsx:117-122/236).
  await roleButton.click();
  await page.waitForTimeout(150);

  const boxImmediate = await legend.boundingBox();
  await page.waitForTimeout(300);
  const boxSettled = await legend.boundingBox();

  const deltaImmediate = Math.abs((boxImmediate?.y ?? 0) - (boxBefore?.y ?? 0));
  const deltaSettled = Math.abs((boxSettled?.y ?? 0) - (boxBefore?.y ?? 0));

  // Measurement evidence for the SUMMARY -- always logged, pass or fail.
  // eslint-disable-next-line no-console
  console.log(
    `[UAT-5 scroll repro] legendY before=${boxBefore?.y} immediate=${boxImmediate?.y} (delta=${deltaImmediate}) settled=${boxSettled?.y} (delta=${deltaSettled})`,
  );

  expect(deltaImmediate).toBeLessThanOrEqual(24);
  expect(deltaSettled).toBeLessThanOrEqual(24);
});
