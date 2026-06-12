// app/(dashboard)/template-mty/components/TemplateMembersTable.tsx
"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { TemplateMember } from "@/lib/server/templateView";
import { cn } from "@/lib/core/utils";
import { useEntrance } from "@/components/ui/animated-list";
import {
  filterMembers,
  sortMembers,
  type MemberFilter,
  type MemberSortKey,
  type SortDir,
} from "../templateMembersTable";

const FILTERS: { key: MemberFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "internal", label: "Internal" },
  { key: "external", label: "External" },
  { key: "admin", label: "Admin" },
];

const COLUMNS: { key: MemberSortKey; label: string }[] = [
  { key: "name", label: "Member" },
  { key: "role", label: "Role" },
  { key: "company", label: "Company" },
  { key: "accessLevel", label: "Access" },
  { key: "origin", label: "Origin" },
];

const GRID =
  "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto_auto] items-center gap-3";

export function TemplateMembersTable({
  members,
  onSelectMember,
}: {
  members: TemplateMember[];
  onSelectMember?: (email: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [sortKey, setSortKey] = useState<MemberSortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const entrance = useEntrance();

  const rows = useMemo(
    () => sortMembers(filterMembers(members, query, filter), sortKey, sortDir),
    [members, query, filter, sortKey, sortDir],
  );

  function toggleSort(key: MemberSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No members found for this template.
      </div>
    );
  }

  return (
    <div className="ui-paper overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
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
        <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
          {rows.length} of {members.length}
        </span>
      </div>

      <div role="table" aria-label="Template members" className="text-sm">
        {/* Header */}
        <div
          role="row"
          className={cn(
            GRID,
            "sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur",
          )}
        >
          {COLUMNS.map((c) => {
            const active = sortKey === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="columnheader"
                aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                onClick={() => toggleSort(c.key)}
                className="group/col flex items-center gap-1 text-left font-medium transition-colors hover:text-foreground"
              >
                {c.label}
                <span
                  aria-hidden
                  className={cn(
                    "text-[9px] transition-all duration-200",
                    active ? "opacity-100" : "opacity-0 group-hover/col:opacity-40",
                    active && sortDir === "desc" ? "rotate-180" : "",
                  )}
                >
                  ▲
                </span>
              </button>
            );
          })}
        </div>

        {/* Rows */}
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No members match your search.
          </div>
        ) : (
          <>
            {rows.map((mem, i) => {
              const clickable = !!(mem.email && onSelectMember);
              return (
                <motion.div
                  key={mem.email || mem.name}
                  layout
                  role="row"
                  tabIndex={clickable ? 0 : undefined}
                  onClick={() => clickable && onSelectMember!(mem.email)}
                  onKeyDown={(e) => {
                    if (clickable && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelectMember!(mem.email);
                    }
                  }}
                  {...entrance(i)}
                  className={cn(
                    GRID,
                    "group/row border-b border-border/60 px-4 py-2 transition-colors last:border-0",
                    clickable ? "cursor-pointer hover:bg-accent/50" : "",
                  )}
                >
                  <div role="cell" className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{mem.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{mem.email}</span>
                  </div>
                  <div role="cell" className="truncate text-foreground/90">
                    {mem.role ? mem.role : <span className="text-muted-foreground">No role</span>}
                  </div>
                  <div role="cell" className="truncate text-foreground/90">
                    {mem.company ? mem.company : <span className="text-muted-foreground">—</span>}
                  </div>
                  <div role="cell">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        mem.isAdmin
                          ? "border border-primary/40 bg-primary/10 text-primary"
                          : "bg-muted/60 text-muted-foreground",
                      )}
                    >
                      {mem.accessLevel}
                    </span>
                  </div>
                  <div role="cell" className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        mem.isInternal
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {mem.isInternal ? "Internal" : "External"}
                    </span>
                    {clickable && (
                      <span
                        aria-hidden
                        className="text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100"
                      >
                        ›
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
