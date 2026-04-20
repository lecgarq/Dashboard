"use client";

/**
 * slash-menu/index.tsx
 *
 * Scaffold for the slash command (/) insertion menu.
 * The Tiptap CLI (npx @tiptap/cli@latest add slash-dropdown-menu) requires Pro
 * authentication and could not be run non-interactively. This scaffold provides
 * the component interface shape that subsequent plans (02-04-PLAN.md) expect.
 *
 * Full slash menu implementation is in 02-04-PLAN.md.
 */

import React from "react";
import type { Editor } from "@tiptap/react";

export interface SlashMenuItem {
  title: string;
  description?: string;
  searchAliases?: string[];
  icon?: React.ReactNode;
  group?: string;
  onSelect: (context: { editor: Editor }) => void;
}

export interface SlashDropdownMenuProps {
  editor: Editor;
  items?: SlashMenuItem[];
}

/**
 * SlashDropdownMenu — command palette triggered by typing "/" on an empty line.
 * Scaffold: renders nothing until 02-04-PLAN.md implementation.
 */
export function SlashDropdownMenu({ editor: _editor, items: _items }: SlashDropdownMenuProps) {
  // Scaffold — full implementation in 02-04-PLAN.md
  return null;
}

export default SlashDropdownMenu;
