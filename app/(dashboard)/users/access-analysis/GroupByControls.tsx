"use client";
/**
 * GroupByControls.tsx — The projector map's common-path layout controls: a "Group into" picker +
 * a single "Grouping strength" slider. Strength is the selected dim's slider value
 * (read/written through useSliders, so the per-frame morph reads it off getLiveValues);
 * the picker selection is controlled by the parent, which builds the descriptor for
 * that dim and transfers strength on change.
 *
 * The primary picker is intentionally curated; Color/filter retain the broader themed
 * aperture through apertureOptionGroups below.
 */
import { useMemo } from "react";
import { useSliders } from "./SliderContext";
import { DimensionSlider } from "./DimensionSlider";
import {
  GENERAL_GROUP_ID,
  groupByDimensions,
  primaryGroupLabel,
} from "./groupByDimensions";
import { APERTURE_THEME_GROUPS, PRESET_DIMENSION_IDS } from "./dimensionIdSpace";
import { dimensionCoverage, coverageText } from "./dimensionCoverage";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export interface GroupByControlsProps {
  catalog: readonly CatalogDimension[];
  /** Loaded snapshot — drives the per-option coverage labels. */
  features?: ReadonlyArray<NodeFeatureSnapshot>;
  groupBy: string;
  onGroupByChange: (id: string) => void;
  /** Strongest live layout, which may be an advanced Dimensions row. */
  activeLayoutId?: string;
  activeLayoutLabel?: string;
  colorLabel?: string;
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
 * Themed option groups over the full Phase-25 aperture, each option labeled
 * "Label · covered/total". Coverage is
 * omitted when no snapshot is loaded (total 0) so labels never read "0/0".
 */
export function apertureOptionGroups(
  catalog: readonly CatalogDimension[],
  features: ReadonlyArray<NodeFeatureSnapshot>,
): ApertureOptionGroup[] {
  const byId = new Map(
    catalog.filter((dimension) => dimension.available && PRESET_DIMENSION_IDS.includes(dimension.id))
      .map((dimension) => [dimension.id, dimension]),
  );
  const groups: ApertureOptionGroup[] = [];
  for (const g of APERTURE_THEME_GROUPS) {
    const options: ApertureOption[] = [];
    for (const id of g.ids) {
      const d = byId.get(id);
      if (!d) continue;
      const cov = dimensionCoverage(features, id);
      const text =
        cov.total > 0
          ? `${d.label} · ${coverageText(cov)}`
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
  activeLayoutId = groupBy,
  activeLayoutLabel,
  colorLabel = "Role",
}: GroupByControlsProps): React.JSX.Element {
  const { values, setSliderValue, resetOne } = useSliders();
  const primaryDimensions = useMemo(() => groupByDimensions(catalog), [catalog]);
  const strength = values[groupBy] ?? 0;
  const activeStrength = activeLayoutId === GENERAL_GROUP_ID ? 0 : (values[activeLayoutId] ?? 0);
  const activeLabel = activeLayoutLabel ?? primaryGroupLabel(activeLayoutId);
  const selectedDimension = primaryDimensions.find((dimension) => dimension.id === groupBy);
  const coverage = groupBy === GENERAL_GROUP_ID ? null : dimensionCoverage(features, groupBy);
  const distinctPeople = useMemo(() => {
    const ids = new Set<string>();
    for (const feature of features) {
      const separator = feature.nodeId.indexOf("::");
      ids.add(separator >= 0 ? feature.nodeId.slice(0, separator) : feature.nodeId);
    }
    return ids.size;
  }, [features]);

  return (
    <aside data-testid="group-by-controls" className="flex w-full shrink-0 flex-col border-l bg-card">
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Layout</h2>
      </header>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Group into</span>
          <select
            data-testid="group-by-select"
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value={GENERAL_GROUP_ID}>General · Similarity</option>
            {primaryDimensions.map((dimension) => (
              <option key={dimension.id} value={dimension.id}>
                {primaryGroupLabel(dimension.id, dimension.label)}
              </option>
            ))}
          </select>
        </label>

        {groupBy !== GENERAL_GROUP_ID ? (
          <DimensionSlider
            dimId={groupBy}
            label="Grouping strength"
            value={strength}
            onChange={(v) => setSliderValue(groupBy, v)}
            onReset={() => resetOne(groupBy)}
          />
        ) : null}

        <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p>Position: Similarity</p>
          <p>Group into: {activeLabel} · {activeStrength}</p>
          <p>Color: {colorLabel}</p>
        </div>

        {coverage && coverage.total > 0 && selectedDimension ? (
          <p className="text-xs text-muted-foreground">
            {primaryGroupLabel(selectedDimension.id, selectedDimension.label)} data · {coverageText(coverage)} memberships
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {features.length.toLocaleString("en-US")} membership nodes · {distinctPeople.toLocaleString("en-US")} distinct people
        </p>

        <p className="text-xs text-muted-foreground">
          0 keeps similarity · 100 strengthens the selected anchor. Drag to morph in real time.
        </p>
      </div>
    </aside>
  );
}
