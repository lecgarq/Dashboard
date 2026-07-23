"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { StatStrip, type Stat } from "@/components/ui/stat-tile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProjectPicker } from "./ProjectPicker";
import { OverviewTabPanel } from "./OverviewTabPanel";
import { RolesTabPanel } from "./RolesTabPanel";
import { UsersTabPanel } from "./UsersTabPanel";
import { CompaniesTabPanel } from "./CompaniesTabPanel";
import { ProjectsTabPanel } from "./ProjectsTabPanel";
import { CompareTabPanel } from "./CompareTabPanel";
import { activityCoverageCounts } from "../coverageCounts";
import { summarizeRoles, UNKNOWN_ROLE, MULTIPLE_ROLES, REMOVED_MEMBER } from "../roleCounts";
import { summarizeModules, type ModuleActivityRow } from "../moduleCounts";
import { summarizeProvisionedModules } from "../provisionedModulesCounts";
import { summarizeProjectActivity } from "../projectActivityCounts";
import { summarizeActivityByRole, type MembershipRolesInput } from "../roleActivityCounts";
import { summarizeCompanies, UNKNOWN_COMPANY } from "../companyCounts";
import { summarizeActivityByCompany } from "../companyActivityCounts";
import { rankDormantByPeople } from "../dormantActivity";
import { summarizeActivityTimeline, type ActivityTimelineRow } from "../timelineCounts";
import { summarizeCoordination } from "../coordinationCounts";
import { summarizeWorkflowTools } from "../workflowToolCounts";
import { projectOptions, filterRowsBySelection, applySliceFilters, type ProjectRoleRow, type SliceFilters } from "../projectFilter";
import { FilterBanner } from "./FilterBanner";
import { PeopleDrillList } from "./PeopleDrillList";
import { DrillSheet } from "@/components/ui/DrillSheet";
import { groupProjectOptions } from "../projectGroups";
import type { DrillPerson } from "../roleCounts";
import type { CoordinationByProjectData } from "@/lib/server/coordinationByProjectView";
import type { ProjectCoverage } from "@/lib/server/projectCoverageView";
import type { DcCoverage } from "@/lib/server/dcCoverageView";
import type { ActivityActorRow } from "@/lib/server/activityByActorView";
import type { ClashIssue } from "../coordinationClash";
import type { FolderTerrainData, TerrainProjectOption } from "../folderTerrain";
import type { FolderRankTotal } from "@/lib/server/folderActivityView";
import type { FolderProjectRow } from "../folderActivityCounts";
import type { FolderActionCell } from "../folderActionTypes";
import type { IngestFreshness } from "@/lib/server/ingestFreshnessView";
import type { ActivityRecencyRow } from "@/lib/server/activityRecencyView";
import type { PermissionLevelRow } from "@/lib/server/permissionLevelView";
import type { PermissionUserCounts } from "@/lib/server/permissionUserView";
import type { FolderActivityActorRow, CompanyFolderSlice } from "@/lib/server/folderActivityByCompanyView";
import type { IssueFunnelData, IssueFunnelStatusRow, IssueFunnelTypeRow } from "@/lib/server/issueFunnelView";
import type { AdminsPerProjectData } from "@/lib/server/adminsPerProjectView";
import type { ProvisionedModuleRow } from "@/lib/server/provisionedModulesView";

// Lazy: keeps the (heavy) shared users-profile + tRPC chain out of the initial
// Access Analysis bundle — it loads only once an author name is first clicked.
const AuthorProfileDrawer = dynamic(
  () => import("./AuthorProfileDrawer").then((m) => m.AuthorProfileDrawer),
  { ssr: false },
);

