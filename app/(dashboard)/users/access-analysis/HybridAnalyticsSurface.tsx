"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Network, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Selection } from "@uwdata/mosaic-core";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { useMergedAccUsers } from "../useMergedAccUsers";
import { canInitializeDuckDbInBrowser, getDuckDbClient } from "./duckdbClient";
import {
  buildFallbackAnalyticsState,
  type ChartDatum,
  EMPTY_ANALYTICS_QUERY_STATE,
  errorToAnalyticsDiagnostic,
  runGraphAnalyticsQueries,
  type AnalyticsQueryState,
} from "./analyticsQueries";
import type { GraphFolderPermissionRow } from "./graphTables";
import { HistogramPanel } from "./HistogramPanel";
import { DistributionPanel } from "./DistributionPanel";
import { HeatmapPanel } from "./HeatmapPanel";
import { DonutPanel, type DonutSlice } from "./DonutPanel";
import { KpiHeroStrip } from "./KpiHeroStrip";
import { AccessEventsChart } from "./AccessEventsChart";
import { buildExecutiveFindings, isAdmin } from "./analyticsFindings";
import { HeadlineInsights, type HeadlineInsightItem } from "./HeadlineInsights";
import { ComplianceScanPanel } from "./ComplianceScanPanel";
import { PermissionRiskPanel } from "./PermissionRiskPanel";
import { chartColor, sequenceColor } from "./chartColors";
import { ChartPanel } from "./ChartPanel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ActiveFiltersBar } from "./ActiveFiltersBar";
import type { ScopedSelection } from "./selectionFilters";

const ACTIVE_REFRESH_MS = 15_000;
const IDLE_REFRESH_MS = 5 * 60_000;

function toFolderRows(rawRows: readonly unknown[] | undefined): GraphFolderPermissionRow[] {
  return (rawRows ?? [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        folderId: String(r.folderId ?? ""),
        folderPath: String(r.folderPath ?? ""),
        projectId: String(r.projectId ?? ""),
        roleId: String(r.roleName ?? r.roleId ?? ""),
        permType: String(r.permType ?? ""),
      };
    })
    .filter((row) => row.folderId && row.roleId && row.permType);
}

const ACCENTS = {
  distribution: chartColor("seq4"),
  distributionAdmin: chartColor("watch"),
  heatmap: chartColor("seq2"),
  membership: chartColor("good"),
  role: chartColor("seq4"),
  company: chartColor("seq1"),
} as const;

const STATUS_ROLE: Record<string, Parameters<typeof chartColor>[0]> = {
  active: "good",
  pending: "watch",
  deleted: "risk",
  unknown: "neutral",
};
const RECENCY_ROLES = ["good", "info", "watch", "neutral"] as const;
const ADMIN_MIX_ROLES = ["risk", "watch", "info", "neutral"] as const;

function computeUserStatus(users: BulkAccUser[]): DonutSlice[] {
  const counts = new Map<string, number>();
  for (const u of users) {
    const key = u.aggregatedStatus ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      value,
      color: chartColor(STATUS_ROLE[label] ?? "neutral"),
    }))
    .sort((a, b) => b.value - a.value);
}

function computeActivityRecency(users: BulkAccUser[]): DonutSlice[] {
  const now = Date.now();
  const buckets = [
    { label: "Active 30d", value: 0 },
    { label: "31-90d", value: 0 },
    { label: "Older than 90d", value: 0 },
    { label: "Never signed in", value: 0 },
  ];
  for (const u of users) {
    const t = u.lastSignIn ? Date.parse(u.lastSignIn) : NaN;
    if (!Number.isFinite(t)) {
      buckets[3].value++;
      continue;
    }
    const days = (now - t) / 86_400_000;
    if (days <= 30) buckets[0].value++;
    else if (days <= 90) buckets[1].value++;
    else buckets[2].value++;
  }
  return buckets.map((b, i) => ({ ...b, color: chartColor(RECENCY_ROLES[i]) }));
}

