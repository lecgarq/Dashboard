"use client";

// DuckDB-client data-hook extracted verbatim from HybridAnalyticsSurface.tsx (SPLIT-04).
// Owns the tRPC queries, the Mosaic crossfilter selections, and the DuckDB-Wasm main query path
// (getDuckDbClient -> runGraphAnalyticsQueries -> setQueryState, falling back to
// buildFallbackAnalyticsState on error). Returns a single view-model object.
import { useEffect, useMemo, useRef, useState } from "react";
import { Selection } from "@uwdata/mosaic-core";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { useMergedAccUsers } from "../useMergedAccUsers";
import { canInitializeDuckDbInBrowser, getDuckDbClient } from "./duckdbClient";
import {
  buildFallbackAnalyticsState,
  EMPTY_ANALYTICS_QUERY_STATE,
  errorToAnalyticsDiagnostic,
  runGraphAnalyticsQueries,
  type AnalyticsQueryState,
} from "./analyticsQueries";
import type { GraphFolderPermissionRow } from "./graphTables";
import type { DonutSlice } from "./DonutPanel";
import {
  buildExecutiveFindings,
  computeFolderProjectCoverage,
  computeSignInCoverage,
} from "./analyticsFindings";
import type { HeadlineInsightItem } from "./HeadlineInsights";
import type { ScopedSelection } from "./selectionFilters";
import type { KpiSummary } from "@/lib/acc/accessAnalysisTypes";
import {
  ACTIVE_REFRESH_MS,
  IDLE_REFRESH_MS,
  adminGrantDistribution,
  computeActivityRecency,
  computeAdminMix,
  computePermTiers,
  computeUserStatus,
  latestTime,
  projectCountDistribution,
  roleStatusHeatmapRows,
  toFolderRows,
  topCompanies,
  topProjects,
  topRoles,
} from "./hybridAnalyticsTransforms";

export interface HybridAnalyticsViewModel {
  users: BulkAccUser[];
  folderRows: GraphFolderPermissionRow[];
  loading: boolean;
  syncActive: boolean;
  kpiSummary: KpiSummary | undefined;
  usersSelection: Selection;
  projectsSelection: Selection;
  scopedSelections: ScopedSelection[];
  queryState: AnalyticsQueryState;
  isRefreshingCharts: boolean;
  isReady: boolean;
  isFallback: boolean;
  userStatusSlices: DonutSlice[];
  recencySlices: DonutSlice[];
  adminMixSlices: DonutSlice[];
  permTierSlices: DonutSlice[];
  findings: ReturnType<typeof buildExecutiveFindings>;
  headlineItems: HeadlineInsightItem[];
  topProjectRows: ReturnType<typeof topProjects>;
  topRoleRows: ReturnType<typeof topRoles>;
  projectDistributionRows: ReturnType<typeof projectCountDistribution>;
  adminDistributionRows: ReturnType<typeof adminGrantDistribution>;
  topCompanyRows: ReturnType<typeof topCompanies>;
  roleStatusRows: ReturnType<typeof roleStatusHeatmapRows>;
  signInCoverage: ReturnType<typeof computeSignInCoverage>;
  folderCoverage: ReturnType<typeof computeFolderProjectCoverage>;
  activeShare: string;
  adminTotal: number;
  latestExtractionAt: number | null;
  elapsedHrs: number | null;
  isStale: boolean;
  syncStateLabel: string;
}

