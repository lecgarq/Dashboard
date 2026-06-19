"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import { TIER_COLORS } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { EChartsOption } from "echarts";
import type { RoleTreeNode } from "@/lib/server/templateRoleTree";

interface Slice {
  roleId: string;
  name: string;
  value: number; // folders this role can reach
  maxRank: number; // highest tier the role holds → slice colour
  color: string;
  node: RoleTreeNode;
}

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  return p > 0 && p < 0.1 ? "<0.1%" : `${p.toFixed(1)}%`;
}

export function RoleAccessPie({ nodes }: { nodes: RoleTreeNode[] }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#6b7280";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";
  const cTipBorder = dark ? "#3f3f46" : "#e5e7eb";
  const cSlice = dark ? "#18181b" : "#ffffff";

  const slices = useMemo<Slice[]>(
    () =>
      nodes.map((n) => {
        const maxRank = Math.max(1, ...n.tiers.map((t) => t.rank));
        return { roleId: n.roleId, name: n.roleName, value: n.folderCount, maxRank, color: TIER_COLORS[maxRank], node: n };
      }),
    [nodes],
  );
  const total = slices.reduce((s, x) => s + x.value, 0);
  const byName = useMemo(() => new Map(slices.map((s) => [s.name, s])), [slices]);
  const selected = slices.find((s) => s.roleId === selectedId) ?? null;

  const option = useMemo<EChartsOption>(() => ({
    title: [
      {
        text: nodes.length.toLocaleString(),
        subtext: "roles",
        left: "center", top: "44%", textAlign: "center",
        textStyle: { color: cTitle, fontSize: 30, fontWeight: 700 },
        subtextStyle: { color: cSub, fontSize: 13 },
      },
    ],
    tooltip: {
      trigger: "item",
      backgroundColor: cTipBg, borderColor: cTipBorder, borderWidth: 1, padding: [8, 12],
      extraCssText: "border-radius:10px;",
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        const name = (p as { name?: string }).name;
        const s = name ? byName.get(name) : undefined;
        if (!s) return "";
        const tierLine = s.node.tiers.map((t) => `${t.label}: ${t.folders.length}`).join("<br/>");
        return `<div style="font-weight:700;color:${cTitle}">${s.name}</div><div style="color:${cSub}">${s.value} folders</div><div style="margin-top:4px;color:${cSub}">${tierLine}</div>`;
      },
    },
    legend: { show: false },
    series: [
      {
        name: "Roles",
        type: "pie",
        radius: ["54%", "80%"],
        center: ["50%", "50%"],
        padAngle: 1.5,
        minAngle: 3,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: cSlice, borderWidth: 2, borderRadius: 5 },
        emphasis: { focus: "self", scaleSize: 10, label: { show: true, formatter: "{b}\n{c}", fontSize: 13, fontWeight: 700, color: cTitle } },
        data: slices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
      },
    ],
  }), [slices, nodes.length, byName, cTitle, cSub, cTipBg, cTipBorder, cSlice]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        No folder permissions found for this template.
      </div>
    );
  }

  return (
    <div className="panel-elevated p-5">
      <EChart
        option={option}
        height={360}
        notMerge={false}
        onEvents={{ click: (p) => { const s = p.name ? byName.get(p.name) : undefined; setSelectedId(s ? (selectedId === s.roleId ? null : s.roleId) : null); } }}
      />

      <p className="mt-1 px-1 text-center text-xs text-muted-foreground">
        Slice size = folders the role can reach · colour = its highest permission tier · click a role for its tier breakdown
      </p>

      {/* Legend — every role, sorted by reach; click to drill. */}
      <ul className="mt-3 list-none border-t border-border pt-3" style={{ columnWidth: "230px", columnGap: "1.5rem" }}>
        {slices.map((s) => {
          const isSel = s.roleId === selectedId;
          return (
            <li key={s.roleId} className="mb-0.5 break-inside-avoid">
              <button
                type="button"
                onClick={() => setSelectedId(isSel ? null : s.roleId)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${isSel ? "bg-accent" : "hover:bg-accent/50"}`}
                title={`${s.name} — ${s.value} folders`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="flex-1 truncate text-foreground/85">{s.name}</span>
                <span className="shrink-0 tabular-nums text-foreground">{s.value}</span>
                <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(s.value, total)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 text-sm font-semibold text-foreground">
            {selected.name} <span className="font-normal text-muted-foreground">· {selected.value} folders</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full border border-border">
            {selected.node.tiers.map((t) => (
              <span key={t.rank} title={`${t.label}: ${t.folders.length}`} style={{ width: `${(t.folders.length / Math.max(1, selected.value)) * 100}%`, background: TIER_COLORS[t.rank] }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {selected.node.tiers.map((t) => (
              <span key={t.rank} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: TIER_COLORS[t.rank] }} />
                {t.label}: <span className="tabular-nums text-foreground">{t.folders.length}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
