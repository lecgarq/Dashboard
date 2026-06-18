"use client";

/**
 * UsersTableSkeleton — table-shaped shimmer placeholder for the /users directory.
 *
 * Renders a 5-column header bar + 8 shimmer data rows matching the DataTable
 * column layout (Name, Role, Office, Last Active, Projects).
 *
 * Used in:
 *   - loading.tsx (route-boundary Suspense fallback)
 *   - UsersDirectoryClient.tsx (inline isLoading fallback)
 *
 * PERF-01: table-shaped skeleton ensures the ~200ms Suspense fallback matches
 * the real layout — no visible layout shift once data loads.
 */

import { Skeleton } from "@/components/ui/skeleton";

// Column width approximations matching USERS_COLUMNS sizes
const HEADER_WIDTHS = [
  "w-48",   // Name (240px)
  "w-36",   // Role (180px)
  "w-24",   // Office (120px)
  "w-28",   // Last Active (140px)
  "w-16",   // Projects (90px)
] as const;

const CELL_WIDTHS = [
  "w-40",   // Name (avatar + text)
  "w-28",   // Role
  "w-20",   // Office
  "w-24",   // Last Active
  "w-10",   // Projects
] as const;

export function UsersTableSkeleton(): React.JSX.Element {
  return (
    <div
      data-testid="users-table-skeleton"
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/60 bg-surface-2">
        {/* Chevron column placeholder */}
        <div className="w-7 shrink-0" />
        {HEADER_WIDTHS.map((w, i) => (
          <Skeleton key={i} className={`h-3 ${w} shrink-0`} />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: 8 }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0"
        >
          {/* Chevron placeholder */}
          <div className="w-7 shrink-0" />
          {/* Name: avatar circle + text bar */}
          <div className="flex items-center gap-2 w-48 shrink-0">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className={`h-3 ${CELL_WIDTHS[0]}`} />
          </div>
          {/* Role */}
          <Skeleton className={`h-3 ${CELL_WIDTHS[1]} shrink-0`} />
          {/* Office */}
          <Skeleton className={`h-3 ${CELL_WIDTHS[2]} shrink-0`} />
          {/* Last Active */}
          <Skeleton className={`h-3 ${CELL_WIDTHS[3]} shrink-0`} />
          {/* Projects */}
          <Skeleton className={`h-3 ${CELL_WIDTHS[4]} shrink-0`} />
        </div>
      ))}
    </div>
  );
}
