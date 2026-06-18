"use client";

// ---------------------------------------------------------------------------
// DirectoryPills.tsx — status/admin/ACC badge pills for the /users directory
//
// Extracted from UsersDirectoryClient.tsx (USR-01 decomposition, Wave 2).
// No logic changes — this is a pure move.
// ---------------------------------------------------------------------------

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { AggregatedStatus } from "@/lib/acc/accStatusReduction";

// ---------------------------------------------------------------------------
// Phase 09 LIST-01 / LIST-02 — Status + Admin pills
//
// Pill text is load-bearing (CONTEXT lock) — color is decoration only. Each
// pill is rendered as a <button type="button"> for keyboard / screen-reader
// access; Tooltip provides DASH-18 hover detail. Click handlers are wired by
// the parent (Task 3) so T1 ships purely visual markup.
// ---------------------------------------------------------------------------

export const STATUS_PILL_LABEL: Record<AggregatedStatus, string> = {
  active: "Active",
  pending: "Pending",
  deleted: "Deleted",
};

const STATUS_PILL_CLASS: Record<AggregatedStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  deleted: "bg-muted text-muted-foreground border border-border",
};

/**
 * Aggregated status pill (LIST-01). Renders a button-wrapped Badge whose
 * label is the canonical AggregatedStatus literal. When status is undefined
 * (enrichedUsers still in flight) renders a low-opacity skeleton badge.
 */
export function StatusPill({
  status,
  onClick,
}: {
  status: AggregatedStatus | undefined;
  onClick?: (status: AggregatedStatus) => void;
}) {
  if (status === undefined) {
    return (
      <Badge variant="outline" className="opacity-50 text-[10px] px-1.5 py-0">
        …
      </Badge>
    );
  }
  const label = STATUS_PILL_LABEL[status];
  const klass = STATUS_PILL_CLASS[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Filter by status: ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(status);
          }}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
        >
          <Badge className={cn("text-[10px] px-2 py-0", klass)}>{label}</Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        Aggregated across all projects
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Inline Project-Admin pill (LIST-02). Only rendered when projectAdmin is
 * strictly true (any-project admin aggregation already handled by
 * enrichedUsers).
 */
export function AdminPill({ onClick }: { onClick?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Filter to project admins only"
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
        >
          <Badge
            variant="default"
            className="ml-2 text-[10px] px-1.5 py-0 gap-1"
          >
            <ShieldCheck size={9} />
            Admin
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        Project Admin on at least one project
      </TooltipContent>
    </Tooltip>
  );
}

/** Small ACC project count badge shown on person cards/rows */
export function AccBadge({ summary }: { summary: BulkAccUser | undefined }) {
  if (!summary) return null;
  if (summary.hasNoProjects) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5 shrink-0">
        <AlertCircle size={9} className="shrink-0" />
        No projects
      </span>
    );
  }
  if (summary.projectCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        {summary.projectCount} {summary.projectCount === 1 ? "project" : "projects"}
      </span>
    );
  }
  return null;
}
