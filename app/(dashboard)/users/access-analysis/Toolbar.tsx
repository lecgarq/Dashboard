"use client";

/**
 * Toolbar.tsx — Phase 4-02 Task 2
 *
 * Top bar surfacing every Phase 4 user gesture EXCEPT the right-sidebar sliders:
 *   - Search input (Ctrl/Cmd+K focus shortcut)
 *   - Six dimension chip popovers (categorical + bucketed)
 *   - Lasso toggle (works in 2D and 3D)
 *   - "Clear all" link (visible only when filters non-default)
 *
 * State is owned by FilterContext for filters + search; lasso is caller-owned
 * (AccessAnalysisShell holds it as local React state). The 2D/3D segmented
 * toggle selects the renderer (2D is the default infographic view; 3D is the
 * raw explore view).
 */

import { useEffect, useMemo, useRef } from "react";
import { DimensionFilterPopover } from "./DimensionFilterPopover";
import { DIMENSIONS, type DimensionId } from "./SliderContext";
import { useFilters } from "./FilterContext";
import { featureValueForDim } from "./usePredicateEngine";
import { apertureOptionGroups } from "./GroupByControls";
import { dimensionCoverage, coverageText, isUnderCovered } from "./dimensionCoverage";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { RiskAccessPanel } from "./RiskAccessPanel";

/** Fixed bucket order for the two numeric dims. */
const BUCKET_VALUES: Partial<Record<DimensionId, readonly string[]>> = {
  activity: ["None", "Low", "Med", "High"],
  signin: ["<7d", "<30d", "<90d", ">90d"],
  internalExternal: ["internal", "external"],
};

export interface ToolbarProps {
  features: ReadonlyArray<NodeFeatureSnapshot>;
  mode: "2d" | "3d";
  onModeChange: (m: "2d" | "3d") => void;
  lassoActive: boolean;
  onLassoToggle: () => void;
  // Optional so existing harnesses can mount the Toolbar without the color
  // controls; the shell always supplies both, so production is fully wired.
  // Phase 25: catalog id-space (dimensionIdSpace aperture), not registry ColorMode.
  colorMode?: string;
  onColorModeChange?: (m: string) => void;
  /** Aperture catalog — drives the themed Color-by optgroups (shell supplies it). */
  catalog?: readonly CatalogDimension[];
  /** Display label of the active grouping dimension (e.g. "Role"). */
  groupedByLabel?: string;
  /** Catalog id of the active grouping dimension — drives the coverage caveat chip. */
  groupedByDimId?: string;
  /** True when color is auto-following the grouping dim (no manual override). */
  colorIsAuto?: boolean;
  /** Clears a manual color override, returning color to auto-follow. */
  onColorReset?: () => void;
  /**
   * Show the 2D/3D segmented toggle. Defaults to false so the flag-OFF embedding
   * map never exposes the (worker-only) 3D view; the shell passes
   * ACC_3D_GRAPH_ENABLED so the physics graph keeps its toggle.
   */
  show3DToggle?: boolean;
}

