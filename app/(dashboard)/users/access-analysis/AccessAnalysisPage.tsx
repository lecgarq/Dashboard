"use client";

import { AccessAnalysisProvider } from "./AccessAnalysisContext";
import { TimeWindowSelector } from "./TimeWindowSelector";
import { KpiStrip } from "./KpiStrip";
import { AccessEventsChart } from "./AccessEventsChart";

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
      </div>
    </AccessAnalysisProvider>
  );
}
