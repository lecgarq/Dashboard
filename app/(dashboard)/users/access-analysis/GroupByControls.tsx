"use client";
/**
 * GroupByControls.tsx — The projector map's grouping sidebar: a "Group by" picker +
 * a single "Grouping strength" slider. Strength is the selected dim's slider value
 * (read/written through useSliders, so the per-frame morph reads it off getLiveValues);
 * the picker selection is controlled by the parent, which builds the descriptor for
 * that dim and transfers strength on change.
 */
import { useMemo } from "react";
import { useSliders } from "./SliderContext";
import { DimensionSlider } from "./DimensionSlider";
import { groupByDimensions } from "./groupByDimensions";
import type { CatalogDimension } from "./dimensionCatalog.types";

export interface GroupByControlsProps {
  catalog: readonly CatalogDimension[];
  groupBy: string;
  onGroupByChange: (id: string) => void;
}

export function GroupByControls({ catalog, groupBy, onGroupByChange }: GroupByControlsProps): React.JSX.Element {
  const { values, setSliderValue, resetOne } = useSliders();
  const options = useMemo(() => groupByDimensions(catalog), [catalog]);
  const strength = values[groupBy] ?? 0;

  return (
    <aside data-testid="group-by-controls" className="flex w-96 shrink-0 flex-col border-l bg-card">
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Map grouping</h2>
      </header>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Group by</span>
          <select
            data-testid="group-by-select"
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {options.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>

        <DimensionSlider
          dimId={groupBy}
          label="Grouping strength"
          value={strength}
          onChange={(v) => setSliderValue(groupBy, v)}
          onReset={() => resetOne(groupBy)}
        />

        <p className="text-xs text-muted-foreground">
          0 = free map · 100 = grouped into blobs. Drag to morph in real time.
        </p>
      </div>
    </aside>
  );
}
