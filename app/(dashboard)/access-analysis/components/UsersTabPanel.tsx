"use client";
import { useMemo, useState } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Reveal } from "@/components/ui/animated-list";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { DataTable } from "@/components/ui/DataTable";
import { SectionHeader } from "./SectionHeaders";
import { DonutPanelSkeleton } from "./DonutSkeletons";
import { LoadFailedNotice } from "./LoadFailedNotice";
import { formatAbsolute } from "../relativeTime";
import { bucketActivityRecency, type ActivityRecencyBand } from "../activityRecencyCounts";
import type { ActivityRecencyRow } from "@/lib/server/activityRecencyView";
import type { PermissionUserCounts } from "@/lib/server/permissionUserView";
import { PermissionUsersDonut } from "./PermissionUsersDonut";
import { ProfileAvatar } from "@/app/(dashboard)/users/ProfileAvatar";
import { useOrgDirectoryPeople } from "@/app/(dashboard)/users/useMergedAccUsers";

interface RecencyDetailRow {
  key: string;
  name: string;
  email: string;
  photoUrl: string | null;
  company: string;
  rolesLabel: string;
  lastActivityAt: string | null;
  /** Epoch ms for sorting; `-Infinity` for "Never active" so it sorts first ascending (most dormant first). */
  lastActivitySort: number;
  band: ActivityRecencyBand;
}

const helper = createColumnHelper<RecencyDetailRow>();

const COLUMNS: ColumnDef<RecencyDetailRow>[] = [
  helper.accessor("name", {
    id: "name",
    header: "Name",
    size: 220,
    enableSorting: true,
    cell: (ctx) => (
      <div className="flex min-w-0 items-center gap-2">
        <ProfileAvatar
          name={ctx.row.original.name}
          email={ctx.row.original.email}
          photoUrl={ctx.row.original.photoUrl}
          size="sm"
        />
        <span className="truncate text-sm font-medium text-foreground">{ctx.getValue()}</span>
      </div>
    ),
  }) as ColumnDef<RecencyDetailRow>,
  helper.accessor("company", {
    id: "company",
    header: "Company",
    size: 180,
    enableSorting: true,
    cell: (ctx) => <span className="truncate text-sm text-foreground/90">{ctx.getValue()}</span>,
  }) as ColumnDef<RecencyDetailRow>,
  helper.accessor("rolesLabel", {
    id: "roles",
    header: "Role(s)",
    size: 220,
    enableSorting: true,
    cell: (ctx) => <span className="truncate text-sm text-foreground/90">{ctx.getValue()}</span>,
  }) as ColumnDef<RecencyDetailRow>,
  helper.accessor("lastActivitySort", {
    id: "lastActivity",
    header: "Last activity",
    size: 180,
    enableSorting: true,
    cell: (ctx) => (
      <span className="text-sm tabular-nums text-foreground/90">
        {ctx.row.original.lastActivityAt ? formatAbsolute(ctx.row.original.lastActivityAt) : "Never active"}
      </span>
    ),
  }) as ColumnDef<RecencyDetailRow>,
  helper.accessor("band", {
    id: "band",
    header: "Band",
    size: 120,
    enableSorting: true,
    cell: (ctx) => <span className="text-sm text-muted-foreground">{ctx.getValue()}</span>,
  }) as ColumnDef<RecencyDetailRow>,
];

/**
 * Users tab (locked tab map): the per-membership recency detail list — the
 * user-level cut of the ENG-01 activity-recency pivot (20.1-06, replaces the
 * interim `DormantSignInChart` sign-in-recency panel). Sourced from the same
 * `filteredActivityRecencyRows` the Roles-tab `ActivityRecencyChart` uses (one
 * loader, two views), so the two panels never disagree.
 */
