"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Filter,
  GanttChartSquare,
  LayoutGrid,
  Share2,
  Table2,
  X,
  Calendar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/core/trpc";
import { cn } from "@/lib/core/utils";

import { ActivitySheet } from "./ActivitySheet";
import { ArchiveSheet } from "./ArchiveSheet";
import type {
  TrelloBoard,
  TrelloCard,
  TrelloLabel,
  TrelloList,
  TrelloMember,
} from "./types";

function ViewSkeleton() {
  return (
    <div className="flex h-full gap-4 p-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          className="h-48 w-64 shrink-0 animate-pulse rounded-xl bg-muted"
          key={index}
        />
      ))}
    </div>
  );
}

const KanbanBoard = dynamic(
  () => import("@/components/trello/KanbanBoard").then((module) => module.KanbanBoard),
  { loading: ViewSkeleton, ssr: false }
);

const CalendarView = dynamic(
  () => import("@/components/trello/CalendarView").then((module) => module.CalendarView),
  { loading: ViewSkeleton, ssr: false }
);

const TimelineView = dynamic(
  () => import("@/components/trello/TimelineView").then((module) => module.TimelineView),
  { loading: ViewSkeleton, ssr: false }
);

const TableView = dynamic(
  () => import("@/components/trello/TableView").then((module) => module.TableView),
  { loading: ViewSkeleton, ssr: false }
);

const CardDialog = dynamic(
  () => import("@/components/trello/CardDialog").then((module) => module.CardDialog),
  { ssr: false }
);

const LABEL_COLORS: Record<string, string> = {
  green: "#61bd4f",
  yellow: "#f2d600",
  orange: "#ff9f1a",
  red: "#eb5a46",
  purple: "#c377e0",
  blue: "#0079bf",
  sky: "#00c2e0",
  lime: "#51e898",
  pink: "#ff78cb",
  black: "#344563",
};

type TrelloBoardViewProps = {
  board: TrelloBoard | null;
  boardId: string;
  onBack: () => void;
};

