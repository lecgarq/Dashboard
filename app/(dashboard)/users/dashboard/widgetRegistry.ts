import { createElement, type ComponentType } from "react";

/**
 * Phase 4 Plan 5 — Widget Registry (placeholders).
 *
 * This is the contract that subsequent widget plans (04-06, 04-07, 04-08) implement
 * against. IDs, titles, and spans are LOCKED in this plan; downstream plans replace
 * the placeholder `component` per id without renaming the id.
 *
 * Layout (locked per 04-CONTEXT.md "2-col at 1280px, generous whitespace"):
 *   - kpi, recommendations, heatmap, flow → col-span-2 (full-width)
 *   - everything else → col-span-1 (half-width)
 */

function makePlaceholder(label: string): ComponentType {
  const Placeholder = () =>
    createElement(
      "div",
      { className: "text-sm text-muted-foreground" },
      `${label} placeholder`
    );
  Placeholder.displayName = `Placeholder(${label})`;
  return Placeholder;
}

export interface WidgetSpec {
  /** Display title rendered in the SortableWidget card header. */
  title: string;
  /** Tailwind grid col-span class — must be either `col-span-1` or `col-span-2`. */
  span: "col-span-1" | "col-span-2";
  /** Renderer. Placeholders for now; widget plans replace these. */
  component: ComponentType;
}

export const WIDGETS = {
  coverage:        { component: makePlaceholder("ACC Coverage"),       title: "ACC Coverage",       span: "col-span-1" },
  tiers:           { component: makePlaceholder("Active Users"),       title: "Active Users",       span: "col-span-1" },
  kpi:             { component: makePlaceholder("Overview"),           title: "Overview",           span: "col-span-2" },
  recommendations: { component: makePlaceholder("Recommendations"),    title: "Recommendations",    span: "col-span-2" },
  heatmap:         { component: makePlaceholder("Roles × Modules"),    title: "Roles × Modules",    span: "col-span-2" },
  outliers:        { component: makePlaceholder("Unusual Access"),     title: "Unusual Access",     span: "col-span-1" },
  flow:            { component: makePlaceholder("Role Relationships"), title: "Role Relationships", span: "col-span-2" },
  recent:          { component: makePlaceholder("Recently Added"),     title: "Recently Added",     span: "col-span-1" },
  admins:          { component: makePlaceholder("Account Admins"),     title: "Account Admins",     span: "col-span-1" },
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
] as const satisfies readonly (keyof typeof WIDGETS)[];

export type WidgetId = keyof typeof WIDGETS;

/** localStorage key for persisted widget order (Pitfall 9: never read at module scope). */
export const WIDGET_ORDER_STORAGE_KEY = "acc-dashboard-widget-order";