function computeAdminMix(users: BulkAccUser[]): DonutSlice[] {
  let accountOnly = 0;
  let projectOnly = 0;
  let both = 0;
  let none = 0;
  for (const u of users) {
    const isAccount = u.isAccountAdmin;
    const isProject = u.adminCount > 0;
    if (isAccount && isProject) both++;
    else if (isAccount) accountOnly++;
    else if (isProject) projectOnly++;
    else none++;
  }
  return [
    { label: "Account admin", value: accountOnly, color: chartColor(ADMIN_MIX_ROLES[0]) },
    { label: "Account + project", value: both, color: chartColor(ADMIN_MIX_ROLES[1]) },
    { label: "Project admin only", value: projectOnly, color: chartColor(ADMIN_MIX_ROLES[2]) },
    { label: "Standard member", value: none, color: chartColor(ADMIN_MIX_ROLES[3]) },
  ];
}

function computePermTiers(folderRows: GraphFolderPermissionRow[]): DonutSlice[] {
  const counts = new Map<string, number>();
  for (const r of folderRows) counts.set(r.permType, (counts.get(r.permType) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: sequenceColor(i) }));
}

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function latestTime(values: Array<Date | string | null | undefined>): number | null {
  const times = values.map(toTime).filter((value): value is number => value !== null);
  return times.length ? Math.max(...times) : null;
}

