/**
 * lodState.ts — Level-of-detail mode resolver for the access graph (pure, no React/DOM).
 *
 * The graph draws ONE dot per user-cluster (~3,367) in "aggregate" mode and all real
 * instances (~16,942) in "full" mode. Aggregate is the cheap view used DURING a slider drag
 * (the fps-critical morph); settled → full detail so hover/click/lasso operate on REAL nodes
 * (cosmos hit-testing returns its current point indices, which are cluster reps in aggregate
 * mode — selecting on them would be wrong). A zoom-OUT→aggregate trigger is a planned
 * extension; it requires interaction-mode handling and is intentionally NOT wired yet.
 */

export type LodMode = "aggregate" | "full";

export interface LodInputs {
  /** True while the slider is being actively dragged (SliderContext preview-active). */
  dragging: boolean;
}

/**
 * Aggregate ONLY while dragging; full detail whenever settled. Keeping settled = full means
 * every interaction (hover/click/lasso) runs against the real node set, never the aggregate.
 */
export function resolveLodMode({ dragging }: LodInputs): LodMode {
  return dragging ? "aggregate" : "full";
}
