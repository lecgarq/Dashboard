import { Suspense } from "react";
import { MainCharts } from "./mainCharts";
import { KpiStripSkeleton, DonutGridSkeleton, TimelineSkeleton } from "./components/DonutSkeletons";

export const metadata = { title: "Access Analysis" };
export const dynamic = "force-dynamic";

export default async function AccessAnalysisRoute() {
  return (
    // The dashboard <main> is fixed-height + overflow-hidden, so this page owns
    // its own vertical scroll. Background comes from the themed layout/body.
    <div className="h-full overflow-y-auto text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="surface-card relative overflow-hidden rounded-3xl p-6">
          <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
          <span className="relative inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_currentColor]" />
            ACC · Access &amp; Activity
          </span>
          <h1 className="relative mt-3 font-display text-3xl font-bold tracking-tight text-foreground">
            Access Analysis
          </h1>
          <p className="relative mt-1.5 max-w-prose text-sm text-muted-foreground">
            Roles, module activity, and coordination issues across ACC projects.
            Tick projects once to focus all three panels below.
          </p>
        </header>

        {/*
         * Suspense boundary: the header above paints immediately (static RSC),
         * then the skeleton shows while MainCharts awaits all 7 fast parallel
         * fetches. The terrain is no longer in this Promise.all — it lazy-loads
         * only when the user expands TerrainReveal (ACC-03).
         *
         * Decomposition decision (05-04 SUMMARY): AccessAnalysisCharts owns the
         * cross-filter state (sliceFilters, selected) that ties donuts + timeline
         * together. Splitting the client component across multiple Suspense
         * boundaries would require lifting cross-filter state into a Zustand store
         * or context — an architectural change (Rule 4). Instead: MainCharts is
         * a single async RSC in a single Suspense so the client component mounts
         * once with all data, while skeleton fallbacks paint immediately.
         */}
        <Suspense
          fallback={
            <div className="flex flex-col gap-8">
              <KpiStripSkeleton />
              <DonutGridSkeleton />
              <DonutGridSkeleton />
              <TimelineSkeleton />
            </div>
          }
        >
          <MainCharts />
        </Suspense>
      </div>
    </div>
  );
}
