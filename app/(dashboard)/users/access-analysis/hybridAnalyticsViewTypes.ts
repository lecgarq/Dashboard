// Shared prop/type contract for the HybridAnalytics view split (SPLIT-04).
// Lives in its own module so the section components don't import types back
// from HybridAnalyticsView.tsx (that back-import was a circular dependency
// flagged by dependency-cruiser's no-circular rule).
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { HybridAnalyticsViewModel } from "./useHybridAnalytics";

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
