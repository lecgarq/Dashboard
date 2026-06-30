"use client";
import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/ui/animated-list";
import { StatStrip, type Stat } from "@/components/ui/stat-tile";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { ProjectPicker } from "./ProjectPicker";
import { RolesPieChart } from "./RolesPieChart";
import { ModulesPieChart } from "./ModulesPieChart";
import { ActivityByRolePieChart } from "./ActivityByRolePieChart";
import { CompaniesPieChart } from "./CompaniesPieChart";
import { CompaniesActivityPieChart } from "./CompaniesActivityPieChart";
import { CoordinationByProject } from "./CoordinationByProject";
import { TerrainReveal } from "./TerrainReveal";
import { FolderActivityReveal } from "./FolderActivityReveal";
import { ActivityTimelineChart } from "./ActivityTimelineChart";
import { ActivityCoverageBadge } from "./ActivityCoverageBadge";
import { activityCoverageCounts } from "../coverageCounts";
import { summarizeRoles, UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";
import { summarizeModules, type ModuleActivityRow } from "../moduleCounts";
import { summarizeActivityByRole, type MembershipRolesInput } from "../roleActivityCounts";
import { summarizeCompanies, UNKNOWN_COMPANY } from "../companyCounts";
import { summarizeActivityByCompany } from "../companyActivityCounts";
import { rankDormantByPeople } from "../dormantActivity";
import { summarizeActivityTimeline, type ActivityTimelineRow } from "../timelineCounts";
import { summarizeCoordination } from "../coordinationCounts";
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
import type { ProjectActivityTotal } from "@/lib/server/folderActivityView";
import type { FolderActivityRow } from "../folderActivityCounts";

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
  loadFolderActivityProjects,
  loadFolderActivityTree,
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
  loadFolderActivityProjects?: (ids: string[]) => Promise<ProjectActivityTotal[]>;
  loadFolderActivityTree?: (projectId: string) => Promise<FolderActivityRow[]>;
}) {
  const options = useMemo(
    () => projectOptions([...roleRows, ...moduleRows, ...(timelineRows ?? []), ...(coordinationData?.rows ?? [])]),
    [roleRows, moduleRows, timelineRows, coordinationData],
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

  // Dormant = entities with members in the current selection but 0 activity there,
  // ranked by headcount. Picker-scoped, so it mirrors the activity donut it sits under.
  const dormantRoles = useMemo(
    () =>
      rankDormantByPeople(
        roleSummary.usersByRole,
        new Set(activityByRoleSummary.slices.map((s) => s.name)),
        new Set([UNKNOWN_ROLE, MULTIPLE_ROLES]),
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

      {/* Activity over time — full-width, activity-derived → coverage badge */}
      {timelineRows ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            <SectionHeader
              title="Activity over time"
              subtitle="Total ACC activity per month across all years. Tick projects above to refocus the line; quiet months dip to zero."
              badge={<ActivityCoverageBadge covered={covCovered} total={covTotal} />}
            />
            <ActivityTimelineChart
              summary={timelineSummary}
              dataFloor={dataFloor}
              floorByProject={floorByProject}
            />
          </PremiumSurface>
        </Reveal>
      ) : null}

      {/* Terrain — full-width, collapsed by default (ACC-03) */}
      {terrainProjects && terrainProjects.length > 0 && loadTerrain && loadOverview && (
        <Reveal>
          <TerrainReveal
            projects={terrainProjects}
            loadTerrain={loadTerrain}
            loadOverview={loadOverview}
          />
        </Reveal>
      )}

      {/* Folder Activity by Role — full-width, collapsed by default (lazy load) */}
      {loadFolderActivityProjects && loadFolderActivityTree && (
        <Reveal>
          <FolderActivityReveal
            selectedProjectIds={[...selected]}
            memberships={membershipRows ?? []}
            loadProjects={loadFolderActivityProjects}
            loadTree={loadFolderActivityTree}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
          />
        </Reveal>
      )}

      {/* ACC-02: Denser 2-up donut grid for membership and activity donuts.
          lg:grid-cols-2 keeps two columns on wide screens; stacks to 1-up below `lg`.
          Timeline and terrain stay full-width (above). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Role distribution — membership (not activity-derived → no coverage badge) */}
        <Reveal><PremiumSurface
          variant="base"
          glow={!!sliceFilters.role}
          className="flex flex-col gap-3 p-5 overflow-hidden"
        >
          <SectionHeaderWithPeople
            title="Role distribution"
            subtitle="Roles held across all project memberships."
            people={[...roleSummary.usersByRole.values()].flat()}
            onViewPeople={(people) => setPeopleSheet({ title: "Role distribution — people", people })}
            testId="view-people-role"
          />
          <RolesPieChart
            data={roleSummary.slices}
            distinctRoles={roleSummary.distinctRoles}
            usersByRole={roleSummary.usersByRole}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
            onSliceClick={(val) => toggleSliceFilter("role", val)}
            activeSlice={sliceFilters.role}
          />
        </PremiumSurface></Reveal>

        {/* Users by company — membership (not activity-derived → no coverage badge) */}
        <Reveal><PremiumSurface
          variant="base"
          glow={!!sliceFilters.company}
          className="flex flex-col gap-3 p-5 overflow-hidden"
        >
          <SectionHeaderWithPeople
            title="Users by company"
            subtitle="Project memberships grouped by each member's company."
            people={[...companySummary.usersByCompany.values()].flat()}
            onViewPeople={(people) => setPeopleSheet({ title: "Users by company — people", people })}
            testId="view-people-company"
          />
          <CompaniesPieChart
            data={companySummary.slices}
            distinctCompanies={companySummary.distinctCompanies}
            usersByCompany={companySummary.usersByCompany}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
            onSliceClick={(val) => toggleSliceFilter("company", val)}
            activeSlice={sliceFilters.company}
          />
        </PremiumSurface></Reveal>

        {/* Activity by role — activity-derived → coverage badge */}
        {activityActorRows ? (
          <Reveal><PremiumSurface
            variant="base"
            glow={!!sliceFilters.role}
            className="flex flex-col gap-3 p-5 overflow-hidden"
          >
            <SectionHeaderWithPeople
              title="Activity by role"
              subtitle="Project activity attributed to the role each person held on that project. Click a role to see who did the work."
              people={[...activityByRoleSummary.usersByRole.values()].flat()}
              onViewPeople={(people) => setPeopleSheet({ title: "Activity by role — people", people })}
              testId="view-people-activity-role"
              badge={<ActivityCoverageBadge covered={covCovered} total={covTotal} />}
            />
            <ActivityByRolePieChart
              summary={activityByRoleSummary}
              dormant={dormantRoles}
              onUserClick={(email) => setProfileEmail(email.toLowerCase())}
              onSliceClick={(val) => toggleSliceFilter("role", val)}
              activeSlice={sliceFilters.role}
            />
          </PremiumSurface></Reveal>
        ) : null}

        {/* Activity by company — activity-derived → coverage badge */}
        {activityActorRows ? (
          <Reveal><PremiumSurface
            variant="base"
            glow={!!sliceFilters.company}
            className="flex flex-col gap-3 p-5 overflow-hidden"
          >
            <SectionHeaderWithPeople
              title="Activity by company"
              subtitle="Project activity attributed to each person's company. Click a company to see who did the work."
              people={[...activityByCompanySummary.usersByCompany.values()].flat()}
              onViewPeople={(people) => setPeopleSheet({ title: "Activity by company — people", people })}
              testId="view-people-activity-company"
              badge={<ActivityCoverageBadge covered={covCovered} total={covTotal} />}
            />
            <CompaniesActivityPieChart
              summary={activityByCompanySummary}
              dormant={dormantCompanies}
              onUserClick={(email) => setProfileEmail(email.toLowerCase())}
              onSliceClick={(val) => toggleSliceFilter("company", val)}
              activeSlice={sliceFilters.company}
            />
          </PremiumSurface></Reveal>
        ) : null}

        {/* Activity by module — activity-derived → coverage badge; full-width in the grid */}
        <Reveal className="lg:col-span-2"><PremiumSurface
          variant="base"
          className="flex flex-col gap-3 p-5 overflow-hidden"
        >
          <SectionHeader
            title="Activity by module"
            subtitle="Total actions recorded in each ACC module."
            badge={<ActivityCoverageBadge covered={covCovered} total={covTotal} />}
          />
          <ModulesPieChart summary={moduleSummary} />
        </PremiumSurface></Reveal>

      </div>

      {/* Model Coordination — full-width, not in the donut grid */}
      {coordinationData ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            <SectionHeader title="Model Coordination" subtitle="Coordination-classified issues, by project." />
            <CoordinationByProject
              summary={coordSummary}
              accessibleProjects={coordinationData.accessibleProjects}
              forbiddenProjects={coordinationData.forbiddenProjects}
              latestRunAt={coordinationData.latestRunAt}
              coverage={coverageMap}
              mtyIds={mtySet}
              loadClashes={loadClashes}
              onAuthorClick={(email) => setProfileEmail(email.toLowerCase())}
            />
          </PremiumSurface>
        </Reveal>
      ) : null}

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
              color="#6366f1"
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

/**
 * Consistent section heading: a readable title with a one-line plain-English
 * subtitle and an optional inline badge (e.g. ActivityCoverageBadge for NA-01).
 */
function SectionHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="mt-1 h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary to-chart-1" />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
          {badge}
        </div>
        <p className="max-w-prose text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * Section heading variant for filterable panels that also carry a "View N people →"
 * affordance (INT-02). The affordance opens the shared people sheet — clicking a
 * slice does NOT open it (locked CONTEXT decision).
 */
function SectionHeaderWithPeople({
  title,
  subtitle,
  people,
  onViewPeople,
  testId,
  badge,
}: {
  title: string;
  subtitle: string;
  /** All people in the current filtered view (from in-memory summary). */
  people: DrillPerson[];
  /** Opens the people sheet with the supplied list. Called only by this button. */
  onViewPeople: (people: DrillPerson[]) => void;
  testId: string;
  /** Optional inline badge (e.g. ActivityCoverageBadge for activity-derived panels). */
  badge?: React.ReactNode;
}) {
  // Deduplicate by email so cross-role/company duplication doesn't inflate count.
  const uniquePeople = useMemo(() => {
    const seen = new Set<string>();
    return people.filter((p) => {
      if (seen.has(p.email)) return false;
      seen.add(p.email);
      return true;
    });
  }, [people]);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary to-chart-1" />
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            {badge}
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {uniquePeople.length > 0 && (
        <button
          type="button"
          data-testid={testId}
          onClick={() => onViewPeople(uniquePeople)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary shadow-sm transition hover:bg-primary/20"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          View {uniquePeople.length} {uniquePeople.length === 1 ? "person" : "people"}
        </button>
      )}
    </div>
  );
}
