"use client";
/**
 * table-sort-filter.tsx
 *
 * Client-side sort and filter state for table node views.
 *
 * useSortFilter: hook that manages sort + filter state and derives displayRows.
 *   VIEW-ONLY — does not modify the Yjs document. Only controls what rows are
 *   rendered in the node view UI.
 *
 * FilterBar: input component shown/hidden via a toolbar toggle.
 *
 * Note for 02-05: After examining the CLI-installed (or scaffolded) table node view,
 * determine whether it exposes a wrapper that can consume useSortFilter. If the
 * table node view handles sort natively, useSortFilter/FilterBar serve as a fallback
 * or can be removed. They are built here as planned per the must_haves spec.
 */

import { useState, useCallback } from "react";

export interface SortState {
  columnIndex: number | null;
  direction: "asc" | "desc";
}

export interface FilterState {
  query: string;
  active: boolean;
}

/**
 * Manages sort and filter state for a table node view.
 *
 * Separates the header row (index 0) from data rows (index 1+) before
 * applying sort and filter, then reassembles as displayRows.
 *
 * @param rawRows - 2D array of cell strings from the ProseMirror document
 * @returns sort/filter state + toggleSort/setFilter + displayRows
 */
export function useSortFilter(rawRows: string[][]) {
  const [sort, setSort] = useState<SortState>({
    columnIndex: null,
    direction: "asc",
  });
  const [filter, setFilter] = useState<FilterState>({
    query: "",
    active: false,
  });

  const toggleSort = useCallback((colIndex: number) => {
    setSort((prev) =>
      prev.columnIndex === colIndex
        ? {
            columnIndex: colIndex,
            direction: prev.direction === "asc" ? "desc" : "asc",
          }
        : { columnIndex: colIndex, direction: "asc" }
    );
  }, []);

  // Separate header from data rows before applying sort/filter
  const headerRow = rawRows[0] ?? [];
  let dataRows = rawRows.slice(1);

  if (filter.active && filter.query.trim()) {
    const q = filter.query.toLowerCase();
    dataRows = dataRows.filter((row) =>
      row.some((cell) => cell.toLowerCase().includes(q))
    );
  }

  if (sort.columnIndex !== null) {
    const col = sort.columnIndex;
    dataRows = [...dataRows].sort((a, b) => {
      const cmp = (a[col] ?? "").localeCompare(b[col] ?? "", undefined, {
        numeric: true,
      });
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }

  return {
    sort,
    filter,
    toggleSort,
    setFilter,
    displayRows: [headerRow, ...dataRows],
  };
}

/**
 * FilterBar — shown/hidden via toolbar toggle in the table node view.
 * Controlled component — receives filter state and setter from useSortFilter.
 */
export function FilterBar({
  filter,
  setFilter,
}: {
  filter: FilterState;
  setFilter: (f: FilterState) => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/50 bg-muted/30 px-3 py-1.5">
      <input
        type="text"
        placeholder="Filter rows..."
        value={filter.query}
        onChange={(e) => setFilter({ ...filter, query: e.target.value })}
        className="h-7 flex-1 rounded border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        onClick={() => setFilter({ query: "", active: false })}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Clear
      </button>
    </div>
  );
}
