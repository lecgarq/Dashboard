"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/use-role";
import { CardDialog } from "./CardDialog";
import { cn } from "@/lib/utils";
import { Plus, X, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type TrelloList = {
  id: string;
  name: string;
  pos: number;
};

type TrelloLabel = {
  id: string;
  name: string;
  color: string;
};

type TrelloCard = {
  id: string;
  name: string;
  desc: string;
  idList: string;
  pos: number;
  due: string | null;
  dueComplete: boolean;
  labels: TrelloLabel[];
  url: string;
  cover?: { color?: string; idAttachmentCover?: string };
};

// ── Position calculation ─────────────────────────────────────────────────────

function computeNewPos(items: { pos: number }[], newIdx: number): number {
  const prev = items[newIdx - 1]?.pos ?? 0;
  const next = items[newIdx + 1]?.pos ?? (items[newIdx]?.pos ?? 65536) + 131072;
  return (prev + next) / 2;
}

// ── Label color map ──────────────────────────────────────────────────────────

function labelColor(color: string): string {
  const map: Record<string, string> = {
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
  return map[color] ?? "#b3bac5";
}

// ── Card chip (sortable) ─────────────────────────────────────────────────────

function SortableCard({
  card,
  isEditor,
  onCardClick,
}: {
  card: TrelloCard;
  isEditor: boolean;
  onCardClick: (card: TrelloCard) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, data: { type: "card", card, listId: card.idList } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dueSoon =
    card.due && !card.dueComplete
      ? new Date(card.due) < new Date(Date.now() + 86400 * 1000 * 2)
      : false;

  const coverColor = card.cover?.color ? labelColor(card.cover.color) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isEditor ? attributes : {})}
      {...(isEditor ? listeners : {})}
      className={cn(
        "bg-card border border-border rounded-lg shadow-sm hover:shadow transition-shadow group overflow-hidden",
        isEditor ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "opacity-30"
      )}
      onClick={() => onCardClick(card)}
    >
      {coverColor && (
        <div className="h-8 w-full" style={{ backgroundColor: coverColor }} />
      )}
      <div className="p-3">
        {/* Labels */}
        {card.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {card.labels.map((label) => (
              <span
                key={label.id}
                className="h-2 w-8 rounded-full"
                style={{ backgroundColor: labelColor(label.color) }}
                title={label.name}
              />
            ))}
          </div>
        )}

        <p className="text-sm font-medium text-foreground leading-snug">
          {card.name}
        </p>

        {/* Due date */}
        {card.due && (
          <div
            className={cn(
              "mt-2 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded",
              card.dueComplete
                ? "bg-green-100 text-green-700"
                : dueSoon
                ? "bg-red-100 text-red-700"
                : "bg-muted text-muted-foreground"
            )}
          >
            {new Date(card.due).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
            {card.dueComplete && " ✓"}
          </div>
        )}
      </div>
    </div>
  );
}
const MemoSortableCard = memo(SortableCard);

// ── Card ghost (DragOverlay) ─────────────────────────────────────────────────

function CardGhost({ card }: { card: TrelloCard }) {
  const coverColor = card.cover?.color ? labelColor(card.cover.color) : null;
  return (
    <div className="bg-card border border-primary/40 rounded-lg shadow-xl cursor-grabbing overflow-hidden w-64">
      {coverColor && <div className="h-8 w-full" style={{ backgroundColor: coverColor }} />}
      <div className="p-3">
        {card.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {card.labels.map((l) => (
              <span key={l.id} className="h-2 w-8 rounded-full" style={{ backgroundColor: labelColor(l.color) }} />
            ))}
          </div>
        )}
        <p className="text-sm font-medium">{card.name}</p>
      </div>
    </div>
  );
}

// ── Sortable column ──────────────────────────────────────────────────────────

