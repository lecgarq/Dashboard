"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CellSelection, TableMap, findTable } from "@tiptap/pm/tables";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Columns3,
  Download,
  Filter,
  Merge,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/core/utils";
import { FilterBar, DEFAULT_SORT_STATE, getNextSortState, useSortFilter } from "../table-sort-filter";
import { exportTableAsXlsx, extractTableRows } from "../table-utils";

interface TableHandleProps {
  editor: Editor;
}

interface TableMenuState {
  kind: "cell" | "table";
  x: number;
  y: number;
}

interface HoveredCellState {
  cell: HTMLTableCellElement;
  table: HTMLTableElement;
}

interface TableTriggerButtonProps extends TableHandleProps {
  className?: string;
  icon?: ReactNode;
  label?: string;
  onClick?: () => void;
  style?: CSSProperties;
}

const MENU_WIDTH = 256;
const MENU_MARGIN = 12;
const OVERLAY_PANEL_WIDTH = 280;
const TRIGGER_BUTTON_SIZE = 32;
const COLOR_PRESETS = [
  { label: "Yellow", value: "#fef3c7" },
  { label: "Green", value: "#dcfce7" },
  { label: "Blue", value: "#dbeafe" },
  { label: "Purple", value: "#ede9fe" },
  { label: "Pink", value: "#fce7f3" },
  { label: "Orange", value: "#ffedd5" },
] as const;

function clampPosition(x: number, y: number, width = MENU_WIDTH, height = 320) {
  if (typeof window === "undefined") {
    return { x, y };
  }

  // Adjust for scroll offset if not using fixed? Wait, we are using fixed.
  // But clientX/Y are viewport relative. 
  // We should ensure we don't overflow the viewport.
  const padding = 10;
  let finalX = x;
  let finalY = y;

  if (finalX + width > window.innerWidth) {
    finalX = window.innerWidth - width - padding;
  }
  if (finalY + height > window.innerHeight) {
    finalY = window.innerHeight - height - padding;
  }

  return {
    x: Math.max(padding, finalX),
    y: Math.max(padding, finalY),
  };
}

function getClosestElement(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }

  return node instanceof HTMLElement ? node : node.parentElement;
}

function getSelectionTable(editor: Editor): HTMLTableElement | null {
  try {
    const { node } = editor.view.domAtPos(editor.state.selection.from);
    return getClosestElement(node)?.closest("table") ?? null;
  } catch {
    return null;
  }
}

function focusCell(editor: Editor, cell: HTMLElement) {
  try {
    const cellPos = editor.view.posAtDOM(cell, 0);
    const position = Math.min(editor.state.doc.content.size, cellPos + 1);
    const selection = TextSelection.near(editor.state.doc.resolve(position));
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    editor.view.focus();
  } catch {
    editor.commands.focus();
  }
}

function isSortableTable(tableNode: ProseMirrorNode) {
  let sortable = true;

  tableNode.descendants((node) => {
    const tableRole = node.type.spec.tableRole;
    if (
      (tableRole === "cell" || tableRole === "header_cell") &&
      (((node.attrs.colspan as number | undefined) ?? 1) !== 1 ||
        ((node.attrs.rowspan as number | undefined) ?? 1) !== 1)
    ) {
      sortable = false;
      return false;
    }

    return sortable;
  });

  return sortable;
}

