"use client";

/**
 * Toolbar.tsx — Phase 4-02 Task 2
 *
 * Top bar surfacing every Phase 4 user gesture EXCEPT the right-sidebar sliders:
 *   - Search input (Ctrl/Cmd+K focus shortcut)
 *   - Six dimension chip popovers (categorical + bucketed)
 *   - Lasso toggle (disabled in 3D mode — RESEARCH anti-pattern)
 *   - 2D|3D segmented pill
 *   - "Clear all" link (visible only when filters non-default)
 *
 * State is owned by FilterContext for filters + search; lasso/mode are caller-owned
 * (AccessAnalysisShell holds them as local React state).
 */

import { useEffect, useMemo, useRef } from "react";
import { DimensionFilterPopover } from "./DimensionFilterPopover";
import { DIMENSIONS, type DimensionId } from "./SliderContext";
import { useFilters } from "./FilterContext";
import { featureValueForDim } from "./usePredicateEngine";
import type { NodeFeatureSnapshot } from "./interactionTypes";

/** Fixed bucket order for the two numeric dims. */
const BUCKET_VALUES: Partial<Record<DimensionId, readonly string[]>> = {
  activity: ["None", "Low", "Med", "High"],
  signin: ["<7d", "<30d", "<90d", ">90d"],
  isExternal: ["internal", "external"],
};

export interface ToolbarProps {
  features: ReadonlyArray<NodeFeatureSnapshot>;
  mode: "2d" | "3d";
  onModeChange: (m: "2d" | "3d") => void;
  lassoActive: boolean;
  onLassoToggle: () => void;
}

export function Toolbar({
  features,
  mode,
  onModeChange,
  lassoActive,
  onLassoToggle,
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

  const lassoDisabled = mode === "3d";

  return (
    <header
      data-testid="toolbar"
      // pr-14 reserves the top-right corner for the globally-fixed ThemeToggle
      // (layout.tsx: `fixed right-4 top-4`), which otherwise overlaps the
      // ml-auto "Clear all" link and swallows clicks meant for it.
      className="flex items-center gap-2 border-b bg-card px-4 py-2 pr-14"
    >
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

      <button
        type="button"
        onClick={onLassoToggle}
        disabled={lassoDisabled}
        title={
          lassoDisabled
            ? "Lasso available in 2D mode only"
            : lassoActive
              ? "Cancel lasso"
              : "Draw lasso"
        }
        data-testid="toolbar-lasso"
        className={`rounded-md border px-3 py-1.5 text-sm ${
          lassoActive
            ? "border-blue-500 bg-blue-500 text-white"
            : "hover:bg-accent"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        Lasso
      </button>

      <div
        role="group"
        aria-label="Mode toggle"
        className="inline-flex overflow-hidden rounded-md border"
        data-testid="toolbar-mode-toggle"
      >
        <button
          type="button"
          onClick={() => onModeChange("2d")}
          aria-pressed={mode === "2d"}
          className={`px-3 py-1.5 text-sm ${
            mode === "2d" ? "bg-blue-500 text-white" : "hover:bg-accent"
          }`}
        >
          2D
        </button>
        <button
          type="button"
          onClick={() => onModeChange("3d")}
          aria-pressed={mode === "3d"}
          className={`px-3 py-1.5 text-sm ${
            mode === "3d" ? "bg-blue-500 text-white" : "hover:bg-accent"
          }`}
        >
          3D
        </button>
      </div>

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
