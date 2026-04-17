"use client";

import { useState } from "react";
import { Archive } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/core/trpc";
import { useRole } from "@/hooks/use-role";

type ArchivedItem = {
  id: string;
  name: string;
};

type ArchiveSheetProps = {
  boardId: string;
  onRestored: () => void;
};

export function ArchiveSheet({ boardId, onRestored }: ArchiveSheetProps) {
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
    onSuccess: () => {
      void refetchCards();
      onRestored();
    },
  });

  const unarchiveList = trpc.trello.unarchiveList.useMutation({
    onSuccess: () => {
      void refetchLists();
      onRestored();
    },
  });

  const cardItems = archivedCards as ArchivedItem[];
  const listItems = archivedLists as ArchivedItem[];

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button className="gap-1.5" size="sm" title="Archived items" variant="ghost">
          <Archive size={16} />
          <span className="hidden sm:inline">Archive</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Archived Items</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => setTab("cards")}
              size="sm"
              variant={tab === "cards" ? "default" : "outline"}
            >
              Cards ({cardItems.length})
            </Button>
            <Button
              className="flex-1"
              onClick={() => setTab("lists")}
              size="sm"
              variant={tab === "lists" ? "default" : "outline"}
            >
              Lists ({listItems.length})
            </Button>
          </div>

          {tab === "cards" && (
            <div className="space-y-2">
              {cardsLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
              ) : cardItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No archived cards
                </p>
              ) : (
                cardItems.map((card) => (
                  <div
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5"
                    key={card.id}
                  >
                    <span className="flex-1 truncate text-sm">{card.name}</span>
                    {isEditor && (
                      <Button
                        className="h-7 shrink-0 text-xs"
                        disabled={unarchiveCard.isPending}
                        onClick={() => unarchiveCard.mutate({ cardId: card.id })}
                        size="sm"
                        variant="outline"
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
                <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
              ) : listItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No archived lists
                </p>
              ) : (
                listItems.map((list) => (
                  <div
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5"
                    key={list.id}
                  >
                    <span className="flex-1 truncate text-sm">{list.name}</span>
                    {isEditor && (
                      <Button
                        className="h-7 shrink-0 text-xs"
                        disabled={unarchiveList.isPending}
                        onClick={() => unarchiveList.mutate({ listId: list.id })}
                        size="sm"
                        variant="outline"
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
