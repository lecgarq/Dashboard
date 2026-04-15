"use client";

import dynamic from "next/dynamic";
import { format } from "date-fns";
import { Activity, CalendarClock, CheckCircle2, Sparkles, Users2 } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { trpc } from "@/lib/trpc";

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

      <div className="custom-scrollbar flex flex-1 flex-col overflow-hidden p-6 space-y-6">
        <section className="surface-card animate-fade-up relative overflow-hidden rounded-[2rem] border px-6 py-6 sm:px-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.14),transparent_24%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="surface-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Daily overview
              </div>
            </div>

            <div className="surface-panel flex items-center gap-3 rounded-2xl px-4 py-4 text-sm text-slate-600">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">
                  Next milestone
                </p>
                <p className="font-medium text-slate-900">{milestoneLabel}</p>
              </div>
            </div>
          </div>

          <div className="relative mt-6 grid gap-4 lg:grid-cols-3">
            {stats.map((stat) => {
              const Icon = stat.icon;

              return (
                <div
                  key={stat.label}
                  className="surface-panel surface-card-hover rounded-[1.5rem] p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        {stat.label}
                      </p>
                      <p className="font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                        {stat.value}
                      </p>
                      <p className="text-sm text-slate-600">{stat.detail}</p>
                    </div>
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${stat.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="ui-paper flex flex-1 flex-col overflow-hidden animate-fade-up">
          <DashboardCalendar />
        </div>
      </div>
    </div>
  );
}
