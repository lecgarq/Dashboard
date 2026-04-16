"use client";

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isSameDay,
  isWeekend,
  format,
} from "date-fns";
import { CheckSquare, Square, Plus, Trash2, Pencil, Shuffle, ChevronRight, X, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { isHoliday } from "@/lib/holidays";
import { trpc } from "@/lib/core/trpc";

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
  gcalEvents?: GCalEvent[];
  optimistic: Record<string, "complete" | "incomplete">;
  onToggle: (item: CheckItem) => void;
  onCreateAt: (date: Date) => void;
  onDelete?: (item: CheckItem) => void;
  onMoveTo?: (item: CheckItem, newDate: Date) => void;
  onRename?: (item: CheckItem, newName: string) => void;
  onMoveToChecklist?: (item: CheckItem, newChecklistId: string) => void;
  onDuplicate?: (item: CheckItem, newDate: Date) => void;
  onGCalEventClick?: (event: GCalEvent) => void;
  onCreateGCalEvent?: (date: Date) => void;
}

// ── Popover for expanded day ──────────────────────────────────────────────────

function DayPopover({
  day,
  items,
  gcalEvents = [],
  optimistic,
  anchorRect,
  onToggle,
  onClose,
  onCreateAt,
  onDelete,
  onMoveTo,
  onRename,
  onMoveToChecklist,
  onDuplicate,
  onGCalEventClick,
  onCreateGCalEvent,
}: {
  day: Date;
  items: CheckItem[];
  gcalEvents?: GCalEvent[];
  optimistic: Record<string, "complete" | "incomplete">;
  anchorRect: DOMRect;
  onToggle: (item: CheckItem) => void;
  onClose: () => void;
  onCreateAt: (date: Date) => void;
  onDelete?: (item: CheckItem) => void;
  onMoveTo?: (item: CheckItem, newDate: Date) => void;
  onRename?: (item: CheckItem, newName: string) => void;
  onMoveToChecklist?: (item: CheckItem, newChecklistId: string) => void;
  onDuplicate?: (item: CheckItem, newDate: Date) => void;
  onGCalEventClick?: (event: GCalEvent) => void;
  onCreateGCalEvent?: (date: Date) => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: CheckItem } | null>(null);
  const [showMoveTargets, setShowMoveTargets] = useState(false);

  const { data: checklists } = trpc.trello.getCardChecklists.useQuery(
    { cardId: contextMenu?.item.cardId ?? "" },
    { enabled: !!contextMenu }
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, item: CheckItem) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMoveTargets(false);
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setShowMoveTargets(false);
  }, []);

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => closeContextMenu();
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, [contextMenu, closeContextMenu]);

  const sorted = [...items].sort((a, b) => {
    const sa = optimistic[a.id] ?? a.state;
    const sb = optimistic[b.id] ?? b.state;
    return sa === sb ? 0 : sa === "incomplete" ? -1 : 1;
  });

  const incompleteCount = sorted.filter((i) => (optimistic[i.id] ?? i.state) === "incomplete").length;

  // Position: try below the anchor, flip up if not enough space
  const popoverWidth = 320;
  const popoverMaxHeight = 360;
  let top = anchorRect.bottom + 6;
  let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;

  if (top + popoverMaxHeight > window.innerHeight - 16) {
    top = anchorRect.top - popoverMaxHeight - 6;
  }
  left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));
  top = Math.max(8, top);

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998]" />
      {/* Popover */}
      <div
        ref={popoverRef}
        className="fixed z-[9999] rounded-2xl border border-white/10 bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ top, left, width: popoverWidth, maxHeight: popoverMaxHeight }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full",
              isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
            )}>
              {format(day, "d")}
            </span>
            <span className="text-xs text-muted-foreground">{format(day, "EEEE, MMM d")}</span>
          </div>
          <div className="flex items-center gap-1">
            {incompleteCount > 0 && (
              <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-md">
                {incompleteCount} left
              </span>
            )}
            {onCreateGCalEvent && (
              <button
                onClick={() => { onCreateGCalEvent(day); onClose(); }}
                title="New calendar event"
                className="p-1 rounded-lg hover:bg-purple-500/20 text-purple-400/60 hover:text-purple-300 transition-colors"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => { onCreateAt(day); onClose(); }}
              className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="overflow-y-auto max-h-[280px] p-2 space-y-1 custom-scrollbar">
          {/* Google Calendar events */}
          {gcalEvents.map((ev) => {
            const now = new Date();
            const isPast = ev.end ? new Date(ev.end) < now : new Date(ev.start) < now;
            return (
              <button
                key={ev.id}
                onClick={() => { onGCalEventClick?.(ev); onClose(); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-left",
                  isPast
                    ? "bg-muted/20 border-border/30 hover:bg-muted/40 opacity-70"
                    : "bg-purple-500/[0.06] border-purple-500/15 hover:bg-purple-500/15"
                )}
              >
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  isPast ? "bg-muted-foreground/50" : "bg-purple-400"
                )} />
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "text-xs font-medium line-clamp-1",
                    isPast ? "text-muted-foreground line-through" : "text-foreground/85"
                  )}>
                    {ev.title}
                  </span>
                  <span className={cn(
                    "block text-[10px] mt-0.5",
                    isPast ? "text-muted-foreground/40" : "text-purple-400/60"
                  )}>
                    {ev.allDay ? "All day" : format(new Date(ev.start), "h:mm a")}
                    {ev.end && !ev.allDay && ` – ${format(new Date(ev.end), "h:mm a")}`}
                    {isPast && " · past"}
                  </span>
                </div>
              </button>
            );
          })}

          {sorted.length === 0 && gcalEvents.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground/50">No tasks</div>
          ) : sorted.map((item) => {
            const state = optimistic[item.id] ?? item.state;
            const done = state === "complete";
            return (
              <button
                key={item.id}
                onClick={() => onToggle(item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", JSON.stringify(item));
                }}
                className={cn(
                  "w-full text-left flex items-start gap-2 px-3 py-2 rounded-xl border transition-all duration-150 cursor-pointer",
                  done
                    ? "bg-green-500/[0.04] border-green-500/10 hover:bg-green-500/10"
                    : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/15"
                )}
              >
                {done
                  ? <CheckSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400" />
                  : <Square className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                }
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "text-xs font-medium leading-snug line-clamp-2",
                    done ? "line-through text-foreground/35" : "text-foreground/85"
                  )}>
                    {item.name}
                  </span>
                  <span className="block text-[10px] text-muted-foreground/40 truncate mt-0.5">
                    {item.cardName}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-[10000] min-w-[180px] bg-popover/95 border border-border rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 180),
            left: Math.min(contextMenu.x, window.innerWidth - 200),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {!showMoveTargets ? (
            <>
              <button
                onClick={() => {
                  const newName = prompt("Rename item:", contextMenu.item.name);
                  if (newName && newName.trim() && newName !== contextMenu.item.name) {
                    onRename?.(contextMenu.item, newName.trim());
                  }
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 opacity-70" />
                Rename
              </button>
              <button
                onClick={() => setShowMoveTargets(true)}
                className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Shuffle className="w-3.5 h-3.5 opacity-70" />
                  Move to Checklist
                </div>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </button>
              <div className="h-px bg-border mx-2" />
              <button
                onClick={() => {
                  if (confirm("Delete this check item?")) {
                    onDelete?.(contextMenu.item);
                  }
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 opacity-70" />
                Delete
              </button>
            </>
          ) : (
            <div className="flex flex-col animate-in slide-in-from-right-2 duration-200">
              <div className="flex items-center justify-between px-3.5 py-2 bg-muted/30 border-b border-border">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Move to...</span>
                <button
                  onClick={() => setShowMoveTargets(false)}
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  Back
                </button>
              </div>
              <div className="max-h-[220px] overflow-y-auto py-1 custom-scrollbar">
                {checklists?.filter(cl => cl.id !== contextMenu.item.checklistId).map(cl => (
                  <button
                    key={cl.id}
                    onClick={() => {
                      onMoveToChecklist?.(contextMenu.item, cl.id);
                      closeContextMenu();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs truncate hover:bg-accent transition-colors flex flex-col"
                  >
                    <span className="font-medium">{cl.name}</span>
                  </button>
                ))}
                {(!checklists || checklists.filter(cl => cl.id !== contextMenu.item.checklistId).length === 0) && (
                  <div className="px-3.5 py-6 text-[11px] text-muted-foreground text-center italic">
                    {checklists ? "No other checklists on this card" : "Loading checklists..."}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>,
    document.body
  );
}

// ── MonthView ─────────────────────────────────────────────────────────────────

export function MonthView({
  date, items, gcalEvents = [], optimistic, onToggle, onCreateAt, onDelete, onMoveTo, onRename, onMoveToChecklist, onDuplicate, onGCalEventClick, onCreateGCalEvent
}: Props) {
  const [popoverDay, setPopoverDay] = useState<{ day: Date; rect: DOMRect } | null>(null);
  const [dragItem, setDragItem] = useState<CheckItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
  }).filter((d) => !isWeekend(d));

  const getItemsForDay = (day: Date) =>
    items.filter((item) => isSameDay(new Date(item.due ?? item.cardDue), day));

  const getGcalForDay = (day: Date) =>
    gcalEvents.filter((ev) => isSameDay(new Date(ev.start), day));

  // Drag handlers
  const handleDragOver = useCallback((e: React.DragEvent, dayId: string) => {
    e.preventDefault();
    setDropTarget(dayId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropDate: Date) => {
    e.preventDefault();
    if (dragItem) {
      if (e.altKey && onDuplicate) {
        onDuplicate(dragItem, dropDate);
      } else {
        onMoveTo?.(dragItem, dropDate);
      }
    }
    setDragItem(null);
    setDropTarget(null);
  }, [dragItem, onMoveTo, onDuplicate]);

  const handleDragEnd = useCallback(() => {
    setDragItem(null);
    setDropTarget(null);
  }, []);

  const handleDayClick = useCallback((day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverDay((prev) => (prev && isSameDay(prev.day, day) ? null : { day, rect }));
  }, []);

  const rows = Math.ceil(days.length / 5);

  return (
    <div className="flex-1 flex flex-col p-3 gap-2 overflow-hidden">
      {/* Day labels */}
      <div className="grid grid-cols-5 px-0.5">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            {d}
          </div>
        ))}
      </div>

      {/* Grid — no scroll, cells fill available space */}
      <div
        className="flex-1 grid grid-cols-5 gap-[3px]"
        style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}
      >
        {days.map((day) => {
          const inMonth = isSameMonth(day, date);
          const isCurrentDay = isToday(day);
          const holiday = isHoliday(day);
          const dayKey = format(day, "yyyy-MM-dd");
          const dayItems = getItemsForDay(day);
          const isDragOver = dropTarget === dayKey;

          const incompleteCount = dayItems.filter((i) => (optimistic[i.id] ?? i.state) === "incomplete").length;
          const completedCount = dayItems.length - incompleteCount;

          return (
            <div
              key={dayKey}
              onClick={(e) => handleDayClick(day, e)}
              className={cn(
                "group/day relative flex flex-col rounded-xl cursor-pointer transition-all duration-200 overflow-hidden select-none",
                inMonth
                  ? "bg-white/[0.015] hover:bg-white/[0.045] border border-transparent hover:border-white/10"
                  : "opacity-15",
                isCurrentDay && "border-primary/20 bg-primary/[0.04] ring-1 ring-primary/10",
                holiday && inMonth && "bg-red-500/[0.03]",
                isDragOver && "ring-2 ring-primary/50 bg-primary/[0.08]"
              )}
              onDragOver={(e) => handleDragOver(e, dayKey)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => handleDrop(e, day)}
            >
              {/* Day number + count */}
              <div className="flex items-center justify-between px-2 pt-1.5 pb-1 shrink-0">
                <span className={cn(
                  "text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full leading-none",
                  isCurrentDay ? "bg-primary text-primary-foreground text-[10px]" :
                  holiday ? "text-red-400/70" :
                  "text-foreground/40 group-hover/day:text-foreground/70"
                )}>
                  {format(day, "d")}
                </span>

                {dayItems.length > 0 && (
                  <div className="flex items-center gap-1">
                    {incompleteCount > 0 && (
                      <span className="text-[9px] font-bold text-blue-400/80 tabular-nums">
                        {incompleteCount}
                      </span>
                    )}
                    {completedCount > 0 && (
                      <span className="text-[9px] font-bold text-green-400/60 tabular-nums">
                        {completedCount}<span className="text-green-400/40">✓</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Compact pills — gcal (purple) + tasks (blue/green), max 3 total, no scroll */}
              <div className="flex-1 flex flex-col gap-[2px] px-1.5 pb-1.5 min-h-0">
                {(() => {
                  const dayGcal = getGcalForDay(day);
                  const now = new Date();
                  return dayGcal.slice(0, 2).map((ev) => {
                    const isPast = ev.end ? new Date(ev.end) < now : new Date(ev.start) < now;
                    return (
                      <button
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onGCalEventClick?.(ev);
                        }}
                        className={cn(
                          "flex items-center gap-1 px-1.5 py-[2px] rounded-md text-[9px] font-medium leading-tight truncate w-full text-left transition-colors",
                          isPast
                            ? "bg-muted/30 text-muted-foreground/50 hover:bg-muted/50"
                            : "bg-purple-500/[0.08] text-purple-300/80 hover:bg-purple-500/20"
                        )}
                      >
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          isPast ? "bg-muted-foreground/40" : "bg-purple-400"
                        )} />
                        <span className={cn("truncate", isPast && "line-through opacity-70")}>{ev.title}</span>
                      </button>
                    );
                  });
                })()}
                {dayItems.slice(0, Math.max(1, 3 - getGcalForDay(day).length)).map((item) => {
                  const state = optimistic[item.id] ?? item.state;
                  const done = state === "complete";
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDragItem(item);
                      }}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(item);
                      }}
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-[2px] rounded-md text-[9px] font-medium leading-tight truncate cursor-grab active:cursor-grabbing transition-colors",
                        done
                          ? "bg-green-500/[0.06] text-green-400/50 line-through"
                          : "bg-blue-500/[0.08] text-foreground/70 hover:bg-blue-500/15"
                      )}
                    >
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        done ? "bg-green-400/50" : "bg-blue-400"
                      )} />
                      <span className="truncate">{item.name}</span>
                    </div>
                  );
                })}
                {(dayItems.length + getGcalForDay(day).length) > 3 && (
                  <span className="text-[9px] font-semibold text-muted-foreground/40 px-1.5">
                    +{dayItems.length + getGcalForDay(day).length - 3} more
                  </span>
                )}
              </div>

              {/* Hover add button */}
              {inMonth && dayItems.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/day:opacity-100 transition-opacity">
                  <Plus className="w-4 h-4 text-muted-foreground/20" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Popover for expanded day */}
      {popoverDay && (
        <DayPopover
          day={popoverDay.day}
          items={getItemsForDay(popoverDay.day)}
          gcalEvents={getGcalForDay(popoverDay.day)}
          optimistic={optimistic}
          anchorRect={popoverDay.rect}
          onToggle={onToggle}
          onClose={() => setPopoverDay(null)}
          onCreateAt={onCreateAt}
          onDelete={onDelete}
          onMoveTo={onMoveTo}
          onRename={onRename}
          onMoveToChecklist={onMoveToChecklist}
          onDuplicate={onDuplicate}
          onGCalEventClick={onGCalEventClick}
          onCreateGCalEvent={onCreateGCalEvent}
        />
      )}
    </div>
  );
}
