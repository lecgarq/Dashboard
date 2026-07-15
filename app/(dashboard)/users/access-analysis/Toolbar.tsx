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
import { useFilters } from "./FilterContext";
import { buildApertureValueResolvers } from "./usePredicateEngine";
import { apertureOptionGroups } from "./GroupByControls";
import { dimensionCoverage, coverageText } from "./dimensionCoverage";
import { PRESET_DIMENSION_IDS } from "./dimensionIdSpace";
import { isFacetKey } from "./accessFacets";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { RiskAccessPanel } from "./RiskAccessPanel";

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
    addFilterDim,
    removeFilterDim,
    clearAll,
    isDefault,
  } = useFilters();

  // ---- Add-a-chip aperture filter (Phase 25 DIM-04) -----------------------
  // The same banded-label resolvers the mask predicate compares against, so a
  // filter tier always matches its Group-by blob / Color-by swatch.
  const valueResolvers = useMemo(
    () => buildApertureValueResolvers(catalog, features),
    [catalog, features],
  );
  const dimById = useMemo(
    () => new Map(catalog.map((d) => [d.id, d] as const)),
    [catalog],
  );

  // Added dimension chips = the non-facet keys in activeFilters, aperture order.
  const activeChipIds = useMemo(() => {
    const rank = (id: string): number => {
      const i = PRESET_DIMENSION_IDS.indexOf(id);
      return i < 0 ? PRESET_DIMENSION_IDS.length : i;
    };
    return Object.keys(activeFilters)
      .filter((id) => !isFacetKey(id) && dimById.has(id))
      .sort((a, b) => rank(a) - rank(b));
  }, [activeFilters, dimById]);

  // Distinct banded labels per added dim, most common first (then A→Z).
  const availableValuesByDim = useMemo<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const id of activeChipIds) {
      const resolve = valueResolvers[id];
      if (!resolve) {
        out[id] = [];
        continue;
      }
      const tally = new Map<string, number>();
      for (const f of features) {
        const v = resolve(f);
        tally.set(v, (tally.get(v) ?? 0) + 1);
      }
      out[id] = [...tally.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([v]) => v);
    }
    return out;
  }, [activeChipIds, valueResolvers, features]);

  // "+ Filter" menu: the themed aperture (coverage inline, DIM-05) minus
  // already-added dims — chips render only after the presenter adds them.
  const addFilterGroups = useMemo(() => {
    const added = new Set(activeChipIds);
    return apertureOptionGroups(catalog, features)
      .map((g) => ({ ...g, options: g.options.filter((o) => !added.has(o.id)) }))
      .filter((g) => g.options.length > 0);
  }, [catalog, features, activeChipIds]);

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

  // Persistent explanation for the active grouping dim. Node-derived figure only —
  // VERIFY: the DC-project denominator (550/1,153) is deliberately NOT shown.
  const groupedByCoverage = useMemo(
    () => (groupedByDimId ? dimensionCoverage(features, groupedByDimId) : null),
    [features, groupedByDimId],
  );

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
          Position: Similarity · Group into: <b className="text-foreground">{groupedByLabel}</b>
          {groupedByCoverage && groupedByCoverage.total > 0 ? (
            <span
              data-testid="toolbar-grouped-by-coverage"
              title={`${groupedByCoverage.note ? `${groupedByCoverage.note} — ` : ""}nodes with a real value for this dimension`}
              className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {groupedByLabel} data · {coverageText(groupedByCoverage)}
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
        {activeChipIds.map((id) => (
          <DimensionFilterPopover
            key={id}
            dim={{ id, label: dimById.get(id)?.label ?? id }}
            availableValues={availableValuesByDim[id] ?? []}
            activeValues={activeFilters[id] ?? new Set<string>()}
            onToggle={(v) => toggleChip(id, v)}
            onRemove={() => removeFilterDim(id)}
          />
        ))}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addFilterDim(e.target.value);
          }}
          aria-label="Add dimension filter"
          data-testid="toolbar-add-filter"
          className="rounded-md border bg-background px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent focus:border-blue-500 focus:outline-none"
        >
          <option value="">+ Filter</option>
          {addFilterGroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.id} value={o.id}>{o.text}</option>
              ))}
            </optgroup>
          ))}
        </select>
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
