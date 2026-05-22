// ActiveFiltersBar.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearAllFilters,
  clearFilter,
  describeActiveFilters,
  type ScopedSelection,
} from "./selectionFilters";

export function ActiveFiltersBar({ scoped }: { scoped: ScopedSelection[] }) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    for (const { selection } of scoped) selection.addEventListener("value", bump);
    return () => {
      for (const { selection } of scoped) selection.removeEventListener("value", bump);
    };
  }, [scoped]);

  // version forces recompute when any selection emits "value".
  void version;
  const filters = describeActiveFilters(scoped);
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2 text-xs shadow-[var(--shadow-soft-sm)]">
      <span className="font-medium uppercase tracking-wide text-muted-foreground">Filters</span>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => { clearFilter(f); setVersion((v) => v + 1); }}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 font-medium transition-colors hover:bg-muted"
          title={`${f.scope}: ${f.label}`}
        >
          <span className="max-w-[16rem] truncate">{f.label}</span>
          <X size={12} className="shrink-0" />
        </button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-6 px-2 text-xs"
        onClick={() => { clearAllFilters(scoped); setVersion((v) => v + 1); }}
      >
        Clear all
      </Button>
    </div>
  );
}
