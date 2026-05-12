import { type ComponentType } from "react";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { CoverageDonutWidget } from "./widgets/CoverageDonutWidget";
import { ActiveUserTiersWidget } from "./widgets/ActiveUserTiersWidget";
import { RolesModulesHeatmapWidget } from "./widgets/RolesModulesHeatmapWidget";
import { KpiStripWidget } from "./widgets/KpiStripWidget";
import { RecommendationsWidget } from "./widgets/RecommendationsWidget";
import { OutlierCombosWidget } from "./widgets/OutlierCombosWidget";
import { RoleRelationshipFlowWidget } from "./widgets/RoleRelationshipFlowWidget";
import { RecentlyAddedWidget } from "./widgets/RecentlyAddedWidget";
import { AdminAccessWidget } from "./widgets/AdminAccessWidget";
import { FolderPermissionsWidget } from "./widgets/FolderPermissionsWidget";

/**
 * Phase 4 Plan 5 — Widget Registry.
 *
 * IDs, titles, and spans are LOCKED. Plan 04-06 fills in `coverage`, `tiers`,
 * `heatmap`. Plan 04-07 fills in the remaining 6 placeholders.
 *
 * Layout (locked per 04-CONTEXT.md "2-col at 1280px, generous whitespace"):
 *   - kpi, recommendations, heatmap, flow → col-span-2 (full-width)
 *   - everything else → col-span-1 (half-width)
 *
 * Component contract (Plan 04-06): every WIDGETS[id].component is a React component
 * that accepts WidgetCommonProps. Components ignore props they don't need (Plan 04-06
 * widgets each consume a subset). DashboardClient lifts data fetching once and spreads
 * the same props object to every widget.
 */

/**
 * Common props passed by DashboardClient to every widget. Plan 04-06 widgets consume
 * a subset; placeholders ignore them. This shape is the cross-plan contract — Plan
 * 04-07 widgets will accept the same shape (or extend it additively).
 */
export interface WidgetCommonProps {
  users: BulkAccUser[];
  workspaceEmails: string[];
}

export interface WidgetSpec {
  /** Display title rendered in the SortableWidget card header. */
  title: string;
  /** Tailwind grid col-span class — must be either `col-span-1` or `col-span-2`. */
  span: "col-span-1" | "col-span-2";
  /** Renderer. Each widget accepts WidgetCommonProps; consumes the subset it needs. */
  component: ComponentType<WidgetCommonProps>;
}

export const WIDGETS = {
  coverage:        { component: CoverageDonutWidget,         title: "ACC Coverage",       span: "col-span-1" },
  tiers:           { component: ActiveUserTiersWidget,       title: "Active Users",       span: "col-span-1" },
  kpi:             { component: KpiStripWidget,              title: "Overview",           span: "col-span-2" },
  recommendations: { component: RecommendationsWidget,       title: "Recommendations",    span: "col-span-2" },
  heatmap:         { component: RolesModulesHeatmapWidget,   title: "Roles × Modules",    span: "col-span-2" },
  outliers:        { component: OutlierCombosWidget,         title: "Unusual Access",     span: "col-span-1" },
  flow:            { component: RoleRelationshipFlowWidget,  title: "Role Relationships", span: "col-span-2" },
  recent:          { component: RecentlyAddedWidget,         title: "Recently Added",     span: "col-span-1" },
  admins:          { component: AdminAccessWidget,           title: "Account Admins",     span: "col-span-1" },
  folderPermissions: { component: FolderPermissionsWidget,   title: "Folder Permissions", span: "col-span-2" },
} as const satisfies Record<string, WidgetSpec>;

/**
 * Locked default order. Decision-priority sequence per 04-RESEARCH.md user_constraints:
 *   1. Coverage donut + Active-user tiers (population context)
 *   2. KPI strip (full-width)
 *   3. Recommendations widget (full-width)
 *   4. Roles × Modules heatmap (full-width)
 *   5. Outlier module combinations
 *   6. Role-relationship flow (full-width)
 *   7. Recently-added members
 *   8. Admin-access list
 */
export const DEFAULT_ORDER = [
  "coverage",
  "tiers",
  "kpi",
  "recommendations",
  "heatmap",
  "outliers",
  "flow",
  "recent",
  "admins",
  "folderPermissions",
] as const satisfies readonly (keyof typeof WIDGETS)[];

export type WidgetId = keyof typeof WIDGETS;

/** localStorage key for persisted widget order (Pitfall 9: never read at module scope). */
export const WIDGET_ORDER_STORAGE_KEY = "acc-dashboard-widget-order";
