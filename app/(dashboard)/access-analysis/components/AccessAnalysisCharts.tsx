"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/ui/animated-list";
import { StatStrip, type Stat } from "@/components/ui/stat-tile";
import { ProjectPicker } from "./ProjectPicker";
import { RolesPieChart } from "./RolesPieChart";
import { ModulesPieChart } from "./ModulesPieChart";
import { ActivityByRolePieChart } from "./ActivityByRolePieChart";
import { CompaniesPieChart } from "./CompaniesPieChart";
import { CompaniesActivityPieChart } from "./CompaniesActivityPieChart";
import { CoordinationByProject } from "./CoordinationByProject";
import { FolderPermissionTerrain } from "./FolderPermissionTerrain";
import { ActivityTimelineChart } from "./ActivityTimelineChart";
import { summarizeRoles, UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";
import { summarizeModules, type ModuleActivityRow } from "../moduleCounts";
import { summarizeActivityByRole, type MembershipRolesInput } from "../roleActivityCounts";
import { summarizeCompanies, UNKNOWN_COMPANY } from "../companyCounts";
import { summarizeActivityByCompany } from "../companyActivityCounts";
import { rankDormantByPeople } from "../dormantActivity";
import { summarizeActivityTimeline, type ActivityTimelineRow } from "../timelineCounts";
import { summarizeCoordination } from "../coordinationCounts";
import { projectOptions, filterRowsBySelection, applySliceFilters, type ProjectRoleRow, type SliceFilters } from "../projectFilter";
import { PillBar } from "./PillBar";
import { groupProjectOptions } from "../projectGroups";
import type { CoordinationByProjectData } from "@/lib/server/coordinationByProjectView";
import type { ProjectCoverage } from "@/lib/server/projectCoverageView";
import type { ActivityActorRow } from "@/lib/server/activityByActorView";
import type { ClashIssue } from "../coordinationClash";
import type { FolderTerrainData, TerrainProjectOption } from "../folderTerrain";

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
  activityActorRows,
  membershipRows,
  coordinationData,
  coverage,
  mtyIds,
  loadClashes,
  terrainProjects,
  initialTerrain,
  loadTerrain,
  loadOverview,
}: {
  roleRows: ProjectRoleRow[];
  moduleRows: ModuleActivityRow[];
  /** Per-(project, month) activity totals for the Activity timeline. When omitted, that section is hidden. */
  timelineRows?: ActivityTimelineRow[];
  /** Per-(project, actor) activity totals for the Activity-by-role donut. When omitted, that section is hidden. */
  activityActorRows?: ActivityActorRow[];
  /** Slim memberships (projectId, email, roles) used to attribute activity to a role. */
  membershipRows?: MembershipRolesInput[];
  coordinationData?: CoordinationByProjectData;
  coverage?: ProjectCoverage[];
  mtyIds?: string[];
  loadClashes?: (projectId: string) => Promise<ClashIssue[]>;
  terrainProjects?: TerrainProjectOption[];
  initialTerrain?: FolderTerrainData | null;
  loadTerrain?: (projectId: string) => Promise<FolderTerrainData | null>;
  loadOverview?: () => Promise<FolderTerrainData | null>;
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

  // Slice cross-filters — one value per dimension, ANDed. Toggling the same value clears it.
  // Project Picker `selected` is deliberately separate: "Clear all" only clears sliceFilters.
  const [sliceFilters, setSliceFilters] = useState<SliceFilters>({});
  const toggleSliceFilter = (dim: string, val: string) =>
    setSliceFilters((prev) => {
      const next = { ...prev };
      if (next[dim] === val) delete next[dim]; else next[dim] = val;
      return next;
    });

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
      <StatStrip stats={kpis} />

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

      <PillBar
        filters={sliceFilters}
        onRemove={(d) => toggleSliceFilter(d, sliceFilters[d])}
        onClear={() => setSliceFilters({})}
        labels={{ role: "Role", company: "Company" }}
      />

      {timelineRows ? (
        <Reveal><section className="flex flex-col gap-3">
          <SectionHeader
            title="Activity over time"
            subtitle="Total ACC activity per month across all years. Tick projects above to refocus the line; quiet months dip to zero."
          />
          <ActivityTimelineChart summary={timelineSummary} />
        </section></Reveal>
      ) : null}

      {terrainProjects && terrainProjects.length > 0 && loadTerrain && (
        <Reveal><section className="flex flex-col gap-3">
          <SectionHeader
            title="Folder permission terrain"
            subtitle="Per project: each Level-2 folder × role, coloured by permission tier and raised by the number of users in that role. Pick a project, hover a block, click to list its users."
          />
          <FolderPermissionTerrain
            projects={terrainProjects}
            initial={initialTerrain ?? null}
            loadTerrain={loadTerrain}
            loadOverview={loadOverview}
          />
        </section></Reveal>
      )}

      <Reveal><section className="flex flex-col gap-3">
        <SectionHeader title="Role distribution" subtitle="Roles held across all project memberships." />
        <RolesPieChart
          data={roleSummary.slices}
          distinctRoles={roleSummary.distinctRoles}
          usersByRole={roleSummary.usersByRole}
          onUserClick={(email) => setProfileEmail(email.toLowerCase())}
          onSliceClick={(val) => toggleSliceFilter("role", val)}
          activeSlice={sliceFilters.role}
        />
      </section></Reveal>

      <Reveal><section className="flex flex-col gap-3">
        <SectionHeader title="Users by company" subtitle="Project memberships grouped by each member's company." />
        <CompaniesPieChart
          data={companySummary.slices}
          distinctCompanies={companySummary.distinctCompanies}
          usersByCompany={companySummary.usersByCompany}
          onUserClick={(email) => setProfileEmail(email.toLowerCase())}
          onSliceClick={(val) => toggleSliceFilter("company", val)}
          activeSlice={sliceFilters.company}
        />
      </section></Reveal>

      {activityActorRows ? (
        <Reveal><section className="flex flex-col gap-3">
          <SectionHeader
            title="Activity by role"
            subtitle="Project activity attributed to the role each person held on that project. Click a role to see who did the work."
          />
          <ActivityByRolePieChart
            summary={activityByRoleSummary}
            dormant={dormantRoles}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
            onSliceClick={(val) => toggleSliceFilter("role", val)}
            activeSlice={sliceFilters.role}
          />
        </section></Reveal>
      ) : null}

      {activityActorRows ? (
        <Reveal><section className="flex flex-col gap-3">
          <SectionHeader
            title="Activity by company"
            subtitle="Project activity attributed to each person's company. Click a company to see who did the work."
          />
          <CompaniesActivityPieChart
            summary={activityByCompanySummary}
            dormant={dormantCompanies}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
            onSliceClick={(val) => toggleSliceFilter("company", val)}
            activeSlice={sliceFilters.company}
          />
        </section></Reveal>
      ) : null}

      <Reveal><section className="flex flex-col gap-3">
        <SectionHeader title="Activity by module" subtitle="Total actions recorded in each ACC module." />
        <ModulesPieChart summary={moduleSummary} />
      </section></Reveal>

      {coordinationData ? (
        <Reveal><section className="flex flex-col gap-3">
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
        </section></Reveal>
      ) : null}

      {profileEmail && (
        <AuthorProfileDrawer email={profileEmail} onClose={() => setProfileEmail(null)} />
      )}
    </div>
  );
}

/**
 * Consistent section heading: a readable title with a one-line plain-English
 * subtitle. Replaces the cramped "Title · descriptor" caption so each panel
 * reads clearly and the two Model Coordination surfaces stay distinct — the
 * donut counts *actions*, this section counts the coordination issue subset.
 */
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="mt-1 h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary to-chart-1" />
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
