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

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SliderSidebar } from "./SliderSidebar";
import { SelectionPanel } from "./SelectionPanel";
import { UserProfilePanel } from "../UserProfilePanel";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { trpc } from "@/lib/core/trpc";
import { mergeAccSummaryWithEnrichment } from "../useMergedAccUsers";
import { useSelection } from "./SelectionContext";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export interface RightPanelStackProps {
  features: ReadonlyArray<NodeFeatureSnapshot>;
  visibleSelectedIndices: ReadonlySet<number> | null;
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
  visibleSelectedIndices,
}: RightPanelStackProps): React.JSX.Element {
  const { isolatedNodeIndex, lassoSelection, setIsolated, setLasso } = useSelection();
  const top = getTopLayer(isolatedNodeIndex, lassoSelection);

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
    <div
      data-testid="right-panel-stack"
      data-top-layer={top}
      // P0 camera stability: pin the column to a constant width (w-96, the max of
      // all three panels) so swapping panels — or the AnimatePresence mode="wait"
      // gap that briefly unmounts the child — never resizes the graph's flex-1
      // area and therefore never reframes the camera.
      className="relative flex w-96 shrink-0"
    >
      <AnimatePresence mode="wait">
        {top === "user-detail" ? (
          <motion.div key="user-detail" {...slide}>
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
          <motion.div key="lasso-pie" {...slide}>
            <SelectionPanel
              visibleSelectedIndices={visibleSelectedIndices ?? new Set<number>()}
              features={features}
              onClear={() => setLasso(null)}
            />
          </motion.div>
        ) : (
          <motion.div key="sliders" {...slide}>
            <SliderSidebar />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
