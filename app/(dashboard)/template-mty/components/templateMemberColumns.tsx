// app/(dashboard)/template-mty/components/templateMemberColumns.tsx
"use client";

/**
 * Five TanStack ColumnDef<TemplateMember>[] for the /template-mty DataTable migration.
 * Pure/presentational — no hooks, no fetch calls inside any cell.
 */
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/core/utils";
import type { TemplateMember } from "@/lib/server/templateView";

// ---------------------------------------------------------------------------
// Column helper
// ---------------------------------------------------------------------------

const helper = createColumnHelper<TemplateMember>();

// ---------------------------------------------------------------------------
// Cell components
// ---------------------------------------------------------------------------

/** Member column — two-line: name (bold) + email (muted, xs). */
function MemberCell({ row }: { row: { original: TemplateMember } }) {
  const { name, email } = row.original;
  const hasEmail = !!email;
  return (
    <div className={cn("flex min-w-0 flex-col", !hasEmail && "opacity-60")}>
      <span className="truncate text-sm font-medium text-foreground">{name}</span>
      {email ? (
        <span className="truncate text-xs text-muted-foreground">{email}</span>
      ) : (
        <span className="truncate text-xs italic text-muted-foreground/60">No email</span>
      )}
    </div>
  );
}

/** Role column — role text or muted "No role" fallback. */
function RoleCell({ row }: { row: { original: TemplateMember } }) {
  const { role } = row.original;
  if (!role) return <span className="text-sm text-muted-foreground">No role</span>;
  return <span className="truncate text-sm text-foreground/90">{role}</span>;
}

/** Company column — company text or muted em-dash fallback. */
function CompanyCell({ row }: { row: { original: TemplateMember } }) {
  const { company } = row.original;
  if (!company) return <span className="text-sm text-muted-foreground">—</span>;
  return <span className="truncate text-sm text-foreground/90">{company}</span>;
}

/** Access column — admin → primary-tinted pill; else muted pill. */
function AccessCell({ row }: { row: { original: TemplateMember } }) {
  const { accessLevel, isAdmin } = row.original;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        isAdmin
          ? "border border-primary/40 bg-primary/10 text-primary"
          : "bg-muted/60 text-muted-foreground",
      )}
    >
      {accessLevel}
    </span>
  );
}

/** Origin column — Internal (emerald) / External (amber) pill. Sort value computed via accessorFn. */
function OriginCell({ row }: { row: { original: TemplateMember } }) {
  const { isInternal } = row.original;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        isInternal
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      {isInternal ? "Internal" : "External"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Column definitions (exported as a constant array — no external state needed)
// ---------------------------------------------------------------------------

// Use ColumnDef<T> (no value-type param) so the array is directly assignable to DataTableProps<T>['columns'].
// The individual accessors are typed via helper and cast to the wider ColumnDef<TemplateMember>.
export const MEMBER_COLUMNS: ColumnDef<TemplateMember>[] = [
  helper.accessor("name", {
    id: "name",
    header: "Member",
    size: 240,
    enableSorting: true,
    cell: (ctx) => <MemberCell row={ctx.row} />,
  }) as ColumnDef<TemplateMember>,

  helper.accessor("role", {
    id: "role",
    header: "Role",
    size: 160,
    enableSorting: true,
    cell: (ctx) => <RoleCell row={ctx.row} />,
  }) as ColumnDef<TemplateMember>,

  helper.accessor("company", {
    id: "company",
    header: "Company",
    size: 160,
    enableSorting: true,
    cell: (ctx) => <CompanyCell row={ctx.row} />,
  }) as ColumnDef<TemplateMember>,

  helper.accessor("accessLevel", {
    id: "accessLevel",
    header: "Access",
    size: 110,
    enableSorting: true,
    cell: (ctx) => <AccessCell row={ctx.row} />,
  }) as ColumnDef<TemplateMember>,

  // Origin sorts by the "Internal" / "External" string derived from isInternal.
  helper.accessor((m) => (m.isInternal ? "Internal" : "External"), {
    id: "origin",
    header: "Origin",
    size: 120,
    enableSorting: true,
    cell: (ctx) => <OriginCell row={ctx.row} />,
  }) as ColumnDef<TemplateMember>,
];
