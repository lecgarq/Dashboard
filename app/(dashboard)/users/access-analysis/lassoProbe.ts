/**
 * lassoProbe.ts — pure helpers for the TEST-ONLY dense-region probe used by
 * graphTestBridge.findDensestScreenPoint (gated behind NEXT_PUBLIC_ACC_GRAPH_TEST;
 * never shipped in a production build).
 *
 * WHY THIS EXISTS
 * ---------------
 * The e2e lasso test must place a small drag box over a dense part of the frozen
 * cloud so the resulting selection is a STRICT subset (0 < selected < total).
 * The bridge locates that box by scanning a grid of candidate screen cells and
 * picking the densest. The cost is `cells × cost(count)`, so the lever is the
 * NUMBER of cells: a coarse, large-step sweep locates the dense region, then a
 * small refine window centers the box on the core.
 *
 * These helpers (`gridCells` + `pickDensestCell`) own the cell generation and the
 * deterministic arg-max. The actual per-cell count is INJECTED (`countAt`) so the
 * bridge can keep using the renderer's own raw screen-pixel
 * `findPointsInPolygon` path - the same coordinate basis as the real lasso drag -
 * while these helpers stay pure and unit-testable without a live renderer.
 *
 * Determinism: fixed row-major iteration order + first-tie-wins, so the chosen
 * cell is reproducible run-to-run (the test freezes the layout first).
 */

export interface DensestCell {
  x: number;
  y: number;
  count: number;
}

/**
 * Build a grid of cell centers across the inclusive `[x0,x1] × [y0,y1]` rect at
 * `step`. Row-major (x varies fastest) so iteration order — and therefore tie
 * resolution in `pickDensestCell` — is stable. A non-positive step falls back
 * to 1 so the grid is never empty for a valid rect.
 */
export function gridCells(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  step: number,
): { x: number; y: number }[] {
  const s = step > 0 ? step : 1;
  const cells: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y += s) {
    for (let x = x0; x <= x1; x += s) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Scan candidate screen cells, returning the one whose `countAt` is highest.
 * Ties resolve to the FIRST cell in iteration order (deterministic). `countAt`
 * is injected (e.g. a renderer hit-test) so this stays pure. Returns null for an
 * empty cell list.
 */
export function pickDensestCell(
  cells: ReadonlyArray<{ x: number; y: number }>,
  countAt: (cx: number, cy: number) => number,
): DensestCell | null {
  let best: DensestCell | null = null;
  for (const c of cells) {
    const count = countAt(c.x, c.y);
    if (best === null || count > best.count) best = { x: c.x, y: c.y, count };
  }
  return best;
}
