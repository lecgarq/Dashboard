import { test, expect, type Page } from "@playwright/test";

// Projector is the default environment now; this runs unless the legacy shell is forced on.
const LEGACY = process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH === "0";

test.describe("person similarity graph", () => {
  test.skip(LEGACY, "legacy 2D/3D shell active (projector is default)");

  test("renders precomputed snapshot and slider changes k", async ({ page }: { page: Page }) => {
    await page.goto("/users/spatial-graph", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __ACC_PERSON_GRAPH_TEST__?: { isReady(): boolean } }).__ACC_PERSON_GRAPH_TEST__?.isReady()),
      undefined,
      { timeout: 120_000 },
    );
    const nodeCount = await page.evaluate(
      () => (window as unknown as { __ACC_PERSON_GRAPH_TEST__: { getNodeCount(): number } }).__ACC_PERSON_GRAPH_TEST__.getNodeCount(),
    );
    expect(nodeCount).toBeGreaterThan(3000);

    // change cluster count via the range slider (use the native value setter so React's onChange fires)
    await page.getByTestId("cluster-slider").evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "12");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(
      () => (window as unknown as { __ACC_PERSON_GRAPH_TEST__: { getK(): number } }).__ACC_PERSON_GRAPH_TEST__.getK() === 12,
      undefined,
      { timeout: 30_000 },
    );
  });
});
