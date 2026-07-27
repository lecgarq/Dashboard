// app/(dashboard)/template-mty/components/TemplateMembersTableShell.tsx
"use client";

/**
 * Toolbar wrapper (search + 4 filter chips + count badge) that pre-filters the
 * members array and passes the result to the premium DataTable.
 *
 * Pattern 1: DataTable Migration with External Toolbar (RESEARCH §Architecture Patterns)
 * DataTable owns sort; the shell owns filter. Do NOT wrap DataTable in PremiumSurface —
 * it already wraps itself (RESEARCH Pitfall 3).
 */
import { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import type { Row } from "@tanstack/react-table";
// ColumnDef import not needed here — columns come from templateMemberColumns
import { cn } from "@/lib/core/utils";
import { filterMembers, type MemberFilter } from "../templateMembersTable";
import { MEMBER_COLUMNS } from "./templateMemberColumns";
import type { TemplateMember } from "@/lib/server/templateView";

// ---------------------------------------------------------------------------
// Filter chip config
// ---------------------------------------------------------------------------

const FILTERS: { key: MemberFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "internal", label: "Internal" },
  { key: "external", label: "External" },
  { key: "admin", label: "Admin" },
];

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function TemplateMembersTableShell({
  members,
  onSelectMember,
}: {
  members: TemplateMember[];
  onSelectMember?: (email: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");

  // DataTable handles sort; the shell pre-filters only.
  const rows = useMemo(
    () => filterMembers(members, query, filter),
    [members, query, filter],
  );

  const hasActiveFilter = filter !== "all" || query.length > 0;

  function handleRowClick(row: Row<TemplateMember>) {
    if (row.original.email) {
      onSelectMember?.(row.original.email);
    }
  }

  function handleClearFilters() {
    setQuery("");
    setFilter("all");
  }

  return (
    <div className="flex flex-col gap-0 overflow-hidden">
      {/* Toolbar — NOT wrapped in PremiumSurface (DataTable owns its own surface) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        {/* Search input */}
        <div className="relative min-w-[12rem] flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members…"
            aria-label="Search members"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>

        {/* Filter chips — All / Internal / External / Admin */}
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                  on
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Count badge */}
        <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
          {rows.length} of {members.length}
        </span>
      </div>

      {/* DataTable — owns sort, virtualisation, PremiumSurface wrap */}
      <DataTable
        data={rows}
        columns={MEMBER_COLUMNS}
        label="Template project members"
        getRowLabel={(m) => m.name}
        pinnedColumn="name"
        defaultSort={[{ id: "name", desc: false }]}
        hasActiveFilter={hasActiveFilter}
        onClearFilters={handleClearFilters}
        onRowClick={handleRowClick}
        emptyMessage="No members found for this template."
        filteredEmptyMessage="No members match your search."
      />
    </div>
  );
}
