"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type Row,
  type SortingState,
  type ExpandedState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, ChevronDown, ChevronUp, Inbox } from "lucide-react";
import { AnimatePresence, motion, useSafeVariants, fadeIn } from "@/components/ui/motion";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { cn } from "@/lib/core/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataTableProps<T> {
  /** The data array. Should be pre-filtered/prepared by the calling page. */
  data: T[];
  /** TanStack ColumnDef array — typed to T for full type safety. */
  columns: ColumnDef<T>[];
  /** Called when a non-chevron area of a row is clicked. */
  onRowClick?: (row: Row<T>) => void;
  /** Called when the pointer enters a row — use to prefetch row detail (warm
   *  the detail panel's queries before the click so it opens instantly). */
  onRowHover?: (row: Row<T>) => void;
  /** Called when the pointer leaves a row — use to cancel a pending prefetch
   *  so fast scroll-over doesn't warm every passed row. */
  onRowHoverEnd?: (row: Row<T>) => void;
  /** Render slot for the inline expand peek. Receives the TanStack Row<T>. */
  renderExpanded?: (row: Row<T>) => React.ReactNode;
  /** Column ID to pin on the left (e.g. 'name'). */
  pinnedColumn?: string;
  /** Default sort state applied on mount (resets each visit). */
  defaultSort?: SortingState;
  /** Whether a filter is currently hiding rows — controls empty state messaging. */
  hasActiveFilter?: boolean;
  /** Called when the "Clear filters" button in the empty state is clicked. */
  onClearFilters?: () => void;
  /** Custom empty state message override. */
  emptyMessage?: string;
  /** Custom empty-state-with-filter message override. */
  filteredEmptyMessage?: string;
  /** Optional className for the outer shell. */
  className?: string;
  /**
   * When set, rows are banded into groups by this label AFTER the active sort:
   * groups are ordered alphabetically ("Not specified" last), rows keep their
   * sort order within each group, and a header band (label + count) precedes
   * each group in the virtualized list.
   */
  getGroupLabel?: (row: T) => string | null;
}

const UNGROUPED_LABEL = "Not specified";

type DisplayItem<T> =
  | { kind: "row"; row: Row<T> }
  | { kind: "group"; label: string; count: number };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DENSITY_KEY = "datatable-density";
type Density = "comfortable" | "compact";
const ROW_HEIGHT: Record<Density, number> = { comfortable: 72, compact: 48 };

