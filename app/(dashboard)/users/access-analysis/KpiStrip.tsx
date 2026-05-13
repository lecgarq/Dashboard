"use client";

import { trpc } from "@/lib/core/trpc";
import { CHANGE_STREAM_META } from "@/lib/acc/accessAnalysisTypes";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessAnalysis } from "./AccessAnalysisContext";
import { KpiCard } from "./KpiCard";

export function KpiStrip() {
  const { window } = useAccessAnalysis();
  const query = trpc.accMembers.getKpiSummary.useQuery({ window }, { staleTime: 300_000 });

  if (query.isLoading || !query.data) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }
  if (query.error) {
    return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Failed to load KPIs: {query.error.message}</div>;
  }

  const d = query.data;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiCard label="Members" value={d.members.value} delta={d.members.delta} borderColor={CHANGE_STREAM_META.membership.color} />
      <KpiCard label="Access changes" value={d.accessChanges.value} delta={d.accessChanges.delta} />
      <KpiCard label="Active admins" value={d.activeAdmins.value} delta={d.activeAdmins.delta} borderColor={CHANGE_STREAM_META.admin.color} />
      <KpiCard label="Stale members" value={d.staleMembers.value} delta={d.staleMembers.delta} />
    </div>
  );
}
