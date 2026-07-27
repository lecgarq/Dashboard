"use client";

/**
 * Five TanStack ColumnDef<DirectoryRow>[] definitions for the /users DataTable
 * and the cell components that render each column.
 *
 * Pure/presentational — NO tRPC imports, NO fetch calls inside any cell.
 */
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useShallow } from "zustand/shallow";
import { Badge } from "@/components/ui/badge";
import { ProfileAvatar } from "./ProfileAvatar";
import type { DirectoryRow } from "./directoryTableRow";
import { useUsersDirectoryStore } from "./useUsersDirectoryStore";

// ---------------------------------------------------------------------------
// Column helper
// ---------------------------------------------------------------------------

const helper = createColumnHelper<DirectoryRow>();

// ---------------------------------------------------------------------------
// Cell components
// ---------------------------------------------------------------------------

/** Name column — avatar + displayName + optional dormant status dot. */
function NameCell({ row }: { row: { original: DirectoryRow } }) {
  const { displayName, email, photoUrl, isDormant, lastActivity, isExternal } = row.original;
  // Only show a dot when lastActivity is known (not null) and the user is dormant.
  const showDot = lastActivity !== null && isDormant;

  return (
    <div className="flex items-center gap-2 min-w-0" title={isExternal ? "External collaborator" : undefined}>
      <div className="relative shrink-0">
        <ProfileAvatar name={displayName} email={email} photoUrl={photoUrl} size="sm" external={isExternal} />
        {showDot && (
          <span
            data-dormant
            aria-label="Dormant"
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-1 ring-background"
          />
        )}
      </div>
      <span className="truncate text-sm font-medium">{displayName}</span>
      {isExternal && (
        <Badge
          variant="outline"
          className="shrink-0 text-[11px] px-1.5 py-0 border-sky-500/40 text-sky-400"
        >
          Ext
        </Badge>
      )}
    </div>
  );
}

/** Role column — primary role text + "+N" badge for additional roles. */
function RoleCell({ row }: { row: { original: DirectoryRow } }) {
  const { primaryRole, extraRoleCount } = row.original;
  if (!primaryRole) return <span className="text-muted-foreground text-sm">—</span>;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="truncate text-sm">{primaryRole}</span>
      {extraRoleCount > 0 && (
        <Badge variant="secondary" className="shrink-0 text-xs px-1.5 py-0">
          +{extraRoleCount}
        </Badge>
      )}
    </div>
  );
}

/** Last Active column — relative date with title tooltip; muted "— No data" when null. */
function LastActiveCell({ row }: { row: { original: DirectoryRow } }) {
  const { lastActivity } = row.original;

  if (!lastActivity) {
    return (
      <span className="text-muted-foreground text-sm italic">— No data</span>
    );
  }

  const date = new Date(lastActivity);
  const relative = formatDistanceToNowStrict(date, { addSuffix: true });
  const exact = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <span className="text-sm" title={exact}>
      {relative}
    </span>
  );
}

/**
 * Last Active HEADER — drives the server-truth activity sort (the tRPC
 * `usersOrderedByLastFileActivity` infinite query via `cycleActivitySort`:
 * off → newest first → oldest first → off), NOT TanStack's client sort over
 * the partial `lastActivity` field. Reads the store directly so the static
 * column module stays prop-free.
 */
function LastActiveHeader() {
  const { activitySort, cycleActivitySort } = useUsersDirectoryStore(
    useShallow((s) => ({ activitySort: s.activitySort, cycleActivitySort: s.cycleActivitySort })),
  );
  const label = activitySort.active
    ? activitySort.direction === "desc" ? "newest first" : "oldest first"
    : "off";
  return (
    <button
      type="button"
      data-testid="activity-sort-header"
      aria-label={`Sort by last ACC activity, currently ${label}`}
      title="Sort by real ACC activity (server-side): off → newest → oldest"
      onClick={(e) => {
        e.stopPropagation();
        cycleActivitySort();
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className="flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors"
    >
      Last Active
      <span className="flex flex-col -space-y-1 opacity-60">
        {activitySort.active && activitySort.direction === "asc" ? (
          <ChevronUp className="w-3 h-3 opacity-100" />
        ) : activitySort.active ? (
          <ChevronDown className="w-3 h-3 opacity-100" />
        ) : (
          <ChevronUp className="w-3 h-3 opacity-30" />
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

export const USERS_COLUMNS: ColumnDef<DirectoryRow, string>[] = [
  helper.accessor("displayName", {
    id: "name",
    header: "Name",
    size: 240,
    enableSorting: true,
    cell: (ctx) => <NameCell row={ctx.row} />,
  }) as ColumnDef<DirectoryRow, string>,

  helper.display({
    id: "role",
    header: "Role",
    size: 180,
    enableSorting: false,
    cell: (ctx) => <RoleCell row={ctx.row} />,
  }) as ColumnDef<DirectoryRow, string>,

  helper.accessor("company", {
    id: "company",
    header: "Company",
    size: 160,
    enableSorting: true,
    cell: (ctx) => (
      <span className="truncate text-sm block" title={ctx.getValue() ?? undefined}>
        {ctx.getValue() ?? <span className="text-muted-foreground">—</span>}
      </span>
    ),
  }) as ColumnDef<DirectoryRow, string>,

  helper.accessor("officeLabel", {
    id: "office",
    header: "Office",
    size: 120,
    enableSorting: true,
    cell: (ctx) => (
      <span className="text-sm">{ctx.getValue() ?? "—"}</span>
    ),
  }) as ColumnDef<DirectoryRow, string>,

  helper.accessor("lastActivity", {
    id: "lastActive",
    // Server-truth sort owns this header (see LastActiveHeader) — TanStack's
    // client sort over the partial lastActivity field stays OFF.
    header: () => <LastActiveHeader />,
    size: 140,
    enableSorting: false,
    cell: (ctx) => <LastActiveCell row={ctx.row} />,
  }) as ColumnDef<DirectoryRow, string>,

  helper.accessor("projectCount", {
    id: "projects",
    header: "Projects",
    size: 90,
    enableSorting: true,
    cell: (ctx) => (
      <span className="text-sm tabular-nums">{ctx.getValue()}</span>
    ),
  }) as ColumnDef<DirectoryRow, string>,
];
