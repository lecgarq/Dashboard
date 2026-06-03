"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/core/trpc";
import { cn } from "@/lib/core/utils";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

export function ComplianceScanPanel() {
  const query = trpc.accMembers.getGovernanceCompliance.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const [activeSeverity, setActiveSeverity] = useState<"all" | "critical" | "warning" | "info" | null>(null);
  const [activeWarningType, setActiveWarningType] = useState<string | null>(null);

  if (query.isLoading) {
    return (
      <div className="rounded-lg border bg-card p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-6 w-1/4 bg-muted rounded" />
        <div className="h-4 w-1/2 bg-muted rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-3" />
        <h3 className="text-lg font-semibold text-destructive">Compliance Scan Error</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {query.error?.message || "Failed to fetch security compliance audit results."}
        </p>
      </div>
    );
  }

  const { score, violations, metrics } = query.data;

  // Filter violations based on selected severity AND selected warning type
  const filteredViolations = activeSeverity === null
    ? []
    : violations.filter((v) => {
        const severityMatch = activeSeverity === "all" || v.severity === activeSeverity;
        const warningTypeMatch = !activeWarningType || v.title === activeWarningType;
        return severityMatch && warningTypeMatch;
      });

  // Group findings by type (title) so each warning category reads as a
  // subsection with its own sub-findings, ordered by severity then volume.
  const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const groupedViolations = Array.from(
    filteredViolations
      .reduce((map, v) => {
        const list = map.get(v.title) ?? [];
        list.push(v);
        map.set(v.title, list);
        return map;
      }, new Map<string, typeof filteredViolations>())
      .entries(),
  ).sort((a, b) => {
    const sevDelta = (SEVERITY_ORDER[a[1][0].severity] ?? 9) - (SEVERITY_ORDER[b[1][0].severity] ?? 9);
    return sevDelta || b[1].length - a[1].length || a[0].localeCompare(b[0]);
  });

  // 1. Group ALL violations by type (title) for the ECharts visual breakdown
  const warningGroups = violations.reduce((acc, v) => {
    let entry = acc.get(v.title);
    if (!entry) {
      entry = { title: v.title, count: 0, severity: v.severity };
      acc.set(v.title, entry);
    }
    entry.count++;
    return acc;
  }, new Map<string, { title: string; count: number; severity: string }>());

  // 2. Sort by count ascending (so highest is at the top of a bottom-up horizontal bar chart)
  const chartData = Array.from(warningGroups.values()).sort((a, b) => a.count - b.count);

  const severityColors: Record<string, string> = {
    critical: "#f43f5e", // Rose 500
    warning: "#f59e0b", // Amber 500
    info: "#3b82f6",    // Blue 500
  };

  const chartOption: EChartsOption = {
    grid: {
      left: 110, // Left margin for title labels
      right: 15,
      top: 5,
      bottom: 20,
    },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: {
        lineStyle: {
          color: "rgba(148, 163, 184, 0.1)",
        },
      },
      axisLabel: {
        fontSize: 8,
        color: "rgba(148, 163, 184, 0.55)",
      },
    },
    yAxis: {
      type: "category",
      data: chartData.map((item) => item.title),
      axisLabel: {
        fontSize: 8,
        color: "rgba(255, 255, 255, 0.75)",
        formatter: (value: string) => {
          // Truncate long categories for display
          return value.length > 20 ? `${value.slice(0, 18)}...` : value;
        },
      },
      axisLine: {
        lineStyle: {
          color: "rgba(148, 163, 184, 0.15)",
        },
      },
      axisTick: { show: false },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const item = params[0];
        return `<div class="text-xs p-1">
          <strong>${item.name}</strong><br/>
          <span style="opacity: 0.7">Findings:</span> <strong>${item.value}</strong>
        </div>`;
      },
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "rgba(148, 163, 184, 0.2)",
      textStyle: { color: "#fff" },
    },
    series: [
      {
        type: "bar",
        barWidth: "60%",
        data: chartData.map((item) => ({
          value: item.count,
          name: item.title,
          itemStyle: {
            color: severityColors[item.severity] || "#6366f1",
            borderRadius: [0, 4, 4, 0],
          },
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0,0,0,0.3)",
          },
        },
      },
    ],
  };

  const onChartClick = (params: any) => {
    if (params.name) {
      setActiveWarningType(params.name);
      setActiveSeverity("all"); // Auto-expand details
    }
  };

  const eventHandlers = {
    click: onChartClick,
  };

  // Score status configuration
  const scoreConfig =
    score >= 90
      ? { color: "text-emerald-500", stroke: "#10b981", bg: "bg-emerald-500/10", label: "Excellent" }
      : score >= 75
      ? { color: "text-amber-500", stroke: "#f59e0b", bg: "bg-amber-500/10", label: "Warning" }
      : { color: "text-rose-500", stroke: "#ef4444", bg: "bg-rose-500/10", label: "Critical" };

  return (
    <Card className="border shadow-md overflow-hidden bg-card/60 backdrop-blur-sm transition-all duration-300">
      <CardHeader className="border-b bg-card/40 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-500" />
              Active Security &amp; Compliance Audit
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Live automated scanning of identity attribution, administrator drift, and high-impact anomalies.
            </CardDescription>
          </div>
          <Badge className="text-xs px-2.5 py-0.5 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20" variant="outline">
            Continuous Scan Active
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Top summary layout with health score */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Health score circle */}
          <button
            onClick={() => {
              setActiveSeverity(activeSeverity === "all" ? null : "all");
              setActiveWarningType(null);
            }}
            className={cn(
              "lg:col-span-3 flex flex-col items-center justify-center p-6 border rounded-xl relative overflow-hidden group transition-all duration-200 text-center w-full focus:outline-none focus:ring-2 focus:ring-indigo-500/40 bg-card/20 hover:bg-card/45 border-border"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative h-28 w-28 flex items-center justify-center mx-auto">
              <svg className="absolute inset-0 transform -rotate-90 w-full h-full">
                <circle cx="56" cy="56" r="48" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="8" fill="transparent" />
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  stroke={scoreConfig.stroke}
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray="301.6"
                  strokeDashoffset={301.6 - (301.6 * score) / 100}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="text-center">
                <span className="text-3xl font-extrabold tracking-tight">{score}</span>
                <span className="text-xs text-muted-foreground block font-medium">Score</span>
              </div>
            </div>
            
            <div className={cn("mt-3 px-3 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider", scoreConfig.bg, scoreConfig.color)}>
              {scoreConfig.label}
            </div>

            <div className="mt-2 text-[10px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity duration-200 font-medium">
              {activeSeverity === "all" ? "Click to collapse" : "Click to view all issues"}
            </div>
          </button>

          {/* Metric cards (stacked vertically) */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            <button
              onClick={() => {
                setActiveSeverity(activeSeverity === "critical" ? null : "critical");
                setActiveWarningType(null);
              }}
              className={cn(
                "p-3.5 rounded-xl border text-left transition-all duration-200 flex items-center justify-between group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-rose-500/40",
                activeSeverity === "critical"
                  ? "bg-rose-500/10 border-rose-500/40 ring-1 ring-rose-500/20"
                  : "bg-card/20 hover:bg-card/45"
              )}
            >
              <div className="min-w-0 pr-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-500 dark:text-rose-400 block">Critical Issues</span>
                <span className="text-lg font-black mt-0.5 block leading-none">{metrics.criticalCount}</span>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">External leaks or orphans</p>
              </div>
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 group-hover:scale-110 transition-transform" />
            </button>

            <button
              onClick={() => {
                setActiveSeverity(activeSeverity === "warning" ? null : "warning");
                setActiveWarningType(null);
              }}
              className={cn(
                "p-3.5 rounded-xl border text-left transition-all duration-200 flex items-center justify-between group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-amber-500/40",
                activeSeverity === "warning"
                  ? "bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/20"
                  : "bg-card/20 hover:bg-card/45"
              )}
            >
              <div className="min-w-0 pr-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400 block">Warnings</span>
                <span className="text-lg font-black mt-0.5 block leading-none">{metrics.warningCount}</span>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">Inactive admins &amp; velocity spikes</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 group-hover:scale-110 transition-transform" />
            </button>

            <button
              onClick={() => {
                setActiveSeverity(activeSeverity === "info" ? null : "info");
                setActiveWarningType(null);
              }}
              className={cn(
                "p-3.5 rounded-xl border text-left transition-all duration-200 flex items-center justify-between group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/40",
                activeSeverity === "info"
                  ? "bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/20"
                  : "bg-card/20 hover:bg-card/45"
              )}
            >
              <div className="min-w-0 pr-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 block">Info Notices</span>
                <span className="text-lg font-black mt-0.5 block leading-none">{metrics.infoCount}</span>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">Policy compliance references</p>
              </div>
              <Info className="h-5 w-5 text-blue-500 shrink-0 group-hover:scale-110 transition-transform" />
            </button>
          </div>

          {/* ECharts Interactive Warnings Breakdown Chart */}
          <div className="lg:col-span-5 rounded-xl border bg-card/10 border-border p-4 flex flex-col justify-between h-full relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <header className="flex items-center justify-between border-b border-border/40 pb-2 mb-2 shrink-0">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Findings by Warning Type</h3>
                <p className="text-[9px] text-muted-foreground mt-0.5">Click a bar to filter findings by vector</p>
              </div>
              {activeWarningType && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-[9px] h-5 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 font-bold"
                  onClick={() => setActiveWarningType(null)}
                >
                  Reset
                </Button>
              )}
            </header>
            <div className="grow w-full min-h-[140px] flex items-center justify-center">
              {violations.length === 0 ? (
                <span className="text-[10px] text-muted-foreground italic">No findings to chart</span>
              ) : (
                <ReactECharts
                  option={chartOption}
                  onEvents={eventHandlers}
                  style={{ height: "100%", width: "100%" }}
                  notMerge
                  lazyUpdate
                />
              )}
            </div>
          </div>
        </div>

        {/* Audit feed filters */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Filter audit logs:</span>
            <Button
              variant={activeSeverity === "all" ? "default" : "outline"}
              size="xs"
              className="text-[10px] h-6"
              onClick={() => setActiveSeverity(activeSeverity === "all" ? null : "all")}
            >
              All ({violations.length})
            </Button>
            <Button
              variant={activeSeverity === "critical" ? "default" : "outline"}
              size="xs"
              className="text-[10px] h-6"
              onClick={() => setActiveSeverity(activeSeverity === "critical" ? null : "critical")}
            >
              Critical ({metrics.criticalCount})
            </Button>
            <Button
              variant={activeSeverity === "warning" ? "default" : "outline"}
              size="xs"
              className="text-[10px] h-6"
              onClick={() => setActiveSeverity(activeSeverity === "warning" ? null : "warning")}
            >
              Warnings ({metrics.warningCount})
            </Button>
            <Button
              variant={activeSeverity === "info" ? "default" : "outline"}
              size="xs"
              className="text-[10px] h-6"
              onClick={() => setActiveSeverity(activeSeverity === "info" ? null : "info")}
            >
              Info ({metrics.infoCount})
            </Button>
            {activeSeverity !== null && (
              <Button
                variant="ghost"
                size="xs"
                className="text-[10px] h-6 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 font-bold ml-2"
                onClick={() => setActiveSeverity(null)}
              >
                Collapse Details
              </Button>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
            Auditing {metrics.auditedUsersCount.toLocaleString()} workspace identities
          </span>
        </div>

        {/* Active Warning Type Filter Banner */}
        {activeWarningType && activeSeverity !== null && (
          <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/20 px-4 py-2.5 rounded-lg text-xs animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-indigo-400">Filtered by Vector:</span>
              <span className="font-bold text-foreground">{activeWarningType}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium bg-indigo-500/20 text-indigo-300">
                {filteredViolations.length} {filteredViolations.length === 1 ? "finding" : "findings"}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="text-[10px] h-6 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 font-bold"
              onClick={() => setActiveWarningType(null)}
            >
              Clear Filter
            </Button>
          </div>
        )}

        {/* Violations List */}
        <div className="space-y-3">
          {activeSeverity === null ? (
            <div className="flex flex-col items-center justify-center p-8 border border-dashed border-indigo-500/20 rounded-xl bg-indigo-500/[0.02] text-center py-12">
              <ShieldAlert className="h-10 w-10 text-indigo-500/60 mb-3 animate-pulse" />
              <p className="text-sm font-bold text-foreground/90">Audit Details Collapsed</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-md leading-relaxed">
                The compliance audit has detected <span className="font-semibold text-foreground">{violations.length} total findings</span>. Click the circular health score gauge or any of the severity metric cards above to expand the detailed report.
              </p>
            </div>
          ) : filteredViolations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-xl bg-card/20 text-center">
              <CheckCircle className="h-10 w-10 text-emerald-500 mb-2" />
              <p className="text-sm font-semibold">No active violations detected</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                No configurations found for the selected category matching compliance concerns.
              </p>
            </div>
          ) : (
            groupedViolations.map(([groupTitle, items]) => {
              const groupSeverity = items[0].severity;
              const dotCol =
                groupSeverity === "critical"
                  ? "bg-rose-500"
                  : groupSeverity === "warning"
                  ? "bg-amber-500"
                  : "bg-blue-500";
              const groupBorder =
                groupSeverity === "critical"
                  ? "border-rose-500/25"
                  : groupSeverity === "warning"
                  ? "border-amber-500/25"
                  : "border-blue-500/25";

              return (
                <div
                  key={groupTitle}
                  className={cn("rounded-xl border bg-card/20 overflow-hidden", groupBorder)}
                >
                  {/* Category header — the "type of warning" */}
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b bg-card/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <span aria-hidden className={cn("h-2 w-2 rounded-full shrink-0", dotCol)} />
                      <h4 className="text-xs font-bold tracking-tight truncate">{groupTitle}</h4>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-px uppercase tracking-wider font-semibold shrink-0",
                          groupSeverity === "critical"
                            ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                            : groupSeverity === "warning"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                        )}
                      >
                        {groupSeverity}
                      </Badge>
                    </div>
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-semibold shrink-0">
                      {items.length} {items.length === 1 ? "finding" : "findings"}
                    </Badge>
                  </div>

                  {/* Sub-findings within this category */}
                  <div className="divide-y divide-border/40">
                    {items.map((violation) => (
                      <div
                        key={violation.id}
                        className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-start transition-colors duration-200 hover:bg-card/30"
                      >
                        <div className="space-y-1.5 min-w-0">
                          {violation.projectName && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                              {violation.projectName}
                            </Badge>
                          )}
                          <p className="text-xs text-card-foreground/80 leading-relaxed max-w-2xl">
                            {violation.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground pt-1">
                            {violation.userName && (
                              <span>
                                Identity: <span className="font-semibold text-foreground/80">{violation.userName}</span>
                              </span>
                            )}
                            {violation.userEmail && (
                              <span>
                                Email: <span className="font-semibold text-foreground/80">{violation.userEmail}</span>
                              </span>
                            )}
                            {violation.subjectLabel && (
                              <span>
                                Scope: <span className="font-semibold text-foreground/80">{violation.subjectLabel}</span>
                              </span>
                            )}
                            {violation.timestamp && (
                              <span>
                                Logged: <span className="font-semibold text-foreground/80">{new Date(violation.timestamp).toLocaleString()}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Recommendation action box */}
                        <div className="w-full sm:w-auto shrink-0 flex flex-col items-end gap-1.5 border-t sm:border-t-0 pt-2 sm:pt-0">
                          <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Action recommendation</span>
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background font-semibold text-indigo-500 border-indigo-500/20">
                            {violation.recommendation}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
