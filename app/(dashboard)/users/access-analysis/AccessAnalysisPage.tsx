"use client";

import dynamic from "next/dynamic";
import { AccessAnalysisProvider } from "./AccessAnalysisContext";

// Dynamic + ssr:false because HybridAnalyticsSurface transitively imports
// cosmos.gl + DuckDB-Wasm, which touch `Worker` at module eval time.
const DeferredAnalyticsSection = dynamic(
  () => import("./DeferredAnalyticsSection").then((m) => m.DeferredAnalyticsSection),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[720px] items-center justify-center rounded-md border bg-card text-sm text-muted-foreground">
        Loading access analytics...
      </div>
    ),
  },
);

export function AccessAnalysisPage() {
  return (
    <AccessAnalysisProvider>
      <div className="flex flex-col gap-8 p-4">
        <header>
          <h1 className="text-2xl font-semibold">Access Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Who has access to what - users, projects, roles, folders, and activity.
          </p>
        </header>
        <DeferredAnalyticsSection />
      </div>
    </AccessAnalysisProvider>
  );
}
