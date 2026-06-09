"use client";

/**
 * SelectionPanel.tsx — lasso → live analytics (in-memory).
 *
 * Right-side overlay that appears when a lasso completes. Summarizes the still-
 * visible subset of the selection with a KPI strip plus two drillable donuts
 * (Role + Project), aggregated straight off the feature snapshot the graph
 * already holds — NO DuckDB, NO async (selectionAggregates). This is what makes
 * the panel light up the instant the lasso closes; the previous DuckDB-backed
 * `selectionQueries` path queried `graph_user_projects`, a table that is never
 * registered on the default JS-snapshot graph load, so both donuts came back
 * empty while the node coloring (driven by the in-memory predicate engine) worked.
 *
 * A clickable legend chip below each donut writes `drillDown` into FilterContext,
 * narrowing the lit-up subset to one slice WITHIN the lasso. Permission tier is
 * intentionally not shown: `permTier` is null on the snapshot graph path, so it
 * would render a single "Unknown" slice. Project is the populated, drillable axis.
 */

import { useMemo, useRef } from "react";
import { DonutPanel, type DonutSlice } from "./DonutPanel";
import { useFilters } from "./FilterContext";
import {
  aggregateSelectionByRole,
  aggregateSelectionByProject,
  selectionKpis,
} from "./selectionAggregates";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export interface SelectionPanelProps {
  /** Indices currently in the lasso AND passing global filters/search. */
  visibleSelectedIndices: ReadonlySet<number>;
  features: ReadonlyArray<NodeFeatureSnapshot>;
  onClear: () => void;
}

interface DonutClickableProps {
  title: string;
  slices: DonutSlice[];
  drillKey: string; // dim id whose drillDown record is { [drillKey]: label }
  activeLabel: string | null;
  onSliceClick: (label: string) => void;
}

function DonutClickable({
  title,
  slices,
  drillKey,
  activeLabel,
  onSliceClick,
}: DonutClickableProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <DonutPanel title={title} data={slices} onSliceClick={(s) => onSliceClick(s.label)} />
      <ul
        data-testid={`drill-legend-${drillKey}`}
        className="flex flex-wrap gap-1.5"
      >
        {slices.map((s) => {
          const active = activeLabel === s.label;
          return (
            <li key={s.label}>
              <button
                type="button"
                data-testid={`drill-${drillKey}-${s.label}`}
                onClick={() => onSliceClick(s.label)}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
                  active
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "hover:bg-accent"
                }`}
              >
                <span
                  aria-hidden
                  style={{ backgroundColor: s.color }}
                  className="inline-block size-2 rounded-full"
                />
                <span>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function KpiCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId: string;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border bg-card px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        data-testid={testId}
        className="mt-0.5 text-lg font-bold tabular-nums text-foreground leading-none"
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export function SelectionPanel({
  visibleSelectedIndices,
  features,
  onClear,
}: SelectionPanelProps): React.JSX.Element {
  const { drillDown, setDrillDown } = useFilters();
  const drillDownRef = useRef(drillDown);
  drillDownRef.current = drillDown;

  // Stable key over the visible subset so the memo only recomputes when the set
  // actually changes (not on every parent re-render).
  const idsKey = Array.from(visibleSelectedIndices).sort((a, b) => a - b).join(",");

  const { kpis, roleSlices, projectSlices } = useMemo(() => {
    return {
      kpis: selectionKpis(features, visibleSelectedIndices),
      roleSlices: aggregateSelectionByRole(features, visibleSelectedIndices),
      projectSlices: aggregateSelectionByProject(features, visibleSelectedIndices),
    };
    // idsKey captures the visible-subset identity; features is stable for a load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, features]);

  const handleSliceClick = (dim: string, label: string): void => {
    // Toggle: clicking the same label clears; otherwise replace. Read latest
    // drillDown via ref so a persisted chip's closure isn't stale after a click.
    const current = drillDownRef.current;
    if (current && current[dim] === label) {
      setDrillDown(null);
    } else {
      setDrillDown({ [dim]: label });
    }
  };

  return (
    <aside
      data-testid="selection-panel"
      className="flex w-full shrink-0 flex-col border-l bg-card"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">
          <span data-testid="selection-count">{visibleSelectedIndices.size}</span>{" "}
          users selected
        </h2>
        <button
          type="button"
          onClick={onClear}
          data-testid="selection-clear"
          className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Clear selection
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-2">
          <KpiCard label="Users" value={kpis.total} testId="kpi-users" />
          <KpiCard label="External" value={kpis.external} testId="kpi-external" />
          <KpiCard label="Admins" value={kpis.admins} testId="kpi-admins" />
          <KpiCard label="Projects" value={kpis.projects} testId="kpi-projects" />
        </div>

        <DonutClickable
          title="Role"
          slices={roleSlices}
          drillKey="role"
          activeLabel={drillDown?.role ?? null}
          onSliceClick={(label) => handleSliceClick("role", label)}
        />
        <DonutClickable
          title="Project"
          slices={projectSlices}
          drillKey="project"
          activeLabel={drillDown?.project ?? null}
          onSliceClick={(label) => handleSliceClick("project", label)}
        />
      </div>
    </aside>
  );
}
