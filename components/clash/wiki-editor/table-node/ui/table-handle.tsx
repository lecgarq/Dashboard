"use client";

/**
 * table-handle.tsx
 *
 * Scaffold for Tiptap table UI handle components.
 * The Tiptap CLI (npx @tiptap/cli@latest add table-node) requires Pro authentication
 * and could not be run non-interactively. This scaffold provides the component
 * interface shape that subsequent plans expect.
 *
 * Full implementation of TableHandle, TableTriggerButton, TableSelectionOverlay,
 * and TableCellHandleMenu will be built in Phase 2 Wave 2 (02-02-PLAN.md).
 */

import React from "react";
import type { Editor } from "@tiptap/react";

interface TableHandleProps {
  editor: Editor;
}

/**
 * TableHandle — row/column add and drag handles.
 * Scaffold: renders nothing until Phase 2 Wave 2 implementation.
 */
export function TableHandle({ editor: _editor }: TableHandleProps) {
  // Scaffold — full implementation in 02-02-PLAN.md
  return null;
}

/**
 * TableTriggerButton — hover grid picker for table insertion.
 * Scaffold: renders nothing until Phase 2 Wave 2 implementation.
 */
export function TableTriggerButton({ editor: _editor }: TableHandleProps) {
  // Scaffold — full implementation in 02-02-PLAN.md
  return null;
}

/**
 * TableSelectionOverlay — visual overlay on multi-cell selection.
 * Scaffold: renders nothing until Phase 2 Wave 2 implementation.
 */
export function TableSelectionOverlay({ editor: _editor }: TableHandleProps) {
  // Scaffold — full implementation in 02-02-PLAN.md
  return null;
}

/**
 * TableCellHandleMenu — right-click context menu for cell operations.
 * Scaffold: renders nothing until Phase 2 Wave 2 implementation.
 */
export function TableCellHandleMenu({ editor: _editor }: TableHandleProps) {
  // Scaffold — full implementation in 02-02-PLAN.md
  return null;
}
