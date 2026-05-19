"use client";

/**
 * RightPanelStack.tsx — Phase 4-02 Task 3
 *
 * Z-stack manager for the three right-side panel layers:
 *   - SliderSidebar     (default home)
 *   - SelectionPanel    (lasso completed → shows pie breakdown)
 *   - UserDetailPanel   (node clicked → shows full user record)
 *
 * Rule: latest action wins. UserDetail beats SelectionPanel beats Sliders.
 * Closing the active overlay returns to the panel underneath (ultimately Sliders).
 *
 * Slide-in animation: framer-motion AnimatePresence with translateX (RESEARCH Pattern 9).
 */

import { AnimatePresence, motion } from "framer-motion";
import { SliderSidebar } from "./SliderSidebar";
import { SelectionPanel } from "./SelectionPanel";
import { UserDetailPanel } from "./UserDetailPanel";
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

  return (
    <div
      data-testid="right-panel-stack"
      data-top-layer={top}
      className="relative flex"
    >
      <AnimatePresence mode="wait">
        {top === "user-detail" ? (
          <motion.div key="user-detail" {...slide}>
            <UserDetailPanel
              userIndex={isolatedNodeIndex!}
              features={features}
              onClose={() => setIsolated(null)}
            />
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
