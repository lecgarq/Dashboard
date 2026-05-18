"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Network } from "lucide-react";
import { AccessAnalysisProvider } from "./AccessAnalysisContext";
import { TimeWindowSelector } from "./TimeWindowSelector";
import { KpiStrip } from "./KpiStrip";
import { AccessEventsChart } from "./AccessEventsChart";
import { ChangeStreamCard } from "./ChangeStreamCard";
import { DirectoryAccordion } from "./DirectoryAccordion";
import { CHANGE_STREAMS } from "@/lib/acc/accessAnalysisTypes";

// Spatial graph lives on its own route now (/users/spatial-graph) so this page
// never has to pay the cosmos.gl + DuckDB-Wasm cost. The card below is just
// a navigation hint.
function SpatialGraphCard() {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-card/30 p-6 text-center">
      <Network className="h-6 w-6 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">Spatial graph &amp; permission analytics</p>
        <p className="text-xs text-muted-foreground">
          Force-directed view of users, projects, and roles. Heavy — opens in its own page.
        </p>
      </div>
      <Button asChild type="button" size="sm">
        <Link href="/users/spatial-graph">Open Spatial Graph</Link>
      </Button>
    </div>
  );
}

export function AccessAnalysisPage() {
  return (
    <AccessAnalysisProvider>
      <div className="flex flex-col gap-6 p-4">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Access Analysis</h1>
            <p className="text-sm text-muted-foreground">How access is changing over time.</p>
          </div>
          <TimeWindowSelector />
        </header>
        <KpiStrip />
        <AccessEventsChart />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CHANGE_STREAMS.map((s) => <ChangeStreamCard key={s} stream={s} />)}
        </div>
        <SpatialGraphCard />
        <DirectoryAccordion />
      </div>
    </AccessAnalysisProvider>
  );
}
