"use client";

/**
 * SliderSidebar.tsx — Phase 4-02 Task 2
 *
 * Right-sidebar "home state" — six dimension sliders stacked vertically with a
 * global Reset button at the top. Always available unless overlaid by the lasso
 * pie panel or user-detail panel (see RightPanelStack).
 */

import { DimensionSlider } from "./DimensionSlider";
import { DIMENSIONS, useSliders, type DimensionId } from "./SliderContext";

export function SliderSidebar(): React.JSX.Element {
  const { values, setSliderValue, resetAll, resetOne } = useSliders();

  return (
    <aside
      data-testid="slider-sidebar"
      className="flex w-72 shrink-0 flex-col border-l bg-card"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Dimensions</h2>
        <button
          type="button"
          onClick={resetAll}
          className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Reset
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        {DIMENSIONS.map((d) => (
          <DimensionSlider
            key={d.id}
            dimId={d.id}
            label={d.label}
            value={values[d.id]}
            onChange={(v) => setSliderValue(d.id as DimensionId, v)}
            onReset={() => resetOne(d.id as DimensionId)}
          />
        ))}
      </div>
    </aside>
  );
}
