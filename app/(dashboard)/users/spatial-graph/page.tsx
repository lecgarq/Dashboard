"use client";

import dynamic from "next/dynamic";

// Heavy cosmos.gl + DuckDB-Wasm view — split into its own route so it never
// blocks the /users page. ssr:false because both libs touch `Worker` at module
// eval time. Page must be a Client Component for ssr:false to be allowed.
const DeferredAnalyticsSection = dynamic(
  () => import("../access-analysis/DeferredAnalyticsSection").then((m) => m.DeferredAnalyticsSection),
  { ssr: false, loading: () => <div className="p-6 text-sm text-muted-foreground">Loading spatial graph…</div> },
);

export default function SpatialGraphPage() {
  return (
    <div className="flex h-full min-h-[720px] flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Spatial Graph</h1>
        <p className="text-sm text-muted-foreground">
          Force-directed view of users, projects, and roles. Loads DuckDB-Wasm and the cosmos.gl simulation.
        </p>
      </header>
      <DeferredAnalyticsSection />
    </div>
  );
}
