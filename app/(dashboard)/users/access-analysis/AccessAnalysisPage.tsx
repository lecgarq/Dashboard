"use client";

import { AccessAnalysisProvider } from "./AccessAnalysisContext";
import { TimeWindowSelector } from "./TimeWindowSelector";
import { KpiStrip } from "./KpiStrip";
import { AccessEventsChart } from "./AccessEventsChart";
import { ChangeStreamCard } from "./ChangeStreamCard";
import { DirectoryAccordion } from "./DirectoryAccordion";
import { CHANGE_STREAMS } from "@/lib/acc/accessAnalysisTypes";

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
        <DirectoryAccordion />
      </div>
    </AccessAnalysisProvider>
  );
}
