"use client";
import { useEffect, useState } from "react";
import { useAccessFilters } from "./store";
import { useSummary, useTrends, useMembers } from "./queries";
import { serializeFilters } from "./filterParams";
import { FilterBar, type FilterOptions } from "./components/FilterBar";
import { CountTiles } from "./components/CountTiles";
import { CompositionDonuts } from "./components/CompositionDonuts";
import { ModuleAccessChart } from "./components/ModuleAccessChart";
import { RiskCards } from "./components/RiskCards";
import { Rankings } from "./components/Rankings";
import { Trends } from "./components/Trends";
import { DetailTable } from "./components/DetailTable";

const EMPTY_SUMMARY = {
  counts: { users: 0, projects: 0, access: 0, roles: 0, companies: 0 },
  composition: { internalExternal: { internal: 0, external: 0 }, permission: { admin: 0, member: 0 } },
  modules: [], rankings: { topProjects: [], membersPerRole: [], topCompanies: [] },
  risk: { externalMembers: 0, externalAdmins: 0, projectAdmins: 0, pending: 0 },
};

export function AccessAnalysisDashboard({ filterOptions, projectTotal }: { filterOptions: FilterOptions; projectTotal: number }) {
  const { filters, toggle, setSingle } = useAccessFilters();
  const [page, setPage] = useState(0);
  const size = 50;
  const filterKey = serializeFilters(filters);
  useEffect(() => { setPage(0); }, [filterKey]);

  const summary = useSummary(filters).data ?? EMPTY_SUMMARY;
  const trends = useTrends(filters).data ?? { activityPerWeek: [], accessAdded: [] };
  const members = useMembers(filters, page, size);
  const exportHref = `/api/access-analysis/members?filters=${encodeURIComponent(serializeFilters(filters))}&format=csv`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <FilterBar options={filterOptions} />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <CountTiles counts={summary.counts} projectTotal={projectTotal} />
        <CompositionDonuts composition={summary.composition}
          onPickInternalExternal={(v) => setSingle("internalExternal", v)}
          onPickAdminMember={(v) => setSingle("adminMember", v)} />
        <ModuleAccessChart modules={summary.modules} onPickModule={(id) => toggle("module", id)} />
        <RiskCards risk={summary.risk}
          onExternal={() => setSingle("internalExternal", "external")}
          onExternalAdmins={() => { setSingle("internalExternal", "external"); setSingle("adminMember", "admin"); }}
          onAdmins={() => setSingle("adminMember", "admin")}
          onPending={() => { /* status filter is a future dimension; no-op keeps the card clickable */ }} />
        <Rankings rankings={summary.rankings}
          onPickProject={(label, key) => { if (key) toggle("projectId", key); }}
          onPickRole={(label) => toggle("role", label)}
          onPickCompany={(label) => toggle("company", label)} />
        <Trends activityPerWeek={trends.activityPerWeek} accessAdded={trends.accessAdded} />
        <DetailTable
          rows={members.data?.rows as never[] ?? []}
          total={members.data?.total ?? 0}
          page={page} size={size} onPage={setPage}
          exportHref={exportHref} loading={members.isLoading} />
      </div>
    </div>
  );
}
