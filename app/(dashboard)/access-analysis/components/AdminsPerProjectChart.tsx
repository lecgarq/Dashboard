"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import { chartPalette } from "@/lib/colors/chartPalette";
import type { EChartsOption } from "echarts";
import type { AdminsPerProjectData, ProjectAdminsRow } from "@/lib/server/adminsPerProjectView";

const DEFAULT_TOP_N = 25;

// Project/user names are third-party data rendered into tooltip HTML via innerHTML.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Zinc — the unresolved rollup, never a brand slot. */
const COLOR_UNRESOLVED = "#71717a";

/**
 * Source split — sky for ACC sync, goldenrod for DC-only, zinc for unresolved.
 * `slot` indexes the shared brand palette; -1 means the zinc rollup.
 */
const SERIES = [
  { key: "member", label: "ACC member sync", slot: 6 },
  { key: "dcOnly", label: "DC only", slot: 3 },
  { key: "unresolved", label: "DC (no email)", slot: -1 },
] as const;

const seriesColor = (slot: number, dark: boolean): string =>
  slot < 0 ? COLOR_UNRESOLVED : chartPalette(dark)[slot];

function splitCounts(row: ProjectAdminsRow): { member: number; dcOnly: number; unresolved: number } {
  let member = 0;
  let dcOnly = 0;
  for (const a of row.admins) {
    if (a.fromMember) member += 1;
    else dcOnly += 1;
  }
  return { member, dcOnly, unresolved: row.unresolvedDcAdmins };
}

/**
 * Admins per project (owner ask 2026-07-23). Horizontal stacked bars, one per
 * project, split by admin source: ACC member sync (`projectAdmin` flag), DC-only
 * (project_admin access level without a member-sync row), and DC admins whose
 * email cannot be resolved (shown, never dropped). Clicking a bar drills into
 * the actual admin list — local drill state only, mirroring
 * `PermissionLevelChart`'s toggleDrill pattern.
 */
export function AdminsPerProjectChart({ data }: { data: AdminsPerProjectData }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const [drill, setDrill] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showZero, setShowZero] = useState(false);

  const bars = useMemo(
    () => (expanded ? data.rows : data.rows.slice(0, DEFAULT_TOP_N)),
    [data.rows, expanded],
  );

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";
  const cAxis = dark ? "#3f3f46" : "#e5e7eb";

  if (data.rows.length === 0) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
        No admin data in either source for this view.
      </div>
    );
  }

  const ordered = [...bars].reverse(); // category axis renders bottom-up
  const splits = ordered.map(splitCounts);

  const option: EChartsOption = {
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    legend: {
      data: SERIES.map((s) => s.label),
      top: 0,
      textStyle: { color: cSub, fontSize: 11 },
      itemWidth: 12,
      itemHeight: 12,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      padding: [8, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (params: unknown) => {
        const list = params as Array<{ name: string; seriesName: string; value: number }>;
        if (!list.length) return "";
        const row = bars.find((b) => b.projectName === list[0].name);
        const lines = list
          .filter((p) => (p.value ?? 0) > 0)
          .map((p) => `<div style="color:${cSub}">${escapeHtml(p.seriesName)}: ${p.value}</div>`)
          .join("");
        const total = row ? row.adminCount + row.unresolvedDcAdmins : 0;
        return `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${escapeHtml(list[0].name)}</div>${lines}<div style="color:${cSub};margin-top:2px">Total: ${total} · click for the list</div>`;
      },
    },
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: { color: cSub },
      splitLine: { lineStyle: { color: cAxis, opacity: 0.4 } },
    },
    yAxis: {
      type: "category",
      data: ordered.map((b) => b.projectName),
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: {
        color: cTitle,
        width: 220,
        overflow: "truncate" as const,
      },
    },
    series: SERIES.map((s) => ({
      name: s.label,
      type: "bar" as const,
      stack: "admins",
      cursor: "pointer",
      barWidth: "58%",
      itemStyle: { color: seriesColor(s.slot, dark) },
      data: splits.map((sp) => sp[s.key]),
      animationDuration: 700,
      animationEasing: "cubicOut" as const,
    })),
  };

  const drillRow = drill ? data.rows.find((r) => r.projectId === drill) : null;

  return (
    <div>
      <EChart
        option={option}
        height={Math.max(220, bars.length * 30 + 64)}
        notMerge={false}
        onEvents={{
          click: (p) => {
            const row = bars.find((b) => b.projectName === p.name);
            if (row) setDrill((cur) => (cur === row.projectId ? null : row.projectId));
          },
        }}
      />

      <p className="mt-3 text-xs text-muted-foreground">
        {data.coveredProjects.toLocaleString()} of {data.totalProjects.toLocaleString()} projects
        have membership data (ACC sync {data.memberCoveredProjects.toLocaleString()} · DC{" "}
        {data.dcCoveredProjects.toLocaleString()}); the rest are invisible to both sources.
        Admins deduped across sources by email.
        {!expanded && data.rows.length > DEFAULT_TOP_N &&
          ` Showing top ${DEFAULT_TOP_N} of ${data.rows.length.toLocaleString()} projects.`}
      </p>

      {data.rows.length > DEFAULT_TOP_N && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded
            ? `Showing all ${data.rows.length.toLocaleString()} — collapse to top ${DEFAULT_TOP_N}`
            : `Show all ${data.rows.length.toLocaleString()} projects`}
        </button>
      )}

      {data.zeroAdminProjects.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowZero((v) => !v)}
            data-testid="zero-admin-toggle"
            className="text-xs font-medium text-amber-500 hover:underline"
          >
            ⚠ {data.zeroAdminProjects.length.toLocaleString()} covered{" "}
            {data.zeroAdminProjects.length === 1 ? "project has" : "projects have"} no flagged admin
          </button>
          {showZero && (
            <ul
              className="mt-2 max-h-60 list-none space-y-0.5 overflow-auto pr-1"
              style={{ columnWidth: "260px", columnGap: "1.5rem" }}
            >
              {data.zeroAdminProjects.map((p) => (
                <li key={p.projectId} className="break-inside-avoid truncate px-2 py-0.5 text-xs text-foreground/85">
                  {p.projectName}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {drillRow && (
        <div data-testid="admins-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {drillRow.projectName}
              <span className="text-xs font-normal text-muted-foreground">
                {drillRow.adminCount} {drillRow.adminCount === 1 ? "admin" : "admins"}
                {drillRow.unresolvedDcAdmins > 0 && ` · ${drillRow.unresolvedDcAdmins} without email`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDrill(null)}
              aria-label="Close breakdown"
              className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <ul className="max-h-80 list-none space-y-0.5 overflow-auto pr-1" style={{ columnWidth: "300px", columnGap: "1.5rem" }}>
            {drillRow.admins.map((a) => (
              <li key={a.email} className="break-inside-avoid truncate px-2 py-1 text-xs text-foreground/85">
                {a.name || a.email}
                <span className="ml-1 text-muted-foreground">
                  {a.name ? `· ${a.email}` : ""} {a.fromMember && a.fromDc ? "· both sources" : a.fromDc ? "· DC" : "· ACC"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
