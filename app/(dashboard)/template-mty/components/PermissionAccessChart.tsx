"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { PeopleDrillList } from "@/app/(dashboard)/access-analysis/components/PeopleDrillList";
import { TIER_COLORS } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { DrillPerson } from "@/app/(dashboard)/access-analysis/roleCounts";
import type { EChartsOption } from "echarts";
import type { PermissionAccessSummary } from "../permissionAccess";

const NO_ACCESS = "#71717a"; // zinc — the "no folder access" row

interface Row {
  label: string;
  value: number;
  color: string;
  roles: Array<{ role: string; userCount: number }>;
}

export function PermissionAccessChart({
  summary,
  members,
  onMemberClick,
}: {
  summary: PermissionAccessSummary;
  /** Roster members — enables the click-a-bar drill into the people behind a tier. */
  members?: ReadonlyArray<{ name: string; email: string; role: string }>;
  /** Open a member's profile (same drawer the members table uses). */
  onMemberClick?: (email: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  // Click-to-drill: the tier label whose members are expanded below the chart.
  const [drill, setDrill] = useState<string | null>(null);
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

  // Members behind the expanded tier — roster members whose role contributes to it.
  const drillRow = drill ? byLabel.get(drill) : undefined;
  const drillPeople = useMemo<DrillPerson[]>(() => {
    if (!drillRow || !members?.length) return [];
    const roles = new Set(drillRow.roles.map((r) => r.role));
    return members
      .filter((m) => roles.has(m.role))
      .map((m) => ({ name: m.name, email: m.email, count: 1 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [drillRow, members]);

  if (rows.length === 0) {
    return (
      <PremiumSurface variant="inset" className="flex h-[200px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-9 w-9 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7h18M3 12h12M3 17h8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No folder permission data for this template.
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface variant="base" className="p-5">
      <EChart
        option={option}
        height={Math.max(180, rows.length * 38 + 24)}
        notMerge={false}
        onEvents={{
          click: (p) => {
            if (!members?.length || !p.name) return;
            const name = p.name;
            setDrill((cur) => (cur === name ? null : name));
          },
        }}
      />

      {/* Drill-down: the roster members whose role grants the clicked tier. */}
      {drill && drillRow && (
        <PeopleDrillList
          testId="tier-access-drilldown"
          title={drill}
          color={drillRow.color}
          people={drillPeople}
          total={drillRow.value}
          unitNoun="members"
          onUserClick={onMemberClick}
          onClose={() => setDrill(null)}
        />
      )}

      <p className="mt-2 px-1 text-xs text-muted-foreground">
        A role can grant several tiers across folders, so a member is counted under every tier their role grants.
        {members?.length ? " Click a bar to expand the members behind it." : ""}
      </p>
    </PremiumSurface>
  );
}
