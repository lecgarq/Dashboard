"use client";

import * as React from "react";
import ReactECharts from "echarts-for-react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { useFindings } from "../findingsContext";
import { useSelection } from "../selectionContext";
import {
  useDashboardAccent,
  useHeatmapRamp,
  useSeverityColor,
} from "./_shared/dashboardTokens";

/**
 * Phase 4 Plan 06 — Roles × Modules entitlement heatmap (DASH-08).
 *
 * One cell per (role, module) pair, colored by the count of DISTINCT MEMBERS that
 * carry both the role and the module. Distinct-member semantics matter — counting
 * raw role-module assignments inflates cells because a single user can hold a
 * (role, module) pair across many projects.
 *
 * Aggregation algorithm:
 *   For each user u:
 *     For each project p in u.projects:
 *       For each role r in p.roles:
 *         For each module m in p.modules:
 *           record (u.email, r, m) into a Set
 *   Then for each (r, m) pair, count distinct emails.
 *
 * Pitfall 1 (SSR): `"use client"` MANDATORY — ECharts touches `window` at module load.
 * Pitfall 2 (height): explicit container height required.
 */
export interface RolesModulesHeatmapWidgetProps {
  users: BulkAccUser[];
}

interface HeatmapData {
  roles: string[];
  modules: string[];
  counts: Map<string, number>; // key = `${role}|${module}`
  matrix: [number, number, number][]; // [moduleIdx, roleIdx, count]
  maxCount: number;
}

function cellKey(role: string, module: string): string {
  return `${role}|${module}`;
}

function aggregate(users: BulkAccUser[]): HeatmapData {
  // distinctPairs[`${role}|${module}`] = Set of emails
  const distinctPairs = new Map<string, Set<string>>();
  const roleSet = new Set<string>();
  const moduleSet = new Set<string>();

  for (const u of users) {
    const email = u.email.toLowerCase();
    for (const p of u.projects ?? []) {
      const projRoles = p.roles ?? [];
      const projModules = p.modules ?? [];
      for (const r of projRoles) {
        roleSet.add(r);
        for (const m of projModules) {
          moduleSet.add(m);
          const k = cellKey(r, m);
          let s = distinctPairs.get(k);
          if (!s) {
            s = new Set<string>();
            distinctPairs.set(k, s);
          }
          s.add(email);
        }
      }
    }
  }

  const roles = Array.from(roleSet).sort();
  const modules = Array.from(moduleSet).sort();

  const counts = new Map<string, number>();
  let maxCount = 0;
  const matrix: [number, number, number][] = [];
  for (let mi = 0; mi < modules.length; mi += 1) {
    for (let ri = 0; ri < roles.length; ri += 1) {
      const k = cellKey(roles[ri], modules[mi]);
      const c = distinctPairs.get(k)?.size ?? 0;
      counts.set(k, c);
      if (c > maxCount) maxCount = c;
      matrix.push([mi, ri, c]);
    }
  }

  return { roles, modules, counts, matrix, maxCount };
}

