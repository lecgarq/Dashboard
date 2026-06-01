import { test, expect } from "@playwright/test";

/**
 * E2E gate for the /access-analysis ECharts + TanStack Table dashboard (Tasks 1-17).
 *
 * Auth: storageState is applied globally by playwright.config.ts (no per-spec setup).
 * Port: :3100 (separate from the always-on :3000 prod server).
 *
 * Assertions are intentionally structural (no hard-coded counts) so they stay valid
 * as the underlying data changes. The goals are:
 *   1. Page loads without a 500/SSR crash.
 *   2. Key UI regions render (CountTiles, Members header, Export link).
 *   3. A FilterBar quick-toggle activates a cross-filter and shows the ActiveFilterChips bar.
 *   4. The CSV export link points at the right endpoint.
 */

const PAGE_URL = "/access-analysis";

test.describe("access-analysis redesign dashboard", () => {
  test("page loads and key UI regions are visible", async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });

    // CountTiles render their uppercase labels. "Access" also appears as a table
    // column header, so scope it to the tile <div> via .first() (tile precedes table
    // in DOM order) to avoid strict-mode ambiguity.
    await expect(page.getByText("Users", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Projects", { exact: true })).toBeVisible();
    await expect(page.getByText("Access", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Roles", { exact: true })).toBeVisible();
    await expect(page.getByText("Companies", { exact: true })).toBeVisible();

    // DetailTable header renders with the Members count label.
    await expect(page.getByText(/^Members \(/)).toBeVisible();

    // FilterBar quick-toggle buttons are present.
    await expect(page.getByRole("button", { name: "Internal", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "External", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Admins", exact: true })).toBeVisible();
  });

  test("CSV export link points at the members API with format=csv", async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });

    // Wait for the DetailTable to appear (Members header is a reliable signal).
    await expect(page.getByText(/^Members \(/)).toBeVisible({ timeout: 30_000 });

    // The Export CSV anchor is rendered by DetailTable.
    const exportLink = page.getByRole("link", { name: /export csv/i });
    await expect(exportLink).toBeVisible();
    const href = await exportLink.getAttribute("href");
    expect(href).toContain("format=csv");
    expect(href).toContain("/api/access-analysis/members");
  });

  test("External quick-toggle activates the filter and shows ActiveFilterChips", async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });

    // Ensure FilterBar is rendered before interacting.
    const externalBtn = page.getByRole("button", { name: "External", exact: true });
    await expect(externalBtn).toBeVisible({ timeout: 30_000 });

    // ActiveFilterChips should NOT be visible before any filter is applied.
    await expect(page.getByRole("button", { name: /clear all/i })).not.toBeVisible();

    // Click the External quick-toggle to activate the filter.
    await externalBtn.click();

    // ActiveFilterChips renders a chip for the active filter and a "Clear all" button.
    await expect(page.getByRole("button", { name: /clear all/i })).toBeVisible({ timeout: 10_000 });
    // The chip text for internalExternal = "external" is just "external" (no prefix).
    // aria-hidden "×" is included in the accessible name, so match by partial text.
    await expect(page.getByRole("button", { name: /^external/ })).toBeVisible();

    // Clear all returns to no active filters.
    await page.getByRole("button", { name: /clear all/i }).click();
    await expect(page.getByRole("button", { name: /clear all/i })).not.toBeVisible();
  });
});
