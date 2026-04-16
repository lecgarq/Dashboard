"use client";

import { Suspense, useState, useCallback } from "react";
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
        <Suspense fallback={<div className="h-8 w-full rounded-md bg-muted animate-pulse" />}>
          <LodStatsBar />
        </Suspense>

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
                <div className="space-y-1">
                  {data?.fromCache && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 pb-1">
                      <Sparkles className="h-3 w-3" />
                      {results.length} results (cached)
                    </p>
                  )}
                  {!data?.fromCache && (
                    <p className="text-xs text-muted-foreground pb-1">
                      {results.length} results
                    </p>
                  )}

                  {results.map((family) => (
                    <button
                      key={family.id}
                      onClick={() => setSelectedId(family.id)}
                      className="w-full text-left rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {family.familyName ?? family.nameOfFile}
                          </p>
                          {family.caption && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {family.caption}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0 mt-0.5">
                          {family.finalCategory && (
                            <Badge variant="secondary" className="text-xs">
                              {family.finalCategory}
                            </Badge>
                          )}
                          {family.lodLabel && (
                            <Badge variant="outline" className="text-xs">
                              {family.lodLabel}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
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
      />
    </div>
  );
}
