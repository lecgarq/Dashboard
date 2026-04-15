"use client";

import { CheckSquare, ListChecks } from "lucide-react";
import type { CalendarView } from "./ViewSwitcher";

interface StatsProps {
  total: number;
  completed: number;
  pending: number;
  viewLabel: string;
}

export function CalendarStats({ total, completed, pending, viewLabel }: StatsProps) {
  return (
    <div className="hidden md:flex items-center gap-1.5">
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <ListChecks className="w-3 h-3 text-blue-400" />
        <span className="text-[10px] font-[700] text-blue-400">{pending}</span>
        <span className="text-[9px] font-[500] text-blue-400/70">pending</span>
      </div>
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20">
        <CheckSquare className="w-3 h-3 text-green-400" />
        <span className="text-[10px] font-[700] text-green-400">{completed}</span>
        <span className="text-[9px] font-[500] text-green-400/70">done</span>
      </div>
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
        <span className="text-[10px] font-[700] text-foreground/70">{total}</span>
        <span className="text-[9px] font-[500] text-foreground/50">{viewLabel}</span>
      </div>
    </div>
  );
}

export function computeStats(
  checkItems: { id: string; state: string; due: string | null; cardDue: string }[],
  optimistic: Record<string, "complete" | "incomplete">,
  rangeStart: Date,
  rangeEnd: Date,
  view: CalendarView
): StatsProps {
  const filtered = checkItems.filter((item) => {
    const d = new Date(item.due ?? item.cardDue);
    return d >= rangeStart && d <= rangeEnd;
  });
  const total = filtered.length;
  const completed = filtered.filter((item) => {
    const s = optimistic[item.id] ?? item.state;
    return s === "complete";
  }).length;
  const labels: Record<CalendarView, string> = {
    month: "this month",
    semester: "this semester",
    year: "this year",
  };
  return { total, completed, pending: total - completed, viewLabel: labels[view] };
}
