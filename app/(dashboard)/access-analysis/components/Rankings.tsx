"use client";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import type { SummaryDTO, Category } from "../types";

function barOption(rows: Category[]): EChartsOption {
  const ordered = [...rows].reverse();
  return {
    grid: { left: 150, right: 24, top: 8, bottom: 8 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value", axisLabel: { color: "#71717a" }, splitLine: { lineStyle: { color: "#27272a" } } },
    yAxis: { type: "category", data: ordered.map((r) => r.label), axisLabel: { color: "#d4d4d8" } },
    series: [{ type: "bar", itemStyle: { color: "#22d3ee", borderRadius: [0, 4, 4, 0] }, data: ordered.map((r) => r.value) }],
  };
}

function Panel({ title, rows, onPick }: { title: string; rows: Category[]; onPick: (label: string, key?: string) => void }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</div>
      <EChart option={barOption(rows)} height={280}
        onEvents={{ click: (p) => { const hit = rows.find((r) => r.label === p.name); onPick(p.name ?? "", hit?.key); } }} />
    </div>
  );
}

export function Rankings({
  rankings, onPickProject, onPickRole, onPickCompany,
}: {
  rankings: SummaryDTO["rankings"];
  onPickProject: (label: string, key?: string) => void;
  onPickRole: (label: string) => void;
  onPickCompany: (label: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Panel title="Top projects by people" rows={rankings.topProjects} onPick={onPickProject} />
      <Panel title="Members per role" rows={rankings.membersPerRole} onPick={(l) => onPickRole(l)} />
      <Panel title="Top companies" rows={rankings.topCompanies} onPick={(l) => onPickCompany(l)} />
    </div>
  );
}