function SortableColumn({
  list,
  cards,
  onCardClick,
  onRefetch,
  isDraggingList,
  isEditor,
}: {
  list: TrelloList;
  cards: TrelloCard[];
  onCardClick: (card: TrelloCard) => void;
  onRefetch: () => void;
  isDraggingList: boolean;
  isEditor: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id, data: { type: "list", list } });

  const [addingCard, setAddingCard] = useState(false);
  const [newCardName, setNewCardName] = useState("");

  const createCard = trpc.trello.createCard.useMutation({
    onSuccess: () => {
      onRefetch();
      setNewCardName("");
      setAddingCard(false);
    },
  });

  function submitCard() {
    if (!newCardName.trim()) return;
    createCard.mutate({ idList: list.id, name: newCardName.trim() });
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const cardIds = cards.map((c) => c.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("flex flex-col w-64 shrink-0", isDragging && "opacity-30")}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2 mb-2">
        {isEditor && (
          <button
            {...attributes}
            {...listeners}
            className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 mr-1"
            title="Drag to reorder list"
          >
            <GripVertical size={14} />
          </button>
        )}
        <h3 className="text-sm font-semibold text-foreground truncate flex-1">
          {list.name}
        </h3>
        <span className="text-xs text-muted-foreground ml-2 shrink-0">
          {cards.length}
        </span>
      </div>

      {/* Drop zone + cards */}
      <div
        className={cn(
          "flex-1 flex flex-col gap-2 p-2 rounded-xl min-h-[80px] transition-colors bg-muted/40",
          isDraggingList && "ring-1 ring-primary/20"
        )}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <MemoSortableCard
              key={card.id}
              card={card}
              isEditor={isEditor}
              onCardClick={onCardClick}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex-1 min-h-[40px]" />
        )}
      </div>

      {/* Add card */}
      {isEditor && (
        <div className="mt-2">
          {addingCard ? (
            <div className="space-y-2 px-1">
              <Input
                autoFocus
                value={newCardName}
                onChange={(e) => setNewCardName(e.target.value)}
                placeholder="Card title..."
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCard();
                  if (e.key === "Escape") setAddingCard(false);
                }}
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={submitCard}
                  disabled={!newCardName.trim() || createCard.isPending}
                >
                  Add card
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    setAddingCard(false);
                    setNewCardName("");
                  }}
                >
                  <X size={14} />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingCard(true)}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <Plus size={13} />
              Add a card
            </button>
          )}
        </div>
      )}
    </div>
  );
}
const MemoSortableColumn = memo(SortableColumn);

// ── Column ghost (DragOverlay) ────────────────────────────────────────────────

