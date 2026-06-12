"use client";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/app/(dashboard)/access-analysis/components/EChart";
import { TIER_COLORS } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { EChartsOption } from "echarts";
import type { PermissionAccessSummary } from "../permissionAccess";

const NO_ACCESS = "#71717a"; // zinc — the "no folder access" row

interface Row {
  label: string;
  value: number;
  color: string;
  roles: Array<{ role: string; userCount: number }>;
}

export function PermissionAccessChart({ summary }: { summary: PermissionAccessSummary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const cText = dark ? "#e4e4e7" : "#374151";
  const cAxis = dark ? "#3f3f46" : "#e5e7eb";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";

  const rows = useMemo<Row[]>(() => {
    const tierRows: Row[] = summary.tiers.map((t) => ({
      label: t.label,
      value: t.userCount,
      color: TIER_COLORS[t.rank] ?? NO_ACCESS,
      roles: t.roles,
    }));
    if (summary.noAccess.userCount > 0) {
      tierRows.push({
        label: "No folder access",
        value: summary.noAccess.userCount,
        color: NO_ACCESS,
        roles: summary.noAccess.roles.map((role) => ({ role, userCount: 0 })),
      });
    }
    return tierRows;
  }, [summary]);

  const byLabel = useMemo(() => new Map(rows.map((r) => [r.label, r])), [rows]);

  const option = useMemo<EChartsOption>(() => {
    const ordered = [...rows].reverse(); // category axis is bottom-up
    return {
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "item",
        backgroundColor: cTipBg,
        borderColor: cAxis,
        borderWidth: 1,
        textStyle: { color: cText },
        extraCssText: "border-radius:10px;",
        formatter: (params) => {
          const p = Array.isArray(params) ? params[0] : params;
          const name = (p as { name?: string }).name;
          const r = name ? byLabel.get(name) : undefined;
          if (!r) return "";
          const lines = r.roles.length
            ? r.roles.map((x) => `${x.role}${x.userCount ? ` (${x.userCount})` : ""}`).join("<br/>")
            : "—";
          return `<b>${r.label}</b><br/>${r.value} members<br/><span style="opacity:.7">${lines}</span>`;
        },
      },
      xAxis: { type: "value", minInterval: 1, axisLine: { lineStyle: { color: cAxis } }, axisLabel: { color: cText }, splitLine: { lineStyle: { color: cAxis, opacity: 0.4 } } },
      yAxis: { type: "category", data: ordered.map((r) => r.label), axisLine: { lineStyle: { color: cAxis } }, axisLabel: { color: cText } },
      series: [
        {
          type: "bar",
          data: ordered.map((r) => ({ value: r.value, itemStyle: { color: r.color, borderRadius: [0, 5, 5, 0] } })),
          barWidth: "58%",
          label: { show: true, position: "right", color: cText, formatter: "{c}" },
        },
      ],
    };
  }, [rows, byLabel, cText, cAxis, cTipBg]);

  if (rows.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        No folder permission data for this template.
      </div>
    );
  }

  return (
    <div className="panel-elevated p-5">
      <EChart option={option} height={Math.max(180, rows.length * 38 + 24)} notMerge={false} />
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        A role can grant several tiers across folders, so a member is counted under every tier their role grants.
      </p>
    </div>
  );
}
