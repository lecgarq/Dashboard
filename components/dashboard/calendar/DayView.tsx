"use client";

import { format } from "date-fns";
import { CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/core/utils";

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
}

export function DayView({ date, items, optimistic, onToggle }: Props) {
  const sorted = [...items].sort((a, b) => {
    const sa = optimistic[a.id] ?? a.state;
    const sb = optimistic[b.id] ?? b.state;
    if (sa === sb) return 0;
    return sa === "incomplete" ? -1 : 1;
  });

  const incomplete = sorted.filter((i) => (optimistic[i.id] ?? i.state) === "incomplete");
  const complete = sorted.filter((i) => (optimistic[i.id] ?? i.state) === "complete");

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-[600] text-foreground tracking-tight">
          {format(date, "EEEE")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">{format(date, "MMMM d, yyyy")}</p>
        <p className="text-[10px] font-[600] text-muted-foreground/60 uppercase tracking-widest mt-2">
          {incomplete.length} pending · {complete.length} done
        </p>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-16 text-muted-foreground/40">
          <p className="text-sm">No items for this day</p>
        </div>
      )}

      <div className="max-w-lg mx-auto space-y-2">
        {sorted.map((item) => {
          const state = optimistic[item.id] ?? item.state;
          const done = state === "complete";
          return (
            <button
              key={item.id}
              onClick={() => onToggle(item)}
              className={cn(
                "w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition-all duration-150",
                done
                  ? "bg-green-500/[0.04] border-green-500/10 hover:bg-green-500/10"
                  : "bg-blue-500/[0.06] border-blue-500/15 hover:bg-blue-500/10 hover:border-blue-500/30"
              )}
            >
              {done
                ? <CheckSquare className="w-4 h-4 shrink-0 mt-0.5 text-green-400" />
                : <Square className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
              }
              <div className="flex-1 min-w-0">
                <span className={cn(
                  "text-sm font-[500] leading-snug",
                  done ? "line-through text-foreground/40" : "text-foreground/90"
                )}>
                  {item.name}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-muted-foreground/60 truncate">{item.cardName}</span>
                  <span className="text-[10px] text-muted-foreground/30">·</span>
                  <span className="text-[10px] text-muted-foreground/60 truncate">{item.checklistName}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