export function RolesModulesHeatmapWidget({
  users,
}: RolesModulesHeatmapWidgetProps) {
  const data = React.useMemo(() => aggregate(users), [users]);
  const findings = useFindings();
  const { selected, setSelected } = useSelection();
  const roleSeverityIndex = findings.roleSeverityIndex;
  const sev = useSeverityColor();
  const accent = useDashboardAccent();
  const heatmapRamp = useHeatmapRamp();

  // Spotlight: when a role is selected upstream, dim heatmap rows whose y-axis
  // index doesn't match. Pre-compute the selected role index once; the series
  // data is rebuilt with per-cell opacity below. When no role is selected, fall
  // back to the bare [mi, ri, c] tuple form (zero-cost path).
  const selectedRoleIdx = React.useMemo(() => {
    if (!selected || selected.kind !== "role") return -1;
    return data.roles.indexOf(selected.role);
  }, [selected, data.roles]);

  const option = React.useMemo(() => {
    // Inline severity badges on Y-axis labels — DASH-09 "wherever else they appear".
    // Rich-text formatter prefixes a colored dot per severity.
    const yAxisFormatter = (role: string) => {
      const sev = roleSeverityIndex.get(role);
      if (sev === "HIGH") return `{hi|●} ${role}`;
      if (sev === "MEDIUM") return `{med|●} ${role}`;
      if (sev === "LOW") return `{low|●} ${role}`;
      return role;
    };
    return {
      tooltip: {
        position: "top",
        formatter: (p: { value: [number, number, number] }) => {
          const [mi, ri, c] = p.value;
          return `${data.roles[ri]} × ${data.modules[mi]}: ${c} member${
            c === 1 ? "" : "s"
          }`;
        },
      },
      grid: { left: 140, right: 30, top: 30, bottom: 80, containLabel: true },
      xAxis: {
        type: "category",
        data: data.modules,
        splitArea: { show: true },
        axisLabel: { rotate: 45, fontSize: 10 },
      },
      yAxis: {
        type: "category",
        data: data.roles,
        splitArea: { show: true },
        triggerEvent: true, // enables click on axis labels (yAxis name/category)
        axisLabel: {
          fontSize: 10,
          formatter: yAxisFormatter,
          // Rich-text dot colors sourced from `_shared/dashboardTokens` so the
          // axis-label severity dots match the bubble cluster, KPI strip, and
          // flow-node severity dots end-to-end.
          rich: {
            hi: { color: sev.HIGH, fontSize: 14, fontWeight: "bold" as const },
            med: { color: sev.MEDIUM, fontSize: 14, fontWeight: "bold" as const },
            low: { color: accent.neutral, fontSize: 14 },
          },
        },
      },
      visualMap: {
        min: 0,
        max: Math.max(1, data.maxCount),
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 10,
        inRange: {
          // Token-sourced 3-stop intensity ramp — see HEATMAP_RAMP_* in
          // _shared/dashboardTokens.ts. Theme-aware (light/dark).
          color: [...heatmapRamp],
        },
      },
      dataZoom: [{ type: "inside" }],
      series: [
        {
          name: "Members",
          type: "heatmap",
          data:
            selectedRoleIdx === -1
              ? data.matrix
              : data.matrix.map(([mi, ri, c]) => ({
                  value: [mi, ri, c],
                  itemStyle: {
                    opacity: ri === selectedRoleIdx ? 1 : 0.4,
                  },
                })),
          label: { show: false },
          emphasis: {
            itemStyle: {
              borderColor: "#000",
              borderWidth: 1,
            },
          },
        },
      ],
    };
  }, [data, roleSeverityIndex, sev, accent, heatmapRamp, selectedRoleIdx]);

  // Click handlers — y-axis label OR a heatmap cell selects the role.
  const onChartEvents = React.useMemo(
    () => ({
      click: (params: {
        componentType?: string;
        targetType?: string;
        value?: unknown;
      }) => {
        // Y-axis label click (axis category name event)
        if (
          params.componentType === "yAxis" ||
          params.targetType === "axisLabel"
        ) {
          const role = String(params.value ?? "");
          if (!role) return;
          setSelected({ kind: "role", role, severity: roleSeverityIndex.get(role) });
          return;
        }
        // Heatmap cell click (series): value = [moduleIdx, roleIdx, count]
        if (
          params.componentType === "series" &&
          Array.isArray(params.value) &&
          params.value.length >= 2
        ) {
          const ri = Number(params.value[1]);
          const role = data.roles[ri];
          if (!role) return;
          setSelected({ kind: "role", role, severity: roleSeverityIndex.get(role) });
        }
      },
    }),
    [data.roles, roleSeverityIndex, setSelected],
  );

  function handleExport() {
    const rows = data.roles.flatMap((r) =>
      data.modules.map((m) => ({
        Role: r,
        Module: m,
        Members: data.counts.get(cellKey(r, m)) ?? 0,
      }))
    );
    downloadCsv("roles-modules.csv", rows);
  }

  if (users.length === 0 || data.roles.length === 0 || data.modules.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={handleExport} disabled>
            <Download className="mr-2 size-4" />
            CSV
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          No data — sync ACC first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-2 size-4" />
          CSV
        </Button>
      </div>
      <div style={{ height: 500 }}>
        <ReactECharts
          option={option}
          notMerge
          lazyUpdate
          onEvents={onChartEvents}
          style={{ height: "100%", width: "100%" }}
        />
      </div>
    </div>
  );
}