export function UsersTabPanel({
  loadActivityRecency,
  activityRecencyLoading,
  activityRecencyFailed,
  onRetryActivityRecency,
  filteredActivityRecencyRows,
  covCovered,
  covTotal,
  dataFloor,
  loadPermissionUsers,
  permissionUsersLoading,
  permissionUsersFailed,
  onRetryPermissionUsers,
  permissionUserCounts,
}: {
  /** Presence gates the panel (fetched lazily by the shell on first Roles/Users tab activation). */
  loadActivityRecency?: () => Promise<ActivityRecencyRow[] | null>;
  activityRecencyLoading: boolean;
  /** True when the lazy fetch REJECTED — render the retry state, never the honest-empty table. */
  activityRecencyFailed?: boolean;
  onRetryActivityRecency?: () => void;
  filteredActivityRecencyRows: ActivityRecencyRow[];
  covCovered: number;
  covTotal: number;
  dataFloor?: string | null;
  /** Presence gates the users-by-permission-level donut (fetched lazily on first Users tab activation). */
  loadPermissionUsers?: () => Promise<PermissionUserCounts | null>;
  permissionUsersLoading?: boolean;
  permissionUsersFailed?: boolean;
  onRetryPermissionUsers?: () => void;
  permissionUserCounts?: PermissionUserCounts | null;
}) {
  const [query, setQuery] = useState("");

  // Captured once per mount so band boundaries don't shift mid-session.
  const [now] = useState(() => Date.now());

  // Google-directory photos, matched by email (the recency loader is
  // server-side and carries no directory fields). Cached/deduped via React Query.
  const people = useOrgDirectoryPeople();
  const photoByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of people) if (p.photoUrl) map.set(p.email.toLowerCase(), p.photoUrl);
    return map;
  }, [people]);

  const rows = useMemo<RecencyDetailRow[]>(
    () =>
      filteredActivityRecencyRows.map((r) => ({
        key: `${r.projectId}::${r.email}`,
        name: r.name,
        email: r.email,
        photoUrl: photoByEmail.get(r.email.toLowerCase()) ?? null,
        company: r.company,
        rolesLabel: r.roles.length > 0 ? r.roles.join(", ") : "Unknown role",
        lastActivityAt: r.lastActivityAt,
        lastActivitySort: r.lastActivityAt ? Date.parse(r.lastActivityAt) : Number.NEGATIVE_INFINITY,
        band: bucketActivityRecency(r.lastActivityAt, now),
      })),
    [filteredActivityRecencyRows, now, photoByEmail],
  );

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.company.toLowerCase().includes(needle) ||
        r.rolesLabel.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const hasActiveFilter = query.length > 0;

  if (!loadActivityRecency) return null;

  return (
    <div className="flex flex-col gap-6">
      {loadPermissionUsers && (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            {permissionUsersLoading ? (
              <DonutPanelSkeleton />
            ) : permissionUsersFailed && onRetryPermissionUsers ? (
              <LoadFailedNotice what="users by permission level" onRetry={onRetryPermissionUsers} />
            ) : permissionUserCounts ? (
              <>
                <SectionHeader
                  title="Users by permission level"
                  subtitle="How many people hold each folder-permission level, counting every user once at their strongest grant — the quickest read on how much of the account can actually change or control content."
                />
                <PermissionUsersDonut counts={permissionUserCounts} />
              </>
            ) : null}
          </PremiumSurface>
        </Reveal>
      )}

      <Reveal>
        <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
          {activityRecencyLoading ? (
            <DonutPanelSkeleton />
          ) : activityRecencyFailed && onRetryActivityRecency ? (
            <LoadFailedNotice what="activity recency detail" onRetry={onRetryActivityRecency} />
          ) : (
            <>
              <SectionHeader
                title="Activity recency detail"
                subtitle="The person-level cut of the Roles-tab activity chart: who is still actually working in ACC, and who has gone quiet? Sorted most-dormant first by default — flags stale access before it becomes a security question. Click a column to re-sort."
              />

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[12rem] flex-1">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, company, or role…"
                    aria-label="Search memberships"
                    className="w-full rounded-xl border border-border bg-background py-2 px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {filteredRows.length} of {rows.length}
                </span>
              </div>

              <DataTable
                data={filteredRows}
                columns={COLUMNS}
                pinnedColumn="name"
                defaultSort={[{ id: "lastActivity", desc: false }]}
                hasActiveFilter={hasActiveFilter}
                onClearFilters={() => setQuery("")}
                emptyMessage="No memberships in this view."
                filteredEmptyMessage="No memberships match your search."
                className="h-[520px]"
              />

              <p data-testid="activity-recency-detail-coverage-caption" className="text-[11px] text-muted-foreground">
                Activity data covers {covCovered} of {covTotal} ACC projects — memberships come from the DC snapshot.
              </p>
              <p data-testid="activity-recency-detail-semantics-caption" className="text-[11px] text-muted-foreground">
                &quot;Never active&quot; = no recorded activity in the ACCDS-crawled window
                {dataFloor ? ` (data available from ${dataFloor})` : ""}.
              </p>
            </>
          )}
        </PremiumSurface>
      </Reveal>
    </div>
  );
}
