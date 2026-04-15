"use client";

import {
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  isWeekend,
  format,
  startOfYear,
} from "date-fns";
import { cn } from "@/lib/utils";

interface CheckItem {
  id: string;
  name: string;
  state: "complete" | "incomplete";
  due: string | null;
  cardDue: string;
}

interface Props {
  date: Date;
  items: CheckItem[];
  optimistic: Record<string, "complete" | "incomplete">;
  gcalEvents?: unknown[];
}

export function YearView({ date, items, optimistic }: Props) {
  const yearStart = startOfYear(date);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));

  const getCountForDay = (day: Date) =>
    items.filter((item) => isSameDay(new Date(item.due ?? item.cardDue), day)).length;

  const getPendingForDay = (day: Date) =>
    items.filter((item) => {
      const d = new Date(item.due ?? item.cardDue);
      if (!isSameDay(d, day)) return false;
      return (optimistic[item.id] ?? item.state) === "incomplete";
    }).length;

  const getMonthStats = (month: Date) => {
    const monthItems = items.filter((item) => isSameMonth(new Date(item.due ?? item.cardDue), month));
    const total = monthItems.length;
    const pending = monthItems.filter((item) => (optimistic[item.id] ?? item.state) === "incomplete").length;
    return { total, pending, done: total - pending };
  };

  return (
    <div className="flex-1 grid grid-cols-4 gap-3 p-4 overflow-y-auto custom-scrollbar">
      {months.map((month) => {
        const days = eachDayOfInterval({
          start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
          end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
        }).filter((d) => !isWeekend(d));

        const stats = getMonthStats(month);
        const isCurrent = isSameMonth(month, new Date());

        return (
          <div
            key={month.toISOString()}
            className={cn(
              "rounded-2xl border p-2.5 transition-all",
              isCurrent
                ? "bg-primary/[0.04] border-primary/20"
                : "bg-white/[0.02] border-white/[0.04]"
            )}
          >
            {/* Month header */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-[600] text-foreground/70">
                {format(month, "MMM")}
              </span>
              <div className="flex items-center gap-1">
                {stats.pending > 0 && (
                  <span className="text-[8px] font-[700] px-1 rounded bg-blue-500/15 text-blue-400">
                    {stats.pending}
                  </span>
                )}
                {stats.done > 0 && (
                  <span className="text-[8px] font-[700] px-1 rounded bg-green-500/15 text-green-400">
                    ✓{stats.done}
                  </span>
                )}
              </div>
            </div>

            {/* Mini grid */}
            <div className="grid grid-cols-5 gap-px">
              {days.map((day) => {
                const inMonth = isSameMonth(day, month);
                const count = getCountForDay(day);
                const pending = getPendingForDay(day);
                const current = isToday(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "aspect-square flex items-center justify-center text-[7px] font-[500] rounded relative",
                      !inMonth && "opacity-0",
                      current && "ring-1 ring-primary/50",
                    )}
                    title={count > 0 ? `${pending} pending / ${count} total` : ""}
                  >
                    {count > 0 && (
                      <div className={cn(
                        "absolute inset-0 rounded",
                        pending > 0
                          ? pending > 2 ? "bg-blue-500/30" : "bg-blue-500/15"
                          : "bg-green-500/15"
                      )} />
                    )}
                    <span className={cn(
                      "relative z-10",
                      inMonth ? "text-foreground/40" : ""
                    )}>
                      {format(day, "d")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
