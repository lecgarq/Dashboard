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
  /**
   * Accessible name for the table. A screen-reader user landing on an unnamed
   * table in a page with several of them has no way to tell which one they are
   * in, so pass something specific ("ACC users", "Template members").
   */
  label?: string;
  /**
   * Per-row name for the expand control. Without it every one of N rows
   * announces the identical "Expand row", which is useless in a rotor list.
   * Return the row's human identity (a person's name, a project title).
   */
  getRowLabel?: (row: T) => string;
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
  label,
  getRowLabel,
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
  // Scroll ref
  //
  // The header used to live in its own scroll container whose scrollLeft was
  // mirrored from the body on every scroll event. With a single table the
  // <thead> is sticky INSIDE the one scroll container, so horizontal scroll is
  // shared by construction — no listener, no drift. `scrolledX` survives only
  // to drive the pinned-column edge shadow.
  // ------------------------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledX, setScrolledX] = useState(false);

  useEffect(() => {
    const body = scrollRef.current;
    if (!body) return;
    const onScroll = () => setScrolledX(body.scrollLeft > 0);
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
  /** Data columns + the leading expand-control column. */
  const totalColumns = table.getAllColumns().length + 1;
  /** Width of the leading expand-control column. */
  const EXPAND_COL = 40;
  /**
   * Minimum width the columns need. Flex cells with a fixed width would happily
   * shrink below it, which silently squashes every column on a narrow viewport
   * instead of overflowing — and kills the horizontal scroll the pinned column
   * and its edge shadow exist to serve. The old `table-fixed` layout did not
   * shrink past content, so this restores that floor.
   */
  const minTableWidth = table.getTotalSize() + EXPAND_COL;
  /**
   * Reproduces `table-fixed` sizing in a flex row: never shrink below the
   * column's own width, but share any surplus in proportion to it, so wide
   * screens still fill edge-to-edge instead of leaving dead space.
   */
  const flexFor = (size: number) => `${size} 0 ${size}px`;
  /**
   * aria-rowcount covers the WHOLE set, not the ~20 rows virtualization keeps in
   * the DOM, so a screen reader announces "row 812 of 1,100" instead of
   * "row 4 of 20". Group bands are rows too, hence displayItems, and the header
   * row is +1.
   */
  const ariaRowCount = displayItems.length + headerGroups.length;

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
            aria-label="Compact rows"
            aria-pressed={density === "compact"}
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
          aria-label="Compact rows"
          aria-pressed={density === "compact"}
          onClick={toggleDensity}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border/60"
        >
          {density === "comfortable" ? "Comfortable" : "Compact"}
        </button>
      </div>


      {/*
       * ONE table.
       *
       * This used to be three: a header-only <table>, a body <table> whose single
       * <td colSpan> held the virtual canvas, and a THIRD <table> per rendered
       * row. A screen reader saw N+2 unrelated tables, the aria-sort on the
       * header described a table with no data cells, and the group bands were
       * role="rowheader" divs sitting outside any row.
       *
       * display:grid/flex is how a virtualized table gets absolutely-positioned
       * rows, but overriding `display` on a table element DROPS its implicit ARIA
       * role in every major browser — so every role here is stated explicitly.
       * Removing them silently returns this to a pile of divs.
       */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <table
          role="table"
          aria-label={label}
          aria-rowcount={ariaRowCount}
          className="w-full"
          style={{ display: "grid", minWidth: minTableWidth }}
        >
          <thead
            role="rowgroup"
            className="sticky top-0 z-20 bg-surface-2 backdrop-blur-md border-b border-surface-border"
            style={{ display: "grid" }}
          >
            {headerGroups.map((headerGroup, groupIndex) => (
              <tr
                key={headerGroup.id}
                role="row"
                aria-rowindex={groupIndex + 1}
                style={{ display: "flex", width: "100%" }}
              >
                {/* Expand-control column. Named, not blank: it heads a column of
                    real controls, and an unnamed columnheader reads as "blank". */}
                <th
                  role="columnheader"
                  className="sticky left-0 z-30 bg-surface-2 backdrop-blur-md"
                  style={{ display: "flex", flex: `0 0 ${EXPAND_COL}px` }}
                >
                  <span className="sr-only">Expand row</span>
                </th>
                {headerGroup.headers.map((header) => {
                  const isPinned = header.column.getIsPinned();
                  const isLastPinned = header.column.getIsLastColumn("left");
                  const isSorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();

                  return (
                    <th
                      key={header.id}
                      role="columnheader"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flex: flexFor(header.getSize()),
                        left: isPinned === "left" ? header.column.getStart("left") + EXPAND_COL : undefined,
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

          <tbody
            role="rowgroup"
            style={{
              display: "grid",
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const item = displayItems[virtualItem.index];
              // Header rows come first in the row index space.
              const ariaRowIndex = virtualItem.index + headerGroups.length + 1;
              const positioned: React.CSSProperties = {
                display: "flex",
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              };

              if (item.kind === "group") {
                return (
                  <tr
                    key={virtualItem.key}
                    role="row"
                    aria-rowindex={ariaRowIndex}
                    data-index={virtualItem.index}
                    data-testid="group-header"
                    ref={(el) => rowVirtualizer.measureElement(el)}
                    style={positioned}
                  >
                    {/* A band spanning the row — a real columnheader scoped to the
                        group, so the rows under it inherit the association. */}
                    <th
                      role="columnheader"
                      scope="colgroup"
                      colSpan={totalColumns}
                      className="flex w-full items-baseline gap-2 border-b border-border/60 bg-muted/40 px-3 py-2 text-left"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                        {item.label}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{item.count}</span>
                    </th>
                  </tr>
                );
              }

              const row = item.row;
              const isExpanded = row.getIsExpanded();
              const rowName = getRowLabel?.(row.original);
              const expandLabel = rowName ? `Expand ${rowName}` : "Expand row";
              const peekId = `${row.id}-peek`;

              return (
                <tr
                  key={virtualItem.key}
                  role="row"
                  aria-rowindex={ariaRowIndex}
                  data-index={virtualItem.index}
                  data-density={density}
                  ref={(el) => rowVirtualizer.measureElement(el)}
                  style={{ ...positioned, flexWrap: "wrap" }}
                  className={cn(
                    density === "comfortable" ? "py-3" : "py-1.5",
                    "border-b border-border/60",
                    "hover:bg-muted/30 focus-visible:bg-muted/40 transition-shadow hover:shadow-[var(--depth-float)] group"
                  )}
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
                  {/* Expand control cell */}
                  <td
                    role="cell"
                    className="sticky left-0 z-10 flex items-center bg-card px-1"
                    style={{ flex: `0 0 ${EXPAND_COL}px` }}
                  >
                    <button
                      data-expand
                      aria-label={expandLabel}
                      aria-expanded={isExpanded}
                      aria-controls={isExpanded && renderExpanded ? peekId : undefined}
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
                        role="cell"
                        data-cell
                        data-col={col.id}
                        style={{
                          flex: flexFor(col.getSize()),
                          left: isPinned === "left" ? col.getStart("left") + EXPAND_COL : undefined,
                        }}
                        className={cn(
                          "flex items-center overflow-hidden text-sm px-3 cursor-pointer",
                          isPinned === "left" && "sticky z-10 bg-card",
                          isLastPinned && scrolledX && "shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]"
                        )}
                        onClick={() => onRowClick?.(row)}
                      >
                        {/* The cell is a flex box (it has to be, to lay out inside a
                            flex row), and `truncate` does not ellipsize flex
                            children — so the clamp lives on this inner block. */}
                        <div className="min-w-0 flex-1 truncate">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      </td>
                    );
                  })}

                  {/* Inline expand peek — a full-width cell that wraps onto its own
                      line inside the SAME row, so the peek stays inside the table
                      structure instead of escaping it. */}
                  {isExpanded && renderExpanded && (
                    <td
                      role="cell"
                      id={peekId}
                      colSpan={totalColumns}
                      style={{ flexBasis: "100%", width: "100%" }}
                    >
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
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PremiumSurface>
  );
}
