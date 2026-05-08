"use client";

import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortableWidget } from "./SortableWidget";
import { useWidgetOrder } from "./useWidgetOrder";
import { WIDGETS, type WidgetId } from "./widgetRegistry";

/**
 * Phase 4 Plan 5 — Dashboard client root (DASH-11 + DASH-13).
 *
 * 2-col responsive grid (single col on narrow screens, 2 cols at md+) with each widget
 * wrapped in a SortableWidget. Drag end fires `arrayMove`; new order is persisted to
 * localStorage by `useWidgetOrder`. Layout density per 04-CONTEXT.md "2-col at 1280px,
 * generous whitespace" — `gap-4` and `p-4` are the minimum.
 *
 * The Refresh button is a no-op in this plan; widget plans (04-06, 04-07) will wire it
 * to invalidate their data queries.
 */
export function DashboardClient() {
  const [order, setOrder] = useWidgetOrder();

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const fromIdx = order.indexOf(String(e.active.id));
    const toIdx = order.indexOf(String(e.over.id));
    if (fromIdx === -1 || toIdx === -1) return;
    setOrder(arrayMove(order, fromIdx, toIdx));
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">ACC Access Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Drag a widget by its handle to reorder. The layout persists across reloads.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled>
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </header>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {order.map((id) => {
              const spec = WIDGETS[id as WidgetId];
              if (!spec) return null;
              const Body = spec.component;
              return (
                <SortableWidget
                  key={id}
                  id={id}
                  span={spec.span}
                  title={spec.title}
                >
                  <Body />
                </SortableWidget>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
