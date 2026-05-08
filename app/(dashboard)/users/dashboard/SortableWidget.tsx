"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/core/utils";

/**
 * Phase 4 Plan 5 — SortableWidget (DASH-11).
 *
 * Wraps a widget body in a draggable shadcn Card. Drag listeners are bound ONLY to
 * the header grip-handle button (Pitfall 8 — putting listeners on the whole card
 * breaks chart hover/click for downstream widgets). The `span` className is applied
 * to the OUTERMOST element so the parent grid honors the layout.
 */
export function SortableWidget({
  id,
  span,
  title,
  children,
}: {
  id: string;
  span: string;
  title: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Slight visual lift while dragging so the user sees what is moving.
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(span, "min-w-0")}>
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <button
            type="button"
            aria-label={`Drag to reorder ${title}`}
            className="cursor-grab rounded-md p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
