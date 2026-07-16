import { expect, test, type Page } from "@playwright/test";

const GRAPH_URL = "/users/spatial-graph";

type Phase31Bridge = {
  isReady(): boolean;
  getPositionsStats(): { count: number; anyNaN: boolean; maxAbs: number };
  getFirstNodeId(): string | null;
  getCentermostNodeId(): string | null;
  getIsolatedNodeId(): string | null;
  getHighlightedNodeCount(): number;
  simulateHover(nodeId: string): boolean;
  simulateHoverEnd(): void;
  simulateClick(nodeId: string): boolean;
};

async function gotoGraph(page: Page): Promise<void> {
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      !!(
        window.__ACC_GRAPH_TEST__ as unknown as Phase31Bridge | undefined
      )?.isReady(),
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () => {
      const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase31Bridge | undefined;
      const stats = bridge?.getPositionsStats();
      return !!stats && stats.count > 22_000 && !stats.anyNaN && stats.maxAbs > 1;
    },
    undefined,
    { timeout: 90_000 },
  );
}

async function targetNodeId(page: Page): Promise<string> {
  const nodeId = await page.evaluate(() => {
    const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase31Bridge;
    return bridge.getCentermostNodeId() ?? bridge.getFirstNodeId();
  });
  expect(nodeId).toBeTruthy();
  return nodeId!;
}

test.describe("Phase 31 click and hover choreography", () => {
  test("authenticated production routes render the spatial graph shell", async ({ page }) => {
    for (const route of ["/users/spatial-graph", "/users/access-analysis"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${route.replace("/", "\\/")}$`));
      await expect(page.getByTestId("right-panel-stack")).toBeAttached({
        timeout: 120_000,
      });
      await expect(page.getByTestId("graph-legend")).toBeVisible({
        timeout: 120_000,
      });
    }
  });

  test("hover reveals the delayed headline tooltip and cancels cleanly", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await gotoGraph(page);
    const nodeId = await targetNodeId(page);

    const startedAt = await page.evaluate(async (id) => {
      const deadline = performance.now() + 15_000;
      while (performance.now() < deadline) {
        const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase31Bridge;
        const eventStartedAt = performance.now();
        if (bridge.simulateHover(id)) return eventStartedAt;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return Infinity;
    }, nodeId);
    expect(Number.isFinite(startedAt)).toBe(true);

    const tooltip = page.getByTestId("node-tooltip");
    await expect(tooltip).toBeVisible();
    const visibleAt = await page.evaluate(() => performance.now());
    expect(visibleAt - startedAt).toBeLessThan(350);
    await expect(tooltip.getByText("Permission tier")).toBeVisible();
    await expect(tooltip.getByText("Activity recency")).toBeVisible();
    await expect(tooltip.getByText("Folder breadth")).toBeVisible();

    await page.evaluate(() => {
      const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase31Bridge;
      bridge.simulateHoverEnd();
    });
    await expect(tooltip).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });

  test("click focuses ten matches in one rail, navigates, and restores the view", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await gotoGraph(page);
    const nodeId = await targetNodeId(page);

    const railLatencyMs = await page.evaluate(async (id) => {
      const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase31Bridge;
      const handlerDeadline = performance.now() + 15_000;
      let startedAt = Infinity;
      while (performance.now() < handlerDeadline) {
        const eventStartedAt = performance.now();
        if (bridge.simulateClick(id)) {
          startedAt = eventStartedAt;
          break;
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      if (!Number.isFinite(startedAt)) return Infinity;
      while (performance.now() - startedAt < 1_000) {
        const rail = document.querySelector<HTMLElement>('[data-testid="right-panel-stack"]');
        if (rail?.dataset.topLayer === "user-detail") return performance.now() - startedAt;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return Infinity;
    }, nodeId);
    expect(railLatencyMs).toBeLessThan(200);

    const userPanel = page.getByTestId("user-detail-panel");
    await expect(userPanel).toBeVisible();
    await expect(page.getByTestId("user-detail-header")).toHaveCount(1);
    await expect(userPanel.getByRole("button", { name: "Close" })).toHaveCount(1);
    await expect(page.getByText("Open profile")).toHaveCount(0);

    const neighborSection = page.getByTestId("neighbor-matches");
    await expect(neighborSection).toBeVisible();
    const matchRows = neighborSection.locator(":scope > ul > li");
    await expect(matchRows).toHaveCount(10, { timeout: 15_000 });
    const matchesBox = await neighborSection.boundingBox();
    const profileBox = await page.getByTestId("acc-profile-body").boundingBox();
    expect(matchesBox).toBeTruthy();
    expect(profileBox).toBeTruthy();
    expect(matchesBox!.y).toBeLessThan(profileBox!.y);

    await page.waitForFunction(
      () => {
        const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase31Bridge;
        return bridge.getHighlightedNodeCount() === 11;
      },
      undefined,
      { timeout: 15_000 },
    );

    const firstMatch = matchRows.first().getByRole("button");
    const firstIsolated = await page.evaluate(() => {
      const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase31Bridge;
      return bridge.getIsolatedNodeId();
    });
    await firstMatch.click();
    await page.waitForFunction(
      (previous) => {
        const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase31Bridge;
        const current = bridge.getIsolatedNodeId();
        return current !== null && current !== previous;
      },
      firstIsolated,
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("user-detail-header")).toHaveCount(1);

    await userPanel.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("right-panel-stack")).toHaveAttribute(
      "data-top-layer",
      "sliders",
    );
    expect(
      await page.evaluate(() => {
        const bridge = window.__ACC_GRAPH_TEST__ as unknown as Phase31Bridge;
        return bridge.getIsolatedNodeId();
      }),
    ).toBeNull();
    expect(consoleErrors).toEqual([]);
  });
});
