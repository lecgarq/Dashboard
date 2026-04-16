"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/core/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type TrelloCard = {
  id: string;
  name: string;
  desc: string;
  idList: string;
  pos: number;
  due: string | null;
  dueComplete: boolean;
  labels: { id: string; name: string; color: string }[];
  url: string;
  idMembers?: string[];
  cover?: { color?: string; idAttachmentCover?: string };
};

type TrelloList = { id: string; name: string; pos: number };

const LABEL_COLORS: Record<string, string> = {
  green: "#61bd4f", yellow: "#f2d600", orange: "#ff9f1a", red: "#eb5a46",
  purple: "#c377e0", blue: "#0079bf", sky: "#00c2e0", lime: "#51e898",
  pink: "#ff78cb", black: "#344563",
};

interface TableViewProps {
  cards: TrelloCard[];
  lists: TrelloList[];
  onCardClick: (card: TrelloCard) => void;
}

type SortKey = "name" | "list" | "due" | "status";
type SortDir = "asc" | "desc" | null;

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === "asc") return <ChevronUp size={12} className="text-primary shrink-0" />;
  if (dir === "desc") return <ChevronDown size={12} className="text-primary shrink-0" />;
  return <ChevronsUpDown size={12} className="text-muted-foreground/40 shrink-0" />;
}

export function TableView({ cards, lists, onCardClick }: TableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("list");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const listMap = useMemo(
    () => Object.fromEntries(lists.map((l) => [l.id, l])),
    [lists]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
      if (sortDir === "desc") setSortKey("list");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortDir) return cards;
    return [...cards].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "list") {
        const posA = listMap[a.idList]?.pos ?? 0;
        const posB = listMap[b.idList]?.pos ?? 0;
        cmp = posA - posB || a.pos - b.pos;
      } else if (sortKey === "due") {
        const da = a.due ? new Date(a.due).getTime() : Infinity;
        const db = b.due ? new Date(b.due).getTime() : Infinity;
        cmp = da - db;
      } else if (sortKey === "status") {
        cmp = (a.dueComplete ? 1 : 0) - (b.dueComplete ? 1 : 0);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [cards, sortKey, sortDir, listMap]);

  const now = new Date();

  function dueClass(card: TrelloCard) {
    if (!card.due) return "";
    if (card.dueComplete) return "text-green-600 dark:text-green-400";
    if (new Date(card.due) < now) return "text-red-500";
    if (new Date(card.due) < new Date(now.getTime() + 86400 * 2000)) return "text-amber-500";
    return "text-muted-foreground";
  }

  const ColHeader = ({
    label,
    skey,
    className,
  }: {
    label: string;
    skey?: SortKey;
    className?: string;
  }) => {
    const active = skey && sortKey === skey;
    return (
      <th
        className={cn(
          "px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50 bg-muted/20 select-none",
          skey && "cursor-pointer hover:text-foreground hover:bg-muted/40 transition-colors",
          className
        )}
        onClick={skey ? () => toggleSort(skey) : undefined}
      >
        <div className="flex items-center gap-1">
          {label}
          {skey && <SortIcon dir={active ? sortDir : null} />}
        </div>
      </th>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <ColHeader label="Card name" skey="name" className="w-[35%]" />
              <ColHeader label="List" skey="list" className="w-[18%]" />
              <ColHeader label="Labels" className="w-[18%]" />
              <ColHeader label="Due date" skey="due" className="w-[14%]" />
              <ColHeader label="Status" skey="status" className="w-[15%]" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No cards match your filters.
                </td>
              </tr>
            )}
            {sorted.map((card) => {
              const list = listMap[card.idList];
              const isOverdue = card.due && !card.dueComplete && new Date(card.due) < now;
              return (
                <tr
                  key={card.id}
                  onClick={() => onCardClick(card)}
                  className="border-b border-border/30 hover:bg-muted/30 cursor-pointer transition-colors group"
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {card.cover?.color && (
                        <div
                          className="w-1.5 h-5 rounded-full shrink-0"
                          style={{
                            backgroundColor: LABEL_COLORS[card.cover.color] ?? "#b3bac5",
                          }}
                        />
                      )}
                      <span className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {card.name}
                      </span>
                    </div>
                  </td>

                  {/* List */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded truncate block w-fit max-w-full">
                      {list?.name ?? "—"}
                    </span>
                  </td>

                  {/* Labels */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {card.labels.slice(0, 3).map((label) => (
                        <span
                          key={label.id}
                          className="px-2 py-0.5 rounded text-white text-[10px] font-medium"
                          style={{ backgroundColor: LABEL_COLORS[label.color] ?? "#b3bac5" }}
                          title={label.name || label.color}
                        >
                          {label.name || label.color}
                        </span>
                      ))}
                      {card.labels.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{card.labels.length - 3}
                        </span>
                      )}
                      {card.labels.length === 0 && (
                        <span className="text-[10px] text-muted-foreground/30">—</span>
                      )}
                    </div>
                  </td>

                  {/* Due date */}
                  <td className={cn("px-4 py-3 text-xs font-medium", dueClass(card))}>
                    {card.due ? (
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]",
                        card.dueComplete
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                          : isOverdue
                          ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {new Date(card.due).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {card.dueComplete && " ✓"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    {card.dueComplete ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                        Complete
                      </span>
                    ) : isOverdue ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        Overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer count */}
        <div className="px-4 py-2 border-t border-border/30 text-[10px] text-muted-foreground/50">
          {sorted.length} card{sorted.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