// ---------------------------------------------------------------------------
// DataTable component
// ---------------------------------------------------------------------------

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  onRowHover,
  onRowHoverEnd,
  renderExpanded,
  pinnedColumn,
  defaultSort,
  hasActiveFilter = false,
  onClearFilters,
  emptyMessage = "No data yet",
  filteredEmptyMessage = "No results — try adjusting your filters",
  className,
  getGroupLabel,
}: DataTableProps<T>): React.ReactElement {
  // ------------------------------------------------------------------
  // Density state — reads from localStorage on mount
  // ------------------------------------------------------------------
  const [density, setDensity] = useState<Density>(() => {
    if (typeof window === "undefined") return "comfortable";
    return (localStorage.getItem(DENSITY_KEY) as Density) ?? "comfortable";
  });

  const toggleDensity = useCallback(() => {
    setDensity((d) => {
      const next = d === "comfortable" ? "compact" : "comfortable";
      localStorage.setItem(DENSITY_KEY, next);
      return next;
    });
  }, []);

  // ------------------------------------------------------------------
  // Sort state
  // ------------------------------------------------------------------
  const [sorting, setSorting] = useState<SortingState>(defaultSort ?? []);

  // ------------------------------------------------------------------
  // Expand state — accordion one-at-a-time
  // ------------------------------------------------------------------
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const handleAccordionExpand = useCallback(
    (updater: React.SetStateAction<ExpandedState>) => {
      setExpanded((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const keys = Object.keys(next);
        if (keys.length > 1) {
          const prevKeys = Object.keys(prev);
          const newKey = keys.find((k) => !prevKeys.includes(k));
          return newKey ? { [newKey]: true } : { [keys[keys.length - 1]]: true };
        }
        return next;
      });
    },
    []
  );

  // ------------------------------------------------------------------
  // TanStack Table instance
  // ------------------------------------------------------------------
  const table = useReactTable<T>({
    data,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: handleAccordionExpand,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    enableSortingRemoval: true,
    enableMultiSort: false,
    initialState: {
      sorting: defaultSort ?? [],
      columnPinning: pinnedColumn ? { left: [pinnedColumn] } : {},
    },
  });

  const rows = table.getRowModel().rows;

  // Grouped display list: header bands interleaved with the sorted rows. When
  // no getGroupLabel is supplied this is a 1:1 wrap of `rows` (no bands).
  const displayItems = useMemo<DisplayItem<T>[]>(() => {
    if (!getGroupLabel) return rows.map((row) => ({ kind: "row" as const, row }));
    const byLabel = new Map<string, Row<T>[]>();
    for (const row of rows) {
      const label = getGroupLabel(row.original) || UNGROUPED_LABEL;
      const arr = byLabel.get(label);
      if (arr) arr.push(row);
      else byLabel.set(label, [row]);
    }
    const entries = [...byLabel.entries()].sort(([a], [b]) =>
      a === UNGROUPED_LABEL ? 1 : b === UNGROUPED_LABEL ? -1 : a.localeCompare(b),
    );
    const items: DisplayItem<T>[] = [];
    for (const [label, groupRows] of entries) {
      items.push({ kind: "group", label, count: groupRows.length });
      for (const row of groupRows) items.push({ kind: "row", row });
    }
    return items;
  }, [rows, getGroupLabel]);

  // ------------------------------------------------------------------
  // Scroll refs + sync
  // ------------------------------------------------------------------
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledX, setScrolledX] = useState(false);

  useEffect(() => {
    const body = scrollRef.current;
    const header = headerRef.current;
    if (!body || !header) return;

    const onScroll = () => {
      header.scrollLeft = body.scrollLeft;
      setScrolledX(body.scrollLeft > 0);
    };

    body.addEventListener("scroll", onScroll, { passive: true });
    return () => body.removeEventListener("scroll", onScroll);
  }, []);

  // ------------------------------------------------------------------
  // Virtualizer
  // ------------------------------------------------------------------
  const rowVirtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (displayItems[i]?.kind === "group" ? 36 : ROW_HEIGHT[density]),
    measureElement: (el) => el?.getBoundingClientRect().height ?? ROW_HEIGHT[density],
    overscan: 5,
  });

  // ------------------------------------------------------------------
  // Motion — useSafeVariants called ONCE at component scope (Rules of Hooks)
  // ------------------------------------------------------------------
  const safeExpand = useSafeVariants(fadeIn);

  // ------------------------------------------------------------------
  // Column width helper
  // ------------------------------------------------------------------
  const headerGroups = table.getHeaderGroups();

  // ------------------------------------------------------------------
  // Render: empty state
  // ------------------------------------------------------------------
  if (rows.length === 0) {
    return (
      <PremiumSurface variant="base" className={cn("flex flex-col h-full overflow-hidden rounded-xl", className)}>
        {/* Toolbar */}
        <div className="flex items-center justify-end px-4 py-2 border-b border-border/60">
          <button
            data-density={density}
            data-testid="density-toggle"
            aria-label="Toggle density"
            onClick={toggleDensity}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border/60"
          >
            {density === "comfortable" ? "Comfortable" : "Compact"}
          </button>
        </div>

        {/* Empty state body */}
        <div
          data-testid="empty-state"
          className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground"
        >
          <Inbox className="w-10 h-10 opacity-40" />
          <p className="text-sm">
            {hasActiveFilter ? filteredEmptyMessage : emptyMessage}
          </p>
          {hasActiveFilter && (
            <button
              data-testid="clear-filters-btn"
              data-clear-filters
              onClick={() => onClearFilters?.()}
              className="text-xs px-3 py-1.5 rounded border border-border/60 hover:bg-muted/50 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </PremiumSurface>
    );
  }

  // ------------------------------------------------------------------
  // Render: full table
  // ------------------------------------------------------------------
  return (
    <PremiumSurface variant="base" className={cn("flex flex-col h-full overflow-hidden rounded-xl", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-border/60 flex-shrink-0">
        <button
          data-density={density}
          data-testid="density-toggle"
          aria-label="Toggle density"
          onClick={toggleDensity}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border/60"
        >
          {density === "comfortable" ? "Comfortable" : "Compact"}
        </button>
      </div>

      {/* Header — split-scroll, sticky glass (FND-05-j) */}
      <div ref={headerRef} className="overflow-x-hidden flex-shrink-0">
        <table className="w-full table-fixed">
          <thead className="sticky top-0 z-10 bg-surface-2 backdrop-blur-md border-b border-surface-border">
            {headerGroups.map((headerGroup) => (
              <tr key={headerGroup.id}>
                {/* Expand chevron column header */}
                <th
                  className="w-10 sticky left-0 z-30 bg-surface-2 backdrop-blur-md"
                  style={{ width: 40, minWidth: 40 }}
                />
                {headerGroup.headers.map((header) => {
                  const isPinned = header.column.getIsPinned();
                  const isLastPinned = header.column.getIsLastColumn("left");
                  const isSorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();

                  return (
                    <th
                      key={header.id}
                      style={{
                        width: header.getSize(),
                        left: isPinned === "left" ? header.column.getStart("left") + 40 : undefined,
                      }}
                      className={cn(
                        "text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2.5 select-none",
                        isPinned === "left" && "sticky z-30 bg-surface-2 backdrop-blur-md",
                        isLastPinned && scrolledX && "shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]",
                        canSort && "cursor-pointer hover:text-foreground transition-colors",
                        isSorted && "text-foreground"
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      onKeyDown={
                        canSort
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                header.column.getToggleSortingHandler()?.(e);
                              }
                            }
                          : undefined
                      }
                      tabIndex={canSort ? 0 : undefined}
                      aria-sort={
                        canSort
                          ? isSorted === "asc" ? "ascending" : isSorted === "desc" ? "descending" : "none"
                          : undefined
                      }
                    >
                      <span className="flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="flex flex-col -space-y-1 opacity-60">
                            {isSorted === "asc" ? (
                              <ChevronUp className="w-3 h-3 opacity-100" />
                            ) : isSorted === "desc" ? (
                              <ChevronDown className="w-3 h-3 opacity-100" />
                            ) : (
                              <ChevronUp className="w-3 h-3 opacity-30" />
                            )}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
        </table>
      </div>

      {/* Body — virtualizer scroll element */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: 40, minWidth: 40 }} />
            {table.getAllColumns().map((col) => (
              <col key={col.id} style={{ width: col.getSize() }} />
            ))}
          </colgroup>
          <tbody>
            <tr>
              <td colSpan={table.getAllColumns().length + 1} style={{ padding: 0, border: 0 }}>
                {/* Virtual canvas */}
                <div
                  style={{
                    height: rowVirtualizer.getTotalSize(),
                    position: "relative",
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                    const item = displayItems[virtualItem.index];
                    if (item.kind === "group") {
                      return (
                        <div
                          key={virtualItem.key}
                          data-index={virtualItem.index}
                          data-testid="group-header"
                          ref={(el) => rowVirtualizer.measureElement(el)}
                          role="rowheader"
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                          className="flex items-baseline gap-2 border-b border-border/60 bg-muted/40 px-3 py-2"
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                            {item.label}
                          </span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">{item.count}</span>
                        </div>
                      );
                    }
                    const row = item.row;
                    const isExpanded = row.getIsExpanded();

                    return (
                      <div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        data-density={density}
                        ref={(el) => rowVirtualizer.measureElement(el)}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                        className={cn(
                          density === "comfortable" ? "py-3" : "py-1.5",
                          "border-b border-border/60"
                        )}
                      >
                        {/* Row cells */}
                        <table className="w-full table-fixed">
                          <colgroup>
                            <col style={{ width: 40, minWidth: 40 }} />
                            {table.getAllColumns().map((col) => (
                              <col key={col.id} style={{ width: col.getSize() }} />
                            ))}
                          </colgroup>
                          <tbody>
                            <tr
                              className="hover:bg-muted/30 focus-visible:bg-muted/40 transition-shadow hover:shadow-[var(--depth-float)] group"
                              onMouseEnter={() => onRowHover?.(row)}
                              onMouseLeave={() => onRowHoverEnd?.(row)}
                              // Keyboard path to the row action: Tab to the row,
                              // Enter opens (same as click); Space toggles the peek.
                              tabIndex={onRowClick ? 0 : undefined}
                              onFocus={() => onRowHover?.(row)}
                              onKeyDown={
                                onRowClick
                                  ? (e) => {
                                      if (e.target !== e.currentTarget) return;
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        onRowClick(row);
                                      } else if (e.key === " " && renderExpanded) {
                                        e.preventDefault();
                                        row.getToggleExpandedHandler()();
                                      }
                                    }
                                  : undefined
                              }
                            >
                              {/* Expand chevron cell */}
                              <td
                                style={{ width: 40, minWidth: 40 }}
                                className="sticky left-0 z-10 bg-card px-1"
                              >
                                <button
                                  data-expand
                                  aria-label="Expand row"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    row.getToggleExpandedHandler()();
                                  }}
                                  className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </button>
                              </td>

                              {/* Data cells */}
                              {row.getVisibleCells().map((cell) => {
                                const col = cell.column;
                                const isPinned = col.getIsPinned();
                                const isLastPinned = col.getIsLastColumn("left");

                                return (
                                  <td
                                    key={cell.id}
                                    data-cell
                                    data-col={col.id}
                                    style={{
                                      width: col.getSize(),
                                      left: isPinned === "left" ? col.getStart("left") + 40 : undefined,
                                    }}
                                    className={cn(
                                      "text-sm px-3 truncate cursor-pointer",
                                      isPinned === "left" && "sticky z-10 bg-card",
                                      isLastPinned && scrolledX && "shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]"
                                    )}
                                    onClick={() => onRowClick?.(row)}
                                  >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>

                        {/* Inline expand peek — conditionally rendered; AnimatePresence animates enter/exit */}
                        {isExpanded && renderExpanded && (
                          <AnimatePresence mode="sync">
                            <motion.div
                              key={`${row.id}-expand`}
                              initial={safeExpand.hidden}
                              animate={safeExpand.visible}
                              exit={safeExpand.hidden}
                              className="overflow-hidden"
                            >
                              {renderExpanded(row)}
                            </motion.div>
                          </AnimatePresence>
                        )}
                      </div>
                    );
                  })}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PremiumSurface>
  );
}
