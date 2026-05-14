"use client";

import { useEffect, useState } from "react";
import { Activity, Database, RotateCcw, Shield, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { useMergedAccUsers } from "../useMergedAccUsers";
import { AccUsersGraph } from "../AccUsersGraph";
import { canInitializeDuckDbInBrowser, getDuckDbClient } from "./duckdbClient";
import {
  buildFallbackAnalyticsState,
  EMPTY_ANALYTICS_QUERY_STATE,
  errorToAnalyticsDiagnostic,
  runGraphAnalyticsQueries,
  type AnalyticsQueryState,
  type ChartDatum,
} from "./analyticsQueries";
import { isAnalyticsSelectionEmpty, selectionFromFacet, type GraphAnalyticsSelection } from "./mosaicSelections";
import type { GraphFolderPermissionRow } from "./graphTables";
import { VgplotFacetChart } from "./VgplotFacetChart";
import { HistogramPanel } from "./HistogramPanel";

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

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: number; detail: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon size={14} />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  );
}

function AnalyticsStrip({ users, state }: { users: BulkAccUser[]; state: AnalyticsQueryState }) {
  const found = users.filter((user) => user.found).length;
  const admins = users.filter((user) => user.isAccountAdmin || user.adminCount > 0).length;
  const projects = new Set(users.flatMap((user) => user.projects.map((project) => project.id))).size;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Metric icon={Users} label="Users" value={users.length} detail={`${found} synced`} />
      <Metric icon={Shield} label="Admins" value={admins} detail="Account or project" />
      <Metric icon={Database} label="Projects" value={projects} detail={state.status === "ready" ? "DuckDB" : "local"} />
      <Metric icon={Activity} label="Similarity edges" value={state.similarityDimensions.reduce((sum, row) => sum + row.value, 0)} detail="7 dimensions" />
    </div>
  );
}

function ChartPanel({
  title,
  rows,
  selection,
  onSelect,
}: {
  title: string;
  rows: ChartDatum[];
  selection: GraphAnalyticsSelection | null;
  onSelect: (row: ChartDatum) => void;
}) {
  return (
    <section className="min-h-[150px] rounded-md border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
      </div>
      <VgplotFacetChart rows={rows} selection={selection} onSelect={onSelect} />
    </section>
  );
}

export function HybridAnalyticsSurface() {
  const { users, loading } = useMergedAccUsers();
  const folderMatrixQuery = trpc.accFolders.getMatrix.useQuery(undefined, { staleTime: 600_000, retry: false });
  const folderRows = toFolderRows(folderMatrixQuery.data?.rows);
  const [selection, setSelection] = useState<GraphAnalyticsSelection | null>(null);
  const [queryState, setQueryState] = useState<AnalyticsQueryState>(EMPTY_ANALYTICS_QUERY_STATE);

  // Warm DuckDB-Wasm immediately. The WASM bundle + worker download + DB instantiate
  // overlaps with bulkAccSummary network time instead of running serially after it.
  useEffect(() => {
    if (canInitializeDuckDbInBrowser()) {
      void getDuckDbClient().catch(() => {});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!users.length) {
      setQueryState(EMPTY_ANALYTICS_QUERY_STATE);
      return;
    }

    setQueryState((prev) => ({ ...prev, status: "loading", diagnostic: null }));
    getDuckDbClient()
      .then(({ connection }) => runGraphAnalyticsQueries({ connection, users, folderRows }))
      .then((state) => {
        if (!cancelled) setQueryState(state);
      })
      .catch((error: unknown) => {
        if (!cancelled) setQueryState(buildFallbackAnalyticsState(users, folderRows, errorToAnalyticsDiagnostic(error)));
      });

    return () => {
      cancelled = true;
    };
  }, [users, folderRows]);

  function selectRow(row: ChartDatum) {
    const next = selectionFromFacet(row.field, row.values);
    setSelection((current) => JSON.stringify(current) === JSON.stringify(next) ? null : next);
  }

  const activeSelection = isAnalyticsSelectionEmpty(selection) ? null : selection;

  return (
    <section className="grid min-h-[720px] grid-cols-1 gap-3 lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="min-h-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Spatial Analytics</h2>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading authorized ACC data" : `${users.length.toLocaleString()} users in memory`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={queryState.status === "ready" ? "default" : "outline"}>
              {queryState.status === "ready" ? "DuckDB-Wasm" : queryState.status}
            </Badge>
            <Button type="button" variant="outline" size="sm" disabled={!activeSelection} onClick={() => setSelection(null)}>
              <RotateCcw size={14} />
            </Button>
          </div>
        </div>
        {queryState.diagnostic && <p className="rounded-sm bg-amber-500/10 p-2 text-xs text-amber-700">{queryState.diagnostic}</p>}
        <AnalyticsStrip users={users} state={queryState} />
        {queryState.status === "ready" ? (
          <HistogramPanel
            title="Project Membership"
            table="user_projects"
            groupBy="project_name"
            groupLabel="users per project"
            topN={20}
          />
        ) : (
          <ChartPanel title="Project Membership" rows={queryState.projectMembership} selection={activeSelection} onSelect={selectRow} />
        )}
        {queryState.status === "ready" ? (
          <HistogramPanel
            title="Role Distribution"
            table="user_projects"
            groupBy="role_id"
            groupLabel="users per role"
            topN={20}
          />
        ) : (
          <ChartPanel title="Role Distribution" rows={queryState.roleDistribution} selection={activeSelection} onSelect={selectRow} />
        )}
        {queryState.status === "ready" ? (
          <HistogramPanel
            title="Activity Recency"
            table="user_activity_buckets"
            groupBy="bucket"
            groupLabel="users by recency"
            aggregator="countDistinctUser"
            topN={4}
          />
        ) : (
          <ChartPanel title="Activity Recency" rows={queryState.activityRecency} selection={activeSelection} onSelect={selectRow} />
        )}
        {queryState.status === "ready" ? (
          <HistogramPanel
            title="Folder Permission Tiers"
            table="folder_permissions"
            groupBy="perm_tier"
            aggregator="count"
            topN={6}
          />
        ) : (
          <ChartPanel title="Folder Permission Tiers" rows={queryState.folderPermissionTiers} selection={activeSelection} onSelect={selectRow} />
        )}
        {queryState.status === "ready" ? (
          <HistogramPanel
            title="Similarity Dimensions"
            table="similarity_edges"
            groupBy="dimension"
            aggregator="count"
            topN={5}
          />
        ) : (
          <ChartPanel title="Similarity Dimensions" rows={queryState.similarityDimensions} selection={activeSelection} onSelect={selectRow} />
        )}
      </aside>

      <main className="min-h-0">
        <div className="h-full min-h-[680px] overflow-hidden rounded-md border bg-card">
          <AccUsersGraph users={users} analyticsSelection={activeSelection} />
        </div>
      </main>
    </section>
  );
}
