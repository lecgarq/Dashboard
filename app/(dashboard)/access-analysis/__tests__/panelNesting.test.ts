/**
 * One card per panel (DESIGN.md §9).
 *
 * Every chart on /access-analysis is rendered inside a tab panel's
 * `<PremiumSurface variant="base">`, which IS `.panel-elevated`. Charts used to
 * carry `panel-elevated p-5` on their own root as well, so each panel painted a
 * card inside a card — and because `.panel-elevated:hover` applies
 * `translateY(-3px)` (app/globals.css), hovering one panel lifted it twice.
 *
 * The chart components are shell-free now: the surface belongs to whoever is
 * outermost. This scan keeps the idiom from coming back one copy-paste at a time.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import path from "node:path";

const COMPONENTS = path.resolve(__dirname, "../components");

/**
 * DonutSkeletons owns the page-level Suspense fallback, which has no panel above
 * it — those two are legitimately the outermost surface.
 */
const OUTERMOST_BY_DESIGN = new Set(["DonutSkeletons.tsx"]);

function chartSources(): string[] {
  return globSync("*.tsx", { cwd: COMPONENTS })
    .filter((f) => !OUTERMOST_BY_DESIGN.has(f))
    .map((f) => path.join(COMPONENTS, f));
}

describe("panel nesting on /access-analysis", () => {
  it("finds the chart components to scan", () => {
    expect(chartSources().length).toBeGreaterThan(15);
  });

  it("no chart component carries its own panel-elevated shell", () => {
    const offenders = chartSources()
      .filter((file) => readFileSync(file, "utf8").includes("panel-elevated"))
      .map((file) => path.basename(file));
    expect(offenders).toEqual([]);
  });
});
