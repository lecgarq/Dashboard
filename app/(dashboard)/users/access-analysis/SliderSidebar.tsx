"use client";

/**
 * SliderSidebar.tsx — Phase 4-07 (P4.7)
 *
 * Grouped sidebar: primary group always expanded, advanced groups collapsible by
 * family. Preset bar and dimension search sit above the groups. Active-count badge
 * surfaces hidden-but-active dims in collapsed groups.
 *
 * Open-group persistence via readOpenGroups()/writeOpenGroups() is deferred (non-
 * critical); the initial state is always defaultOpen from getDimensionGroups().
 */

import { useMemo, useState } from "react";
import { SliderGroup } from "./SliderGroup";
import { PresetBar } from "./PresetBar";
import { DimensionSearchBox } from "./DimensionSearchBox";
import { useSliders, type DimensionId } from "./SliderContext";
import { getDimensionGroups } from "./dimensionGroups";
import { getDimension } from "./dimensionRegistry";
import { filterDimensionIds } from "./dimensionSearch";

export function SliderSidebar(): React.JSX.Element {
  const { values, setSliderValue, resetAll, resetOne, applyPreset, activePreset } = useSliders();
  const groups = useMemo(() => getDimensionGroups(), []);
  const [query, setQuery] = useState("");
  const [openByLabel, setOpenByLabel] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.label, g.defaultOpen])),
  );
  const searching = query.trim() !== "";

  const rowsFor = (ids: readonly DimensionId[]) =>
    filterDimensionIds(ids, query).map((id) => ({
      id,
      label: getDimension(id)!.label,
      value: values[id] ?? 0,
    }));

  return (
    <aside data-testid="slider-sidebar" className="flex w-72 shrink-0 flex-col border-l bg-card">
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

      <div className="flex flex-col gap-4 border-b p-4">
        <PresetBar activePreset={activePreset} onApply={applyPreset} />
        <DimensionSearchBox query={query} onChange={setQuery} />
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        {groups.map((g) => {
          const rows = rowsFor(g.ids);
          if (searching && rows.length === 0) return null;
          const open = g.kind === "primary" ? true : searching ? true : openByLabel[g.label];
          const activeCount = g.ids.filter((id) => (values[id] ?? 0) > 0).length;
          return (
            <SliderGroup
              key={g.label}
              title={g.label}
              rows={rows}
              open={open ?? false}
              collapsible={g.kind !== "primary" && !searching}
              activeCount={activeCount}
              onToggleOpen={() => setOpenByLabel((s) => ({ ...s, [g.label]: !s[g.label] }))}
              onChange={(id, v) => setSliderValue(id as DimensionId, v)}
              onReset={(id) => resetOne(id as DimensionId)}
            />
          );
        })}
      </div>
    </aside>
  );
}
