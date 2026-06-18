"use client";

// ---------------------------------------------------------------------------
// useUsersDirectoryData.ts — single data hook for the /users directory
//
// Consolidates all eight main-body tRPC queries and their derivations
// (USR-01 decomposition, Wave 5) and exports the referentially-stable
// BULK_USERS_LEAN_INPUT constant (PERF-03 fix).
//
// What lives here:
//   - BULK_USERS_LEAN_INPUT exported constant (shared with acc-route-hydration.ts)
//   - 8 tRPC queries: bulkUsers, bulkAccSummary, enrichedUsers, listInvitations,
//     accActivity.getCoverage, accFolders.getCoverage, getOrgDirectory, getDirectory
//   - All derivations the shell consumes:
//       accSource, accSummary, people, isLoading, accSummaryMap, mergedAccUsers,
//       noProjectsCount, usingFallbackDirectory, directoryBanner, error,
//       coverage (DataCoverageStrip props), and the option lists
//       departments/jobTitles/costCenters/accProjects/accRoles/accModules
//
// What stays in the shell (not moved here):
//   - The activity-sort infinite query + its auto-fetch effect + orderedActivityEmails
//     (depend on store activitySort + sortPageCountRef)
//   - hover-prefetch utils/timers (trpc.useUtils() + hoverTimers)
//   - Derived filtering memos (filtered/displayRows/groups/visibleFiltered/visibleGroups)
//     and stats (depend on store filter state + this hook's people/accSummaryMap)
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import {
  ACC_SNAPSHOT_STALE_TIME_MS,
  mapFallbackDirectoryToOrgPeople,
  mergeAccSummaryWithEnrichment,
  selectAccSummarySource,
} from "./useMergedAccUsers";
import type { OrgPerson, LocalDirectoryUser } from "./directoryUtils";
import { uniqueSorted } from "./directoryUtils";

// ---------------------------------------------------------------------------
// PERF-03: single referentially-stable input shared by both the client query
// (below) and the SSR prefetch in lib/server/acc-route-hydration.ts.
// Using the SAME object reference ensures the React-Query / tRPC cache key is
// identical on both sides, so the hydration cache is always hit on mount and
// the client never re-fetches the ~15 MB bulk snapshot.
// DO NOT change the value of leanProjects — changing it IS the regression.
// ---------------------------------------------------------------------------
export const BULK_USERS_LEAN_INPUT = { leanProjects: true } as const;

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------
export interface UsersDirectoryData {
  // Core user data
  people: OrgPerson[];
  accSummary: BulkAccUser[];
  accSummaryMap: Map<string, BulkAccUser>;
  mergedAccUsers: BulkAccUser[];

  // Derived counts / flags
  noProjectsCount: number;
  usingFallbackDirectory: boolean;
  directoryBanner: { title: string; description: string } | null;

  // Loading / error
  isLoading: boolean;
  error: unknown;
  enrichedLoading: boolean;

  // Coverage strip data (DataCoverageStrip)
  coverage: Array<{
    label: string;
    available: boolean;
    loading: boolean;
    detail?: string;
  }>;
  invitationsQuery: {
    data: { invitations: Array<unknown> } | undefined;
    isLoading: boolean;
  };

  // Option lists for filter dropdowns
  departments: string[];
  jobTitles: string[];
  costCenters: string[];
  accProjects: string[];
  accRoles: string[];
  accModules: string[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useUsersDirectoryData(): UsersDirectoryData {
  // -------------------------------------------------------------------------
  // Query 1: Primary DC user snapshot (leanProjects variant)
  // -------------------------------------------------------------------------
  // leanProjects: the directory + its filters never read per-project
  // roles[]/modules[] (role/module filters use the top-level allRoles/allModules),
  // so we request the variant that empties them — trimming ~15 MB from the
  // dehydrated page payload. The input MUST match the prefetch + prewarm key
  // (PERF-03 — see BULK_USERS_LEAN_INPUT above).
  const { data: dcUsersRaw = [], isLoading: dcLoading } = trpc.accDcGraph.bulkUsers.useQuery(
    BULK_USERS_LEAN_INPUT,
    {
      staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
      retry: false,
    },
  );

  // -------------------------------------------------------------------------
  // Query 2: Fallback ACC summary (~7 MB)
  // -------------------------------------------------------------------------
  // Consumed only when the DC snapshot is empty (selectAccSummarySource prefers
  // dcUsersRaw). Gated so it never loads while DC data is present — which is
  // always in production — keeping it out of both the dehydrated page payload
  // and the post-mount fetch path. (RESEARCH Pitfall 5 — preserve dcEmpty gate)
  const { data: accSummaryRaw = [] } = trpc.users.bulkAccSummary.useQuery(undefined, {
    staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    retry: false,
    enabled: !dcLoading && dcUsersRaw.length === 0,
  });

  // -------------------------------------------------------------------------
  // Query 3: Enriched ACC users (roles + admin flags)
  // -------------------------------------------------------------------------
  const { data: enrichedUsers = [], isLoading: enrichedLoading } =
    trpc.accMembers.enrichedUsers.useQuery(undefined, {
      staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
      retry: false,
    });

  // -------------------------------------------------------------------------
  // Query 4: Invitations (always disabled — RESEARCH Pitfall 5)
  // -------------------------------------------------------------------------
  // enabled:false is intentional — this query is preserved for future use
  // but deliberately never fires during normal directory load.
  const invitationsQuery = trpc.accActivity.listInvitations.useQuery(
    { windowDays: 90, limit: 100 },
    { staleTime: 300_000, retry: false, enabled: false },
  );

  // -------------------------------------------------------------------------
  // Query 5: Activity coverage
  // -------------------------------------------------------------------------
  const activityCoverageQuery = trpc.accActivity.getCoverage.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });

