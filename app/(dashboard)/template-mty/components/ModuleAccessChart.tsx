"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { PeopleDrillList } from "@/app/(dashboard)/access-analysis/components/PeopleDrillList";
import type { DrillPerson } from "@/app/(dashboard)/access-analysis/roleCounts";
import type { EChartsOption } from "echarts";
import type { ModuleAccessSummary } from "../moduleAccess";

export function ModuleAccessChart({
  summary,
  members,
  onMemberClick,
}: {
  summary: ModuleAccessSummary;
  /** Roster members — resolves slice user names to emails for the click-a-bar drill. */
  members?: ReadonlyArray<{ name: string; email: string }>;
  /** Open a member's profile (same drawer the members table uses). */
  onMemberClick?: (email: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  // Click-to-drill: the module name whose members are expanded below the chart.
  const [drill, setDrill] = useState<string | null>(null);
  const dark = resolvedTheme !== "light";
  const cText = dark ? "#e4e4e7" : "#374151";
  const cAxis = dark ? "#3f3f46" : "#e5e7eb";
  const cBar = "#5e96ce";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";

  const slices = summary.slices;
  const byName = useMemo(() => new Map(slices.map((s) => [s.name, s])), [slices]);

  const option = useMemo<EChartsOption>(() => {
    // Category axis renders bottom-up, so reverse to put the largest bar on top.
    const names = slices.map((s) => s.name).reverse();
    const values = slices.map((s) => s.userCount).reverse();
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
          const s = name ? byName.get(name) : undefined;
          if (!s) return "";
          const roles = s.roles.length ? s.roles.join(", ") : "—";
          return `<b>${s.name}</b><br/>${s.userCount} members<br/><span style="opacity:.7">${roles}</span>`;
        },
      },
      xAxis: { type: "value", minInterval: 1, axisLine: { lineStyle: { color: cAxis } }, axisLabel: { color: cText }, splitLine: { lineStyle: { color: cAxis, opacity: 0.4 } } },
      yAxis: { type: "category", data: names, axisLine: { lineStyle: { color: cAxis } }, axisLabel: { color: cText } },
      series: [
        {
          type: "bar",
          data: values,
          itemStyle: { color: cBar, borderRadius: [0, 5, 5, 0] },
          barWidth: "58%",
          label: { show: true, position: "right", color: cText, formatter: "{c}" },
        },
      ],
    };
  }, [slices, byName, cText, cAxis, cTipBg]);

  // Members provisioned for the expanded module (slice carries names; roster maps to emails).
  const drillSlice = drill ? byName.get(drill) : undefined;
  const drillPeople = useMemo<DrillPerson[]>(() => {
    if (!drillSlice) return [];
    const emailByName = new Map((members ?? []).map((m) => [m.name, m.email]));
    return [...drillSlice.users]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, email: emailByName.get(name) ?? "", count: 1 }));
  }, [drillSlice, members]);

  if (!summary.hasData) {
    return (
      <PremiumSurface variant="inset" className="flex min-h-[160px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-9 w-9 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span className="font-medium text-foreground">No module access captured yet</span>
        <span>Add <code className="rounded bg-muted px-1.5 py-0.5">modules</code> to each member in <code className="rounded bg-muted px-1.5 py-0.5">lib/acc/template-mty-roster.ts</code>.</span>
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface variant="base" className="p-5">
      <EChart
        option={option}
        height={Math.max(160, slices.length * 34 + 24)}
        notMerge={false}
        onEvents={{
          click: (p) => {
            if (!members?.length || !p.name) return;
            const name = p.name;
            setDrill((cur) => (cur === name ? null : name));
          },
        }}
      />

      {/* Drill-down: the roster members provisioned for the clicked module. */}
      {drill && drillSlice && (
        <PeopleDrillList
          testId="module-access-drilldown"
          title={drill}
          color={cBar}
          people={drillPeople}
          total={drillSlice.userCount}
          unitNoun="members"
          onUserClick={onMemberClick}
          onClose={() => setDrill(null)}
        />
      )}

      {members?.length ? (
        <p className="mt-2 px-1 text-xs text-muted-foreground">Click a bar to expand the members behind it.</p>
      ) : null}
    </PremiumSurface>
  );
}
