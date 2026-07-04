"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import { buildRoleColorMap } from "../roleColors";
import { DEFAULT_TOP_N, summarizeFolderActivityByCompany } from "../folderActivityByCompanyCounts";
import type { MembershipCompanyInput } from "../companyActivityCounts";
import type { FolderActivityActorRow, CompanyFolderSlice } from "@/lib/server/folderActivityByCompanyView";

const OTHER_COLOR = "#71717a"; // zinc-500 — the folded "Other" tail
const isOther = (company: string) => company.startsWith("Other (");

// ACC company/folder names are third-party data rendered into tooltip HTML via innerHTML
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Folder-activity-by-company panel (UAT-6): horizontal bars, one per top-10
 * company (by folder-scoped activity) + "Other", sourced from the small
 * headline aggregate (`loadFolderScopedActivity` — 10,566 rows live, never
 * the account-wide 190,049-row company x folder cross product). Clicking a
 * company lazily fetches that company's top-folder breakdown, scoped to just
 * that company's member emails and the caller's selected projects — bounded
 * by construction (20.1-RESEARCH.md §5 / Pitfall 3). "Other" and companies
 * with no attributable members don't drill. Built UNMOUNTED; plan 20.1-06
 * mounts it in the Companies tab.
 */
export function FolderActivityByCompanyChart({
  rows,
  memberships,
  selectedProjectIds,
  loadFolderBreakdown,
  coverage,
  onUserClick,
}: {
  rows: FolderActivityActorRow[];
  memberships: MembershipCompanyInput[];
  selectedProjectIds: string[];
  loadFolderBreakdown: (emails: string[], projectIds: string[]) => Promise<CompanyFolderSlice[] | null>;
  /** Live accds project-coverage counts — parent passes this, never hardcoded. */
  coverage?: { covered: number; total: number };
  onUserClick?: (email: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves
  const [drill, setDrill] = useState<string | null>(null);
  const [drillCache, setDrillCache] = useState<Record<string, CompanyFolderSlice[]>>({});
  const [loadingCompany, setLoadingCompany] = useState<string | null>(null);
  // UAT gap-closure item 3: clicking "Other (N companies)" reveals the folded
  // companies as their own bars/legend rows instead of being a dead end — same
  // expand-in-place pattern as RolesPieChart's Others slice (topN -> Infinity,
  // no separate data fetch, no new loader).
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(
    () => summarizeFolderActivityByCompany(rows, memberships, expanded ? rows.length : DEFAULT_TOP_N),
    [rows, memberships, expanded],
  );

  const colorByCompany = useMemo(
    () => buildRoleColorMap(summary.bars.filter((b) => !isOther(b.company)).map((b) => b.company)),
    [summary.bars],
  );
  const colorFor = (company: string) => (isOther(company) ? OTHER_COLOR : colorByCompany.get(company) ?? "#888");

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";
  const cAxis = dark ? "#3f3f46" : "#e5e7eb";

  if (rows.length === 0) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7h18M3 12h12M3 17h8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No folder-scoped activity for this view
      </div>
    );
  }

  const toggleDrill = async (bar: { company: string; memberEmails: string[] }) => {
    if (isOther(bar.company)) {
      setExpanded(true); // reveal the folded companies as their own bars — no drill entry for "Other" itself
      return;
    }
    if (bar.memberEmails.length === 0) return; // no attributable members to drill into
    if (drill === bar.company) {
      setDrill(null);
      return;
    }
    setDrill(bar.company);
    if (drillCache[bar.company]) return; // already fetched once — cached, no re-call
    setLoadingCompany(bar.company);
    try {
      const result = await loadFolderBreakdown(bar.memberEmails, selectedProjectIds);
      setDrillCache((cur) => ({ ...cur, [bar.company]: result ?? [] }));
    } finally {
      setLoadingCompany((cur) => (cur === bar.company ? null : cur));
    }
  };

  const ordered = [...summary.bars].reverse(); // category axis renders bottom-up

  const option: EChartsOption = {
    grid: { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      padding: [8, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number };
        return `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${escapeHtml(p.name)}</div><div style="color:${cSub}">${p.value.toLocaleString()} folder-scoped activity events</div>`;
      },
    },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: { color: cSub },
      splitLine: { lineStyle: { color: cAxis, opacity: 0.4 } },
    },
    yAxis: {
      type: "category",
      data: ordered.map((b) => b.company),
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: { color: cTitle },
    },
    series: [
      {
        name: "Folder activity by company",
        type: "bar",
        cursor: "pointer",
        barWidth: "58%",
        data: ordered.map((b) => ({
          value: b.count,
          itemStyle: { color: colorFor(b.company), borderRadius: [0, 5, 5, 0] },
        })),
        label: { show: true, position: "right", color: cSub, formatter: "{c}" },
        animationDuration: 700,
        animationEasing: "cubicOut",
      },
    ],
  };

  const drillBar = drill ? summary.bars.find((b) => b.company === drill) : undefined;
  const drillFolders = drill ? drillCache[drill] ?? [] : [];
  const drillUsers = drill ? summary.usersByCompany.get(drill) ?? [] : [];
  const isLoadingDrill = drill !== null && loadingCompany === drill;

  return (
    <div className="panel-elevated p-5">
      <EChart
        option={option}
        height={Math.max(200, summary.bars.length * 38 + 40)}
        notMerge={false}
        onEvents={{
          click: (p) => {
            const bar = summary.bars.find((b) => b.company === p.name);
            if (bar) void toggleDrill(bar);
          },
        }}
      />

      {drill && (
        <div data-testid="folder-activity-by-company-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(drill) }} aria-hidden />
              {drill}
              <span className="text-xs font-normal text-muted-foreground">
                {(drillBar?.count ?? 0).toLocaleString()} folder-scoped activity events
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

          {isLoadingDrill ? (
            <div data-testid="folder-activity-drill-loading" className="py-3 text-center text-xs text-muted-foreground">
              Loading folder breakdown…
            </div>
          ) : (
            <>
              <p className="mb-1 text-xs font-medium text-foreground/80">Top folders</p>
              <ul data-testid="folder-activity-drill-folders" className="mb-3 max-h-48 list-none space-y-0.5 overflow-auto pr-1">
                {drillFolders.length === 0 ? (
                  <li className="px-2 py-1 text-xs text-muted-foreground">No folder-level activity for this company.</li>
                ) : (
                  drillFolders.map((f) => (
                    <li key={f.folderName} className="flex items-center justify-between truncate px-2 py-1 text-xs text-foreground/85">
                      <span className="truncate">{f.folderName}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{f.count.toLocaleString()}</span>
                    </li>
                  ))
                )}
              </ul>

              <p className="mb-1 text-xs font-medium text-foreground/80">Top contributing users</p>
              <ul data-testid="folder-activity-drill-users" className="list-none space-y-0.5">
                {drillUsers.slice(0, 10).map((u) => (
                  <li key={u.email}>
                    <button
                      type="button"
                      onClick={() => onUserClick?.(u.email)}
                      disabled={!onUserClick}
                      className={`flex w-full items-center justify-between truncate rounded-md px-2 py-1 text-left text-xs text-foreground/85 ${
                        onUserClick ? "hover:bg-accent hover:text-foreground" : "cursor-default"
                      }`}
                    >
                      <span className="truncate">{u.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{u.count.toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ul
        data-testid="folder-activity-by-company-legend"
        className="mt-3 list-none border-t border-border pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {summary.bars.map((b) => {
          const open = drill === b.company;
          const others = isOther(b.company);
          // "Other" is always clickable (expands the fold); a real company with
          // no attributable member emails has nothing to drill into.
          const noDrill = !others && b.memberEmails.length === 0;
          return (
            <li key={b.company} className="mb-1 break-inside-avoid">
              <button
                type="button"
                aria-expanded={open}
                disabled={noDrill}
                onClick={() => void toggleDrill(b)}
                title={
                  others
                    ? "Show every folded company"
                    : `${b.company} — ${b.count.toLocaleString()} folder-scoped activity events`
                }
                className={`group relative flex min-w-0 w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors ${
                  noDrill ? "cursor-default text-muted-foreground" : "hover:bg-accent text-foreground/85"
                } ${open ? "bg-accent text-foreground" : ""}`}
              >
                <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(b.company) }} />
                <span className="relative flex-1 truncate">{b.company}</span>
                <span className="relative shrink-0 tabular-nums text-foreground">{b.count.toLocaleString()}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {expanded && (
        <button
          type="button"
          onClick={() => {
            // While expanded, summary.bars is the full sorted list (nothing folded)
            // — a drilled company beyond the top-N cutoff would fold into "Other"
            // on collapse and its drilldown would otherwise show stale/empty data.
            const rank = drill ? summary.bars.findIndex((b) => b.company === drill) : -1;
            if (rank >= DEFAULT_TOP_N) setDrill(null);
            setExpanded(false);
          }}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          Showing all {summary.bars.length} companies — collapse to top {DEFAULT_TOP_N}
        </button>
      )}

      {coverage && (
        <p data-testid="folder-activity-coverage-caption" className="mt-2 text-[10px] text-muted-foreground">
          Folder-scoped activity — accds covers {coverage.covered} of {coverage.total} projects.
        </p>
      )}
      <p data-testid="folder-activity-unknown-caption" className="mt-1 text-[10px] text-muted-foreground">
        Users with no company mapping appear as Unknown company.
      </p>
    </div>
  );
}
