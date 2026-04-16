"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/core/trpc";
import { useEventSource } from "@/hooks/use-event-source";
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  addYears,
  subYears,
  startOfYear,
  endOfYear,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateCheckItemDialog } from "./CreateCheckItemDialog";
import { ViewSwitcher, type CalendarView } from "./calendar/ViewSwitcher";
import { CalendarStats, computeStats } from "./calendar/CalendarStats";
import { MonthView } from "./calendar/MonthView";
import { SemesterView } from "./calendar/SemesterView";
import { YearView } from "./calendar/YearView";
import { EventModal } from "./calendar/EventModal";

type GCalEvent = {
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
};

type CheckItem = {
  id: string;
  name: string;
  state: "complete" | "incomplete";
  due: string | null;
  cardId: string;
  cardName: string;
  cardDue: string;
  checklistId: string;
  checklistName: string;
};

function getStoredView(): CalendarView {
  if (typeof window === "undefined") return "month";
  return (localStorage.getItem("cal-view") as CalendarView) || "month";
}

export function DashboardCalendar() {
  const [view, setView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [optimistic, setOptimistic] = useState<Record<string, "complete" | "incomplete">>({});
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedGCalEvent, setSelectedGCalEvent] = useState<GCalEvent | null>(null);
  const [newEventDate, setNewEventDate] = useState<Date | undefined>(undefined);

  // Hydrate view from localStorage (avoid SSR mismatch)
  useEffect(() => {
    setView(getStoredView());
  }, []);

  const utils = trpc.useUtils();

  const { data: checkItems = [], isLoading } = trpc.trello.getMyCheckItems.useQuery(undefined, {
    staleTime: 15_000, // 15s — allow SSE-triggered invalidations to actually refetch
  });

  // Google Calendar events for the current view range
  const gcalRange = useMemo(() => {
    const pad = (d: Date) => d.toISOString();
    switch (view) {
      case "month": return { timeMin: pad(startOfMonth(currentDate)), timeMax: pad(endOfMonth(currentDate)) };
      case "semester": return { timeMin: pad(startOfMonth(currentDate)), timeMax: pad(endOfMonth(addMonths(currentDate, 5))) };
      case "year": return { timeMin: pad(startOfYear(currentDate)), timeMax: pad(endOfYear(currentDate)) };
    }
  }, [view, currentDate]);

  const { data: gcalEvents = [] } = trpc.calendar.getEvents.useQuery(gcalRange, {
    staleTime: 60_000,
  });

  // SSE subscription for instant updates
  const handleTrelloEvent = useCallback(
    () => { utils.trello.getMyCheckItems.invalidate(); },
    [utils]
  );
  useEventSource("/api/events/trello", handleTrelloEvent);

  const updateCheckItem = trpc.trello.updateCheckItem.useMutation({
    onMutate: ({ checkItemId, state }) => {
      setOptimistic((prev) => ({ ...prev, [checkItemId]: state }));
    },
    onSuccess: () => {
      utils.trello.getMyCheckItems.invalidate();
    },
    onError: (_err, { checkItemId }) => {
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[checkItemId];
        return next;
      });
    },
  });

  const deleteCheckItem = trpc.trello.deleteCheckItem.useMutation({
    onMutate: async ({ checkItemId }) => {
      await utils.trello.getMyCheckItems.cancel();
      const prev = utils.trello.getMyCheckItems.getData();
      utils.trello.getMyCheckItems.setData(undefined, (old) =>
        old?.filter((item) => item.id !== checkItemId)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.trello.getMyCheckItems.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.trello.getMyCheckItems.invalidate(),
  });

  const moveCheckItemDue = trpc.trello.updateCheckItemDue.useMutation({
    onMutate: async ({ checkItemId, due }) => {
      await utils.trello.getMyCheckItems.cancel();
      const prev = utils.trello.getMyCheckItems.getData();
      utils.trello.getMyCheckItems.setData(undefined, (old) =>
        old?.map((item) => item.id === checkItemId ? { ...item, due } : item)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.trello.getMyCheckItems.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.trello.getMyCheckItems.invalidate(),
  });

  const renameCheckItem = trpc.trello.renameCheckItem.useMutation({
    onMutate: async ({ checkItemId, name }) => {
      await utils.trello.getMyCheckItems.cancel();
      const prev = utils.trello.getMyCheckItems.getData();
      utils.trello.getMyCheckItems.setData(undefined, (old) =>
        old?.map((item) => item.id === checkItemId ? { ...item, name } : item)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.trello.getMyCheckItems.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.trello.getMyCheckItems.invalidate(),
  });

  const moveCheckItem = trpc.trello.moveCheckItem.useMutation({
    onMutate: async ({ checkItemId }) => {
      await utils.trello.getMyCheckItems.cancel();
      const prev = utils.trello.getMyCheckItems.getData();
      // Since ID changes, we just remove the old one optimistically
      utils.trello.getMyCheckItems.setData(undefined, (old) =>
        old?.filter((item) => item.id !== checkItemId)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.trello.getMyCheckItems.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.trello.getMyCheckItems.invalidate(),
  });

  const createCheckItem = trpc.trello.createCheckItemFull.useMutation({
    onSuccess: () => {
      utils.trello.getMyCheckItems.invalidate();
    },
  });

  // Navigation helpers
  const navigate = (dir: 1 | -1) => {
    switch (view) {
      case "month": setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1)); break;
      case "semester": setCurrentDate(dir > 0 ? addMonths(currentDate, 6) : subMonths(currentDate, 6)); break;
      case "year": setCurrentDate(dir > 0 ? addYears(currentDate, 1) : subYears(currentDate, 1)); break;
    }
  };

  const goToday = () => setCurrentDate(new Date());

  const handleChangeView = (v: CalendarView) => {
    setView(v);
    localStorage.setItem("cal-view", v);
  };

  // Compute date range for stats
  const statsRange = useMemo((): [Date, Date] => {
    switch (view) {
      case "month": return [startOfMonth(currentDate), endOfMonth(currentDate)];
      case "semester": return [startOfMonth(currentDate), endOfMonth(addMonths(currentDate, 5))];
      case "year": return [startOfYear(currentDate), endOfYear(currentDate)];
    }
  }, [view, currentDate]);

  const stats = useMemo(
    () => computeStats(checkItems, optimistic, statsRange[0], statsRange[1], view),
    [checkItems, optimistic, statsRange, view]
  );

  // Title for header
  const headerTitle = useMemo(() => {
    switch (view) {
      case "month": return format(currentDate, "MMMM yyyy");
      case "semester": return `${format(currentDate, "MMM yyyy")} – ${format(addMonths(currentDate, 5), "MMM yyyy")}`;
      case "year": return format(currentDate, "yyyy");
    }
  }, [view, currentDate]);

  const handleToggle = (item: CheckItem) => {
    const currentState = optimistic[item.id] ?? item.state;
    const newState = currentState === "incomplete" ? "complete" : "incomplete";
    updateCheckItem.mutate({
      cardId: item.cardId,
      checkItemId: item.id,
      state: newState,
    });
  };

  const handleOpenCreate = (date: Date) => {
    setSelectedDate(date);
    setIsCreateOpen(true);
  };

  const handleGCalEventClick = (event: GCalEvent) => {
    setSelectedGCalEvent(event);
    setNewEventDate(undefined);
    setEventModalOpen(true);
  };

  const handleCreateGCalEvent = (date?: Date) => {
    setSelectedGCalEvent(null);
    setNewEventDate(date);
    setEventModalOpen(true);
  };

  const handleEventModalSuccess = () => {
    utils.calendar.getEvents.invalidate();
  };

  const handleDelete = (item: CheckItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    deleteCheckItem.mutate({ checklistId: item.checklistId, checkItemId: item.id });
  };

  const handleMoveTo = (item: CheckItem, newDate: Date) => {
    moveCheckItemDue.mutate({
      cardId: item.cardId,
      checkItemId: item.id,
      due: newDate.toISOString(),
    });
  };

  const handleRename = (item: CheckItem, newName: string) => {
    renameCheckItem.mutate({
      cardId: item.cardId,
      checkItemId: item.id,
      name: newName,
    });
  };

  const handleMoveToChecklist = (item: CheckItem, newChecklistId: string) => {
    moveCheckItem.mutate({
      oldChecklistId: item.checklistId,
      newChecklistId: newChecklistId,
      checkItemId: item.id,
      details: {
        name: item.name,
        state: item.state,
        due: item.due,
      }
    });
  };

  const handleDuplicate = (item: CheckItem, newDate: Date) => {
    createCheckItem.mutate({
      checklistId: item.checklistId,
      cardId: item.cardId,
      name: item.name,
      due: newDate.toISOString(),
    });
  };

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-background/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 shadow-inner">
            <CalendarIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <h2 className="text-[15px] font-[600] text-foreground tracking-tight flex items-center gap-2 leading-none">
              {headerTitle}
              {isLoading && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
              )}
            </h2>
            <p className="text-[9px] font-[600] text-muted-foreground tracking-widest uppercase mt-0.5">
              My To-Do Items
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CalendarStats {...stats} />

          <Button
            size="sm"
            onClick={() => handleCreateGCalEvent(new Date())}
            className="font-[600] text-xs h-7 px-2.5 rounded-xl gap-1 bg-blue-600 hover:bg-blue-500 text-white shadow-md"
            title="New Google Calendar event"
          >
            <CalendarIcon className="w-3 h-3" />
            <span className="hidden sm:inline">Event</span>
          </Button>
          <Button
            size="sm"
            onClick={() => handleOpenCreate(new Date())}
            className="font-[600] text-xs h-7 px-2.5 rounded-xl gap-1 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
          >
            <Plus className="w-3 h-3" />
            <span className="hidden sm:inline">Task</span>
          </Button>

          <ViewSwitcher value={view} onChange={handleChangeView} />

          <div className="flex items-center gap-0.5 bg-white/[0.03] p-0.5 rounded-xl border border-white/5">
            <Button variant="ghost" size="sm" onClick={goToday} className="font-[500] rounded-lg hover:bg-white/10 px-2 text-xs h-7">
              Today
            </Button>
            <div className="w-px h-3 bg-white/10 mx-0.5" />
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-lg hover:bg-white/10 h-7 w-7">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate(1)} className="rounded-lg hover:bg-white/10 h-7 w-7">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* View Body */}
      {view === "month" && (
        <MonthView
          date={currentDate}
          items={checkItems}
          gcalEvents={gcalEvents}
          optimistic={optimistic}
          onToggle={handleToggle}
          onCreateAt={handleOpenCreate}
          onDelete={handleDelete}
          onMoveTo={handleMoveTo}
          onRename={handleRename}
          onMoveToChecklist={handleMoveToChecklist}
          onDuplicate={handleDuplicate}
          onGCalEventClick={handleGCalEventClick}
          onCreateGCalEvent={handleCreateGCalEvent}
        />
      )}
      {view === "semester" && (
        <SemesterView
          date={currentDate}
          items={checkItems}
          optimistic={optimistic}
          gcalEvents={gcalEvents}
          onGCalEventClick={handleGCalEventClick}
        />
      )}
      {view === "year" && (
        <YearView date={currentDate} items={checkItems} optimistic={optimistic} gcalEvents={gcalEvents} />
      )}

      {isCreateOpen && (
        <CreateCheckItemDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          defaultDate={selectedDate}
          onCreated={() => utils.trello.getMyCheckItems.invalidate()}
        />
      )}

      <EventModal
        open={eventModalOpen}
        onOpenChange={setEventModalOpen}
        event={selectedGCalEvent}
        defaultDate={newEventDate}
        onSuccess={handleEventModalSuccess}
      />
    </div>
  );
}