function sortTableByColumn(editor: Editor, columnIndex: number, direction: "asc" | "desc") {
  const tableInfo = findTable(editor.state.selection.$from);
  if (!tableInfo || tableInfo.node.childCount < 2 || !isSortableTable(tableInfo.node)) {
    return false;
  }

  const tableNode = tableInfo.node;
  const headerRow = tableNode.child(0);
  const normalizedColumnIndex = Math.max(0, Math.min(columnIndex, Math.max(headerRow.childCount - 1, 0)));
  const dataRows = Array.from({ length: tableNode.childCount - 1 }, (_, index) => tableNode.child(index + 1));

  const sortedRows = dataRows
    .map((row, index) => ({
      index,
      row,
      value: row.child(normalizedColumnIndex)?.textContent?.trim() ?? "",
    }))
    .sort((left, right) => {
      const comparison = left.value.localeCompare(right.value, undefined, {
        numeric: true,
        sensitivity: "base",
      });

      if (comparison !== 0) {
        return direction === "asc" ? comparison : -comparison;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.row);

  const nextTable = tableNode.type.create(tableNode.attrs, [headerRow, ...sortedRows], tableNode.marks);
  const nextMap = TableMap.get(nextTable);
  const anchorCell = tableInfo.start + nextMap.positionAt(0, normalizedColumnIndex, nextTable);
  let transaction = editor.state.tr.replaceWith(
    tableInfo.pos,
    tableInfo.pos + tableNode.nodeSize,
    nextTable
  );
  transaction = transaction.setSelection(CellSelection.create(transaction.doc, anchorCell));
  transaction = transaction.scrollIntoView();

  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

function TableMenuButton({
  children,
  className,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/50"
          : "text-foreground hover:bg-accent",
        className
      )}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TableOverlayLayer({ editor }: TableHandleProps) {
  const [hoveredCell, setHoveredCell] = useState<HoveredCellState | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [sortMessage, setSortMessage] = useState<string | null>(null);
  const sortMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const bumpSelectionVersion = () => {
      setSelectionVersion((current) => current + 1);
    };

    editor.on("selectionUpdate", bumpSelectionVersion);
    editor.on("transaction", bumpSelectionVersion);
    editor.on("focus", bumpSelectionVersion);

    return () => {
      editor.off("selectionUpdate", bumpSelectionVersion);
      editor.off("transaction", bumpSelectionVersion);
      editor.off("focus", bumpSelectionVersion);
    };
  }, [editor]);

  useEffect(() => {
    const bumpLayoutVersion = () => {
      setLayoutVersion((current) => current + 1);
    };

    window.addEventListener("resize", bumpLayoutVersion);
    window.addEventListener("scroll", bumpLayoutVersion, true);

    return () => {
      window.removeEventListener("resize", bumpLayoutVersion);
      window.removeEventListener("scroll", bumpLayoutVersion, true);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest("[data-table-overlay-root='true']")) {
        return;
      }

      if (!editor.view.dom.contains(target)) {
        setHoveredCell(null);
        return;
      }

      const cell = target.closest("td, th");
      const table = target.closest("table");

      if (cell instanceof HTMLTableCellElement && table instanceof HTMLTableElement) {
        setHoveredCell((current) => {
          if (current?.cell === cell) {
            return current;
          }

          return { cell, table };
        });
        return;
      }

      setHoveredCell(null);
    };

    document.addEventListener("mousemove", handlePointerMove, true);
    return () => {
      document.removeEventListener("mousemove", handlePointerMove, true);
    };
  }, [editor]);

  const activeTable = useMemo(() => getSelectionTable(editor), [editor, selectionVersion]);
  const activeTableWrapper = useMemo(() => {
    if (!activeTable) {
      return null;
    }

    return (activeTable.closest(".tableWrapper") as HTMLElement | null) ?? activeTable;
  }, [activeTable]);
  const rawRows = useMemo(
    () => (activeTable ? extractTableRows(editor) : []),
    [activeTable, editor, selectionVersion]
  );
  const { sort, filter, toggleSort, setFilter, reset, displayRows } = useSortFilter(rawRows);

  useEffect(() => {
    reset();
    setSortMessage(null);
  }, [activeTable, reset]);

  useEffect(() => {
    if (!activeTable) {
      return;
    }

    const headerCells = Array.from(activeTable.querySelectorAll<HTMLTableCellElement>("tr:first-child > th"));
    headerCells.forEach((cell, index) => {
      if (sort.columnIndex === index) {
        cell.dataset.sortDirection = sort.direction;
      } else {
        delete cell.dataset.sortDirection;
      }
    });

    return () => {
      headerCells.forEach((cell) => {
        delete cell.dataset.sortDirection;
      });
    };
  }, [activeTable, sort, selectionVersion]);

  useEffect(() => {
    if (!activeTable) {
      return;
    }

    const query = filter.query.trim().toLowerCase();
    const tableRows = Array.from(activeTable.rows).slice(1);

    tableRows.forEach((row, index) => {
      const values = rawRows[index + 1] ?? [];
      const visible =
        !filter.active ||
        query.length === 0 ||
        values.some((value) => value.toLowerCase().includes(query));

      row.style.display = visible ? "" : "none";
    });

    return () => {
      tableRows.forEach((row) => {
        row.style.display = "";
      });
    };
  }, [activeTable, filter.active, filter.query, rawRows]);

  useEffect(() => {
    const handleHeaderClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest("[data-table-overlay-root='true']") || target.closest(".column-resize-handle")) {
        return;
      }

      if (!editor.view.dom.contains(target)) {
        return;
      }

      const headerCell = target.closest("th");
      if (!(headerCell instanceof HTMLTableCellElement)) {
        return;
      }

      const table = headerCell.closest("table");
      if (!(table instanceof HTMLTableElement)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      focusCell(editor, headerCell);

      const tableInfo = findTable(editor.state.selection.$from);
      if (!tableInfo) {
        return;
      }

      const cellPos = editor.view.posAtDOM(headerCell, 0) - tableInfo.start;
      const columnIndex = TableMap.get(tableInfo.node).colCount(cellPos);
      const baseSort = table === activeTable ? sort : DEFAULT_SORT_STATE;
      const nextSort = getNextSortState(baseSort, columnIndex);

      if (!sortTableByColumn(editor, columnIndex, nextSort.direction)) {
        setSortMessage("Sorting is disabled when the table contains merged cells.");
        if (sortMessageTimeoutRef.current) {
          clearTimeout(sortMessageTimeoutRef.current);
        }
        sortMessageTimeoutRef.current = setTimeout(() => {
          setSortMessage(null);
        }, 3000);
        return;
      }

      toggleSort(columnIndex);
      setSortMessage(null);
    };

    const viewDom = editor.view?.dom;
    if (!viewDom) return;
    viewDom.addEventListener("click", handleHeaderClick, true);
    return () => {
      viewDom.removeEventListener("click", handleHeaderClick, true);
    };
  }, [activeTable, editor, sort, toggleSort]);

  useEffect(() => {
    return () => {
      if (sortMessageTimeoutRef.current) {
        clearTimeout(sortMessageTimeoutRef.current);
      }
    };
  }, []);

  const hoveredCellRect = useMemo(
    () => hoveredCell?.cell.getBoundingClientRect() ?? null,
    [hoveredCell, layoutVersion]
  );
  const overlayRect = useMemo(
    () => activeTableWrapper?.getBoundingClientRect() ?? null,
    [activeTableWrapper, layoutVersion]
  );
  const columnButtonPosition = useMemo(() => {
    if (!hoveredCellRect) {
      return null;
    }

    return clampPosition(
      hoveredCellRect.left + hoveredCellRect.width / 2 - TRIGGER_BUTTON_SIZE / 2,
      hoveredCellRect.top - TRIGGER_BUTTON_SIZE - 6,
      TRIGGER_BUTTON_SIZE,
      TRIGGER_BUTTON_SIZE
    );
  }, [hoveredCellRect]);
  const rowButtonPosition = useMemo(() => {
    if (!hoveredCellRect) {
      return null;
    }

    return clampPosition(
      hoveredCellRect.left - TRIGGER_BUTTON_SIZE - 6,
      hoveredCellRect.top + hoveredCellRect.height / 2 - TRIGGER_BUTTON_SIZE / 2,
      TRIGGER_BUTTON_SIZE,
      TRIGGER_BUTTON_SIZE
    );
  }, [hoveredCellRect]);
  const panelPosition = useMemo(() => {
    if (!overlayRect) {
      return null;
    }

    return clampPosition(
      overlayRect.right - OVERLAY_PANEL_WIDTH,
      overlayRect.top + 8,
      OVERLAY_PANEL_WIDTH,
      filter.active || filter.query.trim() ? 180 : 104
    );
  }, [filter.active, filter.query, overlayRect]);

  const insertColumnAfterHoveredCell = () => {
    if (!hoveredCell) {
      return;
    }

    focusCell(editor, hoveredCell.cell);
    editor.chain().focus().addColumnAfter().run();
  };

  const insertRowAfterHoveredCell = () => {
    if (!hoveredCell) {
      return;
    }

    focusCell(editor, hoveredCell.cell);
    editor.chain().focus().addRowAfter().run();
  };

  if (!activeTable && !hoveredCell) {
    return null;
  }

  return (
    <>
      {panelPosition && activeTable ? (
        <div
          data-table-overlay-root="true"
          className="fixed z-30 w-[280px] rounded-xl border border-border bg-background/96 p-2.5 shadow-xl backdrop-blur"
          style={{
            left: `${panelPosition.x}px`,
            top: `${panelPosition.y}px`,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Table tools
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {sort.columnIndex !== null
                  ? `Sorted by column ${sort.columnIndex + 1} (${sort.direction === "asc" ? "A to Z" : "Z to A"})`
                  : "Click a header cell to sort rows."}
              </div>
            </div>
            <button
              type="button"
              data-table-overlay-root="true"
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs transition-colors",
                filter.active || filter.query.trim()
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              onClick={() =>
                setFilter(
                  filter.active || filter.query.trim()
                    ? { query: "", active: false }
                    : { ...filter, active: true }
                )
              }
            >
              <Filter size={12} />
              {filter.active || filter.query.trim() ? "Hide filter" : "Filter rows"}
            </button>
          </div>

          {filter.active || filter.query.trim() ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-border/60">
              <FilterBar filter={filter} setFilter={setFilter} />
            </div>
          ) : null}

          {rawRows.length > 1 ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Showing {Math.max(displayRows.length - 1, 0)} of {Math.max(rawRows.length - 1, 0)} rows
            </div>
          ) : null}

          {sortMessage ? (
            <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700">
              {sortMessage}
            </div>
          ) : null}
        </div>
      ) : null}

      {columnButtonPosition && hoveredCell ? (
        <TableTriggerButton
          editor={editor}
          label="Add column after"
          style={{
            left: `${columnButtonPosition.x}px`,
            top: `${columnButtonPosition.y}px`,
          }}
          onClick={insertColumnAfterHoveredCell}
        />
      ) : null}

      {rowButtonPosition && hoveredCell ? (
        <TableTriggerButton
          editor={editor}
          label="Add row after"
          style={{
            left: `${rowButtonPosition.x}px`,
            top: `${rowButtonPosition.y}px`,
          }}
          onClick={insertRowAfterHoveredCell}
        />
      ) : null}
    </>
  );
}

