"use client";

import dynamic from "next/dynamic";
import { format } from "date-fns";
import { Activity, CalendarClock, CheckCircle2, Sparkles, Users2 } from "lucide-react";


import { Header } from "@/components/layout/Header";
import { trpc } from "@/lib/core/trpc";

const DashboardCalendar = dynamic(
  () => import("@/components/dashboard/DashboardCalendar").then((m) => m.DashboardCalendar),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  }
);

export default function HomeClient() {
  const { data: dashboard } = trpc.kpi.getHomeDashboard.useQuery(undefined, {
    staleTime: 60_000,
  });

  const stats = [
    {
      label: "Families complete",
      value: `${dashboard?.families.rate ?? 0}%`,
      detail: `${dashboard?.families.done ?? 0} of ${dashboard?.families.total ?? 0} delivered`,
      icon: CheckCircle2,
      tone: "from-sky-500/14 to-sky-500/6 text-sky-700",
    },
    {
      label: "Clash QA",
      value: `${dashboard?.clash.rate ?? 0}%`,
      detail: `${dashboard?.clash.done ?? 0} of ${dashboard?.clash.total ?? 0} resolved`,
      icon: Activity,
      tone: "from-amber-500/14 to-amber-500/6 text-amber-700",
    },
    {
      label: "Team load",
      value: `${dashboard?.capacity ?? 0}%`,
      detail: `${dashboard?.userCount ?? 0} active contributors`,
      icon: Users2,
      tone: "from-emerald-500/14 to-emerald-500/6 text-emerald-700",
    },
  ];

  const milestoneLabel = dashboard?.nearestMilestone
    ? `${dashboard.nearestMilestone.label} on ${format(dashboard.nearestMilestone.date, "MMM d")}`
    : "No upcoming milestone tracked yet";

  return (
    <div className="flex h-full flex-col bg-transparent">
      <Header title="Mission Control" />

      {/* Compact stats bar */}
      <div className="shrink-0 border-b border-border/40 bg-card/30 backdrop-blur-sm px-4 py-2 flex items-center gap-2 flex-wrap">
        <div className="surface-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          <Sparkles className="h-3 w-3" />
          Daily overview
        </div>

        <div className="h-4 w-px bg-border/50 mx-1" />

        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-center gap-2 px-3 py-1.5 rounded-xl surface-panel">
              <div className={`flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br ${stat.tone}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs text-slate-400">{stat.label}</span>
              <span className="text-xs font-semibold text-slate-900">{stat.value}</span>
              <span className="text-[10px] text-slate-400 hidden sm:inline">{stat.detail}</span>
            </div>
          );
        })}

        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl surface-panel">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Next</span>
          <span className="text-xs font-medium text-slate-900">{milestoneLabel}</span>
        </div>
      </div>

      {/* Calendar fills remaining height */}
      <div className="ui-paper flex flex-1 flex-col overflow-hidden">
        <DashboardCalendar />
      </div>
    </div>
  );
}