  // -------------------------------------------------------------------------
  // Query 6: Folder coverage
  // -------------------------------------------------------------------------
  const folderCoverageQuery = trpc.accFolders.getCoverage.useQuery(undefined, {
    staleTime: 600_000,
    retry: false,
  });

  // -------------------------------------------------------------------------
  // Query 7: Org directory (Google Workspace primary source)
  // -------------------------------------------------------------------------
  const {
    data: directoryData,
    isLoading: isDirectoryLoading,
    error,
  } = trpc.users.getOrgDirectory.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });

  // -------------------------------------------------------------------------
  // Query 8: Local DB fallback directory
  // -------------------------------------------------------------------------
  const {
    data: fallbackDirectory = [],
    isLoading: isFallbackLoading,
  } = trpc.users.getDirectory.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });

  // -------------------------------------------------------------------------
  // Derivation: accSource + accSummary
  // -------------------------------------------------------------------------
  const accSource = useMemo(
    () => selectAccSummarySource(dcUsersRaw as BulkAccUser[], accSummaryRaw as BulkAccUser[]),
    [dcUsersRaw, accSummaryRaw],
  );

  const accSummary = useMemo<BulkAccUser[]>(
    () => mergeAccSummaryWithEnrichment(accSource, enrichedUsers),
    [accSource, enrichedUsers],
  );

  // -------------------------------------------------------------------------
  // Derivation: people (org directory or fallback)
  // -------------------------------------------------------------------------
  const people = useMemo<OrgPerson[]>(() => {
    if (directoryData?.status === "ok") {
      return directoryData.people ?? [];
    }
    return mapFallbackDirectoryToOrgPeople(fallbackDirectory as LocalDirectoryUser[]);
  }, [directoryData, fallbackDirectory]);

  const isLoading = !people.length && isDirectoryLoading && isFallbackLoading;

  // -------------------------------------------------------------------------
  // Derivation: accSummaryMap — O(1) lookup in render
  // -------------------------------------------------------------------------
  const accSummaryMap = useMemo<Map<string, BulkAccUser>>(() => {
    const map = new Map<string, BulkAccUser>();
    for (const item of accSummary) {
      map.set(item.email, item);
    }
    return map;
  }, [accSummary]);

  // -------------------------------------------------------------------------
  // Derivation: mergedAccUsers — all directory people with ACC stubs for gaps
  // -------------------------------------------------------------------------
  const mergedAccUsers = useMemo<BulkAccUser[]>(() => {
    const byEmail = new Map<string, BulkAccUser>();
    for (const u of accSummary) byEmail.set(u.email.toLowerCase(), u);
    return people.map(
      (p) =>
        byEmail.get(p.email.toLowerCase()) ?? {
          email: p.email,
          name: p.displayName,
          found: false,
          projectCount: 0,
          activeCount: 0,
          adminCount: 0,
          hasNoProjects: true,
          syncedAt: "",
          allRoles: [],
          allModules: [],
          projects: [],
          isAccountAdmin: false,
          addedOn: null,
        },
    );
  }, [people, accSummary]);

  // -------------------------------------------------------------------------
  // Derivation: noProjectsCount
  // -------------------------------------------------------------------------
  const noProjectsCount = useMemo(
    () =>
      people.filter((p) => accSummaryMap.get(p.email)?.hasNoProjects === true).length,
    [people, accSummaryMap],
  );

  // -------------------------------------------------------------------------
  // Derivation: usingFallbackDirectory
  // -------------------------------------------------------------------------
  const usingFallbackDirectory =
    !error &&
    (directoryData?.status !== "ok" ||
      (isDirectoryLoading && fallbackDirectory.length > 0));

  // -------------------------------------------------------------------------
  // Derivation: directoryBanner
  // -------------------------------------------------------------------------
  const directoryBanner = useMemo(() => {
    if (error || directoryData?.status === "ok") {
      return null;
    }

    if (isDirectoryLoading && fallbackDirectory.length > 0) {
      return {
        title: "Loading organization directory",
        description:
          "Google directory is still loading. Showing registered app users for now.",
      };
    }

    if (directoryData?.status === "not_linked") {
      return {
        title: "Google directory not linked",
        description:
          "Google is not linked for organization lookup. Showing registered app users only.",
      };
    }

    return {
      title: "Organization directory unavailable",
      description: `${
        (directoryData as { message?: string } | null | undefined)?.message ??
        "Reconnect your Google account to restore Directory access."
      } Showing registered app users only.`,
    };
  }, [directoryData, error, fallbackDirectory.length, isDirectoryLoading]);

  // -------------------------------------------------------------------------
  // Derivation: coverage (DataCoverageStrip props)
  // -------------------------------------------------------------------------
  const coverage = useMemo(() => {
    const hasProjectMembers = accSummary.some((user) => user.found);
    const hasRoles = accSummary.some((user) => (user.allRoles?.length ?? 0) > 0);
    const hasLastSignIn = accSummary.some((user) => !!user.lastSignIn);
    const activityRows = activityCoverageQuery.data?.totalRows ?? 0;
    const attributedActivityRows = activityCoverageQuery.data?.attributedRows ?? 0;
    const attributionRate =
      activityCoverageQuery.data?.attributionRate ??
      (activityRows > 0 ? attributedActivityRows / activityRows : 0);
    const unattributedActivityRows =
      activityCoverageQuery.data?.unattributedRows ??
      Math.max(0, activityRows - attributedActivityRows);
    const folderCount = folderCoverageQuery.data?.folderCount ?? 0;
    const permissionCount = folderCoverageQuery.data?.permissionCount ?? 0;
    const hasRecentAdditions =
      accSummary.some((user) => !!user.addedOn) ||
      (invitationsQuery.data?.invitations.length ?? 0) > 0;
    return [
      {
        label: "Project Members",
        available: hasProjectMembers,
        loading: !accSource.length && isLoading,
      },
      { label: "Roles", available: hasRoles, loading: enrichedLoading },
      {
        label: "Last Sign-In",
        available: hasLastSignIn,
        loading: !accSource.length && isLoading,
      },
      {
        label: "Activity Logs",
        available: activityRows > 0,
        loading: activityCoverageQuery.isLoading,
        detail: `${activityRows.toLocaleString()} activity rows, ${Math.round(attributionRate * 100)}% attributed, ${unattributedActivityRows.toLocaleString()} classified residuals`,
      },
      {
        label: "Folder Permissions",
        available: permissionCount > 0,
        loading: folderCoverageQuery.isLoading,
        detail: `${permissionCount.toLocaleString()} permission rows across ${folderCount.toLocaleString()} folders`,
      },
      {
        label: "Recent Additions",
        available: hasRecentAdditions,
        loading: invitationsQuery.isLoading,
      },
    ];
  }, [
    activityCoverageQuery.data,
    activityCoverageQuery.isLoading,
    accSummary,
    accSource.length,
    enrichedLoading,
    folderCoverageQuery.data,
    folderCoverageQuery.isLoading,
    invitationsQuery.data,
    invitationsQuery.isLoading,
    isLoading,
  ]);

  // -------------------------------------------------------------------------
  // Derivation: option lists for filter dropdowns
  // -------------------------------------------------------------------------
  const departments = useMemo(
    () => uniqueSorted(people.map((p) => p.department)),
    [people],
  );
  const jobTitles = useMemo(
    () => uniqueSorted(people.map((p) => p.jobTitle)),
    [people],
  );
  const costCenters = useMemo(
    () => uniqueSorted(people.map((p) => p.costCenter)),
    [people],
  );

  const accProjects = useMemo(() => {
    const set = new Set<string>();
    for (const u of accSummary) {
      for (const p of u.projects) set.add(p.name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accSummary]);

  const accRoles = useMemo(() => {
    const set = new Set<string>();
    for (const u of accSummary) {
      for (const r of u.allRoles) set.add(r);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accSummary]);

  const accModules = useMemo(() => {
    const set = new Set<string>();
    for (const u of accSummary) {
      for (const m of u.allModules) set.add(m);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accSummary]);

  return {
    people,
    accSummary,
    accSummaryMap,
    mergedAccUsers,
    noProjectsCount,
    usingFallbackDirectory,
    directoryBanner,
    isLoading,
    error,
    enrichedLoading,
    coverage,
    invitationsQuery,
    departments,
    jobTitles,
    costCenters,
    accProjects,
    accRoles,
    accModules,
  };
}
