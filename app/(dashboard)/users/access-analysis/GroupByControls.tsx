"use client";
/**
 * GroupByControls.tsx — The projector map's grouping sidebar: a "Group by" picker +
 * a single "Grouping strength" slider. Strength is the selected dim's slider value
 * (read/written through useSliders, so the per-frame morph reads it off getLiveValues);
 * the picker selection is controlled by the parent, which builds the descriptor for
 * that dim and transfers strength on change.
 *
 * Phase 25: the picker offers the full themed aperture (dimensionIdSpace) as native
 * optgroups, each option carrying its honest node-derived coverage inline (DIM-05).
 */
import { useMemo } from "react";
import { useSliders } from "./SliderContext";
import { DimensionSlider } from "./DimensionSlider";
import { groupByDimensions } from "./groupByDimensions";
import { APERTURE_THEME_GROUPS } from "./dimensionIdSpace";
import { dimensionCoverage, coverageText, isUnderCovered } from "./dimensionCoverage";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export interface GroupByControlsProps {
  catalog: readonly CatalogDimension[];
  /** Loaded snapshot — drives the per-option coverage labels. */
  features?: ReadonlyArray<NodeFeatureSnapshot>;
  groupBy: string;
  onGroupByChange: (id: string) => void;
}

interface ApertureOption {
  id: string;
  text: string;
}

interface ApertureOptionGroup {
  label: string;
  options: ApertureOption[];
}

/**
 * Themed option groups over the groupable catalog dims, each option labeled
 * "Label · covered/total" with a trailing ⚠ when under-covered. Coverage is
 * omitted when no snapshot is loaded (total 0) so labels never read "0/0".
 */
export function apertureOptionGroups(
  catalog: readonly CatalogDimension[],
  features: ReadonlyArray<NodeFeatureSnapshot>,
): ApertureOptionGroup[] {
  const byId = new Map(groupByDimensions(catalog).map((d) => [d.id, d]));
  const groups: ApertureOptionGroup[] = [];
  for (const g of APERTURE_THEME_GROUPS) {
    const options: ApertureOption[] = [];
    for (const id of g.ids) {
      const d = byId.get(id);
      if (!d) continue;
      const cov = dimensionCoverage(features, id);
      const text =
        cov.total > 0
          ? `${d.label} · ${coverageText(cov)}${isUnderCovered(cov) ? " ⚠" : ""}`
          : d.label;
      options.push({ id, text });
    }
    if (options.length > 0) groups.push({ label: g.label, options });
  }
  return groups;
}

export function GroupByControls({
  catalog,
  features = [],
  groupBy,
  onGroupByChange,
}: GroupByControlsProps): React.JSX.Element {
  const { values, setSliderValue, resetOne } = useSliders();
  const groups = useMemo(() => apertureOptionGroups(catalog, features), [catalog, features]);
  const strength = values[groupBy] ?? 0;

  return (
    <aside data-testid="group-by-controls" className="flex w-full shrink-0 flex-col border-l bg-card">
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
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.id} value={o.id}>{o.text}</option>
                ))}
              </optgroup>
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
