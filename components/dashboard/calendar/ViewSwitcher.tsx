"use client";

import { cn } from "@/lib/utils";
import { Calendar, LayoutGrid, GanttChart } from "lucide-react";

export type CalendarView = "month" | "semester" | "year";

const views: { key: CalendarView; label: string; icon: typeof Calendar }[] = [
  { key: "month", label: "Month", icon: Calendar },
  { key: "semester", label: "Semester", icon: LayoutGrid },
  { key: "year", label: "Year", icon: GanttChart },
];

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: CalendarView;
  onChange: (v: CalendarView) => void;
}) {
  return (
    <div className="flex items-center bg-white/[0.03] p-0.5 rounded-xl border border-white/5">
      {views.map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-[600] uppercase tracking-wider transition-all",
            value === v.key
              ? "bg-primary/15 text-primary shadow-sm"
              : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/[0.04]"
          )}
        >
          <v.icon className="w-3 h-3" />
          <span className="hidden lg:inline">{v.label}</span>
        </button>
      ))}
    </div>
  );
}