function ColumnGhost({ list, cards }: { list: TrelloList; cards: TrelloCard[] }) {
  return (
    <div className="flex flex-col w-64 shrink-0 opacity-90">
      <div className="flex items-center justify-between px-3 py-2 mb-2">
        <GripVertical size={14} className="text-muted-foreground/40 shrink-0 mr-1" />
        <h3 className="text-sm font-semibold text-foreground truncate flex-1">{list.name}</h3>
        <span className="text-xs text-muted-foreground ml-2 shrink-0">{cards.length}</span>
      </div>
      <div className="flex flex-col gap-2 p-2 rounded-xl bg-muted/40 border-2 border-dashed border-primary/30 min-h-[80px]">
        {cards.slice(0, 3).map((c) => (
          <div key={c.id} className="bg-card border border-border rounded-lg p-3 text-sm font-medium truncate">
            {c.name}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KanbanBoard ──────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  lists: TrelloList[];
  cards: TrelloCard[];
  boardId: string;
  onRefetch: () => void;
}

export function KanbanBoard({
  lists,
  cards,
  boardId,
  onRefetch,
}: KanbanBoardProps) {
  const utils = trpc.useUtils();
  const { isEditor } = useRole();
  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.pos - b.pos), [lists]);
  const [localCards, setLocalCards] = useState<TrelloCard[]>(cards);
  const [localLists, setLocalLists] = useState<TrelloList[]>(sortedLists);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [activeType, setActiveType] = useState<"card" | "list" | null>(null);
  const [dialogCard, setDialogCard] = useState<TrelloCard | null>(null);
  const [isPendingMove, setIsPendingMove] = useState(false);
  const [isPendingListMove, setIsPendingListMove] = useState(false);

  // Keep local drag state synced with server snapshots without setting state during render.
  useEffect(() => {
    if (!isPendingMove) {
      setLocalCards(cards);
    }
  }, [cards, isPendingMove]);

  useEffect(() => {
    if (!isPendingListMove) {
      setLocalLists(sortedLists);
    }
  }, [isPendingListMove, sortedLists]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const moveCard = trpc.trello.updateCard.useMutation({
    onError: () => {
      setIsPendingMove(false);
      setLocalCards(cards);
    },
    onSuccess: () => {
      setIsPendingMove(false);
      onRefetch();
    },
  });

  const moveList = trpc.trello.updateList.useMutation({
    onError: () => {
      setIsPendingListMove(false);
      setLocalLists([...lists].sort((a, b) => a.pos - b.pos));
    },
    onSuccess: () => {
      setIsPendingListMove(false);
      onRefetch();
    },
  });

  const handleOpenCard = useCallback(
    (card: TrelloCard) => {
      void utils.trello.getCardDetail.prefetch({ cardId: card.id });
      void utils.trello.getCardActions.prefetch({ cardId: card.id });
      setDialogCard(card);
    },
    [utils]
  );

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const type = active.data.current?.type as "card" | "list";
    setActiveId(active.id);
    setActiveType(type);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type !== "card") return;

    // Moving card over a card in a different list
    if (overData?.type === "card" && activeData.listId !== overData.listId) {
      setLocalCards((prev) =>
        prev.map((c) =>
          c.id === active.id
            ? { ...c, idList: overData.listId }
            : c
        )
      );
    }

    // Moving card over an empty list column
    if (overData?.type === "list" && activeData.listId !== over.id) {
      setLocalCards((prev) =>
        prev.map((c) =>
          c.id === active.id ? { ...c, idList: over.id as string } : c
        )
      );
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);

    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // ── List reorder ──
    if (activeData?.type === "list" && overData?.type === "list") {
      const oldIdx = localLists.findIndex((l) => l.id === active.id);
      const newIdx = localLists.findIndex((l) => l.id === over.id);
      if (oldIdx === newIdx) return;

      const moved = arrayMove(localLists, oldIdx, newIdx);
      const newPos = computeNewPos(moved, newIdx);
      const updated = moved.map((l, i) =>
        i === newIdx ? { ...l, pos: newPos } : l
      );

      setIsPendingListMove(true);
      setLocalLists(updated);
      moveList.mutate({ listId: active.id as string, pos: newPos });
      return;
    }

    // ── Card reorder ──
    if (activeData?.type === "card") {
      const activeCard = localCards.find((c) => c.id === active.id);
      if (!activeCard) return;

      const overCard = localCards.find((c) => c.id === over.id);
      const overListId = overData?.type === "list"
        ? (over.id as string)
        : overData?.type === "card"
        ? overData.listId
        : null;

      if (!overListId) return;

      const targetListCards = localCards
        .filter((c) => c.idList === overListId)
        .sort((a, b) => a.pos - b.pos);

      const oldIdx = targetListCards.findIndex((c) => c.id === active.id);

      // Card dropped on list droppable (empty list) → move to bottom
      if (overData?.type === "list") {
        const newPos = targetListCards.length > 0
          ? targetListCards[targetListCards.length - 1].pos + 131072
          : 65536;

        setIsPendingMove(true);
        setLocalCards((prev) =>
          prev.map((c) =>
            c.id === active.id ? { ...c, idList: overListId, pos: newPos } : c
          )
        );
        moveCard.mutate({ cardId: active.id as string, idList: overListId, pos: newPos });
        return;
      }

      // Card dropped on another card
      const overIdx = targetListCards.findIndex((c) => c.id === over.id);
      const sameList = activeCard.idList === overListId;

      if (sameList && oldIdx === overIdx) return;

      // Reorder within same list
      const listBeforeMove = sameList
        ? targetListCards
        : targetListCards.filter((c) => c.id !== active.id);

      // Build the reordered list
      const withActive = sameList
        ? arrayMove(targetListCards, oldIdx, overIdx)
        : (() => {
            const inserted = [...listBeforeMove];
            inserted.splice(overIdx, 0, { ...activeCard, idList: overListId });
            return inserted;
          })();

      const finalIdx = withActive.findIndex((c) => c.id === active.id);
      const newPos = computeNewPos(withActive, finalIdx);

      setIsPendingMove(true);
      setLocalCards((prev) =>
        prev.map((c) =>
          c.id === active.id ? { ...c, idList: overListId, pos: newPos } : c
        )
      );

      moveCard.mutate({
        cardId: active.id as string,
        idList: sameList ? undefined : overListId,
        pos: newPos,
      });
    }
  }

  // Active items for overlay
  const activeCard = activeType === "card"
    ? localCards.find((c) => c.id === activeId)
    : null;
  const activeList = activeType === "list"
    ? localLists.find((l) => l.id === activeId)
    : null;
  const cardsByListId = useMemo(() => {
    const grouped = new Map<string, TrelloCard[]>();
    for (const list of localLists) grouped.set(list.id, []);
    for (const card of localCards) {
      if (!grouped.has(card.idList)) grouped.set(card.idList, []);
      grouped.get(card.idList)!.push(card);
    }
    grouped.forEach((items) => items.sort((a, b) => a.pos - b.pos));
    return grouped;
  }, [localCards, localLists]);
  const activeListCards = activeList ? cardsByListId.get(activeList.id) ?? [] : [];

  const listIds = useMemo(() => localLists.map((l) => l.id), [localLists]);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-4 p-6 h-full overflow-x-auto pb-8">
            {localLists.map((list) => {
              const listCards = cardsByListId.get(list.id) ?? [];

              return (
                <MemoSortableColumn
                  key={list.id}
                  list={list}
                  cards={listCards}
                  onCardClick={handleOpenCard}
                  onRefetch={onRefetch}
                  isDraggingList={activeType === "list"}
                  isEditor={isEditor}
                />
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeCard && <CardGhost card={activeCard} />}
          {activeList && <ColumnGhost list={activeList} cards={activeListCards} />}
        </DragOverlay>
      </DndContext>

      {dialogCard && (
        <CardDialog
          card={dialogCard}
          lists={localLists}
          boardId={boardId}
          onClose={() => setDialogCard(null)}
          onRefetch={onRefetch}
        />
      )}
    </>
  );
}
