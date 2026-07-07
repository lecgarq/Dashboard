"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import type { EChartsOption } from "echarts";
import { EChart } from "../access-analysis/components/EChart";
import { adminProjects, roleCounts, moduleCounts } from "./statCardDetails";
import type { CountSlice, ProjectData, StatCardDetailKind } from "./statCardTypes";

const PALETTE = [
  "#5e96ce", "#e8763f", "#21a3b0", "#d2a012", "#bc74a4", "#8fa65a",
  "#4fabc9", "#e06a62", "#86b3dc", "#f09a6f", "#55bcc7", "#e5bc4c",
];
const colorFor = (i: number) => PALETTE[i % PALETTE.length];

function Donut({ slices, label }: { slices: CountSlice[]; label: string }): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const cText = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#6b7280";
  const cSlice = dark ? "#18181b" : "#ffffff";
  const total = slices.reduce((s, d) => s + d.value, 0);

  const option: EChartsOption = {
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["55%", "80%"],
        center: ["50%", "50%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: cSlice, borderWidth: 2, borderRadius: 5 },
        data: slices.map((s, i) => ({ name: s.name, value: s.value, itemStyle: { color: colorFor(i) } })),
      },
    ],
    title: {
      text: String(slices.length),
      subtext: label,
      left: "center",
      top: "center",
      textAlign: "center",
      textStyle: { color: cText, fontSize: 22, fontWeight: 700 },
      subtextStyle: { color: cSub, fontSize: 11 },
    },
  };

  return (
    <div>
      <EChart option={option} height={200} notMerge={false} />
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(i) }} />
            <span className="min-w-0 flex-1 truncate text-foreground/85" title={s.name}>{s.name}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{s.value}</span>
            <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
              {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatCardDetail({
  kind,
  projects,
}: {
  kind: StatCardDetailKind;
  projects: ProjectData[];
}): React.JSX.Element {
  const admin = useMemo(() => (kind === "admin" ? adminProjects(projects) : []), [kind, projects]);
  const slices = useMemo(
    () => (kind === "roles" ? roleCounts(projects) : kind === "modules" ? moduleCounts(projects) : []),
    [kind, projects],
  );

  return (
    <div data-testid={`stat-detail-${kind}`} className="mt-3 rounded-xl border border-border/40 bg-muted/5 p-4">
      {kind === "admin" ? (
        admin.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No admin projects.</p>
        ) : (
          <div className="space-y-1.5">
            {admin.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/20 bg-card/60 px-3 py-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${p.status === "active" ? "bg-green-500" : "bg-gray-400"}`} />
                  <span className="truncate font-medium text-foreground" title={p.name}>{p.name}</span>
                </span>
                <span className="shrink-0 truncate text-muted-foreground" title={(p.roles ?? []).join(", ")}>
                  {(p.roles ?? []).join(", ") || "—"}
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        <Donut slices={slices} label={kind} />
      )}
    </div>
  );
}
