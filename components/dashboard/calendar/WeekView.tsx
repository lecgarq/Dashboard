"use client";

import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  isSameDay,
  format,
  isWeekend,
} from "date-fns";
import { CheckSquare, Square, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckItem {
  id: string;
  name: string;
  state: "complete" | "incomplete";
  due: string | null;
  cardId: string;
  cardName: string;
  cardDue: string;
  checklistId: string;
  checklistName: string;
}

interface Props {
  date: Date;
  items: CheckItem[];
  optimistic: Record<string, "complete" | "incomplete">;
  onToggle: (item: CheckItem) => void;
  onCreateAt: (date: Date) => void;
}

export function WeekView({ date, items, optimistic, onToggle, onCreateAt }: Props) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).filter((d) => !isWeekend(d));

  const getItemsForDay = (day: Date) =>
    items.filter((item) => isSameDay(new Date(item.due ?? item.cardDue), day));

  return (
    <div className="flex-1 flex flex-col gap-3 p-4 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-5 gap-3">
        {weekDays.map((day) => (
          <div key={day.toISOString()} className="text-center">
            <span className="text-[10px] font-[700] uppercase tracking-widest text-muted-foreground/60">
              {format(day, "EEE")}
            </span>
            <div className="mt-1">
              <span className={cn(
                "inline-flex items-center justify-center w-7 h-7 rounded-full text-[13px] font-[600]",
                isToday(day) ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70"
              )}>
                {format(day, "d")}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Day columns */}
      <div className="flex-1 grid grid-cols-5 gap-3 overflow-y-auto custom-scrollbar">
        {weekDays.map((day) => {
          const dayItems = getItemsForDay(day);
          const sorted = [...dayItems].sort((a, b) => {
            const sa = optimistic[a.id] ?? a.state;
            const sb = optimistic[b.id] ?? b.state;
            return sa === sb ? 0 : sa === "incomplete" ? -1 : 1;
          });

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "group/col flex flex-col rounded-2xl border p-2 transition-all",
                isToday(day)
                  ? "bg-primary/[0.04] border-primary/20"
                  : "bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04]"
              )}
            >
              {/* Add button */}
              <button
                onClick={() => onCreateAt(day)}
                className="opacity-0 group-hover/col:opacity-100 mb-2 flex items-center justify-center gap-1 py-1 rounded-lg bg-white/[0.04] hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all text-[9px] font-[600]"
              >
                <Plus className="w-3 h-3" /> Add
              </button>

              {/* Items */}
              <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar">
                {sorted.map((item) => {
                  const state = optimistic[item.id] ?? item.state;
                  const done = state === "complete";
                  return (
                    <button
                      key={item.id}
                      onClick={() => onToggle(item)}
                      className={cn(
                        "w-full text-left flex items-start gap-1.5 px-2 py-1.5 rounded-lg border transition-all duration-150",
                        done
                          ? "bg-green-500/[0.04] border-green-500/10 hover:bg-green-500/10"
                          : "bg-blue-500/[0.06] border-blue-500/15 hover:bg-blue-500/10"
                      )}
                    >
                      {done
                        ? <CheckSquare className="w-3 h-3 shrink-0 mt-0.5 text-green-400" />
                        : <Square className="w-3 h-3 shrink-0 mt-0.5 text-blue-400" />
                      }
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          "text-[10px] font-[500] leading-snug line-clamp-3",
                          done ? "line-through text-foreground/40" : "text-foreground/85"
                        )}>
                          {item.name}
                        </span>
                        <span className="block text-[9px] text-muted-foreground/50 truncate mt-0.5">
                          {item.cardName}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
