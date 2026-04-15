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
} from "date-fns";
import { cn } from "@/lib/utils";

interface CheckItem {
  id: string;
  name: string;
  state: "complete" | "incomplete";
  due: string | null;
  cardDue: string;
}

interface GCalEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  htmlLink: string | null;
  color: string | null;
  description: string | null;
  location: string | null;
  meetLink: string | null;
  attendees: { email: string; displayName?: string | null; responseStatus?: string | null; resource?: boolean }[];
  organizer: { email: string; displayName?: string | null; self?: boolean } | null;
  status: string | null;
}

interface Props {
  date: Date;
  items: CheckItem[];
  optimistic: Record<string, "complete" | "incomplete">;
  gcalEvents?: GCalEvent[];
  onGCalEventClick?: (event: GCalEvent) => void;
}

export function SemesterView({ date, items, optimistic, gcalEvents = [], onGCalEventClick }: Props) {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(startOfMonth(date), i));

  const getCountForDay = (day: Date) =>
    items.filter((item) => isSameDay(new Date(item.due ?? item.cardDue), day)).length;

  const getPendingForDay = (day: Date) =>
    items.filter((item) => {
      if (!isSameDay(new Date(item.due ?? item.cardDue), day)) return false;
      return (optimistic[item.id] ?? item.state) === "incomplete";
    }).length;

  const getGcalForDay = (day: Date) =>
    gcalEvents.filter((ev) => isSameDay(new Date(ev.start), day));

  return (
    <div className="flex-1 grid grid-cols-3 gap-4 p-4 overflow-y-auto custom-scrollbar">
      {months.map((month) => {
        const days = eachDayOfInterval({
          start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
          end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
        }).filter((d) => !isWeekend(d));

        const monthTotal = items.filter((item) => {
          const d = new Date(item.due ?? item.cardDue);
          return isSameMonth(d, month);
        }).length;

        return (
          <div key={month.toISOString()} className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-3">
            {/* Month header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-[600] text-foreground/80">
                {format(month, "MMMM yyyy")}
              </span>
              {monthTotal > 0 && (
                <span className="text-[9px] font-[700] px-1.5 py-px rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                  {monthTotal}
                </span>
              )}
            </div>

            {/* Mini grid */}
            <div className="grid grid-cols-5 gap-px">
              {["M", "T", "W", "T", "F"].map((d, i) => (
                <div key={`${d}-${i}`} className="text-center text-[8px] font-[700] text-muted-foreground/40 pb-1">
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const inMonth = isSameMonth(day, month);
                const count = getCountForDay(day);
                const pending = getPendingForDay(day);
                const isCurrentDay = isToday(day);
                const dayGcal = getGcalForDay(day);
                const now = new Date();

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center rounded-md text-[9px] font-[500] relative cursor-pointer",
                      !inMonth && "opacity-0",
                      isCurrentDay && "ring-1 ring-primary/40",
                      dayGcal.length > 0 && "ring-1 ring-purple-400/20"
                    )}
                    title={[
                      count > 0 ? `${pending} tasks pending` : "",
                      dayGcal.length > 0 ? `${dayGcal.length} event(s)` : ""
                    ].filter(Boolean).join(" · ") || undefined}
                    onClick={() => dayGcal.length === 1 && onGCalEventClick?.(dayGcal[0])}
                  >
                    {count > 0 && (
                      <div className={cn(
                        "absolute inset-0 rounded-md",
                        pending > 0
                          ? pending > 3 ? "bg-blue-500/30" : pending > 1 ? "bg-blue-500/20" : "bg-blue-500/10"
                          : "bg-green-500/15"
                      )} />
                    )}
                    <span className={cn(
                      "relative z-10",
                      inMonth ? "text-foreground/50" : "text-transparent"
                    )}>
                      {format(day, "d")}
                    </span>
                    {dayGcal.length > 0 && (
                      <div className="flex gap-px mt-px z-10">
                        {dayGcal.slice(0, 3).map((ev) => {
                          const isPast = ev.end ? new Date(ev.end) < now : new Date(ev.start) < now;
                          return (
                            <span
                              key={ev.id}
                              className={cn(
                                "w-1 h-1 rounded-full",
                                isPast ? "bg-muted-foreground/40" : "bg-purple-400"
                              )}
                            />
                          );
                        })}
                      </div>
                    )}
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
