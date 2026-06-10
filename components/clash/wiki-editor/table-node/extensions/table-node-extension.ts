/**
 * table-node-extension.ts
 *
 * Scaffold for Tiptap table extensions.
 * The Tiptap CLI (npx @tiptap/cli@latest add table-node) requires Pro authentication
 * and could not be run non-interactively. This scaffold wraps @tiptap/extension-table
 * (already installed) and re-exports the same API shape that subsequent plans expect.
 */

/**
 * Re-export TableKit bundled from @tiptap/extension-table.
 * Includes: Table, TableRow, TableCell, TableHeader.
 */
export { TableKit } from "@tiptap/extension-table";
