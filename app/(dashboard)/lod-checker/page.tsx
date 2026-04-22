"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { trpc } from "@/lib/core/trpc";
import { LodSearchBar } from "@/components/lod/LodSearchBar";
import { LodStatsBar } from "@/components/lod/LodStatsBar";
import { LodDetailPanel } from "@/components/lod/LodDetailPanel";
import { LodGraphCanvas } from "@/components/lod/LodGraphCanvas";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, Sparkles, Network, FlaskConical } from "lucide-react";
import { LodTrainingPanel } from "@/components/lod/LodTrainingPanel";
import { getFamilyDisplayName } from "@/components/lod/lodDisplay";

type LodFamily = {
  id: string;
  nameOfFile: string;
  familyName: string | null;
  finalCategory: string | null;
  lodLabel: string | null;
  provider: string | null;
  caption: string | null;
  imagePath: string | null;
  confidenceLevel: string | null;
};

type View = "search" | "graph" | "training";

export default function LODCheckerPage() {
  const [view, setView] = useState<View>("search");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isFetching, isError, error } = trpc.lod.search.useQuery(
    { query },
    { enabled: query.length > 0 && view === "search" }
  );

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setSelectedId(null);
  }, []);

  const results = (data?.results ?? []) as LodFamily[];
  const hasData = results.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="LOD Checker" />

      <div className="flex flex-col gap-4 p-4 flex-1 overflow-hidden">
        <LodStatsBar />

        {/* View toggle */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setView("search")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "search"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            Search
          </button>
          <button
            onClick={() => setView("graph")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "graph"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            Graph
          </button>
          <button
            onClick={() => setView("training")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "training"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Training
          </button>
        </div>

        {view === "search" && (
          <>
            <LodSearchBar onSearch={handleSearch} isLoading={isFetching} />

            <div className="flex-1 overflow-y-auto">
              {isFetching && (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {!isFetching && isError && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                  <p className="text-sm">
                    {error?.message ??
                      "Search failed. Verify the LOD engine service and try again."}
                  </p>
                </div>
              )}

              {!isFetching && !isError && query && !hasData && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                  <p className="text-sm">No families found for "{query}"</p>
                </div>
              )}

              {!isFetching && !query && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Database className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Enter a search term to find Revit families</p>
                  <p className="text-xs opacity-60">Powered by AI semantic search + pgvector</p>
                </div>
              )}

              {!isFetching && hasData && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1 pb-1">
                    {data?.fromCache && <Sparkles className="h-3 w-3" />}
                    {results.length} results{data?.fromCache ? " (cached)" : ""}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {results.map((family) => {
                      const displayName = getFamilyDisplayName(
                        family.familyName,
                        family.nameOfFile
                      );
                      return (
                        <button
                          key={family.id}
                          onClick={() => setSelectedId(family.id)}
                          className="group text-left rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200 p-3 flex gap-3 items-start"
                        >
                          {/* Thumbnail */}
                          <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/50 relative">
                            {family.imagePath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/lod-img/${encodeURIComponent(family.imagePath)}`}
                                alt={displayName}
                                className="w-full h-full object-cover grayscale-[0.15] group-hover:grayscale-0 transition-all duration-300"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : null}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-xs truncate text-foreground">
                              {displayName}
                            </p>
                            {family.finalCategory && (
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate mt-0.5">
                                {family.finalCategory}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {family.lodLabel && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {family.lodLabel}
                                </Badge>
                              )}
                              {family.provider && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {family.provider}
                                </Badge>
                              )}
                            </div>
                            {family.caption && (
                              <p className="text-[10px] text-muted-foreground/70 line-clamp-2 mt-1">
                                {family.caption}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {view === "graph" && (
          <div className="flex-1 overflow-hidden rounded-lg border">
            <LodGraphCanvas onSelectFamily={setSelectedId} />
          </div>
        )}

        {view === "training" && (
          <div className="flex-1 overflow-y-auto">
            <LodTrainingPanel />
          </div>
        )}
      </div>

      <LodDetailPanel
        familyId={selectedId}
        onClose={() => setSelectedId(null)}
        onSelectFamily={setSelectedId}
      />
    </div>
  );
}