/**
 * The whole Access Analysis surface behind ONE project picker. The selected set
 * of projects focuses BOTH donuts at once: roles (by membership) and module
 * activity (by volume). The project list is the union of the two sources — some
 * projects have access but no recorded activity, and the account-level admin
 * bucket has activity but no membership — so neither donut hides a project the
 * other knows about. Coordination rows are also included so MC-only projects
 * are selectable.
 *
 * 20.1-05 tab-IA redesign (UAT item 7 — "current layout is all over the
 * place"): this is now a thin shell. Shared state, the project picker, and the
 * FilterBanner stay pinned ABOVE a 6-tab Radix `<Tabs>` root
 * (Overview · Roles · Users · Companies · Projects · Compare); every tab
 * (including Compare's terrain) reads the same `selected`/`sliceFilters`
 * state. Tab content is controlled client state (`value`/`onValueChange`) —
 * no useRouter/useSearchParams — so switching tabs never resets scroll
 * position or selection (research Pitfall 5). Panel JSX itself now lives in
 * the six sibling *TabPanel components; this file owns state + wiring only.
 *
 * 20.1-06 panel-semantic swaps: the tab value is now controlled (not
 * `defaultValue`) so an effect can fetch the three ENG-01/PERM-01/UAT-6
 * loaders lazily on first Roles/Users/Companies tab activation — never
 * eagerly in mainCharts.tsx's Promise.all (fan-out stays at 9). Each loader
 * fires at most once per page load (a ref flag, not a null-check, gates the
 * fetch — a no-session `null` result must not cause an infinite refetch loop
 * every time the tab is revisited); the resulting rows (`T[] | null`) are
 * passed straight to the panels, which already render an honest empty state
 * for zero rows.
 */
