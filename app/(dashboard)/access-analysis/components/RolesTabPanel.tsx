"use client";
import { Reveal } from "@/components/ui/animated-list";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { SectionHeader, SectionHeaderWithPeople } from "./SectionHeaders";
import { RolesPieChart } from "./RolesPieChart";
import { ActivityByRolePieChart } from "./ActivityByRolePieChart";
import { ActivityCoverageBadge } from "./ActivityCoverageBadge";
import { PermissionLevelChart } from "./PermissionLevelChart";
import { ActivityRecencyChart } from "./ActivityRecencyChart";
import { DonutPanelSkeleton } from "./DonutSkeletons";
import { LoadFailedNotice } from "./LoadFailedNotice";
import { FolderActivityReveal } from "./FolderActivityReveal";
import type { RoleSummary } from "../roleCounts";
import type { RoleActivitySummary, MembershipRolesInput } from "../roleActivityCounts";
import type { DormantEntity } from "../dormantActivity";
import type { SliceFilters } from "../projectFilter";
import type { DrillPerson } from "../roleCounts";
import type { ActivityActorRow } from "@/lib/server/activityByActorView";
import type { PermissionLevelRow } from "@/lib/server/permissionLevelView";
import type { ActivityRecencyRow } from "@/lib/server/activityRecencyView";
import type { FolderRankTotal } from "@/lib/server/folderActivityView";
import type { FolderProjectRow } from "../folderActivityCounts";
import type { FolderActionCell } from "../folderActionTypes";
import { FolderActionHeatmap } from "./FolderActionHeatmap";

/**
 * Roles tab (locked tab map): Role distribution · Activity by role (2-up grid) ·
 * Permission volume by level (PERM-01 reframe, 20.1-06 — replaces the interim
 * byte-sized Permission footprint by role) · Activity recency by role (ENG-01
 * pivot, 20.1-06 — new) · Folder Activity by Role (Claude-discretion, role-scoped
 * so it belongs here rather than Overview/Compare).
 *
 * The PERM-01/ENG-01 panels are gated by the presence of their lazy `load*`
 * function props (fetched on first Roles-tab activation by the shell, see
 * AccessAnalysisCharts.tsx) — while the fetch is in flight, a skeleton renders
 * (never a blank pane, never a fake chart).
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
  loadPermissionLevel,
  permissionLevelLoading,
  permissionLevelFailed,
  onRetryPermissionLevel,
  filteredPermissionLevelRows,
  loadActivityRecency,
  activityRecencyLoading,
  activityRecencyFailed,
  onRetryActivityRecency,
  filteredActivityRecencyRows,
  dataFloor,
  selected,
  membershipRows,
  loadFolderRanking,
  loadFolderDetail,
  loadFolderActionMatrix,
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
  /** Presence gates the Permission volume by level panel (PERM-01). */
  loadPermissionLevel?: () => Promise<PermissionLevelRow[] | null>;
  permissionLevelLoading: boolean;
  /** True when the lazy fetch REJECTED (network/server failure) — render the retry state, not the honest-empty chart. */
  permissionLevelFailed?: boolean;
  onRetryPermissionLevel?: () => void;
  filteredPermissionLevelRows: PermissionLevelRow[];
  /** Presence gates the Activity recency by role panel (ENG-01). */
  loadActivityRecency?: () => Promise<ActivityRecencyRow[] | null>;
  activityRecencyLoading: boolean;
  activityRecencyFailed?: boolean;
  onRetryActivityRecency?: () => void;
  filteredActivityRecencyRows: ActivityRecencyRow[];
  dataFloor?: string | null;
  selected: Set<string>;
  membershipRows?: MembershipRolesInput[];
  loadFolderRanking?: (ids: string[]) => Promise<FolderRankTotal[]>;
  loadFolderDetail?: (folderName: string, ids: string[]) => Promise<FolderProjectRow[]>;
  loadFolderActionMatrix?: (ids: string[], limit?: number) => Promise<FolderActionCell[]>;
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

      {/* Permission volume by level (PERM-01 reframe) — full-width. */}
      {loadPermissionLevel ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            {permissionLevelLoading ? (
              <DonutPanelSkeleton />
            ) : permissionLevelFailed && onRetryPermissionLevel ? (
              <LoadFailedNotice what="permission volume by level" onRetry={onRetryPermissionLevel} />
            ) : (
              <>
                <SectionHeader
                  title="Permission volume by level"
                  subtitle="Which role holds the most access at each permission level? Counted per folder grant."
                />
                <PermissionLevelChart rows={filteredPermissionLevelRows} />
              </>
            )}
          </PremiumSurface>
        </Reveal>
      ) : null}

      {/* Activity recency by role (ENG-01 pivot) — full-width. */}
      {loadActivityRecency ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            {activityRecencyLoading ? (
              <DonutPanelSkeleton />
            ) : activityRecencyFailed && onRetryActivityRecency ? (
              <LoadFailedNotice what="activity recency by role" onRetry={onRetryActivityRecency} />
            ) : (
              <>
                <SectionHeader
                  title="Activity recency by role"
                  subtitle="Which roles are actually doing work right now, vs. holding access they never use? Each membership is bucketed by how long ago it was last active in ACC, stacked by role — a role stacked mostly in “Never active” has permissions with no real engagement behind them."
                />
                <ActivityRecencyChart
                  rows={filteredActivityRecencyRows}
                  coverage={{ covered: covCovered, total: covTotal }}
                  dataFloor={dataFloor}
                />
              </>
            )}
          </PremiumSurface>
        </Reveal>
      ) : null}

      {/* Folder Activity by Role — full-width, collapsed by default (lazy load).
          Folder-first drill: Folders → Projects → Roles → People (2026-07-07). */}
      {loadFolderRanking && loadFolderDetail && (
        <Reveal>
          <FolderActivityReveal
            selectedProjectIds={[...selected]}
            memberships={membershipRows ?? []}
            loadFolders={loadFolderRanking}
            loadDetail={loadFolderDetail}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
          />
        </Reveal>
      )}

      {/* Activity types by folder — heatmap of what people DO in the busiest
          folders (views / downloads / uploads / edits / …), collapsed by default. */}
      {loadFolderActionMatrix && (
        <Reveal>
          <FolderActionHeatmap selectedProjectIds={[...selected]} loadMatrix={loadFolderActionMatrix} />
        </Reveal>
      )}
    </div>
  );
}
