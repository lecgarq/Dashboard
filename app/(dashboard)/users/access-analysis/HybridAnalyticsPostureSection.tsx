"use client";

// Header, freshness bar, ActiveFiltersBar, stale banner, diagnostic, executive summary, and
// posture donut grid — moved verbatim from HybridAnalyticsSurface.tsx (SPLIT-04 Task 2).
import Link from "next/link";
import { AlertTriangle, Loader2, Network, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DonutPanel } from "./DonutPanel";
import { KpiHeroStrip } from "./KpiHeroStrip";
import { HeadlineInsights } from "./HeadlineInsights";
import { ActiveFiltersBar } from "./ActiveFiltersBar";
import { SectionHeading } from "./hybridAnalyticsPanels";
import { formatDateTime } from "./hybridAnalyticsTransforms";
import type { HybridAnalyticsViewProps } from "./hybridAnalyticsViewTypes";

export function HybridAnalyticsPostureSection({
  viewModel,
  setDetailFilter,
  handleHeadlineSelect,
}: HybridAnalyticsViewProps) {
  const {
    users,
    folderRows,
    loading,
    syncActive,
    kpiSummary,
    scopedSelections,
    queryState,
    isRefreshingCharts,
    isReady,
    userStatusSlices,
    recencySlices,
    adminMixSlices,
    permTierSlices,
    findings,
    headlineItems,
    signInCoverage,
    folderCoverage,
    activeShare,
    adminTotal,
    latestExtractionAt,
    elapsedHrs,
    isStale,
    syncStateLabel,
  } = viewModel;

  return (
    <>
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

      <KpiHeroStrip users={users} folderGrantCount={folderRows.length} summary={kpiSummary} />

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
          title="Sign-in recency"
          subtitle={`Time since last recorded sign-in · only ${signInCoverage.percent}% of users have one`}
          finding={findings.staleMembers}
          findingSeverity="risk"
          data={recencySlices}
          centerValue={activeShare}
          centerLabel="signed in 30d"
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
                if (slice.label === "Signed in 30d") return days <= 30;
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
          subtitle={
            folderCoverage.totalProjects > 0
              ? `Folder-grant breakdown · ${folderCoverage.projectsWithFolders} of ${folderCoverage.totalProjects} projects crawled`
              : "Folder-grant breakdown"
          }
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
    </>
  );
}
