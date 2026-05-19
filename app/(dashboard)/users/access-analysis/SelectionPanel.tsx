"use client";

/**
 * SelectionPanel.tsx — Phase 4-02 Task 3
 *
 * Right-side overlay panel that appears when a lasso completes. Shows two
 * DonutPanels (role + permission tier) computed from a DuckDB aggregation over
 * the still-visible subset of the lasso selection. A clickable legend below
 * each donut drives the drill-down filter inside FilterContext.
 *
 * Deviation from PLAN: DonutPanel's published prop shape is `{ title, data, ... }`
 * with no `onSliceClick`. To stay non-invasive, this component renders the
 * DonutPanel for visuals AND a parallel clickable chip legend that writes
 * drillDown via FilterContext. Same labels, same colors, single source of truth.
 *
 * Visible-subset rule (CONTEXT.md): When global filters change, only the still-
 * visible subset feeds the pie. AccessAnalysisShell computes that via
 * `filterSelectionByPredicate` and passes it as `visibleSelectedIndices` here.
 */

import { useEffect, useRef, useState } from "react";
import { DonutPanel, type DonutSlice } from "./DonutPanel";
import { useFilters } from "./FilterContext";
import {
  aggregateSelectionByRole,
  aggregateSelectionByTier,
} from "./selectionQueries";
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
  loading: boolean;
  drillKey: string; // dim id whose drillDown record is { [drillKey]: label }
  activeLabel: string | null;
  onSliceClick: (label: string) => void;
}

function DonutClickable({
  title,
  slices,
  loading,
  drillKey,
  activeLabel,
  onSliceClick,
}: DonutClickableProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <DonutPanel title={title} data={slices} />
      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : (
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
      )}
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

  const [roleSlices, setRoleSlices] = useState<DonutSlice[]>([]);
  const [tierSlices, setTierSlices] = useState<DonutSlice[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Refetch when the visible subset of node IDs changes.
  const idsKey = Array.from(visibleSelectedIndices).sort((a, b) => a - b).join(",");

  useEffect(() => {
    const nodeIds: string[] = [];
    for (const i of visibleSelectedIndices) {
      const f = features[i];
      if (f) nodeIds.push(f.nodeId);
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([
      aggregateSelectionByRole(nodeIds),
      aggregateSelectionByTier(nodeIds),
    ])
      .then(([role, tier]) => {
        if (cancelled) return;
        setRoleSlices(role);
        setTierSlices(tier);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRoleSlices([]);
        setTierSlices([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, features]);

  const handleSliceClick = (dim: string, label: string): void => {
    // Toggle: clicking the same label clears; otherwise replace.
    // Read latest drillDown via ref — the click handler closure captures the
    // value from the render where the chip was created, which may be stale
    // after the first click flips state but the same chip element persists.
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
      className="flex w-96 shrink-0 flex-col border-l bg-card"
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
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto p-4">
        <DonutClickable
          title="Role"
          slices={roleSlices}
          loading={loading}
          drillKey="role"
          activeLabel={drillDown?.role ?? null}
          onSliceClick={(label) => handleSliceClick("role", label)}
        />
        <DonutClickable
          title="Permission tier"
          slices={tierSlices}
          loading={loading}
          drillKey="tier"
          activeLabel={drillDown?.tier ?? null}
          onSliceClick={(label) => handleSliceClick("tier", label)}
        />
      </div>
    </aside>
  );
}