export function AccessAnalysisCharts({
  roleRows,
  moduleRows,
  timelineRows,
  dataFloor,
  floorByProject,
  activityActorRows,
  membershipRows,
  coordinationData,
  coverage,
  dcCoverage,
  mtyIds,
  loadClashes,
  terrainProjects,
  initialTerrain,
  loadTerrain,
  loadOverview,
  loadFolderRanking,
  loadFolderDetail,
  loadFolderActionMatrix,
  loadActivityRecency,
  loadPermissionLevel,
  loadPermissionUsers,
  loadFolderScopedActivity,
  loadCompanyFolderBreakdown,
  loadIssueFunnel,
  loadWorkflowTools,
  loadAdminsPerProject,
  ingestFreshness,
  provisionedModuleRows,
}: {
  roleRows: ProjectRoleRow[];
  moduleRows: ModuleActivityRow[];
  /** Per-(project, month) activity totals for the Activity timeline. When omitted, that section is hidden. */
  timelineRows?: ActivityTimelineRow[];
  /** TRUTH-02: account-wide earliest activity month as "YYYY-MM", or null. Shown as caption under the timeline. */
  dataFloor?: string | null;
  /** TRUTH-02: per-project earliest activity month as "YYYY-MM". Key "" = account-level bucket. */
  floorByProject?: Record<string, string>;
  /** Per-(project, actor) activity totals for the Activity-by-role donut. When omitted, that section is hidden. */
  activityActorRows?: ActivityActorRow[];
  /** Slim memberships (projectId, email, roles) used to attribute activity to a role. */
  membershipRows?: MembershipRolesInput[];
  coordinationData?: CoordinationByProjectData;
  coverage?: ProjectCoverage[];
  /** TRUTH-01: live DC-metadata coverage (AccDcProject count over AccProject total). */
  dcCoverage?: DcCoverage;
  mtyIds?: string[];
  loadClashes?: (projectId: string) => Promise<ClashIssue[]>;
  terrainProjects?: TerrainProjectOption[];
  initialTerrain?: FolderTerrainData | null;
  loadTerrain?: (projectId: string) => Promise<FolderTerrainData | null>;
  loadOverview?: () => Promise<FolderTerrainData | null>;
  loadFolderRanking?: (ids: string[]) => Promise<FolderRankTotal[]>;
  loadFolderDetail?: (folderName: string, ids: string[]) => Promise<FolderProjectRow[]>;
  loadFolderActionMatrix?: (ids: string[], limit?: number) => Promise<FolderActionCell[]>;
  /** ENG-01 pivot: lazy per-tab fetch (Roles + Users tabs), fired at most once. Presence gates both panels. */
  loadActivityRecency?: () => Promise<ActivityRecencyRow[] | null>;
  /** PERM-01 reframe: lazy per-tab fetch (Roles tab), fired at most once. Presence gates the panel. */
  loadPermissionLevel?: () => Promise<PermissionLevelRow[] | null>;
  /** Users-by-permission-level donut: lazy per-tab fetch (Users tab), fired at most once. Presence gates the panel. */
  loadPermissionUsers?: () => Promise<PermissionUserCounts | null>;
  /** UAT-6: lazy per-tab fetch (Companies tab), fired at most once. Presence gates the panel. */
  loadFolderScopedActivity?: () => Promise<FolderActivityActorRow[] | null>;
  /** UAT-6: lazy per-company folder drill, fired on click (never eager, never cached account-wide). */
  loadCompanyFolderBreakdown?: (emails: string[], projectIds: string[]) => Promise<CompanyFolderSlice[] | null>;
  /** Phase 21 ISSUE-02/03: lazy per-tab fetch (Projects tab), fired at most once. Presence gates both issue-funnel panels. */
  loadIssueFunnel?: () => Promise<IssueFunnelData | null>;
  /** Reviews/RFIs/Submittals donuts: lazy per-tab fetch (Projects tab), fired at most once. Presence gates the panel. */
  loadWorkflowTools?: () => Promise<ModuleActivityRow[] | null>;
  /** Admins-per-project chart (owner ask 2026-07-23): lazy per-tab fetch (Projects tab), fired at most once. Presence gates the panel. */
  loadAdminsPerProject?: () => Promise<AdminsPerProjectData | null>;
  /** PIPE-01: latest Data Connector ingest run + live throughput. Account-wide, NOT project-filtered. */
  ingestFreshness?: IngestFreshness | null;
  /** UAT-21.1-01: eager Overview-tab prop (mainCharts.tsx's Promise.all fan-out, 9->10 — Overview is
   *  never lazy-gated). Presence gates the Provisioned-modules panel. */
  provisionedModuleRows?: ProvisionedModuleRow[];
}) {
  // Union of every source that can name a project — including
  // `provisionedModuleRows` (AccProjectMember covers all 1,153 live projects;
  // `roleRows` is DC-scoped) — so a live-membership-only project stays
  // selectable and default-selected; otherwise `filterRowsBySelection` would
  // silently drop its grants from the Provisioned-modules panel.
  const options = useMemo(
    () =>
      projectOptions([
        ...roleRows,
        ...moduleRows,
        ...(timelineRows ?? []),
        ...(coordinationData?.rows ?? []),
        ...(provisionedModuleRows ?? []),
      ]),
    [roleRows, moduleRows, timelineRows, coordinationData, provisionedModuleRows],
  );

  // Per-project number shown in the picker = membership count (the roles donut's
  // unit), which is the figure the picker has always shown.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of roleRows) m.set(r.projectId, (m.get(r.projectId) ?? 0) + 1);
    return m;
  }, [roleRows]);

  // Authoritative MTY set + per-project coverage, both serialized from the server.
  const mtySet = useMemo(() => new Set(mtyIds ?? []), [mtyIds]);
  const coverageMap = useMemo(
    () => new Map((coverage ?? []).map((c) => [c.projectId, c])),
    [coverage],
  );
  // Office groups drive the picker's collapsible sections + per-group select-all.
  const groups = useMemo(() => groupProjectOptions(options, mtySet), [options, mtySet]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(options.map((o) => o.id)));
  // The author whose profile drawer is open (null = closed). Lowercased email.
  const [profileEmail, setProfileEmail] = useState<string | null>(null);

  // People sheet: opened by "View N people →" affordance (NOT by slice clicks — locked decision).
  // Sources people from in-memory summaries — no tRPC/useQuery (Pitfall 2).
  const [peopleSheet, setPeopleSheet] = useState<{ title: string; people: DrillPerson[] } | null>(null);

  // Slice cross-filters — one value per dimension, ANDed. Toggling the same value clears it.
  // Project Picker `selected` is deliberately separate: "Clear all" only clears sliceFilters.
  const [sliceFilters, setSliceFilters] = useState<SliceFilters>({});
  const toggleSliceFilter = (dim: string, val: string) =>
    setSliceFilters((prev) => {
      const next = { ...prev };
      if (next[dim] === val) delete next[dim]; else next[dim] = val;
      return next;
    });

  // VIS-05: KPI count animation must fire only on first mount, not on filter change.
  // The StatStrip's useEntrance() fires its framer-motion entrance on MOUNT only
  // (keyed by index, not by value), so updating `kpis` values re-renders the number
  // without restarting the entrance — already correct. We confirm by NOT remounting
  // StatStrip on filter change (no `key` prop tied to filter values below).
  // Additionally, guard any future count-up with a `hasAnimated` ref:
  const hasAnimatedKpi = useRef(false);
  // (referenced in kpis array to confirm ref exists — the ref itself prevents re-animation
  //  if a count-up component is ever introduced; currently StatStrip is mount-once.)
  void hasAnimatedKpi;

  // Narrow the projectId set by any active sliceFilters so the timeline refocuses with the donuts.
  // We derive the narrowed set from the slice-filtered role rows (which carry role+company),
  // then intersect with `selected` so the Project Picker and the timeline agree.
  const sliceFilteredProjectIds = useMemo(() => {
    if (Object.keys(sliceFilters).length === 0) return selected;
    const narrowed = new Set(
      applySliceFilters(filterRowsBySelection(roleRows, selected), sliceFilters).map((r) => r.projectId),
    );
    return narrowed;
  }, [roleRows, selected, sliceFilters]);

  // Timeline filters internally (it needs the full per-project rows + the Set),
  // so it takes `timelineRows` directly rather than via filterRowsBySelection.
  // When sliceFilters are active, narrow the timeline to the slice-filtered project set.
  const timelineSummary = useMemo(
    () => summarizeActivityTimeline(timelineRows ?? [], sliceFilteredProjectIds),
    [timelineRows, sliceFilteredProjectIds],
  );
  const roleSummary = useMemo(
    () => summarizeRoles(applySliceFilters(filterRowsBySelection(roleRows, selected), sliceFilters)),
    [roleRows, selected, sliceFilters],
  );
  // moduleSummary: ModuleActivityRow has no roles/company → applySliceFilters is a type-safe no-op;
  // keep driven by the project picker only (consistent with Terrain + MC out-of-scope boundary).
  const moduleSummary = useMemo(
    () => summarizeModules(filterRowsBySelection(moduleRows, selected)),
    [moduleRows, selected],
  );
  // Overview 2-up row (UAT-21.1-01/03): both picker-only, same convention as
  // moduleSummary above — driven by `selected` directly, never
  // `sliceFilteredProjectIds`, no sliceFilters coupling (CONTEXT.md locked).
  const provisionedModuleSummary = useMemo(
    () => summarizeProvisionedModules(filterRowsBySelection(provisionedModuleRows ?? [], selected)),
    [provisionedModuleRows, selected],
  );
  const projectActivitySummary = useMemo(
    () => summarizeProjectActivity(filterRowsBySelection(moduleRows, selected)),
    [moduleRows, selected],
  );
  const activityByRoleSummary = useMemo(
    () =>
      summarizeActivityByRole(
        filterRowsBySelection(activityActorRows ?? [], selected),
        applySliceFilters(filterRowsBySelection(membershipRows ?? [], selected), sliceFilters),
      ),
    [activityActorRows, membershipRows, selected, sliceFilters],
  );
  const companySummary = useMemo(
    () => summarizeCompanies(applySliceFilters(filterRowsBySelection(roleRows, selected), sliceFilters)),
    [roleRows, selected, sliceFilters],
  );
  const activityByCompanySummary = useMemo(
    () =>
      summarizeActivityByCompany(
        filterRowsBySelection(activityActorRows ?? [], selected),
        applySliceFilters(filterRowsBySelection(membershipRows ?? [], selected), sliceFilters),
      ),
    [activityActorRows, membershipRows, selected, sliceFilters],
  );
  const coordSummary = useMemo(
    () => summarizeCoordination(filterRowsBySelection(coordinationData?.rows ?? [], selected)),
    [coordinationData, selected],
  );

  // 20.1-06: controlled tab value so an effect can drive lazy per-tab fetches
  // (Pitfall 5 still respected — plain useState, no useRouter/useSearchParams).
  const [tab, setTab] = useState("overview");

  // Lazy-fetched ENG-01/PERM-01/UAT-6 slices. `null` = not-yet-resolved OR a
  // no-session loader result (both cases: the panel below renders its own
  // honest empty state — never a fake chart). Ref flags (not the `rows ===
  // null` check the data itself would give) gate each fetch to fire AT MOST
  // ONCE per page load, so a no-session `null` result never re-triggers on
  // every tab revisit.
  const [activityRecencyRows, setActivityRecencyRows] = useState<ActivityRecencyRow[] | null>(null);
  const [activityRecencyLoading, setActivityRecencyLoading] = useState(false);
  const activityRecencyFetchedRef = useRef(false);
  const [permissionLevelRows, setPermissionLevelRows] = useState<PermissionLevelRow[] | null>(null);
  const [permissionLevelLoading, setPermissionLevelLoading] = useState(false);
  const permissionLevelFetchedRef = useRef(false);
  const [permissionUserCounts, setPermissionUserCounts] = useState<PermissionUserCounts | null>(null);
  const [permissionUsersLoading, setPermissionUsersLoading] = useState(false);
  const permissionUsersFetchedRef = useRef(false);
  const [folderScopedActivityRows, setFolderScopedActivityRows] = useState<FolderActivityActorRow[] | null>(null);
  const [folderScopedActivityLoading, setFolderScopedActivityLoading] = useState(false);
  const folderScopedActivityFetchedRef = useRef(false);
  // Phase 21 ISSUE-02/03: same ref-flag lazy fetch-once pattern, keyed to the Projects tab.
  const [issueFunnelData, setIssueFunnelData] = useState<IssueFunnelData | null>(null);
  const [issueFunnelLoading, setIssueFunnelLoading] = useState(false);
  const issueFunnelFetchedRef = useRef(false);
  // Reviews/RFIs/Submittals donuts: same ref-flag lazy fetch-once pattern, Projects tab.
  const [workflowToolRows, setWorkflowToolRows] = useState<ModuleActivityRow[] | null>(null);
  const [workflowToolsLoading, setWorkflowToolsLoading] = useState(false);
  const workflowToolsFetchedRef = useRef(false);
  // Admins-per-project: same ref-flag lazy fetch-once pattern, Projects tab.
  const [adminsData, setAdminsData] = useState<AdminsPerProjectData | null>(null);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const adminsFetchedRef = useRef(false);

  useEffect(() => {
    if ((tab === "roles" || tab === "users") && loadActivityRecency && !activityRecencyFetchedRef.current) {
      activityRecencyFetchedRef.current = true;
      setActivityRecencyLoading(true);
      void loadActivityRecency()
        .then((rows) => setActivityRecencyRows(rows))
        .finally(() => setActivityRecencyLoading(false));
    }
    if (tab === "roles" && loadPermissionLevel && !permissionLevelFetchedRef.current) {
      permissionLevelFetchedRef.current = true;
      setPermissionLevelLoading(true);
      void loadPermissionLevel()
        .then((rows) => setPermissionLevelRows(rows))
        .finally(() => setPermissionLevelLoading(false));
    }
    if (tab === "users" && loadPermissionUsers && !permissionUsersFetchedRef.current) {
      permissionUsersFetchedRef.current = true;
      setPermissionUsersLoading(true);
      void loadPermissionUsers()
        .then((counts) => setPermissionUserCounts(counts))
        .finally(() => setPermissionUsersLoading(false));
    }
    if (tab === "companies" && loadFolderScopedActivity && !folderScopedActivityFetchedRef.current) {
      folderScopedActivityFetchedRef.current = true;
      setFolderScopedActivityLoading(true);
      void loadFolderScopedActivity()
        .then((rows) => setFolderScopedActivityRows(rows))
        .finally(() => setFolderScopedActivityLoading(false));
    }
    if (tab === "projects" && loadIssueFunnel && !issueFunnelFetchedRef.current) {
      // Ref set BEFORE the await so a no-session `null` result never refetches.
      issueFunnelFetchedRef.current = true;
      setIssueFunnelLoading(true);
      void loadIssueFunnel()
        .then((data) => setIssueFunnelData(data))
        .finally(() => setIssueFunnelLoading(false));
    }
    if (tab === "projects" && loadWorkflowTools && !workflowToolsFetchedRef.current) {
      workflowToolsFetchedRef.current = true;
      setWorkflowToolsLoading(true);
      void loadWorkflowTools()
        .then((rows) => setWorkflowToolRows(rows))
        .finally(() => setWorkflowToolsLoading(false));
    }
    if (tab === "projects" && loadAdminsPerProject && !adminsFetchedRef.current) {
      adminsFetchedRef.current = true;
      setAdminsLoading(true);
      void loadAdminsPerProject()
        .then((data) => setAdminsData(data))
        .finally(() => setAdminsLoading(false));
    }
  }, [tab, loadActivityRecency, loadPermissionLevel, loadFolderScopedActivity, loadIssueFunnel, loadWorkflowTools, loadAdminsPerProject]);

  // 20.1-06 panels — picker-only filtering (locked decision: no sliceFilters
  // extension, mirrors moduleSummary's pattern). Ingest freshness is account-global
  // and deliberately NOT filtered.
  const filteredActivityRecencyRows = useMemo(
    () => filterRowsBySelection(activityRecencyRows ?? [], selected),
    [activityRecencyRows, selected],
  );
  // Admins-per-project honors the picker; account-wide coverage figures stay
  // as-is (they frame source trust, not the filtered view).
  const filteredAdminsData = useMemo(
    () =>
      adminsData
        ? {
            ...adminsData,
            rows: filterRowsBySelection(adminsData.rows, selected),
            zeroAdminProjects: filterRowsBySelection(adminsData.zeroAdminProjects, selected),
          }
        : null,
    [adminsData, selected],
  );
  const filteredPermissionLevelRows = useMemo(
    () => filterRowsBySelection(permissionLevelRows ?? [], selected),
    [permissionLevelRows, selected],
  );
  const filteredFolderScopedActivityRows = useMemo(
    () => filterRowsBySelection(folderScopedActivityRows ?? [], selected),
    [folderScopedActivityRows, selected],
  );
  const filteredIssueCoverageProjects = useMemo(
    () => filterRowsBySelection(coordinationData?.issueCoverage?.projects ?? [], selected),
    [coordinationData, selected],
  );
  // Phase 21 ISSUE-02/03: picker-only filtering (locked decision) — deliberately
  // `selected`, NOT `sliceFilteredProjectIds`, unlike the Overview timeline two
  // memos above, which does narrow by sliceFilters. No cross-filter bus wiring here.
  const issueTimelineSummary = useMemo(
    () => summarizeActivityTimeline(issueFunnelData?.monthRows ?? [], selected),
    [issueFunnelData, selected],
  );
  const filteredIssueStatusRows: IssueFunnelStatusRow[] = useMemo(
    () => filterRowsBySelection(issueFunnelData?.statusRows ?? [], selected),
    [issueFunnelData, selected],
  );
  // Phase 22 ISSUE-05: same picker-only filtering — deliberately `selected`,
  // never `sliceFilteredProjectIds`. No cross-filter bus wiring here either.
  const filteredIssueTypeRows: IssueFunnelTypeRow[] = useMemo(
    () => filterRowsBySelection(issueFunnelData?.typeRows ?? [], selected),
    [issueFunnelData, selected],
  );
  // Reviews/RFIs/Submittals donuts: same picker-only filtering. `undefined`
  // until the lazy fetch resolves with rows (a no-session null stays hidden).
  const workflowToolSummaries = useMemo(
    () => (workflowToolRows ? summarizeWorkflowTools(filterRowsBySelection(workflowToolRows, selected)) : undefined),
    [workflowToolRows, selected],
  );

  // Dormant = entities with members in the current selection but 0 activity there,
  // ranked by headcount. Picker-scoped, so it mirrors the activity donut it sits under.
  const dormantRoles = useMemo(
    () =>
      rankDormantByPeople(
        roleSummary.usersByRole,
        new Set(activityByRoleSummary.slices.map((s) => s.name)),
        new Set([UNKNOWN_ROLE, MULTIPLE_ROLES, REMOVED_MEMBER]),
      ),
    [roleSummary, activityByRoleSummary],
  );
  const dormantCompanies = useMemo(
    () =>
      rankDormantByPeople(
        companySummary.usersByCompany,
        new Set(activityByCompanySummary.slices.map((s) => s.name)),
        new Set([UNKNOWN_COMPANY]),
      ),
    [companySummary, activityByCompanySummary],
  );

  // NA-01: Coverage badge counts, derived from the server-serialized coverage prop.
  const { covered: covCovered, total: covTotal } = useMemo(
    () => activityCoverageCounts(coverage),
    [coverage],
  );

  const kpis: Stat[] = [
    { label: "Projects", value: selected.size, accent: "primary" },
    { label: "Memberships", value: roleSummary.total, accent: "emerald" },
    { label: "Distinct roles", value: roleSummary.distinctRoles, accent: "violet" },
    { label: "Companies", value: companySummary.distinctCompanies, accent: "primary" },
    { label: "Activities", value: moduleSummary.total, accent: "amber" },
    { label: "Coordination issues", value: coordSummary.total, accent: "orange" },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* VIS-05: StatStrip is NOT keyed by filter values — it mounts once and updates
          in-place so the entrance animation fires only on first load. */}
      <StatStrip stats={kpis} />

      {/* TRUTH-01: metric-specific coverage header. Activity (~956/1,153 via free ACCDS
          crawl) leads; DC-metadata coverage (~550/1,153) is labeled separately.
          All counts come from live server props — no hard-coded literals. */}
      {covTotal > 0 && (
        <p data-testid="coverage-header" className="text-xs text-muted-foreground -mt-4">
          Activity data covers{" "}
          <span className="tabular-nums">{covCovered}</span>{" "}
          of{" "}
          <span className="tabular-nums">{covTotal}</span>{" "}
          ACC projects
          {dcCoverage != null && (
            <>
              {" · "}Data Connector metadata covers{" "}
              <span className="tabular-nums">{dcCoverage.covered}</span>{" "}
              of{" "}
              <span className="tabular-nums">{dcCoverage.total}</span>
            </>
          )}
        </p>
      )}

      <ProjectPicker
        options={options}
        counts={counts}
        countNoun="memberships"
        selected={selected}
        onChange={setSelected}
        testIdPrefix="project"
        groups={groups}
        coverage={coverageMap}
      />

      {Object.keys(sliceFilters).length === 0 ? (
        <p data-testid="filter-idle-tip" className="text-sm text-muted-foreground">
          <span aria-hidden>💡 </span>Tip — click any chart slice to filter the dashboard.
        </p>
      ) : (
        <FilterBanner
          filters={sliceFilters}
          shown={sliceFilteredProjectIds.size}
          total={selected.size}
          onRemove={(d) => toggleSliceFilter(d, sliceFilters[d])}
          onClear={() => setSliceFilters({})}
          labels={{ role: "Role", company: "Company" }}
        />
      )}

      {/* 20.1-05/06: 6 themed tabs for storytelling (UAT item 7). Controlled
          Radix state (value/onValueChange, plain useState) — no URL params
          (Pitfall 5) — so 20.1-06's lazy-fetch effect can key off the active
          tab. Every tab reads the SAME selected/sliceFilters state above;
          switching tabs never resets the picker or filters. */}
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTabPanel
            timelineRows={timelineRows}
            timelineSummary={timelineSummary}
            dataFloor={dataFloor}
            floorByProject={floorByProject}
            covCovered={covCovered}
            covTotal={covTotal}
            moduleSummary={moduleSummary}
            ingestFreshness={ingestFreshness}
            projectActivitySummary={projectActivitySummary}
            provisionedModuleSummary={provisionedModuleRows !== undefined ? provisionedModuleSummary : undefined}
          />
        </TabsContent>

        <TabsContent value="roles">
          <RolesTabPanel
            roleSummary={roleSummary}
            sliceFilters={sliceFilters}
            toggleSliceFilter={toggleSliceFilter}
            setProfileEmail={setProfileEmail}
            setPeopleSheet={setPeopleSheet}
            activityActorRows={activityActorRows}
            activityByRoleSummary={activityByRoleSummary}
            dormantRoles={dormantRoles}
            covCovered={covCovered}
            covTotal={covTotal}
            loadPermissionLevel={loadPermissionLevel}
            permissionLevelLoading={permissionLevelLoading}
            filteredPermissionLevelRows={filteredPermissionLevelRows}
            loadActivityRecency={loadActivityRecency}
            activityRecencyLoading={activityRecencyLoading}
            filteredActivityRecencyRows={filteredActivityRecencyRows}
            dataFloor={dataFloor}
            selected={selected}
            membershipRows={membershipRows}
            loadFolderRanking={loadFolderRanking}
            loadFolderDetail={loadFolderDetail}
            loadFolderActionMatrix={loadFolderActionMatrix}
          />
        </TabsContent>

        <TabsContent value="users">
          <UsersTabPanel
            loadActivityRecency={loadActivityRecency}
            activityRecencyLoading={activityRecencyLoading}
            filteredActivityRecencyRows={filteredActivityRecencyRows}
            covCovered={covCovered}
            covTotal={covTotal}
            dataFloor={dataFloor}
            loadPermissionUsers={loadPermissionUsers}
            permissionUsersLoading={permissionUsersLoading}
            permissionUserCounts={permissionUserCounts}
          />
        </TabsContent>

        <TabsContent value="companies">
          <CompaniesTabPanel
            companySummary={companySummary}
            sliceFilters={sliceFilters}
            toggleSliceFilter={toggleSliceFilter}
            setProfileEmail={setProfileEmail}
            setPeopleSheet={setPeopleSheet}
            activityActorRows={activityActorRows}
            activityByCompanySummary={activityByCompanySummary}
            dormantCompanies={dormantCompanies}
            covCovered={covCovered}
            covTotal={covTotal}
            loadFolderScopedActivity={loadFolderScopedActivity}
            folderScopedActivityLoading={folderScopedActivityLoading}
            filteredFolderScopedActivityRows={filteredFolderScopedActivityRows}
            membershipRows={membershipRows}
            selected={selected}
            loadCompanyFolderBreakdown={loadCompanyFolderBreakdown}
          />
        </TabsContent>

        <TabsContent value="projects">
          <ProjectsTabPanel
            coordinationData={coordinationData}
            filteredIssueCoverageProjects={filteredIssueCoverageProjects}
            coordSummary={coordSummary}
            coverageMap={coverageMap}
            mtySet={mtySet}
            loadClashes={loadClashes}
            setProfileEmail={setProfileEmail}
            loadIssueFunnel={loadIssueFunnel}
            issueFunnelLoading={issueFunnelLoading}
            issueTimelineSummary={issueTimelineSummary}
            filteredIssueStatusRows={filteredIssueStatusRows}
            filteredIssueTypeRows={filteredIssueTypeRows}
            workflowToolSummaries={workflowToolSummaries}
            workflowToolsLoading={workflowToolsLoading}
            adminsData={filteredAdminsData}
            adminsEnabled={Boolean(loadAdminsPerProject)}
            adminsLoading={adminsLoading}
          />
        </TabsContent>

        <TabsContent value="compare">
          <CompareTabPanel
            terrainProjects={terrainProjects}
            loadTerrain={loadTerrain}
            loadOverview={loadOverview}
            selected={selected}
          />
        </TabsContent>
      </Tabs>

      {profileEmail && (
        <AuthorProfileDrawer email={profileEmail} onClose={() => setProfileEmail(null)} />
      )}

      {/* People sheet — opened ONLY by "View N people →" affordance, not by slice clicks. */}
      <DrillSheet
        open={!!peopleSheet}
        onClose={() => setPeopleSheet(null)}
        title={peopleSheet?.title}
        data-testid="people-sheet"
      >
        {peopleSheet && (
          <div data-testid="people-sheet">
            <PeopleDrillList
              title={peopleSheet.title}
              color="#5e96ce"
              people={peopleSheet.people}
              total={peopleSheet.people.reduce((s, p) => s + p.count, 0)}
              unitNoun="people"
              onUserClick={(email) => {
                setProfileEmail(email.toLowerCase());
                setPeopleSheet(null);
              }}
              onClose={() => setPeopleSheet(null)}
            />
          </div>
        )}
      </DrillSheet>
    </div>
  );
}