export function Toolbar({
  features,
  mode,
  onModeChange,
  lassoActive,
  onLassoToggle,
  colorMode = "role",
  onColorModeChange,
  catalog = [],
  groupedByLabel = "",
  groupedByDimId = "",
  colorIsAuto = true,
  onColorReset,
  show3DToggle = false,
}: ToolbarProps): React.JSX.Element {
  const {
    activeFilters,
    searchQuery,
    setSearchQuery,
    toggleChip,
    clearAll,
    isDefault,
  } = useFilters();

  // Derive available values for each categorical dim from the feature snapshot.
  // Bucketed dims use the fixed canonical list (BUCKET_VALUES).
  const availableValuesByDim = useMemo<Record<string, string[]>>(() => {
    const out: Record<string, Set<string>> = {};
    for (const d of DIMENSIONS) out[d.id] = new Set();
    for (const f of features) {
      for (const d of DIMENSIONS) {
        const v = featureValueForDim(f, d.id);
        if (v) out[d.id].add(v);
      }
    }
    const result: Record<string, string[]> = {};
    for (const d of DIMENSIONS) {
      if (BUCKET_VALUES[d.id as DimensionId]) {
        result[d.id] = [...(BUCKET_VALUES[d.id as DimensionId] ?? [])];
      } else {
        result[d.id] = Array.from(out[d.id]).sort();
      }
    }
    return result;
  }, [features]);

  // Cmd/Ctrl + K focuses the search input (RESEARCH default).
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Lasso now works in 3D (screen-space projection), so it is always enabled.
  const lassoDisabled = false;

  // Themed Color-by optgroups over the SAME widened aperture Group-by uses
  // (single id-space), each option carrying its inline coverage (DIM-05).
  const colorGroups = useMemo(() => apertureOptionGroups(catalog, features), [catalog, features]);

  // Persistent caveat on the ACTIVE grouping dim: coverage chip + ⚠ when a
  // material share of nodes lack the value. Node-derived figure only —
  // VERIFY: the DC-project denominator (550/1,153) is deliberately NOT shown.
  const groupedByCoverage = useMemo(
    () => (groupedByDimId ? dimensionCoverage(features, groupedByDimId) : null),
    [features, groupedByDimId],
  );
  const groupedByUnderCovered = groupedByCoverage !== null && isUnderCovered(groupedByCoverage);

  return (
    <header
      data-testid="toolbar"
      // pr-14 reserves the top-right corner for the globally-fixed ThemeToggle
      // (layout.tsx: `fixed right-4 top-4`), which otherwise overlaps the
      // ml-auto "Clear all" link and swallows clicks meant for it.
      className="flex items-center gap-2 border-b bg-card px-4 py-2 pr-14"
    >
      {show3DToggle ? (
        <div className="flex items-center" data-testid="toolbar-mode">
          <button
            type="button"
            data-testid="toolbar-mode-2d"
            onClick={() => onModeChange("2d")}
            className={`rounded-l-md border px-2.5 py-1.5 text-sm ${mode === "2d" ? "border-blue-500 bg-blue-500 text-white" : "hover:bg-accent"}`}
          >2D</button>
          <button
            type="button"
            data-testid="toolbar-mode-3d"
            onClick={() => onModeChange("3d")}
            className={`-ml-px rounded-r-md border px-2.5 py-1.5 text-sm ${mode === "3d" ? "border-blue-500 bg-blue-500 text-white" : "hover:bg-accent"}`}
          >3D</button>
        </div>
      ) : null}
      {groupedByLabel ? (
        <span data-testid="toolbar-grouped-by" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Grouped by: <b className="text-foreground">{groupedByLabel}</b>
          {groupedByUnderCovered && groupedByCoverage ? (
            <span
              data-testid="toolbar-grouped-by-coverage"
              title={`${groupedByCoverage.note ? `${groupedByCoverage.note} — ` : ""}nodes with a real value for this dimension`}
              className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500"
            >
              ⚠ {coverageText(groupedByCoverage)}
            </span>
          ) : null}
        </span>
      ) : null}
      <input
        ref={searchInputRef}
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search name or email…"
        aria-label="Search users"
        className="w-64 rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none"
        data-testid="toolbar-search"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {DIMENSIONS.map((d) => (
          <DimensionFilterPopover
            key={d.id}
            dim={d}
            availableValues={availableValuesByDim[d.id] ?? []}
            activeValues={activeFilters[d.id] ?? new Set<string>()}
            onToggle={(v) => toggleChip(d.id, v)}
          />
        ))}
      </div>

      <details className="relative">
        <summary
          data-testid="toolbar-risk-access"
          className="cursor-pointer list-none rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Risk &amp; Access
        </summary>
        <div className="absolute left-0 z-20 mt-1 rounded-md border bg-card shadow-lg">
          <RiskAccessPanel features={features} />
        </div>
      </details>

      <button
        type="button"
        onClick={onLassoToggle}
        disabled={lassoDisabled}
        title={lassoActive ? "Cancel lasso" : "Draw lasso"}
        data-testid="toolbar-lasso"
        className={`rounded-md border px-3 py-1.5 text-sm ${
          lassoActive
            ? "border-blue-500 bg-blue-500 text-white"
            : "hover:bg-accent"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        Lasso
      </button>

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="hidden sm:inline">Color</span>
        <select
          value={colorMode}
          onChange={(e) => onColorModeChange?.(e.target.value)}
          aria-label="Color nodes by"
          data-testid="toolbar-color-mode"
          className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground focus:border-blue-500 focus:outline-none"
        >
          {colorGroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.id} value={o.id}>{o.text}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <span className="flex items-center">
        {colorIsAuto ? (
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">auto</span>
        ) : (
          <button
            type="button"
            data-testid="toolbar-color-reset"
            onClick={() => onColorReset?.()}
            className="text-xs text-blue-500 underline-offset-2 hover:underline"
          >Reset</button>
        )}
      </span>

      <div className="ml-auto">
        {!isDefault ? (
          <button
            type="button"
            onClick={clearAll}
            data-testid="toolbar-clear-all"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>
    </header>
  );
}
