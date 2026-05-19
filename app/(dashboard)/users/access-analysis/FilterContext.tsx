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
import { CONTROLS_STORAGE_KEY, DIMENSIONS } from "./SliderContext";

type Filters = Record<string, ReadonlySet<string>>;

interface FilterContextValue {
  activeFilters: Filters;
  searchQuery: string;
  drillDown: Record<string, string> | null;
  toggleChip: (dimId: string, value: string) => void;
  clearAll: () => void;
  setSearchQuery: (q: string) => void;
  setDrillDown: (d: Record<string, string> | null) => void;
  /** True when every set is empty AND search === "" — drives "Clear all" visibility. */
  isDefault: boolean;
}

const FilterCtx = createContext<FilterContextValue | null>(null);

function makeEmptyFilters(): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const d of DIMENSIONS) out[d.id] = new Set();
  return out;
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
        if (next[dim] && Array.isArray(arr)) next[dim] = new Set(arr);
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
    for (const set of Object.values(activeFilters)) {
      if (set.size > 0) return false;
    }
    return true;
  }, [activeFilters, searchQuery]);

  const ctx = useMemo<FilterContextValue>(
    () => ({
      activeFilters: activeFilters as Filters,
      searchQuery,
      drillDown,
      toggleChip,
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
