"use client";

// Presentational composition extracted from HybridAnalyticsSurface.tsx (SPLIT-04 Task 2).
// The chart/panel JSX body (~620 lines) is split into a posture section and a rankings section
// so neither file exceeds the ~400-line ceiling — precedent: SPLIT-02 (Plan 16-02) split its view
// the same way. Receives the view-model + drill-down handlers as props.
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { HybridAnalyticsViewModel } from "./useHybridAnalytics";
import { HybridAnalyticsPostureSection } from "./HybridAnalyticsPostureSection";
import { HybridAnalyticsRankingsSection } from "./HybridAnalyticsRankingsSection";

export interface DetailFilter {
  title: string;
  subtitle: string;
  filterFn: (u: BulkAccUser) => boolean;
}

export type VgPlotColumnType =
  | "projects"
  | "admin"
  | "topProjects"
  | "topRoles"
  | "topCompanies"
  | "rolesProjectStatus";

export interface HybridAnalyticsViewProps {
  viewModel: HybridAnalyticsViewModel;
  setDetailFilter: (filter: DetailFilter | null) => void;
  handleVgPlotClick: (e: React.MouseEvent<HTMLDivElement>, columnType: VgPlotColumnType) => void;
  handleHeadlineSelect: (id: string) => void;
}

export function HybridAnalyticsView(props: HybridAnalyticsViewProps) {
  return (
    <>
      <HybridAnalyticsPostureSection {...props} />
      <HybridAnalyticsRankingsSection {...props} />
    </>
  );
}
