import { test, expect } from "@playwright/test";

/**
 * Smoke test for the Forma Proposal tab: pick a role, set a folder's tier,
 * reload to prove the localStorage draft persists, and trigger a JSON export.
 * Reuses the shared storageState auth + the isolated :3100 webServer from
 * playwright.config (so it never touches the prod .next on :3000).
 */
test.describe("Forma Proposal", () => {
  test.setTimeout(200_000);

  test("assign, persist across reload, and export", async ({ page }) => {
    await page.goto("/forma-proposal");

    // The role rail lists the seeded taxonomy.
    const vdc = page.getByText("VDC Specialist", { exact: true });
    await expect(vdc).toBeVisible({ timeout: 60_000 });

    // Pick a role, then set the first (root) folder's tier.
    await vdc.click();
    const firstTier = page.getByLabel("permission tier").first();
    await expect(firstTier).toBeVisible();
    await firstTier.selectOption("Full Controller");
    await expect(firstTier).toHaveValue("Full Controller");

    // Reload → the draft is restored from localStorage.
    await page.reload();
    await page.getByText("VDC Specialist", { exact: true }).click();
    await expect(page.getByLabel("permission tier").first()).toHaveValue("Full Controller");

    // Export JSON triggers a download with the expected filename.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "JSON" }).click(),
    ]);
    expect(download.suggestedFilename()).toContain("forma-proposal");
  });
});
