"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown as ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { CompactionCandidate, CompactionFlag } from "@/lib/acc/compactionAnalysis";

const FLAG_META: Record<CompactionFlag, { label: string; cls: string }> = {
  "junk-role": { label: "Junk Role", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  "module-discrepancy": { label: "Module Discrepancy", cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  "duplicate-role": { label: "Duplicate Role", cls: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  inactive: { label: "Inactive", cls: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const FILTERS: Array<{ id: CompactionFlag | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "junk-role", label: "Junk Roles" },
  { id: "module-discrepancy", label: "Module Discrepancy" },
  { id: "duplicate-role", label: "Duplicate Roles" },
  { id: "inactive", label: "Inactive" },
];

type SortKey = "name" | "projects" | "flags";

interface AccCompactionTableProps {
  candidates: CompactionCandidate[];
  onSelectUser: (email: string) => void;
}

export function AccCompactionTable({ candidates, onSelectUser }: AccCompactionTableProps) {
  const [activeFilter, setActiveFilter] = useState<CompactionFlag | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("flags");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = activeFilter === "all"
    ? candidates
    : candidates.filter((c) => c.flags.includes(activeFilter));

  const sorted = [...filtered].sort((a, b) => {
    let diff = 0;
    if (sortKey === "name") diff = (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email);
    else if (sortKey === "projects") diff = a.user.projectCount - b.user.projectCount;
    else diff = b.flags.length - a.flags.length;
    return sortAsc ? diff : -diff;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortAsc ? <ChevronUp size={11} className="inline ml-0.5" /> : <ChevronDownIcon size={11} className="inline ml-0.5" />;
  }

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveFilter(id)}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-full border transition-all",
              activeFilter === id
                ? "bg-primary/10 text-primary border-primary/30"
                : "text-muted-foreground border-border/40 hover:text-foreground hover:border-border/60",
            )}
          >
            {label}
            {id !== "all" && (
              <span className="ml-1.5 tabular-nums">
                ({candidates.filter((c) => c.flags.includes(id as CompactionFlag)).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No candidates for this filter.</p>
      ) : (
        <div className="rounded-xl border border-border/30 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold border-b border-border/30">
            <button onClick={() => toggleSort("name")} className="text-left hover:text-foreground transition-colors">
              User <SortIcon k="name" />
            </button>
            <button onClick={() => toggleSort("flags")} className="text-left hover:text-foreground transition-colors">
              Reasons <SortIcon k="flags" />
            </button>
            <button onClick={() => toggleSort("projects")} className="text-left hover:text-foreground transition-colors">
              Projects <SortIcon k="projects" />
            </button>
            <span>Action</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/20 max-h-96 overflow-y-auto">
            {sorted.map((candidate) => (
              <div
                key={candidate.user.email}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-4 py-3 hover:bg-muted/10 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{candidate.user.name || candidate.user.email}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{candidate.user.email}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {candidate.flags.map((flag) => {
                    const meta = FLAG_META[flag];
                    return (
                      <span key={flag} className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", meta.cls)}>
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground text-center">
                  {candidate.user.projectCount}
                </span>
                <button
                  onClick={() => onSelectUser(candidate.user.email)}
                  className="text-[11px] text-primary hover:text-primary/80 border border-primary/20 rounded-lg px-2.5 py-1 bg-primary/5 hover:bg-primary/10 transition-all whitespace-nowrap"
                >
                  Details
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
