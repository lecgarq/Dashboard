"use client";

import { type Editor } from "@tiptap/react";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { Plus, GripVertical } from "lucide-react";
import { cn } from "@/lib/core/utils";

export interface WikiDragHandleProps {
  editor: Editor;
}

/**
 * WikiDragHandle — drag handle + add block (+) button for the WikiEditor.
 *
 * Renders:
 *   - [+] button: inserts "/" at cursor to trigger the slash command menu
 *   - [⠿] grip: Tiptap's native drag-to-reorder handle
 *
 * Usage in WikiEditor.tsx (alongside EditorContent, not inside it):
 *   <WikiDragHandle editor={editor} />
 */
export function WikiDragHandle({ editor }: WikiDragHandleProps) {
  const handleAddBlock = () => {
    const { selection } = editor.state;
    const insertPos =
      selection.$from.depth > 0 ? selection.$from.after(1) : selection.to;

    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, {
        type: "paragraph",
        content: [{ type: "text", text: "/" }],
      })
      .run();
  };

  return (
    <DragHandle editor={editor}>
      <div
        className={cn(
          "flex items-center gap-0.5",
          "text-muted-foreground hover:text-foreground"
        )}
      >
        <button
          type="button"
          title="Add block"
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
          onClick={handleAddBlock}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Plus size={14} />
        </button>
        <div className="flex h-6 w-6 cursor-grab items-center justify-center rounded hover:bg-accent active:cursor-grabbing">
          <GripVertical size={14} />
        </div>
      </div>
    </DragHandle>
  );
}
