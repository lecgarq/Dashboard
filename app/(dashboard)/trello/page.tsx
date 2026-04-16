"use client";

import { Suspense, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/core/trpc";
import { useRole } from "@/hooks/use-role";
import {
  ArrowLeft,
  ExternalLink,
  AlertCircle,
  LayoutGrid,
  Calendar,
  GanttChartSquare,
  Table2,
  Archive,
  X,
  Filter,
  Activity,
  Share2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/core/utils";

function ViewSkeleton() {
  return (
    <div className="flex gap-4 p-6 h-full">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="w-64 shrink-0 rounded-xl bg-muted animate-pulse h-48" />
      ))}
    </div>
  );
}

const KanbanBoard = dynamic(
  () => import("@/components/trello/KanbanBoard").then((m) => m.KanbanBoard),
  { ssr: false, loading: ViewSkeleton }
);

const CalendarView = dynamic(
  () => import("@/components/trello/CalendarView").then((m) => m.CalendarView),
  { ssr: false, loading: ViewSkeleton }
);

const TimelineView = dynamic(
  () => import("@/components/trello/TimelineView").then((m) => m.TimelineView),
  { ssr: false, loading: ViewSkeleton }
);

const TableView = dynamic(
  () => import("@/components/trello/TableView").then((m) => m.TableView),
  { ssr: false, loading: ViewSkeleton }
);

const CardDialog = dynamic(
  () => import("@/components/trello/CardDialog").then((m) => m.CardDialog),
  { ssr: false }
);

type TrelloBoard = {
  id: string;
  name: string;
  desc: string;
  url: string;
  dateLastActivity: string;
  prefs: { backgroundColor?: string; backgroundImage?: string };
};

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

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  );
}

// ── Archive Sheet ─────────────────────────────────────────────────────────────