export function useHybridAnalytics(): HybridAnalyticsViewModel {
  const activeJobQuery = trpc.accSync.getActiveDeepSyncJob.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 10_000,
  });
  const syncActive = !!activeJobQuery.data;
  const refreshInterval = syncActive ? ACTIVE_REFRESH_MS : false;
  const freshnessQuery = trpc.accSync.getSyncFreshness.useQuery(undefined, {
    refetchInterval: syncActive ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS,
    staleTime: 60_000,
  });
  const dcStatusQuery = trpc.accSync.getDcIngestStatus.useQuery(undefined, {
    refetchInterval: syncActive ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS,
    staleTime: 60_000,
  });
  const kpiSummaryQuery = trpc.accMembers.getKpiSummary.useQuery(
    { window: "all" },
    { refetchInterval: refreshInterval, staleTime: 60_000 },
  );
  const { users, loading } = useMergedAccUsers({ refetchInterval: refreshInterval });
  const folderMatrixQuery = trpc.accFolders.getMatrix.useQuery(undefined, {
    staleTime: 600_000,
    retry: false,
    enabled: users.length > 0,
    refetchInterval: refreshInterval,
  });

  const folderRows = useMemo(
    () => toFolderRows(folderMatrixQuery.data?.rows),
    [folderMatrixQuery.data?.rows],
  );

  // Mosaic crossfilter must NOT be shared across panels that query different
  // base tables: a clause from a `user_projects` panel applied to a `users`
  // panel (or vice versa) makes Mosaic compute one table's measure against the
  // other's columns → "column not found" Binder Errors. Keep one selection per
  // table so within-table crossfilter still works, cross-table never forms.
  const usersSelection = useMemo(() => Selection.crossfilter(), []);
  const projectsSelection = useMemo(() => Selection.crossfilter(), []);
  const scopedSelections = useMemo<ScopedSelection[]>(
    () => [
      { selection: usersSelection as unknown as ScopedSelection["selection"], scope: "Users" },
      { selection: projectsSelection as unknown as ScopedSelection["selection"], scope: "Projects" },
    ],
    [usersSelection, projectsSelection],
  );

  const [queryState, setQueryState] = useState<AnalyticsQueryState>(EMPTY_ANALYTICS_QUERY_STATE);
  const [isRefreshingCharts, setIsRefreshingCharts] = useState(false);
  const queryStatusRef = useRef<AnalyticsQueryState["status"]>(queryState.status);

  useEffect(() => {
    queryStatusRef.current = queryState.status;
  }, [queryState.status]);

  useEffect(() => {
    if (!users.length) return;
    if (canInitializeDuckDbInBrowser()) {
      void getDuckDbClient().catch(() => {});
    }
  }, [users.length]);

  const syncVersionKey = useMemo(
    () => [
      freshnessQuery.data?.quick.lastRunAt ?? "",
      freshnessQuery.data?.deep.lastRunAt ?? "",
      freshnessQuery.data?.deep.lastIngestAt ?? "",
      dcStatusQuery.data?.lastRunAt ?? "",
      dcStatusQuery.data?.lastSuccessAt ?? "",
      users.length,
      folderRows.length,
    ].join("|"),
    [
      freshnessQuery.data?.quick.lastRunAt,
      freshnessQuery.data?.deep.lastRunAt,
      freshnessQuery.data?.deep.lastIngestAt,
      dcStatusQuery.data?.lastRunAt,
      dcStatusQuery.data?.lastSuccessAt,
      users.length,
      folderRows.length,
    ],
  );

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    if (!users.length) {
      setQueryState(EMPTY_ANALYTICS_QUERY_STATE);
      setIsRefreshingCharts(false);
      return;
    }

    const hasReusableData = queryStatusRef.current === "ready" || queryStatusRef.current === "fallback";
    setIsRefreshingCharts(hasReusableData);
    setQueryState((prev) =>
      hasReusableData || prev.status === "loading" ? prev : { ...prev, status: "loading", diagnostic: null },
    );

    getDuckDbClient()
      .then(({ connection }) => runGraphAnalyticsQueries({ connection, users, folderRows }))
      .then((state) => {
        if (!cancelled) {
          setQueryState(state);
          setIsRefreshingCharts(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setQueryState(buildFallbackAnalyticsState(users, folderRows, errorToAnalyticsDiagnostic(error)));
          setIsRefreshingCharts(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loading, users, folderRows, syncVersionKey]);

  const isReady = queryState.status === "ready";
  const isFallback = queryState.status === "fallback";
  const userStatusSlices = useMemo(() => computeUserStatus(users), [users]);
  const recencySlices = useMemo(() => computeActivityRecency(users), [users]);
  const adminMixSlices = useMemo(() => computeAdminMix(users), [users]);
  const permTierSlices = useMemo(() => computePermTiers(folderRows), [folderRows]);
  const findings = useMemo(() => buildExecutiveFindings({ users, folderRows }), [users, folderRows]);
  const headlineItems = useMemo<HeadlineInsightItem[]>(
    () => [
      { id: "stale", label: "Stale access", text: findings.staleMembers, severity: "risk" },
      { id: "active", label: "Active members", text: findings.activeMembers, severity: "good" },
      { id: "admins", label: "Admin concentration", text: findings.adminConcentration, severity: "watch" },
      { id: "breadth", label: "Access breadth", text: findings.projectBreadth, severity: "info" },
    ],
    [findings],
  );
  const topProjectRows = useMemo(() => topProjects(users), [users]);
  const topRoleRows = useMemo(() => topRoles(users), [users]);
  const projectDistributionRows = useMemo(() => projectCountDistribution(users), [users]);
  const adminDistributionRows = useMemo(() => adminGrantDistribution(users), [users]);
  const topCompanyRows = useMemo(() => topCompanies(users), [users]);
  const roleStatusRows = useMemo(() => roleStatusHeatmapRows(users), [users]);

  const signInCoverage = useMemo(() => computeSignInCoverage(users), [users]);
  const folderCoverage = useMemo(
    () => computeFolderProjectCoverage(folderRows, users),
    [folderRows, users],
  );

  // Share of users with a *recorded* sign-in in the last 30 days, measured
  // against users who have any sign-in date — not the whole population — so the
  // ~66% with no recorded sign-in don't deflate the number into noise.
  const activeShare = useMemo(() => {
    if (!signInCoverage.withSignIn) return "0%";
    const t = recencySlices[0]?.value ?? 0;
    return `${Math.round((t / signInCoverage.withSignIn) * 100)}%`;
  }, [recencySlices, signInCoverage.withSignIn]);

  const adminTotal = useMemo(
    () => users.filter((u) => u.isAccountAdmin || u.adminCount > 0).length,
    [users],
  );
  const latestExtractionAt = useMemo(
    () => latestTime([
      freshnessQuery.data?.deep.lastIngestAt,
      freshnessQuery.data?.deep.lastSuccessCompletedAt,
      freshnessQuery.data?.deep.lastRunAt,
      freshnessQuery.data?.quick.lastRunAt,
      dcStatusQuery.data?.lastSuccessAt,
      dcStatusQuery.data?.lastRunAt,
    ]),
    [
      freshnessQuery.data?.deep.lastIngestAt,
      freshnessQuery.data?.deep.lastSuccessCompletedAt,
      freshnessQuery.data?.deep.lastRunAt,
      freshnessQuery.data?.quick.lastRunAt,
      dcStatusQuery.data?.lastSuccessAt,
      dcStatusQuery.data?.lastRunAt,
    ],
  );

  const { elapsedHrs, isStale } = useMemo(() => {
    const lastSuccessTime = dcStatusQuery.data?.lastSuccessAt
      ? new Date(dcStatusQuery.data.lastSuccessAt).getTime()
      : null;
    if (!lastSuccessTime) return { elapsedHrs: null, isStale: false };
    const hrs = (Date.now() - lastSuccessTime) / 3_600_000;
    return { elapsedHrs: hrs, isStale: hrs > 36 };
  }, [dcStatusQuery.data?.lastSuccessAt]);

  const syncStateLabel = syncActive
    ? `Sync ${activeJobQuery.data?.status ?? "running"}`
    : dcStatusQuery.data?.lastRunStatus
      ? `DC ${dcStatusQuery.data.lastRunStatus}`
      : freshnessQuery.data?.deep.ingestState
        ? `Ingest ${freshnessQuery.data.deep.ingestState}`
        : "Idle";

  return {
    users,
    folderRows,
    loading,
    syncActive,
    kpiSummary: kpiSummaryQuery.data,
    usersSelection,
    projectsSelection,
    scopedSelections,
    queryState,
    isRefreshingCharts,
    isReady,
    isFallback,
    userStatusSlices,
    recencySlices,
    adminMixSlices,
    permTierSlices,
    findings,
    headlineItems,
    topProjectRows,
    topRoleRows,
    projectDistributionRows,
    adminDistributionRows,
    topCompanyRows,
    roleStatusRows,
    signInCoverage,
    folderCoverage,
    activeShare,
    adminTotal,
    latestExtractionAt,
    elapsedHrs,
    isStale,
    syncStateLabel,
  };
}
