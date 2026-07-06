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
import { loadIngestFreshness } from "@/lib/server/ingestFreshnessView";
import { AccessAnalysisCharts } from "./components/AccessAnalysisCharts";
import { loadProjectClashes } from "./coordinationActions";
import { loadTerrainForProject, loadOverviewTerrain } from "./folderTerrainActions";
import { loadFolderActivityProjectsAction, loadFolderActivityTreeAction } from "./folderActivityActions";
import { loadActivityRecencyAction } from "./activityRecencyActions";
import { loadPermissionLevelAction } from "./permissionLevelActions";
import { loadFolderScopedActivityAction, loadCompanyFolderBreakdownAction } from "./folderActivityByCompanyActions";
import { loadIssueFunnelAction } from "./issueFunnelActions";
import mtyAllowlist from "@/lib/acc/mty-allowlist.json";
import type { ProjectRoleRow } from "./projectFilter";

export async function MainCharts() {
  // Fan-out: 9 entries (STATE.md-flagged review, resolved 20.1-06). The Phase
  // 20 permission-footprint/sign-in-recency loaders are GONE (superseded by
  // the PERM-01/ENG-01 panel-semantic pivots below), dropping the prior
  // 11-entry fan-out by 2. The three new 20.1-01/02/03 loaders
  // (activity-recency, permission-level, folder-scoped-activity) do NOT ride
  // this eager Promise.all — they're passed down as FUNCTION PROPS and fetched
  // lazily on first Roles/Users/Companies tab activation (see
  // AccessAnalysisCharts.tsx), keeping first paint lighter, not heavier.
  // ISSUE-01 adds nothing here — it rides the existing loadCoordinationByProject()
  // call (see lib/server/coordinationByProjectView.ts's additive issueCoverage
  // field, plan 20-03's consolidation decision). Stays well under the
  // ~12-entry fan-out warning threshold (PITFALLS.md Pitfall 4) while keeping
  // the load flat and parallel — no waterfall. Phase 21's issue-funnel loader
  // (ISSUE-02/03) also rides the lazy per-tab path, not this eager fan-out.
  const [
    view,
    moduleRows,
    activityActorRows,
    coordinationData,
    coverage,
    terrainProjects,
    timeline,
    dcCoverage,
    ingestFreshness,
  ] = await Promise.all([
    loadInstanceView(),
    loadModuleActivity(),
    loadActivityByActor(),
    loadCoordinationByProject(),
    loadProjectCoverage(),
    loadTerrainProjects(),
    loadActivityTimeline(),
    loadDcCoverage(),
    loadIngestFreshness(),
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
      loadActivityRecency={loadActivityRecencyAction}
      loadPermissionLevel={loadPermissionLevelAction}
      loadFolderScopedActivity={loadFolderScopedActivityAction}
      loadCompanyFolderBreakdown={loadCompanyFolderBreakdownAction}
      loadIssueFunnel={loadIssueFunnelAction}
      ingestFreshness={ingestFreshness}
    />
  );
}
