"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ProjectPicker } from "./ProjectPicker";
import { RolesPieChart } from "./RolesPieChart";
import { ModulesPieChart } from "./ModulesPieChart";
import { ActivityByRolePieChart } from "./ActivityByRolePieChart";
import { CoordinationByProject } from "./CoordinationByProject";
import { FolderPermissionTerrain } from "./FolderPermissionTerrain";
import { ActivityTimelineChart } from "./ActivityTimelineChart";
import { summarizeRoles } from "../roleCounts";
import { summarizeModules, type ModuleActivityRow } from "../moduleCounts";
import { summarizeActivityByRole, type MembershipRolesInput } from "../roleActivityCounts";
import { summarizeActivityTimeline, type ActivityTimelineRow } from "../timelineCounts";
import { summarizeCoordination } from "../coordinationCounts";
import { projectOptions, filterRowsBySelection, type ProjectRoleRow } from "../projectFilter";
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

  // Timeline filters internally (it needs the full per-project rows + the Set),
  // so it takes `timelineRows` directly rather than via filterRowsBySelection.
  const timelineSummary = useMemo(
    () => summarizeActivityTimeline(timelineRows ?? [], selected),
    [timelineRows, selected],
  );
  const roleSummary = useMemo(() => summarizeRoles(filterRowsBySelection(roleRows, selected)), [roleRows, selected]);
  const moduleSummary = useMemo(() => summarizeModules(filterRowsBySelection(moduleRows, selected)), [moduleRows, selected]);
  const activityByRoleSummary = useMemo(
    () =>
      summarizeActivityByRole(
        filterRowsBySelection(activityActorRows ?? [], selected),
        filterRowsBySelection(membershipRows ?? [], selected),
      ),
    [activityActorRows, membershipRows, selected],
  );
  const coordSummary = useMemo(
    () => summarizeCoordination(filterRowsBySelection(coordinationData?.rows ?? [], selected)),
    [coordinationData, selected],
  );

  return (
    <div className="flex flex-col gap-8">
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

      {timelineRows ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Activity over time"
            subtitle="Total ACC activity per month across all years. Tick projects above to refocus the line; quiet months dip to zero."
          />
          <ActivityTimelineChart summary={timelineSummary} />
        </section>
      ) : null}

      {terrainProjects && terrainProjects.length > 0 && loadTerrain && (
        <section className="flex flex-col gap-3">
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
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Role distribution" subtitle="Roles held across all project memberships." />
        <RolesPieChart data={roleSummary.slices} distinctRoles={roleSummary.distinctRoles} />
      </section>

      {activityActorRows ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Activity by role"
            subtitle="Project activity attributed to the role each person held on that project. Click a role to see who did the work."
          />
          <ActivityByRolePieChart summary={activityByRoleSummary} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Activity by module" subtitle="Total actions recorded in each ACC module." />
        <ModulesPieChart summary={moduleSummary} />
      </section>

      {coordinationData ? (
        <section className="flex flex-col gap-3">
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
        </section>
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
    <div className="flex flex-col gap-0.5">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
