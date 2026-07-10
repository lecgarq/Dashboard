"use client";

// Presentational composition extracted from HybridAnalyticsSurface.tsx (SPLIT-04 Task 2).
// The chart/panel JSX body (~620 lines) is split into a posture section and a rankings section
// so neither file exceeds the ~400-line ceiling — precedent: SPLIT-02 (Plan 16-02) split its view
// the same way. Receives the view-model + drill-down handlers as props.
import { HybridAnalyticsPostureSection } from "./HybridAnalyticsPostureSection";
import { HybridAnalyticsRankingsSection } from "./HybridAnalyticsRankingsSection";
import type { HybridAnalyticsViewProps } from "./hybridAnalyticsViewTypes";

// Types moved to hybridAnalyticsViewTypes.ts (no-circular fix); re-exported
// so existing `from "./HybridAnalyticsView"` type imports keep resolving.
export type {
  DetailFilter,
  VgPlotColumnType,
  HybridAnalyticsViewProps,
} from "./hybridAnalyticsViewTypes";

export function HybridAnalyticsView(props: HybridAnalyticsViewProps) {
  return (
    <>
      <HybridAnalyticsPostureSection {...props} />
      <HybridAnalyticsRankingsSection {...props} />
    </>
  );
}