export function TrelloBoardView({
  board,
  boardId,
  onBack,
}: TrelloBoardViewProps) {
  const utils = trpc.useUtils();
  const [view, setView] = useState<"board" | "calendar" | "timeline" | "table">("board");
  const [copied, setCopied] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [filterLabelIds, setFilterLabelIds] = useState<string[]>([]);
  const [filterMemberIds, setFilterMemberIds] = useState<string[]>([]);
  const [filterDue, setFilterDue] = useState<"" | "overdue" | "soon" | "none">("");
  const [dialogCard, setDialogCard] = useState<TrelloCard | null>(null);

  const {
    data: boardFull,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = trpc.trello.getBoardFullDetail.useQuery(
    { boardId },
    { enabled: !!boardId, refetchOnWindowFocus: false }
  );

  const openDialogForCard = useCallback(
    (cardToOpen: TrelloCard) => {
      void utils.trello.getCardDetail.prefetch({ cardId: cardToOpen.id });
      void utils.trello.getCardActions.prefetch({ cardId: cardToOpen.id });
      setDialogCard(cardToOpen);
    },
    [utils]
  );

  const allCards = (boardFull?.cards as TrelloCard[]) ?? [];
  const allLists = (boardFull?.lists as TrelloList[]) ?? [];
  const boardLabels = (boardFull?.labels as TrelloLabel[]) ?? [];
  const boardMembers = (boardFull?.members as TrelloMember[]) ?? [];

  const filteredCards = useMemo(() => {
    const now = new Date();
    return allCards.filter((card) => {
      if (filterText) {
        const query = filterText.toLowerCase();
        if (
          !card.name.toLowerCase().includes(query) &&
          !card.desc?.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      if (
        filterLabelIds.length > 0 &&
        !filterLabelIds.some((id) => card.labels.some((label) => label.id === id))
      ) {
        return false;
      }

      if (
        filterMemberIds.length > 0 &&
        !filterMemberIds.some((id) => card.idMembers?.includes(id))
      ) {
        return false;
      }

      if (filterDue === "overdue") {
        if (!card.due || card.dueComplete || new Date(card.due) >= now) {
          return false;
        }
      }

      if (filterDue === "soon") {
        if (!card.due || card.dueComplete) return false;
        const dueDate = new Date(card.due);
        if (dueDate < now || dueDate > new Date(now.getTime() + 86400 * 2000)) {
          return false;
        }
      }

      if (filterDue === "none" && card.due) {
        return false;
      }

      return true;
    });
  }, [allCards, filterDue, filterLabelIds, filterMemberIds, filterText]);

  const hasFilter =
    !!filterText ||
    filterLabelIds.length > 0 ||
    filterMemberIds.length > 0 ||
    !!filterDue;

  function handleShareBoard() {
    const url = board?.url ?? window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function clearFilters() {
    setFilterText("");
    setFilterLabelIds([]);
    setFilterMemberIds([]);
    setFilterDue("");
  }

  function toggleLabelFilter(id: string) {
    setFilterLabelIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  function toggleMemberFilter(id: string) {
    setFilterMemberIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
        <Button className="gap-1.5 shrink-0" onClick={onBack} size="sm" variant="ghost">
          <ArrowLeft size={16} />
          All Boards
        </Button>
        <div className="h-5 w-px bg-border" />
        <div
          className="h-5 w-5 shrink-0 rounded"
          style={{ backgroundColor: board?.prefs?.backgroundColor ?? "#0052CC" }}
        />
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{board?.name}</h1>

        <Tabs onValueChange={(value) => setView(value as typeof view)} value={view}>
          <TabsList className="h-8">
            <TabsTrigger className="h-7 gap-1 px-2.5 text-xs" value="board">
              <LayoutGrid size={13} /> Board
            </TabsTrigger>
            <TabsTrigger className="h-7 gap-1 px-2.5 text-xs" value="table">
              <Table2 size={13} /> Table
            </TabsTrigger>
            <TabsTrigger className="h-7 gap-1 px-2.5 text-xs" value="calendar">
              <Calendar size={13} /> Calendar
            </TabsTrigger>
            <TabsTrigger className="h-7 gap-1 px-2.5 text-xs" value="timeline">
              <GanttChartSquare size={13} /> Timeline
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          className="gap-1.5 shrink-0"
          onClick={handleShareBoard}
          size="sm"
          title="Copy board link"
          variant="ghost"
        >
          {copied ? (
            <Check className="text-green-500" size={16} />
          ) : (
            <Share2 size={16} />
          )}
          <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
        </Button>

        <ArchiveSheet boardId={boardId} onRestored={() => void refetchDetail()} />
        <ActivitySheet boardId={boardId} />

        {board?.url && (
          <a
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            href={board.url}
            rel="noopener noreferrer"
            target="_blank"
            title="Open in Trello"
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/40 px-4 py-2">
        <Filter className="shrink-0 text-muted-foreground" size={13} />
        <Input
          className="h-7 w-40 text-xs"
          onChange={(event) => setFilterText(event.target.value)}
          placeholder="Filter cards..."
          value={filterText}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className={cn(
                "h-7 gap-1 text-xs",
                filterLabelIds.length > 0 && "border-primary text-primary"
              )}
              size="sm"
              variant="outline"
            >
              Labels {filterLabelIds.length > 0 && `(${filterLabelIds.length})`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs">Filter by label</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {boardLabels.map((label) => (
              <DropdownMenuCheckboxItem
                checked={filterLabelIds.includes(label.id)}
                className="text-xs"
                key={label.id}
                onCheckedChange={() => toggleLabelFilter(label.id)}
              >
                <span
                  className="mr-2 inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: LABEL_COLORS[label.color] ?? "#b3bac5" }}
                />
                {label.name || label.color}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className={cn(
                "h-7 gap-1 text-xs",
                filterMemberIds.length > 0 && "border-primary text-primary"
              )}
              size="sm"
              variant="outline"
            >
              Members {filterMemberIds.length > 0 && `(${filterMemberIds.length})`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs">Filter by member</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {boardMembers.map((member) => (
              <DropdownMenuCheckboxItem
                checked={filterMemberIds.includes(member.id)}
                className="text-xs"
                key={member.id}
                onCheckedChange={() => toggleMemberFilter(member.id)}
              >
                {member.fullName}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className={cn("h-7 gap-1 text-xs", filterDue && "border-primary text-primary")}
              size="sm"
              variant="outline"
            >
              Due {filterDue ? `(${filterDue})` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel className="text-xs">Filter by due date</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              onValueChange={(value) => setFilterDue(value as typeof filterDue)}
              value={filterDue}
            >
              <DropdownMenuRadioItem className="text-xs" value="">
                Any
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem className="text-xs" value="overdue">
                Overdue
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem className="text-xs" value="soon">
                Due in 2 days
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem className="text-xs" value="none">
                No due date
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {hasFilter && (
          <Button
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={clearFilters}
            size="sm"
            variant="ghost"
          >
            <X size={12} /> Clear
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {detailLoading || !boardFull ? (
          <ViewSkeleton />
        ) : (
          <Suspense fallback={<ViewSkeleton />}>
            {view === "board" ? (
              <KanbanBoard
                boardId={boardId}
                cards={filteredCards}
                lists={allLists}
                onRefetch={() => void refetchDetail()}
              />
            ) : view === "table" ? (
              <TableView
                cards={filteredCards}
                lists={allLists}
                onCardClick={(card) => openDialogForCard(card as TrelloCard)}
              />
            ) : view === "calendar" ? (
              <CalendarView
                cards={filteredCards}
                lists={allLists}
                onCardClick={(card) => openDialogForCard(card as TrelloCard)}
              />
            ) : (
              <TimelineView
                cards={filteredCards}
                lists={allLists}
                onCardClick={(card) => openDialogForCard(card as TrelloCard)}
              />
            )}
          </Suspense>
        )}
      </div>

      {dialogCard && (
        <CardDialog
          boardId={boardId}
          card={dialogCard}
          lists={allLists}
          onClose={() => setDialogCard(null)}
          onRefetch={() => {
            void refetchDetail();
          }}
        />
      )}
    </div>
  );
}
