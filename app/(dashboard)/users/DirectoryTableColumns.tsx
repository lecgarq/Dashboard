"use client";

/**
 * Five TanStack ColumnDef<DirectoryRow>[] definitions for the /users DataTable
 * and the cell components that render each column.
 *
 * Pure/presentational — NO tRPC imports, NO fetch calls inside any cell.
 */
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNowStrict } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ProfileAvatar } from "./ProfileAvatar";
import type { DirectoryRow } from "./directoryTableRow";

// ---------------------------------------------------------------------------
// Column helper
// ---------------------------------------------------------------------------

const helper = createColumnHelper<DirectoryRow>();

// ---------------------------------------------------------------------------
// Cell components
// ---------------------------------------------------------------------------

/** Name column — avatar + displayName + optional dormant status dot. */
function NameCell({ row }: { row: { original: DirectoryRow } }) {
  const { displayName, email, photoUrl, isDormant, lastActivity } = row.original;
  // Only show a dot when lastActivity is known (not null) and the user is dormant.
  const showDot = lastActivity !== null && isDormant;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="relative shrink-0">
        <ProfileAvatar name={displayName} email={email} photoUrl={photoUrl} size="sm" />
        {showDot && (
          <span
            data-dormant
            aria-label="Dormant"
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-1 ring-background"
          />
        )}
      </div>
      <span className="truncate text-sm font-medium">{displayName}</span>
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
    header: "Last Active",
    size: 140,
    enableSorting: true,
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
