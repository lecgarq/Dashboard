"use client";

import * as React from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/core/trpc";
import { computeAllFindings } from "@/lib/acc/dashboardAnalytics";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { FindingsProvider } from "./findingsContext";
import { SelectionProvider } from "./selectionContext";
import { DashboardSidePanel } from "./DashboardSidePanel";
import { SortableWidget } from "./SortableWidget";
import { useWidgetOrder } from "./useWidgetOrder";
import { WIDGETS, type WidgetId } from "./widgetRegistry";

/**
 * Phase 4 Plan 5/06 — Dashboard client root (DASH-11 + DASH-13).
 *
 * 2-col responsive grid (single col on narrow screens, 2 cols at md+) with each widget
 * wrapped in a SortableWidget. Drag end fires `arrayMove`; new order is persisted to
 * localStorage by `useWidgetOrder`.
 *
 * Plan 04-06 lift: data fetching moved here (one query each for ACC users + Workspace
 * directory) and props are spread to every widget. Widgets ignore props they don't
 * need; placeholders ignore props entirely.
 *
 * Workspace error is non-fatal — the Coverage donut handles `workspaceEmails: []` by
 * rendering an inline empty state. ACC users error blocks the dashboard with an
 * inline error message; Skeleton cards render while ACC users load.
 */
export function DashboardClient() {
  const [order, setOrder] = useWidgetOrder();

  const usersQuery = trpc.users.bulkAccSummary.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });
  const workspaceQuery = trpc.workspace.getDirectory.useQuery(undefined, {
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const utils = trpc.useUtils();

  function handleRefresh() {
    utils.users.bulkAccSummary.invalidate();
    utils.workspace.getDirectory.invalidate();
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const fromIdx = order.indexOf(String(e.active.id));
    const toIdx = order.indexOf(String(e.over.id));
    if (fromIdx === -1 || toIdx === -1) return;
    setOrder(arrayMove(order, fromIdx, toIdx));
  }

  const users = (usersQuery.data ?? []) as BulkAccUser[];
  // Workspace error → empty list; CoverageDonutWidget renders an inline empty state.
  const workspaceEmails = workspaceQuery.data?.emails ?? [];

  const widgetProps = React.useMemo(
    () => ({ users, workspaceEmails }),
    [users, workspaceEmails]
  );

  // Pattern 3 — compute findings ONCE per users-array reference. Empty users → null;
  // FindingsProvider only wraps when findings exist so widgets calling useFindings()
  // don't run before data arrives. Skeleton path below renders before this branch.
  const findings = React.useMemo(
    () => (users.length > 0 ? computeAllFindings(users, new Date()) : null),
    [users]
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">ACC Access Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Drag a widget by its handle to reorder. The layout persists across reloads.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={usersQuery.isFetching || workspaceQuery.isFetching}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </header>

      {usersQuery.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load ACC users: {usersQuery.error.message}
        </div>
      ) : null}

      <FindingsProvider
        // Stable empty findings shape while data is loading or empty so widgets
        // that call useFindings() don't throw. Real findings flow once `users` is
        // non-empty (Pattern 3 — single source of truth).
        findings={
          findings ?? {
            junkRoles: [],
            duplicateRoles: [],
            outlierCombos: [],
            roleSeverityIndex: new Map(),
          }
        }
      >
        <SelectionProvider>
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
                      {usersQuery.isLoading ? (
                        <Skeleton className="h-48 w-full" />
                      ) : (
                        <Body {...widgetProps} />
                      )}
                    </SortableWidget>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          {/* Drill-down panel — sibling of grid, OUTSIDE DndContext so the
              panel's interactions never feed drag listeners. */}
          <DashboardSidePanel users={users} />
        </SelectionProvider>
      </FindingsProvider>
    </div>
  );
}
