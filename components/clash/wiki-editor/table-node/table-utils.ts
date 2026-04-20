/**
 * table-utils.ts
 *
 * Utility functions for table data operations in the WikiEditor.
 *
 * extractTableRows: walks the ProseMirror document to extract cell text as a 2D array.
 * exportTableAsXlsx: exports the current table to an .xlsx file via SheetJS.
 *
 * Called from the right-click context menu (02-05) — "Export as .xlsx".
 */

import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import * as XLSX from "xlsx";

/**
 * Walk the ProseMirror document tree to extract a 2D array of cell text
 * from the table nearest to (or containing) the current selection.
 *
 * Returns string[][] where index 0 is the header row (if the table has one).
 * Returns an empty array if no table is found.
 */
export function extractTableRows(editor: Editor): string[][] {
  const rows: string[][] = [];
  const { $from } = editor.state.selection;

  let tableNode: ProseMirrorNode | null = null;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "table") {
      tableNode = node;
      break;
    }
  }

  if (!tableNode) return rows;

  tableNode.forEach((rowNode) => {
    const row: string[] = [];
    rowNode.forEach((cellNode) => {
      row.push(cellNode.textContent);
    });
    rows.push(row);
  });

  return rows;
}

/**
 * Export the table at the current cursor position as an .xlsx file.
 * Uses SheetJS (xlsx 0.20.3 from cdn.sheetjs.com — installed in 02-01).
 *
 * Called from the right-click context menu "Export as .xlsx" action.
 * No-ops silently if no table is found in the document.
 *
 * @param editor - The active Tiptap editor instance
 * @param fileName - Output filename (default: 'table-export.xlsx')
 */
export function exportTableAsXlsx(
  editor: Editor,
  fileName = "table-export.xlsx"
): void {
  const rows = extractTableRows(editor);
  if (rows.length === 0) return;

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, fileName);
}