function formatDateTime(value: number | null): string {
  if (value === null) return "No extraction yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

interface FallbackBarDatum {
  label: string;
  value: number;
}

function toFallbackRows(rows: readonly ChartDatum[]): FallbackBarDatum[] {
  return rows.map((row) => ({ label: row.label, value: row.value })).filter((row) => row.value > 0);
}

function projectCountDistribution(users: readonly BulkAccUser[]): FallbackBarDatum[] {
  const buckets = new Map<string, number>();
  for (const user of users) {
    const key = user.projectCount >= 10 ? "10+" : String(user.projectCount);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Number.parseInt(a.label, 10) - Number.parseInt(b.label, 10));
}

function adminGrantDistribution(users: readonly BulkAccUser[]): FallbackBarDatum[] {
  const buckets = new Map<string, number>();
  for (const user of users) {
    const key = user.adminCount >= 10 ? "10+" : String(user.adminCount);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Number.parseInt(a.label, 10) - Number.parseInt(b.label, 10));
}

function topCompanies(users: readonly BulkAccUser[], limit = 20): FallbackBarDatum[] {
  const counts = new Map<string, number>();
  for (const user of users) {
    const label = (user.companyName ?? user.companyRole ?? "Unknown").trim() || "Unknown";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function topProjects(users: readonly BulkAccUser[], limit = 20): FallbackBarDatum[] {
  const counts = new Map<string, Set<string>>();
  for (const user of users) {
    for (const project of user.projects) {
      const label = project.name || project.id || "Unknown";
      const emails = counts.get(label) ?? new Set<string>();
      emails.add(user.email.toLowerCase());
      counts.set(label, emails);
    }
  }
  return Array.from(counts.entries())
    .map(([label, emails]) => ({ label, value: emails.size }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function topRoles(users: readonly BulkAccUser[], limit = 20): FallbackBarDatum[] {
  const counts = new Map<string, Set<string>>();
  for (const user of users) {
    const roles = new Set([...(user.allRoles ?? []), ...(user.perProjectRoleNames ?? [])].filter(Boolean));
    for (const project of user.projects) {
      for (const role of project.roles) if (role) roles.add(role);
    }
    for (const role of roles) {
      const emails = counts.get(role) ?? new Set<string>();
      emails.add(user.email.toLowerCase());
      counts.set(role, emails);
    }
  }
  return Array.from(counts.entries())
    .map(([label, emails]) => ({ label, value: emails.size }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function roleStatusHeatmapRows(users: readonly BulkAccUser[], limit = 12): FallbackBarDatum[] {
  const counts = new Map<string, number>();
  for (const user of users) {
    for (const project of user.projects) {
      const roles = project.roles.length ? project.roles : user.allRoles;
      for (const role of roles) {
        const label = `${role || "Unknown"} / ${project.status || "unknown"}`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function adminGrantFinding(users: readonly BulkAccUser[]): string {
  const grants = users.reduce((sum, user) => sum + user.adminCount, 0);
  if (grants === 0) return "No project admin grants found.";
  return `${grants.toLocaleString()} project admin ${grants === 1 ? "grant" : "grants"}`;
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mt-2 flex items-baseline gap-3">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function FallbackBarPanel({
  title,
  subtitle,
  rows,
  accent,
  emptyText = "No data",
  finding,
  onRowClick,
}: {
  title: string;
  subtitle?: string;
  rows: readonly FallbackBarDatum[];
  accent: string;
  emptyText?: string;
  finding?: string;
  onRowClick?: (row: FallbackBarDatum) => void;
}) {
  const max = rows.reduce((largest, row) => Math.max(largest, row.value), 0);
  return (
    <ChartPanel
      title={title}
      subtitle={subtitle}
      insight={finding ? { text: finding } : undefined}
      affordance={onRowClick ? "click-to-filter" : undefined}
    >
      {rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => (
            <div
              key={row.label}
              onClick={() => onRowClick?.(row)}
              className={`grid grid-cols-[minmax(0,1fr)_minmax(7rem,45%)] items-center gap-3 text-xs p-1 rounded transition-colors ${
                onRowClick ? "cursor-pointer hover:bg-muted/70" : ""
              }`}
            >
              <span className="truncate font-medium text-foreground/90" title={row.label}>{row.label}</span>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full animate-in slide-in-from-left duration-500 ease-out"
                    style={{
                      backgroundColor: accent,
                      width: `${max ? Math.max(4, (row.value / max) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="w-10 text-right tabular-nums font-semibold">{row.value.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartPanel>
  );
}

export function HybridAnalyticsSurface() {
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
  const [detailFilter, setDetailFilter] = useState<{
    title: string;
    subtitle: string;
    filterFn: (u: BulkAccUser) => boolean;
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);

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

  useEffect(() => {
    setVisibleCount(50);
  }, [detailFilter]);

  const filteredDetailUsers = useMemo(() => {
    if (!detailFilter) return [];
    const matched = users.filter(detailFilter.filterFn);
    if (!searchTerm.trim()) return matched;
    const query = searchTerm.toLowerCase();
    return matched.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(query) ||
        (u.email ?? "").toLowerCase().includes(query) ||
        (u.companyName ?? "").toLowerCase().includes(query)
    );
  }, [users, detailFilter, searchTerm]);

  const handleVgPlotClick = (
    e: React.MouseEvent<HTMLDivElement>,
    columnType: "projects" | "admin" | "topProjects" | "topRoles" | "topCompanies" | "rolesProjectStatus"
  ) => {
    const target = e.target as SVGElement;
    const rectOrPath = target.closest("rect, path, g");
    if (!rectOrPath) return;

    const titleEl = rectOrPath.querySelector("title");
    if (!titleEl) return;

    const text = titleEl.textContent || "";
    const lines = text.split("\n");
    const parsedData: Record<string, string> = {};
    for (const line of lines) {
      const parts = line.split(":");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join(":").trim();
        parsedData[key] = val;
      }
    }

    const findValueByKeyContains = (search: string) => {
      for (const [k, v] of Object.entries(parsedData)) {
        if (k.toLowerCase().includes(search.toLowerCase())) return v;
      }
      return parsedData.value || parsedData.count || "";
    };

    if (columnType === "projects") {
      const countVal = findValueByKeyContains("project_count");
      if (countVal) {
        setDetailFilter({
          title: `Users with ${countVal} Projects`,
          subtitle: `Detailed view of users who belong to exactly ${countVal} projects.`,
          filterFn: (u) => {
            if (countVal === "10+") return u.projectCount >= 10;
            const num = parseInt(countVal);
            if (isNaN(num)) return false;
            return u.projectCount === num;
          },
        });
      }
    } else if (columnType === "admin") {
      const countVal = findValueByKeyContains("admin_count");
      if (countVal) {
        setDetailFilter({
          title: `Users with ${countVal} Admin Grants`,
          subtitle: `Detailed view of users administering exactly ${countVal} projects.`,
          filterFn: (u) => {
            if (countVal === "10+") return u.adminCount >= 10;
            const num = parseInt(countVal);
            if (isNaN(num)) return false;
            return u.adminCount === num;
          },
        });
      }
    } else if (columnType === "topProjects" && (parsedData.project_name !== undefined || parsedData.project_id !== undefined)) {
      const projectName = parsedData.project_name ?? parsedData.project_id;
      setDetailFilter({
        title: `Users in Project: ${projectName}`,
        subtitle: `Detailed view of members assigned to the "${projectName}" project.`,
        filterFn: (u) => u.projects.some((p) => p.name === projectName || p.id === projectName),
      });
    } else if (columnType === "topRoles" && parsedData.role_id !== undefined) {
      const roleId = parsedData.role_id;
      setDetailFilter({
        title: `Users with Role: ${roleId}`,
        subtitle: `Detailed view of users carrying the role "${roleId}".`,
        filterFn: (u) =>
          u.allRoles.includes(roleId) || u.projects.some((p) => p.roles.includes(roleId)),
      });
    } else if (columnType === "topCompanies" && parsedData.company_name !== undefined) {
      const companyName = parsedData.company_name;
      setDetailFilter({
        title: `Users at Company: ${companyName}`,
        subtitle: `Detailed view of users belonging to "${companyName}".`,
        filterFn: (u) =>
          (u.companyName ?? "Unknown").trim() === companyName ||
          (!u.companyName && companyName === "Unknown"),
      });
    } else if (columnType === "rolesProjectStatus" && (parsedData.role_id !== undefined || parsedData.project_status !== undefined)) {
      const roleId = parsedData.role_id;
      const projectStatus = parsedData.project_status;
      setDetailFilter({
        title: `Users with Role ${roleId || "Any"} in ${projectStatus || "Any"} Projects`,
        subtitle: `Detailed view of role-project membership intersections.`,
        filterFn: (u) =>
          u.projects.some(
            (p) =>
              (!projectStatus || p.status === projectStatus) &&
              (!roleId || p.roles.includes(roleId)),
          ),
      });
    }
  };

  const handleHeadlineSelect = (id: string) => {
    const now = Date.now();
    if (id === "stale") {
      setDetailFilter({
        title: "Stale or never signed-in members",
        subtitle: "Members with no sign-in in over 90 days (or never).",
        filterFn: (u) => {
          const t = u.lastSignIn ? Date.parse(u.lastSignIn) : NaN;
          if (!Number.isFinite(t)) return true;
          return (now - t) / 86_400_000 > 90;
        },
      });
    } else if (id === "active") {
      setDetailFilter({
        title: "Members active in the last 30 days",
        subtitle: "Members who signed in within the last 30 days.",
        filterFn: (u) => {
          const t = u.lastSignIn ? Date.parse(u.lastSignIn) : NaN;
          return Number.isFinite(t) && (now - t) / 86_400_000 <= 30;
        },
      });
    } else if (id === "admins") {
      setDetailFilter({
        title: "Admins",
        subtitle: "Members with account or project admin access.",
        filterFn: (u) => isAdmin(u),
      });
    } else if (id === "breadth") {
      setDetailFilter({
        title: "Members with 10+ projects",
        subtitle: "Broad-access members who belong to ten or more projects.",
        filterFn: (u) => u.projectCount >= 10,
      });
    }
  };

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

  const activeShare = useMemo(() => {
    if (!users.length) return "0%";
    const t = recencySlices[0]?.value ?? 0;
    return `${Math.round((t / users.length) * 100)}%`;
  }, [recencySlices, users.length]);

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

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Users, Roles &amp; Access</h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading authorized ACC data..."
              : `${users.length.toLocaleString()} users; ${folderRows.length.toLocaleString()} folder grants; click or brush to cross-filter`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isReady ? "default" : "outline"}>
            {isReady ? "DuckDB-Wasm" : queryState.status}
          </Badge>
          {isRefreshingCharts ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 size={12} className="animate-spin" /> Updating
            </Badge>
          ) : null}
          <Button asChild type="button" variant="outline" size="sm">
            <Link href="/users/spatial-graph">
              <Network size={14} className="mr-1" /> Open Spatial Graph
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest extraction</p>
          <p className="truncate font-medium">{formatDateTime(latestExtractionAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={syncActive ? "default" : "outline"}>{syncStateLabel}</Badge>
          <span className="inline-flex items-center gap-1">
            <RefreshCw size={12} className={syncActive ? "animate-spin" : ""} />
            {syncActive ? "Live refresh every 15s" : "Idle refresh every 5m"}
          </span>
        </div>
      </div>

      <ActiveFiltersBar scoped={scopedSelections} />

      {isStale && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50 animate-pulse">
          <AlertTriangle size={18} className="shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <span className="font-semibold">Local Cache Out of Date!</span> The latest successful Data Connector snapshot was extracted{" "}
            <span className="font-bold">{Math.round(elapsedHrs!)} hours ago</span> (threshold is 36 hours). Analytics may not reflect recent activities. Please check the <Link href="/sync-center" className="underline hover:text-rose-900 dark:hover:text-rose-100 font-semibold">Sync Center</Link> to trigger or debug extraction.
          </div>
        </div>
      )}

      {queryState.diagnostic ? (
        <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700">{queryState.diagnostic}</p>
      ) : null}

      <SectionHeading title="Executive summary" />

      <KpiHeroStrip users={users} folderGrantCount={folderRows.length} summary={kpiSummaryQuery.data} />

      <HeadlineInsights items={headlineItems} onSelect={handleHeadlineSelect} />

      <SectionHeading title="Access posture" hint="Click a slice to drill in" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <DonutPanel
          title="User status"
          subtitle="Aggregated across project memberships"
          finding={findings.activeMembers}
          findingSeverity="good"
          data={userStatusSlices}
          centerValue={users.length.toLocaleString()}
          centerLabel="users"
          onSliceClick={(slice) => {
            const statusKey = slice.label.toLowerCase();
            setDetailFilter({
              title: `Users with Status: ${slice.label}`,
              subtitle: `Detailed view of users whose account status is "${slice.label}".`,
              filterFn: (u) => (u.aggregatedStatus ?? "unknown").toLowerCase() === statusKey,
            });
          }}
        />
        <DonutPanel
          title="Activity recency"
          subtitle="Time since last sign-in"
          finding={findings.staleMembers}
          findingSeverity="risk"
          data={recencySlices}
          centerValue={activeShare}
          centerLabel="active 30d"
          onSliceClick={(slice) => {
            const now = Date.now();
            setDetailFilter({
              title: `Users by Activity: ${slice.label}`,
              subtitle: `Detailed view of users in the "${slice.label}" activity bucket.`,
              filterFn: (u) => {
                const t = u.lastSignIn ? Date.parse(u.lastSignIn) : NaN;
                if (slice.label === "Never signed in") {
                  return !Number.isFinite(t);
                }
                if (!Number.isFinite(t)) return false;
                const days = (now - t) / 86_400_000;
                if (slice.label === "Active 30d") return days <= 30;
                if (slice.label === "31-90d") return days > 30 && days <= 90;
                if (slice.label === "Older than 90d") return days > 90;
                return false;
              },
            });
          }}
        />
        <DonutPanel
          title="Admin composition"
          subtitle="Where admin power sits"
          finding={findings.adminConcentration}
          findingSeverity="watch"
          data={adminMixSlices}
          centerValue={adminTotal.toLocaleString()}
          centerLabel="any admin"
          onSliceClick={(slice) => {
            setDetailFilter({
              title: `Users: ${slice.label}`,
              subtitle: `Detailed view of users classified as "${slice.label}".`,
              filterFn: (u) => {
                const isAccount = u.isAccountAdmin;
                const isProject = u.adminCount > 0;
                if (slice.label === "Account admin") return isAccount && !isProject;
                if (slice.label === "Account + project") return isAccount && isProject;
                if (slice.label === "Project admin only") return !isAccount && isProject;
                if (slice.label === "Standard member") return !isAccount && !isProject;
                return false;
              },
            });
          }}
        />
        <DonutPanel
          title="Permission tiers"
          subtitle="Folder-grant breakdown"
          finding={findings.permissionTiers}
          findingSeverity="info"
          data={permTierSlices}
          centerValue={folderRows.length.toLocaleString()}
          centerLabel="grants"
          onSliceClick={(slice) => {
            const matchingRoleIds = new Set(
              folderRows.filter((r) => r.permType === slice.label).map((r) => r.roleId)
            );
            setDetailFilter({
              title: `Users with Permission Tier: ${slice.label}`,
              subtitle: `Detailed view of users holding roles associated with the "${slice.label}" permission tier.`,
              filterFn: (u) => {
                const userRoles = new Set([
                  ...(u.allRoles ?? []),
                  ...(u.perProjectRoleNames ?? []),
                  ...u.projects.flatMap((p) => p.roles)
                ].filter(Boolean));
                return Array.from(userRoles).some((role) => matchingRoleIds.has(role));
              },
            });
          }}
        />
      </div>

      <SectionHeading title="Access breadth" />

      {isReady ? (
        <div onClick={(e) => handleVgPlotClick(e, "projects")} className="cursor-pointer vgplot-clickable">
          <DistributionPanel
            title="Projects per user"
            subtitle="Distribution of access breadth. The long tail on the right is your over-provisioned users."
            table="users"
            column="project_count"
            accent={ACCENTS.distribution}
            binStep={1}
            height={300}
            selection={usersSelection}
          />
        </div>
      ) : isFallback ? (
        <FallbackBarPanel
          title="Projects per user"
          subtitle="Local fallback distribution while DuckDB-Wasm is unavailable."
          rows={projectDistributionRows}
          accent={ACCENTS.distribution}
          finding={findings.projectBreadth}
          onRowClick={(row) => {
            setDetailFilter({
              title: `Users with ${row.label} Projects`,
              subtitle: `Detailed view of users who belong to ${row.label} projects.`,
              filterFn: (u) => {
                if (row.label === "10+") return u.projectCount >= 10;
                const num = parseInt(row.label, 10);
                return !isNaN(num) && u.projectCount === num;
              },
            });
          }}
        />
      ) : (
        <div className="h-[340px] animate-pulse rounded-lg border bg-card/60" />
      )}

      <div className="grid grid-cols-1 gap-4">
        {isReady ? (
          <div onClick={(e) => handleVgPlotClick(e, "rolesProjectStatus")} className="cursor-pointer vgplot-clickable">
            <HeatmapPanel
              title="Roles x project status"
              subtitle="Which roles are concentrated on active vs archived projects"
              table="user_projects"
              xColumn="project_status"
              yColumn="role_id"
              scheme="blues"
              height={520}
              selection={projectsSelection}
            />
          </div>
        ) : isFallback ? (
          <FallbackBarPanel
            title="Roles x project status"
            subtitle="Top role and project-status intersections from local data."
            rows={roleStatusRows}
            accent={ACCENTS.heatmap}
            onRowClick={(row) => {
              const [rolePart, statusPart] = row.label.split(" / ");
              setDetailFilter({
                title: `Users with Role "${rolePart}" in "${statusPart}" Projects`,
                subtitle: `Detailed view of users carrying role "${rolePart}" on projects with status "${statusPart}".`,
                filterFn: (u) => u.projects.some((p) => {
                  const statusMatch = (p.status || "unknown").toLowerCase() === (statusPart || "unknown").toLowerCase();
                  const rolesToCheck = p.roles.length ? p.roles : u.allRoles;
                  const roleMatch = rolesToCheck.some((r) => (r || "Unknown").toLowerCase() === (rolePart || "Unknown").toLowerCase());
                  return statusMatch && roleMatch;
                }),
              });
            }}
          />
        ) : (
          <div className="h-[520px] animate-pulse rounded-lg border bg-card/60" />
        )}
        {isReady ? (
          <div onClick={(e) => handleVgPlotClick(e, "admin")} className="cursor-pointer vgplot-clickable">
            <DistributionPanel
              title="Admin grants per user"
              subtitle="How many projects each admin actually administers"
              table="users"
              column="admin_count"
              accent={ACCENTS.distributionAdmin}
              binStep={1}
              height={420}
              selection={usersSelection}
            />
          </div>
        ) : isFallback ? (
          <FallbackBarPanel
            title="Admin grants per user"
            subtitle="Local fallback distribution while DuckDB-Wasm is unavailable."
            rows={adminDistributionRows}
            accent={ACCENTS.distributionAdmin}
            finding={adminGrantFinding(users)}
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users with ${row.label} Admin Grants`,
                subtitle: `Detailed view of users administering ${row.label} projects.`,
                filterFn: (u) => {
                  if (row.label === "10+") return u.adminCount >= 10;
                  const num = parseInt(row.label, 10);
                  return !isNaN(num) && u.adminCount === num;
                },
              });
            }}
          />
        ) : (
          <div className="h-[420px] animate-pulse rounded-lg border bg-card/60" />
        )}
      </div>

      <SectionHeading title="Rankings" />

      {!isReady && !isFallback ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <FallbackBarPanel
            title="Top projects"
            subtitle="Extracted project memberships shown immediately while cross-filter charts initialize."
            rows={topProjectRows}
            accent={ACCENTS.membership}
            emptyText="No project memberships found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users in Project: ${row.label}`,
                subtitle: `Detailed view of users who belong to the project "${row.label}".`,
                filterFn: (u) => u.projects.some((p) => p.name === row.label || p.id === row.label),
              });
            }}
          />
          <FallbackBarPanel
            title="Top roles"
            subtitle="Extracted role assignments shown immediately while cross-filter charts initialize."
            rows={topRoleRows}
            accent={ACCENTS.role}
            emptyText="No roles found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users with Role: ${row.label}`,
                subtitle: `Detailed view of users who carry the role "${row.label}".`,
                filterFn: (u) => {
                  const userRoles = new Set([
                    ...(u.allRoles ?? []),
                    ...(u.perProjectRoleNames ?? []),
                    ...u.projects.flatMap((p) => p.roles)
                  ].filter(Boolean));
                  return userRoles.has(row.label);
                },
              });
            }}
          />
          <FallbackBarPanel
            title="Top companies"
            subtitle="Extracted company membership distribution."
            rows={topCompanyRows}
            accent={ACCENTS.company}
            emptyText="No company data found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users at Company: ${row.label}`,
                subtitle: `Detailed view of users belonging to "${row.label}".`,
                filterFn: (u) => {
                  const label = (u.companyName ?? u.companyRole ?? "Unknown").trim() || "Unknown";
                  return label === row.label;
                },
              });
            }}
          />
        </div>
      ) : null}

      {isReady ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div onClick={(e) => handleVgPlotClick(e, "topProjects")} className="cursor-pointer vgplot-clickable">
            <HistogramPanel
              title="Top projects"
              table="user_projects"
              groupBy="project_name"
              groupLabel="users per project"
              topN={20}
              selection={projectsSelection}
            />
          </div>
          <div onClick={(e) => handleVgPlotClick(e, "topRoles")} className="cursor-pointer vgplot-clickable">
            <HistogramPanel
              title="Top roles"
              table="user_projects"
              groupBy="role_id"
              groupLabel="users per role"
              topN={20}
              selection={projectsSelection}
            />
          </div>
          <div onClick={(e) => handleVgPlotClick(e, "topCompanies")} className="cursor-pointer vgplot-clickable">
            <HistogramPanel
              title="Top companies"
              table="users"
              groupBy="company_name"
              groupLabel="users per company"
              topN={20}
              selection={usersSelection}
            />
          </div>
        </div>
      ) : isFallback ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <FallbackBarPanel
            title="Top projects"
            rows={toFallbackRows(queryState.projectMembership)}
            accent={ACCENTS.membership}
            emptyText="No project memberships found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users in Project: ${row.label}`,
                subtitle: `Detailed view of users who belong to the project "${row.label}".`,
                filterFn: (u) => u.projects.some((p) => p.name === row.label || p.id === row.label),
              });
            }}
          />
          <FallbackBarPanel
            title="Top roles"
            rows={toFallbackRows(queryState.roleDistribution)}
            accent={ACCENTS.role}
            emptyText="No roles found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users with Role: ${row.label}`,
                subtitle: `Detailed view of users who carry the role "${row.label}".`,
                filterFn: (u) => {
                  const userRoles = new Set([
                    ...(u.allRoles ?? []),
                    ...(u.perProjectRoleNames ?? []),
                    ...u.projects.flatMap((p) => p.roles)
                  ].filter(Boolean));
                  return userRoles.has(row.label);
                },
              });
            }}
          />
          <FallbackBarPanel
            title="Top companies"
            rows={topCompanyRows}
            accent={ACCENTS.company}
            emptyText="No company data found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users at Company: ${row.label}`,
                subtitle: `Detailed view of users belonging to "${row.label}".`,
                filterFn: (u) => {
                  const label = (u.companyName ?? u.companyRole ?? "Unknown").trim() || "Unknown";
                  return label === row.label;
                },
              });
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-[400px] animate-pulse rounded-lg border bg-card/60" />
          ))}
        </div>
      )}

      <SectionHeading title="Activity & risk" />

      <AccessEventsChart />

      <ComplianceScanPanel />

      <PermissionRiskPanel />

      {/* Styled Interactive Effects for vgplot charts */}
      <style>{`
        .vgplot-clickable svg rect,
        .vgplot-clickable svg path {
          cursor: pointer;
          transition: opacity 0.15s ease-in-out, filter 0.15s ease-in-out;
        }
        .vgplot-clickable svg rect:hover,
        .vgplot-clickable svg path:hover {
          opacity: 0.85;
          filter: brightness(1.15);
        }
      `}</style>

      {/* Drill-down Detail Modal */}
      <Dialog open={!!detailFilter} onOpenChange={(open) => { if (!open) { setDetailFilter(null); setSearchTerm(""); setVisibleCount(50); } }}>
        <DialogContent className="w-[56rem] max-w-[95vw] min-w-[24rem] h-[80vh] max-h-[90vh] min-h-[20rem] resize overflow-hidden flex flex-col bg-background/95 backdrop-blur-md border shadow-2xl p-6 rounded-xl animate-in fade-in zoom-in duration-200">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>{detailFilter?.title || "Drill-Down Details"}</span>
              <Badge variant="secondary" className="font-semibold text-xs py-0.5">
                {filteredDetailUsers.length} {filteredDetailUsers.length === 1 ? "user" : "users"}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              {detailFilter?.subtitle}
            </DialogDescription>
          </DialogHeader>

          {/* Live Search Input */}
          <div className="relative mb-4">
            <Input
              type="text"
              placeholder="Search by name, email, or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-muted/40 border-muted-foreground/20 focus:border-primary/50 text-sm pl-10 h-10 rounded-lg shadow-inner"
            />
            {/* Search Icon */}
            <svg
              className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          {/* Scrollable Table Area */}
          <div className="flex-1 min-h-0 overflow-y-auto border rounded-lg bg-card/50 shadow-inner pr-1">
            {filteredDetailUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <svg
                  className="h-10 w-10 text-muted-foreground/60 mb-2 stroke-1"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <p className="text-sm font-medium">No matching users found</p>
                <p className="text-xs text-muted-foreground/80 mt-0.5">Try refining your search terms.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[280px] font-semibold text-xs uppercase tracking-wider">User</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider">Company</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider w-[100px]">Projects</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider w-[100px]">Admins</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider w-[120px]">Roles</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDetailUsers.slice(0, visibleCount).map((u) => {
                      const initials = (u.name ?? "")
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2) || "?";

                      const statusVal = u.aggregatedStatus?.toLowerCase() ?? "unknown";
                      const badgeVariant =
                        statusVal === "active" ? "default" :
                        statusVal === "pending" ? "outline" : "destructive";

                      const userRoles = Array.from(new Set([
                        ...(u.allRoles ?? []),
                        ...(u.perProjectRoleNames ?? []),
                        ...u.projects.flatMap((p) => p.roles)
                      ].filter(Boolean))).slice(0, 2);

                      return (
                        <TableRow key={u.email} className="hover:bg-muted/40 transition-colors duration-150">
                          <TableCell className="font-medium py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 text-primary flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0 flex flex-col">
                                <span className="truncate font-semibold text-foreground/90 leading-tight">{u.name || "Unknown User"}</span>
                                <span className="truncate text-xs text-muted-foreground leading-normal mt-0.5">{u.email}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <span className="text-xs font-medium text-foreground/80 bg-muted/30 px-2 py-1 rounded border border-muted/55 truncate max-w-[150px] inline-block">
                              {(u.companyName ?? u.companyRole ?? "Unknown").trim() || "Unknown"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold py-3 tabular-nums">
                            {u.projectCount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-semibold py-3 tabular-nums text-amber-600 dark:text-amber-400">
                            {u.adminCount.toLocaleString()}
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex flex-wrap gap-1 max-w-[150px]">
                              {userRoles.length === 0 ? (
                                <span className="text-xs text-muted-foreground">-</span>
                              ) : (
                                userRoles.map((role) => (
                                  <Badge key={role} variant="outline" className="text-[10px] px-1.5 py-0 truncate max-w-[80px]">
                                    {role}
                                  </Badge>
                                ))
                              )}
                              {userRoles.length < Array.from(new Set([
                                ...(u.allRoles ?? []),
                                ...(u.perProjectRoleNames ?? []),
                                ...u.projects.flatMap((p) => p.roles)
                              ].filter(Boolean))).length && (
                                <span className="text-[9px] text-muted-foreground align-middle font-medium">+more</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right py-3">
                            <Badge variant={badgeVariant} className="text-[10px] font-bold tracking-wider px-2 py-0.5 uppercase">
                              {u.aggregatedStatus || "UNKNOWN"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredDetailUsers.length > visibleCount && (
                  <div className="flex justify-center p-4 border-t bg-card/40">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleCount((prev) => prev + 100)}
                      className="font-medium text-xs shadow-sm"
                    >
                      Load More (showing {visibleCount} of {filteredDetailUsers.length} users)
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
