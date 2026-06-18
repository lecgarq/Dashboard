"use client";

import { cn } from "@/lib/core/utils";

// ---------------------------------------------------------------------------
// MODULE_BADGE_COLORS + ModuleBadge — exported for reuse by
// DashboardSidePanel.UserActivityBody and UsersDirectoryClient.
// Moved from UsersDirectoryClient (USR-01 decomposition, Wave 6).
// ---------------------------------------------------------------------------
export const MODULE_BADGE_COLORS: Record<string, string> = {
  docs: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  issues: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  submittals: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  rfis: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  sheets: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
  admin: "bg-muted text-foreground/80",
  cost: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  assets: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  bridge: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
};

export function ModuleBadge({ service }: { service: string | null | undefined }) {
  if (!service) return null;
  const className =
    MODULE_BADGE_COLORS[service.toLowerCase()] ?? "bg-muted text-foreground/80";
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-0.5 text-[10px] font-medium rounded uppercase tracking-wide shrink-0",
        className,
      )}
      title={`Source module: ${service}`}
    >
      {service}
    </span>
  );
}
