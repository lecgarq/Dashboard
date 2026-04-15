"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type TrelloCard = {
  id: string; name: string; desc: string; idList: string; pos: number;
  due: string | null; dueComplete: boolean;
  labels: { id: string; name: string; color: string }[];
  url: string; idMembers?: string[];
};
type TrelloList = { id: string; name: string; pos: number };

const LABEL_COLORS: Record<string, string> = {
  green: "#61bd4f", yellow: "#f2d600", orange: "#ff9f1a", red: "#eb5a46",
  purple: "#c377e0", blue: "#0079bf", sky: "#00c2e0", lime: "#51e898",
  pink: "#ff78cb", black: "#344563",
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

interface CalendarViewProps {
  cards: TrelloCard[];
  lists: TrelloList[];
  onCardClick: (card: TrelloCard) => void;
}

export function CalendarView({ cards, lists, onCardClick }: CalendarViewProps) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const listMap = useMemo(() => Object.fromEntries(lists.map(l => [l.id, l.name])), [lists]);

  const calDays = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < first.getDay(); i++) {
      days.push({ date: new Date(year, month, -first.getDay() + i + 1), inMonth: false });
    }
    for (let i = 1; i <= last.getDate(); i++) {
      days.push({ date: new Date(year, month, i), inMonth: true });
    }
    while (days.length % 7 !== 0) {
      days.push({ date: new Date(year, month + 1, days.length - last.getDate() - first.getDay() + 1), inMonth: false });
    }
    return days;
  }, [month, year]);

  function cardsForDate(d: Date) {
    return cards.filter(c => {
      if (!c.due) return false;
      const dd = new Date(c.due);
      return dd.getFullYear() === d.getFullYear() && dd.getMonth() === d.getMonth() && dd.getDate() === d.getDate();
    });
  }

  function prev() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/40 shrink-0">
        <h3 className="text-base font-semibold">{MONTHS[month]} {year}</h3>
        <div className="flex items-center gap-1">
          <button onClick={prev} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-smooth"><ChevronLeft size={16} /></button>
          <button onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); }} className="px-2 py-1 text-xs rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-smooth">Today</button>
          <button onClick={next} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-smooth"><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border/30 shrink-0">
        {DAYS.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 h-full" style={{ gridAutoRows: "minmax(100px, 1fr)" }}>
          {calDays.map((day, i) => {
            const dayCards = day.inMonth ? cardsForDate(day.date) : [];
            const isToday = day.inMonth && day.date.toDateString() === now.toDateString();
            return (
              <div
                key={i}
                className={cn(
                  "border-b border-r border-border/20 p-1.5 min-h-[100px]",
                  day.inMonth ? "bg-card/20" : "bg-card/5",
                  isToday && "ring-1 ring-inset ring-primary/30"
                )}
              >
                <span className={cn(
                  "text-[11px] font-medium inline-flex w-5 h-5 items-center justify-center rounded-full",
                  isToday ? "bg-primary text-primary-foreground font-bold" : day.inMonth ? "text-foreground" : "text-muted-foreground/30"
                )}>
                  {day.date.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayCards.slice(0, 3).map(c => (
                    <button
                      key={c.id}
                      onClick={() => onCardClick(c)}
                      className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate hover:opacity-80 transition-smooth text-white font-medium"
                      style={{ backgroundColor: c.labels[0] ? (LABEL_COLORS[c.labels[0].color] ?? "#0079bf") : "#0079bf" }}
                      title={`${c.name} — ${listMap[c.idList] ?? ""}`}
                    >
                      {c.name}
                    </button>
                  ))}
                  {dayCards.length > 3 && (
                    <p className="text-[9px] text-muted-foreground/50 pl-1">+{dayCards.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
