"use client";

/**
 * FilterContext.tsx — Phase 4-02 Task 1
 *
 * State surface consumed by the Toolbar + predicate engine:
 *   - activeFilters: Record<dimId, Set<value>>  (categorical + bucketed dims)
 *   - searchQuery:   string                     (debounced inside GraphInteractions)
 *   - drillDown:     Record<dim,value> | null   (session-only — does NOT persist)
 *
 * Persists to the SAME localStorage key as SliderContext
 * (`lecg.access-analysis.controls.v1`) — sets serialize as arrays.
 *
 * Two-pass mount (RESEARCH Pitfall 3): default state on SSR; useEffect rehydrates client-side.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CONTROLS_STORAGE_KEY } from "./SliderContext";
import { FACET_KEY_RISK, FACET_KEY_PERM, isFacetKey } from "./accessFacets";
import { PRESET_DIMENSION_IDS } from "./dimensionIdSpace";

type Filters = Record<string, ReadonlySet<string>>;

interface FilterContextValue {
  activeFilters: Filters;
  searchQuery: string;
  drillDown: Record<string, string> | null;
  toggleChip: (dimId: string, value: string) => void;
  /** Add an aperture dimension as an active filter chip (empty set = "any"). */
  addFilterDim: (dimId: string) => void;
  /** Remove a dimension chip entirely, clearing its value set with it. */
  removeFilterDim: (dimId: string) => void;
  clearAll: () => void;
  setSearchQuery: (q: string) => void;
  setDrillDown: (d: Record<string, string> | null) => void;
  /** True when no chip is added, every set is empty AND search === "" — drives "Clear all" visibility. */
  isDefault: boolean;
}

const FilterCtx = createContext<FilterContextValue | null>(null);

/** Rehydration key gate: the unified aperture (Phase 25 DIM-04) — unknown persisted keys are ignored. */
const APERTURE_ID_SET = new Set<string>(PRESET_DIMENSION_IDS);

/**
 * Phase 25 (DIM-04): filter keys are DYNAMIC — whichever aperture dimension ids
 * the user has added as chips. No key list is seeded from SliderContext.DIMENSIONS
 * anymore; only the two P7 facet families (no aperture descriptor) are seeded so
 * they rehydrate from persistence.
 */
function makeEmptyFilters(): Record<string, Set<string>> {
  return { [FACET_KEY_RISK]: new Set(), [FACET_KEY_PERM]: new Set() };
}

// ---------------------------------------------------------------------------
// Persistence helpers (mirror SliderContext shape — write side serializes sets)
// ---------------------------------------------------------------------------

interface PersistedControls {
  sliders?: Record<string, number>;
  filters?: Record<string, string[]>;
  searchQuery?: string;
}

function readPersisted(): PersistedControls | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONTROLS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedControls) : null;
  } catch {
    return null;
  }
}

function writePersisted(patch: PersistedControls): void {
  if (typeof window === "undefined") return;
  try {
    const prev = readPersisted() ?? {};
    const next = { ...prev, ...patch };
    window.localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function FilterProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [activeFilters, setActiveFilters] =
    useState<Record<string, Set<string>>>(makeEmptyFilters);
  const [searchQuery, setSearchQueryState] = useState<string>("");
  const [drillDown, setDrillDownState] = useState<Record<string, string> | null>(null);

  const filtersRef = useRef(activeFilters);
  filtersRef.current = activeFilters;

  // Two-pass hydration.
  useEffect(() => {
    const stored = readPersisted();
    if (!stored) return;
    if (stored.filters) {
      const next = makeEmptyFilters();
      for (const [dim, arr] of Object.entries(stored.filters)) {
        if (!Array.isArray(arr)) continue;
        // Facet families restore into their seeded sets; aperture keys restore
        // as added chips (even with no values yet). Anything else — retired
        // registry dims, tampered keys — is ignored (T-25-03-T).
        if (dim in next) next[dim] = new Set(arr);
        else if (APERTURE_ID_SET.has(dim)) next[dim] = new Set(arr);
      }
      setActiveFilters(next);
    }
    if (typeof stored.searchQuery === "string") {
      setSearchQueryState(stored.searchQuery);
    }
    // drillDown is session-only — deliberately NOT restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced persistence — convert Sets to arrays.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      const serialized: Record<string, string[]> = {};
      for (const [dim, set] of Object.entries(activeFilters)) {
        serialized[dim] = Array.from(set);
      }
      writePersisted({ filters: serialized, searchQuery });
    }, 200);
    return () => window.clearTimeout(id);
  }, [activeFilters, searchQuery]);

  const toggleChip = useCallback((dimId: string, value: string): void => {
    setActiveFilters((prev) => {
      const prevSet = prev[dimId] ?? new Set<string>();
      const nextSet = new Set(prevSet);
      if (nextSet.has(value)) nextSet.delete(value);
      else nextSet.add(value);
      return { ...prev, [dimId]: nextSet };
    });
  }, []);

  const addFilterDim = useCallback((dimId: string): void => {
    setActiveFilters((prev) => (dimId in prev ? prev : { ...prev, [dimId]: new Set<string>() }));
  }, []);

  const removeFilterDim = useCallback((dimId: string): void => {
    setActiveFilters((prev) => {
      if (!(dimId in prev)) return prev;
      const { [dimId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAll = useCallback((): void => {
    setActiveFilters(makeEmptyFilters());
    setSearchQueryState("");
    setDrillDownState(null);
  }, []);

  const setSearchQuery = useCallback((q: string): void => {
    setSearchQueryState(q);
  }, []);

  const setDrillDown = useCallback((d: Record<string, string> | null): void => {
    setDrillDownState(d);
  }, []);

  const isDefault = useMemo<boolean>(() => {
    if (searchQuery !== "") return false;
    for (const [dim, set] of Object.entries(activeFilters)) {
      if (set.size > 0) return false;
      // A dimension chip added but not yet valued is still non-default —
      // "Clear all" must be able to remove it. Facet keys are always seeded.
      if (!isFacetKey(dim)) return false;
    }
    return true;
  }, [activeFilters, searchQuery]);

  const ctx = useMemo<FilterContextValue>(
    () => ({
      activeFilters: activeFilters as Filters,
      searchQuery,
      drillDown,
      toggleChip,
      addFilterDim,
      removeFilterDim,
      clearAll,
      setSearchQuery,
      setDrillDown,
      isDefault,
    }),
    [
      activeFilters,
      searchQuery,
      drillDown,
      toggleChip,
      addFilterDim,
      removeFilterDim,
      clearAll,
      setSearchQuery,
      setDrillDown,
      isDefault,
    ],
  );

  return <FilterCtx.Provider value={ctx}>{children}</FilterCtx.Provider>;
}

export function useFilters(): FilterContextValue {
  const v = useContext(FilterCtx);
  if (!v) throw new Error("useFilters must be used inside <FilterProvider>");
  return v;
}
