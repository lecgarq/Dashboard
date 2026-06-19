import { Suspense } from "react";
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { loadModuleActivity } from "@/lib/server/moduleActivityView";
import { loadActivityByActor } from "@/lib/server/activityByActorView";
import { loadCoordinationByProject } from "@/lib/server/coordinationByProjectView";
import { loadProjectCoverage } from "@/lib/server/projectCoverageView";
import { loadTerrainProjects } from "@/lib/server/folderPermissionTerrainView";
import { loadActivityTimeline } from "@/lib/server/activityTimelineView";
import { AccessAnalysisCharts } from "./components/AccessAnalysisCharts";
import { KpiStripSkeleton, DonutGridSkeleton, TimelineSkeleton } from "./components/DonutSkeletons";
import { loadProjectClashes } from "./coordinationActions";
import { loadTerrainForProject, loadOverviewTerrain } from "./folderTerrainActions";
import mtyAllowlist from "@/lib/acc/mty-allowlist.json";
import type { ProjectRoleRow } from "./projectFilter";

export const metadata = { title: "Access Analysis" };
export const dynamic = "force-dynamic";

/**
 * Tier 1: Loads all fast parallel fetches — KPIs + donuts + timeline data.
 * The expensive sequential `loadFolderPermissionTerrain(defaultProject.id)` is
 * GONE — terrain now builds its account-wide overview on expand via TerrainReveal.
 *
 * Decomposition rationale (documented for SUMMARY):
 * - Wrapping the whole <AccessAnalysisCharts> in one Suspense boundary is the
 *   cleanest decomposition because AccessAnalysisCharts owns the cross-filter
 *   state (sliceFilters, selected) that ties donuts + timeline together.
 *   Splitting the client component across multiple Suspense boundaries would
 *   require lifting cross-filter state into a Zustand store or context, which
 *   is an architectural change (Rule 4 boundary). This approach still achieves
 *   the key goal: no single blocking Promise.all on the expensive terrain load.
 */
/** Exported for direct testing — bypasses the Suspense boundary so async RSC
 * can be awaited in Vitest without the route shell's skeleton fallback. */
export async function MainCharts() {
  const [view, moduleRows, activityActorRows, coordinationData, coverage, terrainProjects, timelineRows] =
    await Promise.all([
      loadInstanceView(),
      loadModuleActivity(),
      loadActivityByActor(),
      loadCoordinationByProject(),
      loadProjectCoverage(),
      loadTerrainProjects(),
      loadActivityTimeline(),
    ]);

  // Slim per-membership rows for client-side filtering.
  const rows: ProjectRoleRow[] = view.map((v) => ({
    projectId: v.projectId,
    projectName: v.projectName,
    roles: v.roles,
    company: v.company,
    name: v.name,
    email: v.email,
  }));

  const membershipRows = view.map((v) => ({
    projectId: v.projectId,
    email: v.email,
    roles: v.roles,
    company: v.company,
  }));

  return (
    <AccessAnalysisCharts
      roleRows={rows}
      moduleRows={moduleRows}
      timelineRows={timelineRows}
      activityActorRows={activityActorRows}
      membershipRows={membershipRows}
      coordinationData={coordinationData}
      coverage={coverage}
      mtyIds={mtyAllowlist as string[]}
      loadClashes={loadProjectClashes}
      terrainProjects={terrainProjects}
      loadTerrain={loadTerrainForProject}
      loadOverview={loadOverviewTerrain}
    />
  );
}

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
         * only when the user expands TerrainReveal.
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
