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
import { loadProvisionedModules } from "@/lib/server/provisionedModulesView";
import { AccessAnalysisCharts } from "./components/AccessAnalysisCharts";
import { loadProjectClashes } from "./coordinationActions";
import { loadTerrainForProject, loadOverviewTerrain } from "./folderTerrainActions";
import { loadFolderRankingAction, loadFolderDetailAction, loadFolderActionMatrixAction } from "./folderActivityActions";
import { loadActivityRecencyAction } from "./activityRecencyActions";
import { loadPermissionLevelAction } from "./permissionLevelActions";
import { loadPermissionUsersAction } from "./permissionUserActions";
import { loadFolderScopedActivityAction, loadCompanyFolderBreakdownAction } from "./folderActivityByCompanyActions";
import { loadIssueFunnelAction } from "./issueFunnelActions";
import { loadWorkflowToolsAction } from "./workflowToolsActions";
import { loadAdminsPerProjectAction } from "./adminsPerProjectActions";
import mtyAllowlist from "@/lib/acc/mty-allowlist.json";
import type { ProjectRoleRow } from "./projectFilter";

export async function MainCharts() {
  // Fan-out: 10 entries (grew from 9, 21.1-04). The Phase 20
  // permission-footprint/sign-in-recency loaders are GONE (superseded by
  // the PERM-01/ENG-01 panel-semantic pivots), dropping the prior 11-entry
  // fan-out by 2. The three 20.1-01/02/03 loaders (activity-recency,
  // permission-level, folder-scoped-activity) do NOT ride this eager
  // Promise.all — they're passed down as FUNCTION PROPS and fetched lazily
  // on first Roles/Users/Companies tab activation (see
  // AccessAnalysisCharts.tsx), keeping first paint lighter, not heavier.
  // ISSUE-01 adds nothing here — it rides the existing loadCoordinationByProject()
  // call (see lib/server/coordinationByProjectView.ts's additive issueCoverage
  // field, plan 20-03's consolidation decision). Phase 21's issue-funnel loader
  // (ISSUE-02/03) rides the lazy per-tab path, not this eager fan-out.
  // `loadProvisionedModules` (21.1-02/04, UAT-21.1-01) is the ONE genuine
  // exception to "new loaders ride the lazy per-tab path": Overview is the
  // default-visible tab (never lazy-gated behind a tab click), so its data
  // must be eager just like the other Overview-tab loaders above — this is
  // the documented cause for growing the fan-out, not a new precedent. Items
  // 2 (attribution fix, 21.1-01) and 3 (activity-share-by-project donut,
  // 21.1-03) add NO loader — both re-derive from `moduleRows`, already in
  // this fan-out — so this is the phase's only fan-out growth (9 -> 10).
  // Stays well under the ~12-entry fan-out warning threshold
  // (PITFALLS.md Pitfall 4) while keeping the load flat and parallel — no
  // waterfall.
  // SETTLED, not all-or-nothing. A plain Promise.all rejects the whole fan-out
  // on a single loader failure, which throws past <Suspense> to the route error
  // boundary and replaces KPIs, picker and all six tabs with a generic panel
  // printing the raw error message — on a projector, in front of stakeholders.
  // Every consumer prop below is optional and every panel already gates on
  // presence, so a failed source can degrade to one empty panel instead.
  // `failedSources` carries the names up so that emptiness is LABELLED as a
  // fetch failure (SourcesFailedBanner) and never reads as "no data".
  const settled = await Promise.allSettled([
    loadInstanceView(),
    loadModuleActivity(),
    loadActivityByActor(),
    loadCoordinationByProject(),
    loadProjectCoverage(),
    loadTerrainProjects(),
    loadActivityTimeline(),
    loadDcCoverage(),
    loadIngestFreshness(),
    loadProvisionedModules(),
  ]);

  const failedSources: string[] = [];
  /** Unwrap one settled loader, recording its product-facing name on failure. */
  function take<T>(result: PromiseSettledResult<T>, label: string): T | undefined {
    if (result.status === "fulfilled") return result.value;
    failedSources.push(label);
    console.error(`[access-analysis] loader failed: ${label}`, result.reason);
    return undefined;
  }

  const view = take(settled[0], "memberships") ?? [];
  const moduleRows = take(settled[1], "module activity") ?? [];
  const activityActorRows = take(settled[2], "activity by actor");
  const coordinationData = take(settled[3], "coordination");
  const coverage = take(settled[4], "project coverage");
  const terrainProjects = take(settled[5], "folder terrain projects");
  const timeline = take(settled[6], "activity timeline");
  const dcCoverage = take(settled[7], "Data Connector coverage");
  const ingestFreshness = take(settled[8], "ingest freshness");
  const provisionedModuleRows = take(settled[9], "provisioned modules");

  // Slim per-membership rows for client-side filtering.
  const rows: ProjectRoleRow[] = view.map((v) => ({
    projectId: v.projectId,
    projectName: v.projectName,
    roles: v.roles,
    company: v.company,
    name: v.name,
    email: v.email,
    status: v.status,
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
      timelineRows={timeline?.rows}
      dataFloor={timeline?.dataFloor}
      floorByProject={timeline?.floorByProject}
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
      loadFolderRanking={loadFolderRankingAction}
      loadFolderDetail={loadFolderDetailAction}
      loadFolderActionMatrix={loadFolderActionMatrixAction}
      loadActivityRecency={loadActivityRecencyAction}
      loadPermissionLevel={loadPermissionLevelAction}
      loadPermissionUsers={loadPermissionUsersAction}
      loadFolderScopedActivity={loadFolderScopedActivityAction}
      loadCompanyFolderBreakdown={loadCompanyFolderBreakdownAction}
      loadIssueFunnel={loadIssueFunnelAction}
      loadWorkflowTools={loadWorkflowToolsAction}
      loadAdminsPerProject={loadAdminsPerProjectAction}
      ingestFreshness={ingestFreshness}
      provisionedModuleRows={provisionedModuleRows}
      failedSources={failedSources}
    />
  );
}
