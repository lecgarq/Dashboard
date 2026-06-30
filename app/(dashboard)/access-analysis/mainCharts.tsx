/**
 * MainCharts RSC — loads all fast parallel data fetches for the Access Analysis
 * page then renders AccessAnalysisCharts with all props wired.
 *
 * Separated from page.tsx so it can be:
 *  a) Imported in page.tsx inside a <Suspense> boundary, and
 *  b) Directly awaited in Vitest tests (bypassing the Suspense boundary, which
 *     jsdom/RTL don't resolve automatically for async RSC children).
 *
 * The expensive sequential `loadFolderPermissionTerrain(defaultProject.id)` is
 * intentionally absent — terrain now builds its account-wide overview on expand
 * via TerrainReveal (ACC-03 / 05-04 locked decision).
 */
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { loadModuleActivity } from "@/lib/server/moduleActivityView";
import { loadActivityByActor } from "@/lib/server/activityByActorView";
import { loadCoordinationByProject } from "@/lib/server/coordinationByProjectView";
import { loadProjectCoverage } from "@/lib/server/projectCoverageView";
import { loadTerrainProjects } from "@/lib/server/folderPermissionTerrainView";
import { loadActivityTimeline } from "@/lib/server/activityTimelineView";
import { loadDcCoverage } from "@/lib/server/dcCoverageView";
import { AccessAnalysisCharts } from "./components/AccessAnalysisCharts";
import { loadProjectClashes } from "./coordinationActions";
import { loadTerrainForProject, loadOverviewTerrain } from "./folderTerrainActions";
import { loadFolderActivityProjectsAction, loadFolderActivityTreeAction } from "./folderActivityActions";
import mtyAllowlist from "@/lib/acc/mty-allowlist.json";
import type { ProjectRoleRow } from "./projectFilter";

export async function MainCharts() {
  const [view, moduleRows, activityActorRows, coordinationData, coverage, terrainProjects, timeline, dcCoverage] =
    await Promise.all([
      loadInstanceView(),
      loadModuleActivity(),
      loadActivityByActor(),
      loadCoordinationByProject(),
      loadProjectCoverage(),
      loadTerrainProjects(),
      loadActivityTimeline(),
      loadDcCoverage(),
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
      timelineRows={timeline.rows}
      dataFloor={timeline.dataFloor}
      floorByProject={timeline.floorByProject}
      activityActorRows={activityActorRows}
      membershipRows={membershipRows}
      coordinationData={coordinationData}
      coverage={coverage}
      dcCoverage={dcCoverage}
      mtyIds={mtyAllowlist as string[]}
      loadClashes={loadProjectClashes}
      terrainProjects={terrainProjects}
      loadTerrain={loadTerrainForProject}
      loadOverview={loadOverviewTerrain}
      loadFolderActivityProjects={loadFolderActivityProjectsAction}
      loadFolderActivityTree={loadFolderActivityTreeAction}
    />
  );
}
