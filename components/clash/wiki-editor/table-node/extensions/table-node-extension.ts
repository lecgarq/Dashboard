/**
 * table-node-extension.ts
 *
 * Scaffold for Tiptap table extensions.
 * The Tiptap CLI (npx @tiptap/cli@latest add table-node) requires Pro authentication
 * and could not be run non-interactively. This scaffold wraps @tiptap/extension-table
 * (already installed) and re-exports the same API shape that subsequent plans expect.
 *
 * Re-exports: TableKit, TableHandleExtension, CustomTableCell
 * Phase 2 plans import from this path.
 */

import { TableKit } from "@tiptap/extension-table";
import { Extension } from "@tiptap/core";
import { TableCell } from "@tiptap/extension-table";

/**
 * Re-export TableKit bundled from @tiptap/extension-table.
 * Includes: Table, TableRow, TableCell, TableHeader.
 */
export { TableKit } from "@tiptap/extension-table";
export { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";

/**
 * TableHandleExtension — scaffold placeholder.
 * The full table handle UI (hover row/column handles) is implemented in table-handle.tsx.
 * This extension stub satisfies import requirements; actual handle rendering is React-based.
 */
export const TableHandleExtension = Extension.create({
  name: "tableHandle",
});

/**
 * CustomTableCell — extends TableCell with backgroundColor and textAlign attributes.
 * These custom attributes sync via Yjs (ProseMirror node attributes are tracked by y-prosemirror).
 *
 * Source: https://tiptap.dev/docs/editor/extensions/nodes/table-cell
 */
export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.style.backgroundColor || null,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {};
          return { style: `background-color: ${attributes.backgroundColor}` };
        },
      },
      textAlign: {
        default: null,
        parseHTML: (element) => element.style.textAlign || null,
        renderHTML: (attributes) => {
          if (!attributes.textAlign) return {};
          return { style: `text-align: ${attributes.textAlign}` };
        },
      },
    };
  },
});
