import { test, expect, type Page } from "@playwright/test";

/**
 * acc-cluster-labels.spec.ts — Regression proof for "labels not following the clusters"
 * (problem labels.mov). On the projector map the name chips morph with their clusters:
 * each chip must sit on its cluster's LIVE on-screen centroid at EVERY strength, not just
 * at full strength. The old code pinned chips to the fixed footprint center, so at a
 * partial strength (cluster still mostly scattered) the chip floated far from its dots.
 *
 * The check is camera-invariant: it compares the chip's screen position to the on-screen
 * centroid of that cluster's OWN dots (both move together under pan/zoom), via the test
 * bridge's getProjectorClusterCentroidsScreen(). Mid-strength (30) is where the old bug
 * is largest — there the footprint-pinned chip is ~84% of the rest→clump distance away.
 */

const GRAPH_URL = "/users/spatial-graph";

async function gotoGraph(page: Page): Promise<void> {
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  // First test in a fresh dev-server run pays the cold compile + 16,942-row snapshot load.
  await page.waitForFunction(() => !!window.__ACC_GRAPH_TEST__?.isReady(), undefined, { timeout: 240_000 });
  await page.waitForFunction(() => {
    const b = window.__ACC_GRAPH_TEST__;
    if (!b) return false;
    const s = b.getPositionsStats();
    return s.count > 0 && !s.anyNaN && s.maxAbs > 1;
  }, undefined, { timeout: 90_000 });
}

/** Drive the Radix "Grouping strength" slider to >= target (step 10 via PageUp). */
async function setStrength(page: Page, target: number): Promise<number> {
  const thumb = page.getByLabel("Grouping strength thumb");
  await thumb.focus();
  await page.keyboard.press("Home"); // → 0
  const read = async (): Promise<number> => Number(await thumb.getAttribute("aria-valuenow"));
  let v = await read();
  let guard = 0;
  while (v < target && guard++ < 40) {
    await page.keyboard.press("PageUp");
    await page.waitForTimeout(80); // let the ~60ms rAF-throttled commit land before re-reading
    v = await read();
  }
  return v;
}

/** Jump the slider to its max (100) reliably via the Radix "End" key. */
async function setStrengthMax(page: Page): Promise<number> {
  const thumb = page.getByLabel("Grouping strength thumb");
  await thumb.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(120);
  return Number(await thumb.getAttribute("aria-valuenow"));
}

/** Visible chip centers in the labels overlay's local basis (same basis as spaceToScreen). */
async function chipCenters(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return await page.evaluate(() => {
    const cont = document.querySelector('[data-testid="map-cluster-labels"]') as HTMLElement | null;
    const base = cont?.getBoundingClientRect();
    const out: Record<string, { x: number; y: number }> = {};
    document.querySelectorAll('[data-testid="map-cluster-label"]').forEach((el) => {
      const node = el as HTMLElement;
      if (node.style.opacity === "0") return; // collision/LOD-hidden
      const r = node.getBoundingClientRect();
      const label = (node.textContent || "").trim();
      if (label) out[label] = { x: r.left + r.width / 2 - (base?.left ?? 0), y: r.top + r.height / 2 - (base?.top ?? 0) };
    });
    return out;
  });
}

interface Centroid { label: string; x: number; y: number; members: number }

async function clusterCentroids(page: Page): Promise<Centroid[]> {
  // Method added to the bridge for this proof; cast avoids re-augmenting Window (TS2717).
  return await page.evaluate(() => {
    const b = window.__ACC_GRAPH_TEST__ as unknown as {
      getProjectorClusterCentroidsScreen?: () => Centroid[] | null;
    };
    return b.getProjectorClusterCentroidsScreen?.() ?? [];
  });
}

/** Mean chip→own-cluster-centroid distance over chips that have a matching cluster. */
function meanChipDistance(
  chips: Record<string, { x: number; y: number }>,
  cents: Centroid[],
): { mean: number; max: number; matched: number } {
  const byLabel = new Map(cents.map((c) => [c.label, c]));
  const ds: number[] = [];
  for (const [label, p] of Object.entries(chips)) {
    const c = byLabel.get(label);
    if (!c) continue;
    ds.push(Math.hypot(p.x - c.x, p.y - c.y));
  }
  if (ds.length === 0) return { mean: Infinity, max: Infinity, matched: 0 };
  return { mean: ds.reduce((a, b) => a + b, 0) / ds.length, max: Math.max(...ds), matched: ds.length };
}

test.describe("ACC projector map — name chips ride their clusters (2D)", () => {
  test("chips sit on their cluster's live centroid at mid AND high strength", async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    await gotoGraph(page);

    // MID strength: the cluster is only ~16% morphed toward its clump, so a footprint-
    // pinned chip (old bug) would be far from its dots. The fix puts the chip on the
    // live centroid → small distance.
    const mid = await setStrength(page, 30);
    expect(mid).toBeGreaterThanOrEqual(30);
    await page.waitForTimeout(3_000); // let the ease + any camera reframe settle
    await testInfo.attach("strength-30", { body: await page.screenshot(), contentType: "image/png" });

    const midChips = await chipCenters(page);
    const midCents = await clusterCentroids(page);
    const midD = meanChipDistance(midChips, midCents);
    // eslint-disable-next-line no-console
    console.log(`[labels] strength~30: matched=${midD.matched} meanDist=${midD.mean.toFixed(1)}px maxDist=${midD.max.toFixed(1)}px`);
    expect(midD.matched).toBeGreaterThanOrEqual(3);
    expect(midD.mean).toBeLessThan(70); // chips track the clusters, not the empty destination

    // HIGH strength: clusters are fully clumped; chips must remain on them.
    const high = await setStrengthMax(page);
    expect(high).toBeGreaterThanOrEqual(90);
    await page.waitForTimeout(3_500);
    await testInfo.attach("strength-100", { body: await page.screenshot(), contentType: "image/png" });

    const highChips = await chipCenters(page);
    const highCents = await clusterCentroids(page);
    const highD = meanChipDistance(highChips, highCents);
    // eslint-disable-next-line no-console
    console.log(`[labels] strength~100: matched=${highD.matched} meanDist=${highD.mean.toFixed(1)}px maxDist=${highD.max.toFixed(1)}px`);
    expect(highD.matched).toBeGreaterThanOrEqual(3);
    expect(highD.mean).toBeLessThan(70);

    await expect(page.locator("canvas").first()).toBeVisible();
  });
});
