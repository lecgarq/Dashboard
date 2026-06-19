import { test, expect } from "@playwright/test";

/**
 * Smoke: the Folder Activity by Role panel mounts on /access-analysis, and
 * expanding it loads the tree (or a valid empty state) without error. Auth comes
 * from the minted storageState (playwright/global-setup.ts); server runs on :3100.
 */
test("Folder Activity by Role expands and renders", async ({ page }) => {
  await page.goto("/access-analysis");
  await page.waitForLoadState("networkidle");

  const expand = page.getByTestId("folder-activity-expand");
  await expect(expand).toBeVisible();
  await expand.click();

  const panel = page.getByTestId("folder-activity-panel");
  await expect(panel).toBeVisible();

  // Either the tree renders, or a project row, or a valid empty/loading-resolved state.
  await expect
    .poll(async () => {
      const tree = await page.getByTestId("folder-activity-tree").count();
      const projectRow = await page.getByTestId("fa-project-row").count();
      const empty = (await panel.textContent())?.includes("No folder activity") ? 1 : 0;
      return tree + projectRow + empty;
    }, { timeout: 30_000 })
    .toBeGreaterThan(0);
});
