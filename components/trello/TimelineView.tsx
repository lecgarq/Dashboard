"use client";

import { useMemo } from "react";
import { cn } from "@/lib/core/utils";

type TrelloCard = {
  id: string; name: string; idList: string; due: string | null; dueComplete: boolean;
  labels: { id: string; name: string; color: string }[];
  url: string; idMembers?: string[];
};
type TrelloList = { id: string; name: string; pos: number };

const LABEL_COLORS: Record<string, string> = {
  green: "#61bd4f", yellow: "#f2d600", orange: "#ff9f1a", red: "#eb5a46",
  purple: "#c377e0", blue: "#0079bf", sky: "#00c2e0", lime: "#51e898",
  pink: "#ff78cb", black: "#344563",
};

interface TimelineViewProps {
  cards: TrelloCard[];
  lists: TrelloList[];
  onCardClick: (card: TrelloCard) => void;
}

export function TimelineView({ cards, lists, onCardClick }: TimelineViewProps) {
  const now = new Date();

  const { startDate, days, totalDays } = useMemo(() => {
    const datedCards = cards.filter(c => c.due);
    if (datedCards.length === 0) {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      const diff = Math.ceil((e.getTime() - s.getTime()) / 86400000) + 1;
      return { startDate: s, days: Array.from({ length: diff }, (_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; }), totalDays: diff };
    }
    const dates = datedCards.map(c => new Date(c.due!));
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 7);
    const diff = Math.ceil((max.getTime() - min.getTime()) / 86400000) + 1;
    return {
      startDate: min,
      days: Array.from({ length: diff }, (_, i) => { const d = new Date(min); d.setDate(d.getDate() + i); return d; }),
      totalDays: diff,
    };
  }, [cards]);

  const COL_W = 32; // px per day
  const ROW_H = 36;
  const LABEL_W = 160;

  const sortedLists = [...lists].sort((a, b) => a.pos - b.pos);

  function dayOffset(dateStr: string) {
    const d = new Date(dateStr);
    return Math.floor((d.getTime() - startDate.getTime()) / 86400000);
  }

  const todayOffset = Math.floor((now.getTime() - startDate.getTime()) / 86400000);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: LABEL_W + totalDays * COL_W }}>
          {/* Header row */}
          <div className="flex sticky top-0 z-10 bg-card border-b border-border/40">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="border-r border-border/30 px-3 py-2 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest shrink-0">
              List
            </div>
            <div className="flex">
              {days.map((d, i) => {
                const isToday = d.toDateString() === now.toDateString();
                const isFirst = d.getDate() === 1;
                return (
                  <div
                    key={i}
                    style={{ width: COL_W, minWidth: COL_W }}
                    className={cn(
                      "border-r border-border/10 flex flex-col items-center justify-center py-1 shrink-0",
                      isToday && "bg-primary/10",
                      isFirst && "border-r border-border/40"
                    )}
                  >
                    {(i === 0 || isFirst) && (
                      <span className="text-[8px] text-muted-foreground/40 uppercase">
                        {d.toLocaleDateString(undefined, { month: "short" })}
                      </span>
                    )}
                    <span className={cn("text-[9px]", isToday ? "font-bold text-primary" : "text-muted-foreground/50")}>
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rows per list */}
          {sortedLists.map(list => {
            const listCards = cards.filter(c => c.idList === list.id && c.due);
            return (
              <div key={list.id}>
                {/* List label row */}
                <div className="flex border-b border-border/20 bg-muted/20">
                  <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="border-r border-border/30 px-3 py-1.5 text-xs font-semibold text-foreground/70 shrink-0 truncate">
                    {list.name}
                  </div>
                  <div className="relative flex-1" style={{ height: 28 }}>
                    {todayOffset >= 0 && todayOffset < totalDays && (
                      <div className="absolute top-0 bottom-0 w-px bg-primary/30 z-10" style={{ left: todayOffset * COL_W + COL_W / 2 }} />
                    )}
                  </div>
                </div>

                {/* Card rows */}
                {listCards.map(card => {
                  const offset = dayOffset(card.due!);
                  const color = card.labels[0] ? (LABEL_COLORS[card.labels[0].color] ?? "#0079bf") : "#0079bf";
                  const isPast = !card.dueComplete && new Date(card.due!) < now;
                  return (
                    <div key={card.id} className="flex border-b border-border/10 hover:bg-muted/10 transition-colors" style={{ height: ROW_H }}>
                      <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="border-r border-border/20 px-3 flex items-center shrink-0">
                        <span className="text-xs text-muted-foreground truncate">{card.name}</span>
                      </div>
                      <div className="relative flex-1">
                        {todayOffset >= 0 && todayOffset < totalDays && (
                          <div className="absolute top-0 bottom-0 w-px bg-primary/20 z-10" style={{ left: todayOffset * COL_W + COL_W / 2 }} />
                        )}
                        {offset >= 0 && offset < totalDays && (
                          <button
                            onClick={() => onCardClick(card)}
                            className="absolute top-1/2 -translate-y-1/2 h-6 rounded flex items-center px-2 text-white text-[10px] font-medium truncate hover:opacity-80 transition-smooth"
                            style={{
                              left: offset * COL_W + 2,
                              minWidth: COL_W - 4,
                              maxWidth: 200,
                              backgroundColor: isPast ? "#eb5a46" : color,
                            }}
                            title={card.name}
                          >
                            {card.name}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {listCards.length === 0 && (
                  <div className="flex border-b border-border/10" style={{ height: ROW_H }}>
                    <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="border-r border-border/20 shrink-0" />
                    <div className="flex items-center px-3">
                      <span className="text-[10px] text-muted-foreground/30">No cards with due dates</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
