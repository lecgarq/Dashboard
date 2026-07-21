"use client";

/**
 * ActivityDimensionsPanel.tsx — v2.7 Phase 40 (DIM-07, owner decision 3).
 *
 * The repopulated dimensions sidebar for the activity universe: group-by
 * select (7 dims — author excluded, owner decision 4), color-by select
 * (all 8 dims), and the kept DimensionSlider for grouping strength. Same
 * aside chrome as the retired instance rail (GroupByControls pattern),
 * activity-native data boundary: the shell supplies options, coverage text
 * and counts — this component holds no dimension logic of its own.
 *
 * A dimension whose dict failed to resolve arrives with `disabled: true` and
 * renders as a disabled option — honest degradation, never a blank sidebar.
 */

import { DimensionSlider } from "../DimensionSlider";

export const GROUP_BY_NONE = "none";

export interface ActivityDimensionOption {
  id: string;
  label: string;
  /** Dict failed to resolve (cardinality 0) — selectable never, hidden never. */
  disabled?: boolean;
}

export interface ActivityDimensionsPanelProps {
  groupByOptions: readonly ActivityDimensionOption[];
  colorByOptions: readonly ActivityDimensionOption[];
  groupBy: string;
  colorBy: string;
  /** 0–100 grouping strength (committed value; shell coalesces morph work). */
  strength: number;
  onGroupByChange: (id: string) => void;
  onColorByChange: (id: string) => void;
  onStrengthChange: (v: number) => void;
  /** "covered/total" for the active group-by dim (null when none / no sentinel gap). */
  groupCoverageText: string | null;
  groupByLabel: string | null;
  /** "covered/total" for the active color-by dim. */
  colorCoverageText: string | null;
  colorByLabel: string;
  residentCount: number;
  renderedCount: number;
}

const fmt = (n: number): string => n.toLocaleString("en-US");

export function ActivityDimensionsPanel({
  groupByOptions,
  colorByOptions,
  groupBy,
  colorBy,
  strength,
  onGroupByChange,
  onColorByChange,
  onStrengthChange,
  groupCoverageText,
  groupByLabel,
  colorCoverageText,
  colorByLabel,
  residentCount,
  renderedCount,
}: ActivityDimensionsPanelProps): React.JSX.Element {
  const allGroupDimsDisabled = groupByOptions.every((o) => o.disabled);

  return (
    <aside
      data-testid="activity-dimensions-panel"
      className="flex w-[260px] shrink-0 flex-col border-l bg-card"
    >
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Dimensions</h2>
      </header>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Group into</span>
          <select
            data-testid="activity-group-by-select"
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value={GROUP_BY_NONE}>None · Embedding</option>
            {groupByOptions.map((o) => (
              <option key={o.id} value={o.id} disabled={o.disabled}>
                {o.disabled ? `${o.label} · unavailable` : o.label}
              </option>
            ))}
          </select>
        </label>

        {allGroupDimsDisabled ? (
          <p className="text-xs text-muted-foreground">
            Dimension dictionaries unavailable — grouping is disabled for this payload.
          </p>
        ) : null}

        {groupBy !== GROUP_BY_NONE ? (
          <DimensionSlider
            dimId={groupBy}
            label="Grouping strength"
            value={strength}
            onChange={onStrengthChange}
            onReset={() => onStrengthChange(0)}
          />
        ) : null}

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Color by</span>
          <select
            data-testid="activity-color-by-select"
            value={colorBy}
            onChange={(e) => onColorByChange(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {colorByOptions.map((o) => (
              <option key={o.id} value={o.id} disabled={o.disabled}>
                {o.disabled ? `${o.label} · unavailable` : o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p>Position: Embedding</p>
          <p>
            Group into: {groupByLabel ?? "None"}
            {groupBy !== GROUP_BY_NONE ? ` · ${strength}` : ""}
          </p>
          <p>Color: {colorByLabel}</p>
        </div>

        {groupCoverageText && groupByLabel ? (
          <p data-testid="activity-group-coverage" className="text-xs text-muted-foreground">
            {groupByLabel} data · {groupCoverageText} events
          </p>
        ) : null}
        {colorCoverageText ? (
          <p data-testid="activity-color-coverage" className="text-xs text-muted-foreground">
            {colorByLabel} data · {colorCoverageText} events
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {fmt(residentCount)} events · rendering ~{fmt(renderedCount)}
        </p>

        <p className="text-xs text-muted-foreground">
          0 keeps the embedding · 100 clumps into {groupByLabel ?? "the selected"} groups. Drag to
          morph in real time.
        </p>
      </div>
    </aside>
  );
}
