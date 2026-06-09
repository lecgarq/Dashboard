"use client";

/**
 * RightPanelStack.tsx — Phase 4-02 Task 3
 *
 * Z-stack manager for the three right-side panel layers:
 *   - SliderSidebar     (default home)
 *   - SelectionPanel    (lasso completed → shows pie breakdown)
 *   - UserProfilePanel  (node clicked → shows the full /users profile tab)
 *
 * Rule: latest action wins. UserDetail beats SelectionPanel beats Sliders.
 * Closing the active overlay returns to the panel underneath (ultimately Sliders).
 *
 * Slide-in animation: framer-motion AnimatePresence with translateX (RESEARCH Pattern 9).
 */

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  clampSidebarWidth,
  loadSidebarWidth,
  saveSidebarWidth,
} from "./sidebarWidth";
import { CatalogSliderSidebar } from "./CatalogSliderSidebar";
import { GroupByControls } from "./GroupByControls";
import { SelectionPanel } from "./SelectionPanel";
import { UserProfilePanel } from "../UserProfilePanel";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { trpc } from "@/lib/core/trpc";
import { mergeAccSummaryWithEnrichment } from "../useMergedAccUsers";
import { useSelection } from "./SelectionContext";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";

export interface RightPanelStackProps {
  features: ReadonlyArray<NodeFeatureSnapshot>;
  catalog: readonly CatalogDimension[];
  visibleSelectedIndices: ReadonlySet<number> | null;
  /** Flag-OFF projector map: render the Group-by controls instead of the slider wall. */
  useGroupByControls?: boolean;
  groupBy?: string;
  onGroupByChange?: (id: string) => void;
}

type LayerKind = "user-detail" | "lasso-pie" | "sliders";

function getTopLayer(
  isolatedNodeIndex: number | null,
  lassoSelection: ReadonlySet<number> | null,
): LayerKind {
  if (isolatedNodeIndex !== null) return "user-detail";
  if (lassoSelection) return "lasso-pie";
  return "sliders";
}

const slide = {
  initial: { x: 320, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: 320, opacity: 0 },
  transition: { duration: 0.2 },
};

export function RightPanelStack({
  features,
  catalog,
  visibleSelectedIndices,
  useGroupByControls = false,
  groupBy,
  onGroupByChange,
}: RightPanelStackProps): React.JSX.Element {
  const { isolatedNodeIndex, lassoSelection, setIsolated, setLasso } = useSelection();
  const top = getTopLayer(isolatedNodeIndex, lassoSelection);

  // ---- Resizable rail width (persisted, drag handle on the left edge) -------
  // Client-only shell (AccessAnalysisShellClient is dynamic ssr:false), so it's
  // safe to seed from localStorage in the lazy initializer.
  const [width, setWidth] = useState<number>(() => loadSidebarWidth());
  const widthRef = useRef(width);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const setWidthTracked = (w: number): void => {
    widthRef.current = w;
    setWidth(w);
  };
  const onHandleDown = (e: ReactPointerEvent): void => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: widthRef.current };
  };
  const onHandleMove = (e: ReactPointerEvent): void => {
    const d = dragRef.current;
    if (!d) return;
    // Rail sits on the right edge of the layout: dragging the handle LEFT
    // (clientX decreases) widens it; dragging right narrows it.
    setWidthTracked(clampSidebarWidth(d.startW + (d.startX - e.clientX)));
  };
  const onHandleUp = (e: ReactPointerEvent): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    saveSidebarWidth(widthRef.current);
  };

  // Email → synced snapshot, built from data the access-analysis page already
  // loads (accDcGraph.bulkUsers — same query + args as the shell, so React Query
  // dedups to a cache hit) plus enrichment for company/status parity with the
  // /users tab. Background-fetched on mount; available by the time a node is
  // clicked, so the panel opens instantly with no network on the click itself.
  const bulkUsersQuery = trpc.accDcGraph.bulkUsers.useQuery(
    { includePermissionSummary: true, includeActivityMix: true },
    { staleTime: 600_000, retry: false },
  );
  const enrichedQuery = trpc.accMembers.enrichedUsers.useQuery(undefined, {
    staleTime: 600_000,
    retry: false,
  });
  const usersByEmail = useMemo<Map<string, BulkAccUser>>(() => {
    const base = (bulkUsersQuery.data ?? []) as BulkAccUser[];
    const merged = mergeAccSummaryWithEnrichment(base, enrichedQuery.data ?? []);
    const map = new Map<string, BulkAccUser>();
    for (const u of merged) map.set(u.email.toLowerCase(), u);
    return map;
  }, [bulkUsersQuery.data, enrichedQuery.data]);

  return (
    // Outer column owns the (resizable) width + the drag handle. Width is constant
    // across panel swaps — only a deliberate user drag changes it — so the
    // AnimatePresence mode="wait" gap never reframes the graph's flex-1 camera.
    <div className="relative flex h-full min-h-0 shrink-0" style={{ width }}>
      {/* Drag handle straddling the left border. setPointerCapture keeps the drag
          alive even when the cursor outruns the 8px hit area. */}
      <div
        data-testid="sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        className="group absolute left-0 top-0 z-30 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none"
      >
        <div className="mx-auto h-full w-px bg-border transition-colors group-hover:bg-blue-500" />
      </div>
      {/* Inner scroll area: the slider list is taller than the viewport; it must
          scroll WITHIN the bounded row, not stretch it (which pushed the canvas
          off-screen). Kept separate from the handle so the handle never scrolls. */}
      <div
        data-testid="right-panel-stack"
        data-top-layer={top}
        className="flex h-full min-h-0 w-full overflow-y-auto"
      >
        <AnimatePresence mode="wait">
          {top === "user-detail" ? (
            <motion.div key="user-detail" className="h-full w-full" {...slide}>
              {(() => {
                const email = features[isolatedNodeIndex!]?.emailLower ?? "";
                return (
                  <UserProfilePanel
                    user={usersByEmail.get(email) ?? null}
                    email={email}
                    onClose={() => setIsolated(null)}
                    variant="rail"
                  />
                );
              })()}
            </motion.div>
          ) : top === "lasso-pie" ? (
            <motion.div key="lasso-pie" className="h-full w-full" {...slide}>
              <SelectionPanel
                visibleSelectedIndices={visibleSelectedIndices ?? new Set<number>()}
                features={features}
                onClear={() => setLasso(null)}
              />
            </motion.div>
          ) : (
            <motion.div key="sliders" className="h-full w-full" {...slide}>
              {useGroupByControls && groupBy && onGroupByChange ? (
                <GroupByControls catalog={catalog} groupBy={groupBy} onGroupByChange={onGroupByChange} />
              ) : (
                <CatalogSliderSidebar catalog={catalog} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
