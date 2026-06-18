"use client";

import { ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/core/utils";

// ---------------------------------------------------------------------------
// DirectoryListHeader — the two-row column header for list-view rendering.
// Moved from UsersDirectoryClient renderPeople (USR-01 decomposition, Wave 6).
// ---------------------------------------------------------------------------
export function DirectoryListHeader({
  activitySortActive,
  activitySortDirection,
  activitySortFetching,
  onActivitySortClick,
}: {
  activitySortActive: boolean;
  activitySortDirection: "asc" | "desc";
  activitySortFetching: boolean;
  onActivitySortClick: () => void;
}) {
  return (
    <div className="hidden lg:block">
      <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.8fr_2.8fr_1fr_auto] gap-3 px-4 pt-2 pl-[68px] text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
        <span>Name</span><span>Department</span><span>Job Title</span>
        <span>Cost Center</span><span>Phone</span><span>Status</span>
        <span className="text-center border-b border-border/30 pb-0.5">File Activity</span>
        <button
          type="button"
          onClick={onActivitySortClick}
          aria-label={"Sort by last file activity, " + (activitySortActive ? activitySortDirection : "inactive")}
          className={cn("inline-flex items-center gap-1 text-left uppercase tracking-wider font-medium transition-colors hover:text-foreground", activitySortActive && "text-foreground")}
        >
          Last File Activity
          {activitySortActive && activitySortDirection === "desc" && <ArrowDown size={11} aria-hidden />}
          {activitySortActive && activitySortDirection === "asc" && <ArrowUp size={11} aria-hidden />}
          {activitySortActive && activitySortFetching && <Loader2 className="size-3 animate-spin shrink-0" aria-hidden />}
        </button>
        <span>ACC</span>
      </div>
      <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_1fr_auto] gap-3 px-4 py-1 pl-[68px] text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
        <span /><span /><span /><span /><span /><span />
        <span className="text-muted-foreground/80">View</span>
        <span className="text-muted-foreground/80">Upload</span>
        <span className="text-muted-foreground/80">Edit</span>
        <span className="text-muted-foreground/80">Delete</span>
        <span /><span />
      </div>
    </div>
  );
}