export function TableHandle({ editor }: TableHandleProps) {
  return <TableOverlayLayer editor={editor} />;
}

export function TableTriggerButton({
  editor: _editor,
  className,
  icon = <Plus size={14} />,
  label = "Table action",
  onClick,
  style,
}: TableTriggerButtonProps) {
  return (
    <button
      type="button"
      data-table-overlay-root="true"
      title={label}
      aria-label={label}
      className={cn(
        "fixed z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg transition-colors hover:bg-accent",
        className
      )}
      style={style}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
    >
      {icon}
    </button>
  );
}

export const TableSelectionOverlay = TableHandle;

export function TableCellHandleMenu({ editor }: TableHandleProps) {
  const [menuState, setMenuState] = useState<TableMenuState | null>(null);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (!editor.view.dom.contains(target)) {
        return;
      }

      const table = target.closest("table");
      if (!table) {
        return;
      }

      event.preventDefault();

      const selection = editor.state.selection;
      if (!(selection instanceof CellSelection)) {
        const position = editor.view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });

        if (position?.pos != null) {
          editor.chain().focus(position.pos, { scrollIntoView: false }).run();
        } else {
          editor.commands.focus();
        }
      }

      const kind = target.closest("td, th") ? "cell" : "table";
      const { x, y } = clampPosition(
        event.clientX,
        event.clientY,
        MENU_WIDTH,
        kind === "cell" ? 640 : 240
      );
      setMenuState({
        kind,
        x,
        y,
      });
    };

    const viewDom = editor.view?.dom;
    if (!viewDom) return;
    viewDom.addEventListener("contextmenu", handleContextMenu);
    return () => {
      viewDom.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [editor]);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuState(null);
      }
    };

    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [menuState]);

  const commandState = useMemo(() => {
    const canCommands = editor.can() as {
      addColumnAfter?: () => boolean;
      addColumnBefore?: () => boolean;
      addRowAfter?: () => boolean;
      addRowBefore?: () => boolean;
      deleteColumn?: () => boolean;
      deleteRow?: () => boolean;
      deleteTable?: () => boolean;
      mergeCells?: () => boolean;
      splitCell?: () => boolean;
    };

    return {
      canAddColumnAfter: typeof canCommands.addColumnAfter === "function" ? canCommands.addColumnAfter() : false,
      canAddColumnBefore: typeof canCommands.addColumnBefore === "function" ? canCommands.addColumnBefore() : false,
      canAddRowAfter: typeof canCommands.addRowAfter === "function" ? canCommands.addRowAfter() : false,
      canAddRowBefore: typeof canCommands.addRowBefore === "function" ? canCommands.addRowBefore() : false,
      canDeleteColumn: typeof canCommands.deleteColumn === "function" ? canCommands.deleteColumn() : false,
      canDeleteRow: typeof canCommands.deleteRow === "function" ? canCommands.deleteRow() : false,
      canDeleteTable: typeof canCommands.deleteTable === "function" ? canCommands.deleteTable() : false,
      canMerge: typeof canCommands.mergeCells === "function" ? canCommands.mergeCells() : false,
      canSplit: typeof canCommands.splitCell === "function" ? canCommands.splitCell() : false,
    };
  }, [editor, menuState]);

  const closeMenu = () => {
    setMenuState(null);
  };

  const applyAlign = (align: "left" | "center" | "right" | null) => {
    editor.chain().focus().setCellTextAlign(align).run();
    closeMenu();
  };

  const applyBackground = (color: string | null) => {
    editor.chain().focus().setCellBackgroundColor(color).run();
    closeMenu();
  };

  const runCommand = (command: () => boolean) => {
    command();
    closeMenu();
  };

  const deleteCurrentTable = () => {
    if (!window.confirm("Delete this table?")) {
      return;
    }

    runCommand(() => editor.chain().focus().deleteTable().run());
  };

  if (!menuState) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={closeMenu} />
      <div
        className="fixed z-50 max-h-[calc(100vh-1.5rem)] w-64 overflow-y-auto rounded-xl border border-border bg-background/95 p-2 shadow-2xl backdrop-blur"
        style={{
          left: `${menuState.x}px`,
          top: `${menuState.y}px`,
        }}
      >
        {menuState.kind === "cell" ? (
          <>
            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Text alignment
            </div>
            <div className="grid grid-cols-4 gap-1 px-1 pb-2">
              <button
                type="button"
                className="flex h-9 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => applyAlign("left")}
              >
                <AlignLeft size={14} />
              </button>
              <button
                type="button"
                className="flex h-9 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => applyAlign("center")}
              >
                <AlignCenter size={14} />
              </button>
              <button
                type="button"
                className="flex h-9 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => applyAlign("right")}
              >
                <AlignRight size={14} />
              </button>
              <button
                type="button"
                className="rounded-md border border-border bg-muted/40 px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => applyAlign(null)}
              >
                Clear
              </button>
            </div>

            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Background
            </div>
            <div className="grid grid-cols-3 gap-2 px-1 pb-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
                  onClick={() => applyBackground(preset.value)}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-black/10"
                    style={{ backgroundColor: preset.value }}
                  />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
            <div className="px-1 pb-2">
              <TableMenuButton onClick={() => applyBackground(null)}>
                Clear background
              </TableMenuButton>
            </div>

            <div className="mx-1 my-1 h-px bg-border" />

            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Cell structure
            </div>
            <div className="px-1 pb-2">
              <TableMenuButton
                disabled={!commandState.canMerge}
                onClick={() => runCommand(() => editor.chain().focus().mergeCells().run())}
              >
                <Merge size={14} />
                Merge cells
              </TableMenuButton>
              <TableMenuButton
                disabled={!commandState.canSplit}
                onClick={() => runCommand(() => editor.chain().focus().splitCell().run())}
              >
                <Merge size={14} className="rotate-180" />
                Split cell
              </TableMenuButton>
            </div>

            <div className="mx-1 my-1 h-px bg-border" />

            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Rows
            </div>
            <div className="px-1 pb-2">
              <TableMenuButton
                disabled={!commandState.canAddRowBefore}
                onClick={() => runCommand(() => editor.chain().focus().addRowBefore().run())}
              >
                <Rows3 size={14} />
                Add row above
              </TableMenuButton>
              <TableMenuButton
                disabled={!commandState.canAddRowAfter}
                onClick={() => runCommand(() => editor.chain().focus().addRowAfter().run())}
              >
                <Rows3 size={14} />
                Add row below
              </TableMenuButton>
              <TableMenuButton
                disabled={!commandState.canDeleteRow}
                onClick={() => runCommand(() => editor.chain().focus().deleteRow().run())}
              >
                <Trash2 size={14} />
                Delete row
              </TableMenuButton>
            </div>

            <div className="mx-1 my-1 h-px bg-border" />

            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Columns
            </div>
            <div className="px-1 pb-2">
              <TableMenuButton
                disabled={!commandState.canAddColumnBefore}
                onClick={() => runCommand(() => editor.chain().focus().addColumnBefore().run())}
              >
                <Columns3 size={14} />
                Add column before
              </TableMenuButton>
              <TableMenuButton
                disabled={!commandState.canAddColumnAfter}
                onClick={() => runCommand(() => editor.chain().focus().addColumnAfter().run())}
              >
                <Columns3 size={14} />
                Add column after
              </TableMenuButton>
              <TableMenuButton
                disabled={!commandState.canDeleteColumn}
                onClick={() => runCommand(() => editor.chain().focus().deleteColumn().run())}
              >
                <Trash2 size={14} />
                Delete column
              </TableMenuButton>
            </div>

            <div className="mx-1 my-1 h-px bg-border" />
          </>
        ) : null}

        <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Table
        </div>
        <div className="px-1">
          <TableMenuButton
            onClick={() => {
              exportTableAsXlsx(editor);
              closeMenu();
            }}
          >
            <Download size={14} />
            Export as .xlsx
          </TableMenuButton>
          <TableMenuButton
            className={
              commandState.canDeleteTable
                ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                : undefined
            }
            disabled={!commandState.canDeleteTable}
            onClick={deleteCurrentTable}
          >
            <Trash2 size={14} />
            Delete table
          </TableMenuButton>
        </div>
      </div>
    </>
  );
}
