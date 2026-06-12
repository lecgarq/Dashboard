import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { loadModuleActivity } from "@/lib/server/moduleActivityView";
import { loadActivityByActor } from "@/lib/server/activityByActorView";
import { loadCoordinationByProject } from "@/lib/server/coordinationByProjectView";
import { loadProjectCoverage } from "@/lib/server/projectCoverageView";
import { loadTerrainProjects, loadFolderPermissionTerrain } from "@/lib/server/folderPermissionTerrainView";
import { loadActivityTimeline } from "@/lib/server/activityTimelineView";
import { AccessAnalysisCharts } from "./components/AccessAnalysisCharts";
import { loadProjectClashes } from "./coordinationActions";
import { loadTerrainForProject, loadOverviewTerrain } from "./folderTerrainActions";
import mtyAllowlist from "@/lib/acc/mty-allowlist.json";
import type { ProjectRoleRow } from "./projectFilter";

export const metadata = { title: "Access Analysis" };
export const dynamic = "force-dynamic";

export default async function AccessAnalysisRoute() {
  const [view, moduleRows, activityActorRows, coordinationData, coverage, terrainProjects, timelineRows] = await Promise.all([
    loadInstanceView(),
    loadModuleActivity(),
    loadActivityByActor(),
    loadCoordinationByProject(),
    loadProjectCoverage(),
    loadTerrainProjects(),
    loadActivityTimeline(),
  ]);
  // Default the terrain to a well-staffed project: among the permission-dense
  // half, the one with the most users in roles (so bar heights are meaningful).
  // Falls back to the most permission-dense project if none are staffed.
  const dense = terrainProjects.filter((p) => p.folderCount >= 4 && p.permCount >= 40);
  const pool = dense.length > 0 ? dense : terrainProjects;
  const defaultProject =
    [...pool].sort((a, b) => b.userRoleCount - a.userRoleCount)[0] ?? terrainProjects[0];
  const initialTerrain = defaultProject
    ? await loadFolderPermissionTerrain(defaultProject.id)
    : null;
  // Slim per-membership rows: just enough for the client to filter by project
  // and re-bucket roles. Everything else in the instance view is dropped.
  const rows: ProjectRoleRow[] = view.map((v) => ({
    projectId: v.projectId,
    projectName: v.projectName,
    roles: v.roles,
  }));
  // Slim memberships for the Activity-by-role join: the actor's role(s) on each
  // project, keyed later by `email::projectId`. Derived from the instance view
  // already loaded above — no extra DB hit.
  const membershipRows = view.map((v) => ({
    projectId: v.projectId,
    email: v.email,
    roles: v.roles,
  }));
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
          initialTerrain={initialTerrain}
          loadTerrain={loadTerrainForProject}
          loadOverview={loadOverviewTerrain}
        />
      </div>
    </div>
  );
}