function ArchiveSheet({
  boardId,
  onRestored,
}: {
  boardId: string;
  onRestored: () => void;
}) {
  const { isEditor } = useRole();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"cards" | "lists">("cards");

  const {
    data: archivedCards = [],
    isLoading: cardsLoading,
    refetch: refetchCards,
  } = trpc.trello.getArchivedCards.useQuery(
    { boardId },
    { enabled: open, refetchOnWindowFocus: false }
  );

  const {
    data: archivedLists = [],
    isLoading: listsLoading,
    refetch: refetchLists,
  } = trpc.trello.getArchivedLists.useQuery(
    { boardId },
    { enabled: open, refetchOnWindowFocus: false }
  );

  const unarchiveCard = trpc.trello.unarchiveCard.useMutation({
    onSuccess: () => { refetchCards(); onRestored(); },
  });

  const unarchiveList = trpc.trello.unarchiveList.useMutation({
    onSuccess: () => { refetchLists(); onRestored(); },
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5" title="Archived items">
          <Archive size={16} />
          <span className="hidden sm:inline">Archive</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Archived Items</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Button
              variant={tab === "cards" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("cards")}
              className="flex-1"
            >
              Cards ({(archivedCards as any[]).length})
            </Button>
            <Button
              variant={tab === "lists" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("lists")}
              className="flex-1"
            >
              Lists ({(archivedLists as any[]).length})
            </Button>
          </div>

          {tab === "cards" && (
            <div className="space-y-2">
              {cardsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
              ) : (archivedCards as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No archived cards</p>
              ) : (
                (archivedCards as any[]).map((card: any) => (
                  <div
                    key={card.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 gap-2"
                  >
                    <span className="text-sm truncate flex-1">{card.name}</span>
                    {isEditor && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        disabled={unarchiveCard.isPending}
                        onClick={() => unarchiveCard.mutate({ cardId: card.id })}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "lists" && (
            <div className="space-y-2">
              {listsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
              ) : (archivedLists as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No archived lists</p>
              ) : (
                (archivedLists as any[]).map((list: any) => (
                  <div
                    key={list.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 gap-2"
                  >
                    <span className="text-sm truncate flex-1">{list.name}</span>
                    {isEditor && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        disabled={unarchiveList.isPending}
                        onClick={() => unarchiveList.mutate({ listId: list.id })}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Activity Sheet ────────────────────────────────────────────────────────────

function ActivitySheet({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false);

  const { data: boardActions = [], isLoading } = trpc.trello.getBoardActions.useQuery(
    { boardId },
    { enabled: open, refetchOnWindowFocus: false }
  );

  function actionSentence(action: any): string {
    const name = action.memberCreator?.fullName ?? "Someone";
    const d = action.data;
    switch (action.type) {
      case "createCard": return `${name} created card "${d?.card?.name}"`;
      case "updateCard":
        if (d?.listBefore && d?.listAfter) return `${name} moved "${d.card?.name}" from "${d.listBefore?.name}" to "${d.listAfter?.name}"`;
        if (d?.card?.closed === true) return `${name} archived "${d.card?.name}"`;
        if (d?.card?.closed === false) return `${name} restored "${d.card?.name}"`;
        return `${name} updated card "${d?.card?.name}"`;
      case "commentCard": return `${name} commented on "${d?.card?.name}"`;
      case "addMemberToCard": return `${name} added a member to "${d?.card?.name}"`;
      case "removeMemberFromCard": return `${name} removed a member from "${d?.card?.name}"`;
      case "addAttachmentToCard": return `${name} attached "${d?.attachment?.name}" to "${d?.card?.name}"`;
      case "deleteAttachmentFromCard": return `${name} removed attachment from "${d?.card?.name}"`;
      case "createList": return `${name} created list "${d?.list?.name}"`;
      case "updateList": return `${name} updated list "${d?.list?.name}"`;
      case "archiveList": return `${name} archived list "${d?.list?.name}"`;
      case "addChecklistToCard": return `${name} added checklist to "${d?.card?.name}"`;
      default: return `${name} performed action: ${action.type}`;
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5" title="Board activity">
          <Activity size={16} />
          <span className="hidden sm:inline">Activity</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Board Activity</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : (boardActions as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
          ) : (
            (boardActions as any[]).map((action: any) => (
              <div key={action.id} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary">
                  {action.memberCreator?.fullName?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-snug">{actionSentence(action)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(action.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Board view ────────────────────────────────────────────────────────────────

function BoardView({
  board,
  boardId,
  onBack,
}: {
  board: TrelloBoard | null;
  boardId: string;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const [view, setView] = useState<"board" | "calendar" | "timeline" | "table">("board");
  const [copied, setCopied] = useState(false);

  function handleShareBoard() {
    const url = board?.url ?? window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
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

  const allCards: TrelloCard[] = (boardFull?.cards as TrelloCard[]) ?? [];
  const allLists: TrelloList[] = (boardFull?.lists as TrelloList[]) ?? [];
  const boardLabels = (boardFull?.labels ?? []) as any[];
  const boardMembers = (boardFull?.members ?? []) as any[];

  const filteredCards = useMemo(() => {
    const now = new Date();
    return allCards.filter((card) => {
      if (filterText) {
        const q = filterText.toLowerCase();
        if (!card.name.toLowerCase().includes(q) && !card.desc?.toLowerCase().includes(q)) return false;
      }
      if (filterLabelIds.length > 0) {
        if (!filterLabelIds.some((id) => card.labels.some((l) => l.id === id))) return false;
      }
      if (filterMemberIds.length > 0) {
        if (!filterMemberIds.some((id) => card.idMembers?.includes(id))) return false;
      }
      if (filterDue === "overdue") {
        if (!card.due || card.dueComplete || new Date(card.due) >= now) return false;
      }
      if (filterDue === "soon") {
        if (!card.due || card.dueComplete) return false;
        const d = new Date(card.due);
        if (d < now || d > new Date(now.getTime() + 86400 * 2000)) return false;
      }
      if (filterDue === "none") {
        if (card.due) return false;
      }
      return true;
    });
  }, [allCards, filterText, filterLabelIds, filterMemberIds, filterDue]);

  const hasFilter = filterText || filterLabelIds.length > 0 || filterMemberIds.length > 0 || filterDue;

  function clearFilters() {
    setFilterText("");
    setFilterLabelIds([]);
    setFilterMemberIds([]);
    setFilterDue("");
  }

  function toggleLabelFilter(id: string) {
    setFilterLabelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleMemberFilter(id: string) {
    setFilterMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 shrink-0">
          <ArrowLeft size={16} />
          All Boards
        </Button>
        <div className="h-5 w-px bg-border" />
        <div
          className="w-5 h-5 rounded shrink-0"
          style={{ backgroundColor: board?.prefs?.backgroundColor ?? "#0052CC" }}
        />
        <h1 className="text-base font-semibold truncate flex-1 min-w-0">{board?.name}</h1>

        {/* View switcher */}
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList className="h-8">
            <TabsTrigger value="board" className="h-7 gap-1 text-xs px-2.5">
              <LayoutGrid size={13} /> Board
            </TabsTrigger>
            <TabsTrigger value="table" className="h-7 gap-1 text-xs px-2.5">
              <Table2 size={13} /> Table
            </TabsTrigger>
            <TabsTrigger value="calendar" className="h-7 gap-1 text-xs px-2.5">
              <Calendar size={13} /> Calendar
            </TabsTrigger>
            <TabsTrigger value="timeline" className="h-7 gap-1 text-xs px-2.5">
              <GanttChartSquare size={13} /> Timeline
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Share board */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={handleShareBoard}
          title="Copy board link"
        >
          {copied ? <Check size={16} className="text-green-500" /> : <Share2 size={16} />}
          <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
        </Button>

        {/* Archive */}
        <ArchiveSheet boardId={boardId} onRestored={() => refetchDetail()} />
        <ActivitySheet boardId={boardId} />

        {/* External link */}
        {board?.url && (
          <a
            href={board.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Open in Trello"
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 shrink-0 flex-wrap">
        <Filter size={13} className="text-muted-foreground shrink-0" />
        <Input
          placeholder="Filter cards…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="h-7 text-xs w-40"
        />

        {/* Label filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-7 text-xs gap-1", filterLabelIds.length > 0 && "border-primary text-primary")}
            >
              Labels {filterLabelIds.length > 0 && `(${filterLabelIds.length})`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs">Filter by label</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(boardLabels as any[]).map((label: any) => (
              <DropdownMenuCheckboxItem
                key={label.id}
                checked={filterLabelIds.includes(label.id)}
                onCheckedChange={() => toggleLabelFilter(label.id)}
                className="text-xs"
              >
                <span
                  className="inline-block w-3 h-3 rounded-full mr-2 shrink-0"
                  style={{ backgroundColor: LABEL_COLORS[label.color] ?? "#b3bac5" }}
                />
                {label.name || label.color}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Member filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-7 text-xs gap-1", filterMemberIds.length > 0 && "border-primary text-primary")}
            >
              Members {filterMemberIds.length > 0 && `(${filterMemberIds.length})`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs">Filter by member</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(boardMembers as any[]).map((member: any) => (
              <DropdownMenuCheckboxItem
                key={member.id}
                checked={filterMemberIds.includes(member.id)}
                onCheckedChange={() => toggleMemberFilter(member.id)}
                className="text-xs"
              >
                {member.fullName}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Due date filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-7 text-xs gap-1", filterDue && "border-primary text-primary")}
            >
              Due {filterDue ? `(${filterDue})` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel className="text-xs">Filter by due date</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filterDue}
              onValueChange={(v) => setFilterDue(v as typeof filterDue)}
            >
              <DropdownMenuRadioItem value="" className="text-xs">Any</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="overdue" className="text-xs">Overdue</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="soon" className="text-xs">Due in 2 days</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="none" className="text-xs">No due date</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={clearFilters}
          >
            <X size={12} /> Clear
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {detailLoading || !boardFull ? (
          <ViewSkeleton />
        ) : (
          <Suspense fallback={<ViewSkeleton />}>
            {view === "board" ? (
              <KanbanBoard
                lists={allLists}
                cards={filteredCards}
                boardId={boardId}
                onRefetch={() => refetchDetail()}
              />
            ) : view === "table" ? (
              <TableView
                cards={filteredCards}
                lists={allLists}
                onCardClick={(c) => openDialogForCard(c as TrelloCard)}
              />
            ) : view === "calendar" ? (
              <CalendarView
                cards={filteredCards}
                lists={allLists}
                onCardClick={(c) => openDialogForCard(c as TrelloCard)}
              />
            ) : (
              <TimelineView
                cards={filteredCards}
                lists={allLists}
                onCardClick={(c) => openDialogForCard(c as TrelloCard)}
              />
            )}
          </Suspense>
        )}
      </div>

      {/* CardDialog for calendar/timeline card clicks */}
      {dialogCard && (
        <CardDialog
          card={dialogCard}
          lists={allLists}
          boardId={boardId}
          onClose={() => setDialogCard(null)}
          onRefetch={() => {
            refetchDetail();
          }}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrelloPage() {
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<TrelloBoard | null>(null);

  const {
    data: boards = [],
    isLoading: boardsLoading,
    error: boardsError,
  } = trpc.trello.getBoards.useQuery();

  function handleSelectBoard(board: TrelloBoard) {
    setSelectedBoard(board);
    setSelectedBoardId(board.id);
  }

  function handleBack() {
    setSelectedBoardId(null);
    setSelectedBoard(null);
  }

  if (selectedBoardId) {
    return (
      <BoardView
        board={selectedBoard}
        boardId={selectedBoardId}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Trello Workspace</h1>

      {boardsLoading ? (
        <BoardSkeleton />
      ) : boardsError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle size={32} className="text-destructive/50" />
          <p className="text-sm font-medium text-foreground">Trello connection failed</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Check that <code className="bg-muted px-1 rounded">TRELLO_TOKEN</code> is set in your{" "}
            <code className="bg-muted px-1 rounded">.env</code> file.
          </p>
        </div>
      ) : boards.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          No open boards found in your Trello workspace.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(boards as TrelloBoard[]).map((board) => (
            <button
              key={board.id}
              onClick={() => handleSelectBoard(board)}
              className="group relative h-28 rounded-xl overflow-hidden text-left transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary"
              style={{
                backgroundColor: board.prefs?.backgroundColor ?? "#0052CC",
                backgroundImage: board.prefs?.backgroundImage
                  ? `url(${board.prefs.backgroundImage})`
                  : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
              <div className="absolute inset-0 p-4 flex flex-col justify-between">
                <span className="text-white font-semibold text-sm leading-tight drop-shadow">
                  {board.name}
                </span>
                <span className="text-white/70 text-xs">
                  {board.dateLastActivity
                    ? `Updated ${new Date(board.dateLastActivity).toLocaleDateString()}`
                    : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
