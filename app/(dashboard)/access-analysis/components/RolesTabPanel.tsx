"use client";
import { Reveal } from "@/components/ui/animated-list";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { SectionHeader, SectionHeaderWithPeople } from "./SectionHeaders";
import { RolesPieChart } from "./RolesPieChart";
import { ActivityByRolePieChart } from "./ActivityByRolePieChart";
import { ActivityCoverageBadge } from "./ActivityCoverageBadge";
import { PermissionFootprintChart } from "./PermissionFootprintChart";
import { FolderActivityReveal } from "./FolderActivityReveal";
import type { RoleSummary } from "../roleCounts";
import type { RoleActivitySummary, MembershipRolesInput } from "../roleActivityCounts";
import type { DormantEntity } from "../dormantActivity";
import type { SliceFilters } from "../projectFilter";
import type { DrillPerson } from "../roleCounts";
import type { ActivityActorRow } from "@/lib/server/activityByActorView";
import type { PermissionFootprintRow } from "@/lib/server/permissionFootprintView";
import type { ProjectActivityTotal } from "@/lib/server/folderActivityView";
import type { FolderActivityRow } from "../folderActivityCounts";

/**
 * Roles tab (locked tab map, interim placements per 20.1-05): Role distribution ·
 * Activity by role (2-up grid) · Permission footprint by role (interim — replaced
 * by the PERM-01 reframe in 20.1-06) · Folder Activity by Role (Claude-discretion,
 * role-scoped so it belongs here rather than Overview/Compare).
 */
export function RolesTabPanel({
  roleSummary,
  sliceFilters,
  toggleSliceFilter,
  setProfileEmail,
  setPeopleSheet,
  activityActorRows,
  activityByRoleSummary,
  dormantRoles,
  covCovered,
  covTotal,
  permissionFootprintRows,
  filteredPermissionFootprintRows,
  selected,
  membershipRows,
  loadFolderActivityProjects,
  loadFolderActivityTree,
}: {
  roleSummary: RoleSummary;
  sliceFilters: SliceFilters;
  toggleSliceFilter: (dim: string, val: string) => void;
  setProfileEmail: (email: string) => void;
  setPeopleSheet: (sheet: { title: string; people: DrillPerson[] } | null) => void;
  /** Presence gates the Activity by role panel (matches the pre-split conditional-render guard). */
  activityActorRows?: ActivityActorRow[];
  activityByRoleSummary: RoleActivitySummary;
  dormantRoles: DormantEntity[];
  covCovered: number;
  covTotal: number;
  /** Presence gates the Permission footprint panel. */
  permissionFootprintRows?: PermissionFootprintRow[];
  filteredPermissionFootprintRows: PermissionFootprintRow[];
  selected: Set<string>;
  membershipRows?: MembershipRolesInput[];
  loadFolderActivityProjects?: (ids: string[]) => Promise<ProjectActivityTotal[]>;
  loadFolderActivityTree?: (projectId: string) => Promise<FolderActivityRow[]>;
}) {
  return (
    <div className="flex flex-col gap-6">
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
      </div>

      {/* Permission footprint by role (PERM-01, interim) — full-width. */}
      {permissionFootprintRows ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            <SectionHeader
              title="Permission footprint by role"
              subtitle="Folder access granted per role, sized by total bytes reachable (from the materialized permission summary). Click a role to see its projects."
            />
            <PermissionFootprintChart rows={filteredPermissionFootprintRows} />
          </PremiumSurface>
        </Reveal>
      ) : null}

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
    </div>
  );
}
