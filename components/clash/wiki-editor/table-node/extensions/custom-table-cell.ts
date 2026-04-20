/**
 * custom-table-cell.ts
 *
 * CustomTableCell extends @tiptap/extension-table's TableCell with two extra attributes:
 *   - backgroundColor: persisted in HTML as inline style, synced via Yjs
 *   - textAlign: persisted in HTML as inline style, synced via Yjs
 *
 * Both attributes declare parseHTML + renderHTML so they survive Yjs serialization cycles.
 *
 * Also exposes two editor commands used by the right-click context menu (02-05):
 *   - setCellBackgroundColor(color)
 *   - setCellTextAlign(align)
 *
 * Note: setCellAttribute is provided by @tiptap/extension-table's Table extension (part of TableKit).
 * CustomTableCell piggybacks on that command — it does not re-implement it.
 */

import { TableCell } from "@tiptap/extension-table";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    customTableCell: {
      /**
       * Set the background color of the currently selected table cell(s).
       * Pass null to clear the color.
       * @example editor.commands.setCellBackgroundColor('#fef3c7')
       */
      setCellBackgroundColor: (color: string | null) => ReturnType;
      /**
       * Set the text alignment of the currently selected table cell(s).
       * Pass null to clear the alignment.
       * @example editor.commands.setCellTextAlign('center')
       */
      setCellTextAlign: (align: "left" | "center" | "right" | null) => ReturnType;
    };
  }
}

export const CustomTableCell = TableCell.extend({
  name: "tableCell",

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

  addCommands() {
    return {
      setCellBackgroundColor:
        (color: string | null) =>
        ({ commands }) => {
          return commands.setCellAttribute("backgroundColor", color);
        },
      setCellTextAlign:
        (align: "left" | "center" | "right" | null) =>
        ({ commands }) => {
          return commands.setCellAttribute("textAlign", align);
        },
    };
  },
});
