import { expect, test } from "@playwright/test";

const GRAPH_URL = "/users/spatial-graph";
const GENERATED_ACTION_MARKER = "Asset Create";
const CONTROLS_STORAGE_KEY = "lecg.access-analysis.controls.v1";

function containsGeneratedActions(entries: Array<{ source?: string }>): boolean {
  return entries.some((entry) => entry.source?.includes(GENERATED_ACTION_MARKER) === true);
}

test("catalog actions load only after Catalog preview opens", async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("group-by-controls")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("catalog-slider-sidebar")).toHaveCount(0);
  await page.waitForFunction(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}").sliders != null,
    CONTROLS_STORAGE_KEY,
  );
  const initialSliderIds = await page.evaluate(
    (key) => Object.keys(JSON.parse(localStorage.getItem(key) ?? "{}").sliders ?? {}),
    CONTROLS_STORAGE_KEY,
  );
  expect(initialSliderIds).toHaveLength(9);
  expect(initialSliderIds).not.toContain("asset-create");
  const initialCoverage = await page.coverage.stopJSCoverage();
  expect(containsGeneratedActions(initialCoverage), "generated action code is absent on Grouping first paint").toBe(false);

  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  await page.getByTestId("catalog-preview-tab").click();
  const sidebar = page.getByTestId("catalog-slider-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute("data-catalog-count", "208");
  const unavailableCount = Number(await sidebar.getAttribute("data-unavailable-count"));
  expect(unavailableCount).toBeGreaterThanOrEqual(19);
  // Runtime truth: action availability is snapshot-derived, so record the observed split.
  console.log(`[catalog-preview] total=208 available=${208 - unavailableCount} unavailable=${unavailableCount}`);
  const catalogCoverage = await page.coverage.stopJSCoverage();
  expect(containsGeneratedActions(catalogCoverage), "generated action code loads after the Catalog click").toBe(true);
  const catalogSliderIds = await page.evaluate(
    (key) => Object.keys(JSON.parse(localStorage.getItem(key) ?? "{}").sliders ?? {}),
    CONTROLS_STORAGE_KEY,
  );
  expect(catalogSliderIds).toEqual(initialSliderIds);

  const search = page.getByTestId("dimension-search");
  await search.fill("Asset Create");
  await expect(page.getByText("Asset Create", { exact: true })).toBeVisible();

  await search.fill("Folder Description");
  const unavailableRow = page.getByTestId("disabled-dim-row");
  await expect(unavailableRow).toContainText("Folder Description");
  await expect(unavailableRow).toContainText("Not collected yet");
});
