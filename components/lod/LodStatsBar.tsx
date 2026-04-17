"use client";

import { trpc } from "@/lib/core/trpc";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid, Tag, Library } from "lucide-react";

export function LodStatsBar() {
  const { data, isError } = trpc.lod.getStats.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  if (isError || !data) return null;

  const topCategories = [...data.byCategory]
    .sort((a, b) => b._count.id - a._count.id)
    .slice(0, 4);

  const topLod = [...data.byLod]
    .sort((a, b) => b._count.id - a._count.id)
    .slice(0, 4);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground border-b pb-3">
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <Library className="h-4 w-4" />
        {data.total.toLocaleString()} families
      </span>

      <span className="flex items-center gap-1.5">
        <LayoutGrid className="h-3.5 w-3.5" />
        {topCategories.map((c) => (
          <Badge key={c.finalCategory ?? "none"} variant="secondary" className="text-xs">
            {c.finalCategory ?? "Unclassified"} ({c._count.id})
          </Badge>
        ))}
      </span>

      <span className="flex items-center gap-1.5">
        <Tag className="h-3.5 w-3.5" />
        {topLod.map((l) => (
          <Badge key={l.lodLabel ?? "none"} variant="outline" className="text-xs">
            {l.lodLabel ?? "—"} ({l._count.id})
          </Badge>
        ))}
      </span>
    </div>
  );
}
