"use client";

/**
 * drag-handle/index.tsx
 *
 * DragHandle wrapper component scaffold.
 * Wraps @tiptap/extension-drag-handle-react (installed via npm) and provides
 * the combined drag handle + add-block (+) button pattern described in RESEARCH.md.
 *
 * The Tiptap CLI (npx @tiptap/cli@latest add drag-context-menu) requires Pro auth
 * and could not be run non-interactively. This file provides the scaffold that
 * downstream plans (02-05-PLAN.md) will implement against.
 *
 * Source: https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react
 */

import React, { useState, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import type { Node } from "@tiptap/pm/model";

export interface DragHandleWrapperProps {
  editor: Editor;
}

interface NodeState {
  node: Node | null;
  pos: number;
}

/**
 * WikiDragHandle — drag handle + add block (+) button for all block types.
 *
 * Scaffold: The full implementation (including context menu for duplicate/delete)
 * is in 02-05-PLAN.md. This scaffold renders a placeholder that compiles cleanly.
 *
 * Usage in WikiEditor.tsx (alongside EditorContent, not inside it):
 *   <WikiDragHandle editor={editor} />
 */
export function WikiDragHandle({ editor: _editor }: DragHandleWrapperProps) {
  const [_currentNode, _setCurrentNode] = useState<NodeState>({ node: null, pos: -1 });

  const handleNodeChange = useCallback(
    ({ node, pos }: { node: Node | null; pos: number }) => {
      _setCurrentNode({ node, pos });
    },
    []
  );

  // Scaffold — @tiptap/extension-drag-handle-react DragHandle component
  // Full implementation in 02-05-PLAN.md
  // The actual DragHandle import is deferred to avoid SSR issues during scaffold phase
  void handleNodeChange;

  return null;
}

export default WikiDragHandle;
