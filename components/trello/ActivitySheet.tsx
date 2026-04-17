"use client";

import { useState } from "react";
import { Activity } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/core/trpc";

import type { TrelloAction } from "./types";

type ActivitySheetProps = {
  boardId: string;
};

function actionSentence(action: TrelloAction) {
  const name = action.memberCreator?.fullName ?? "Someone";
  const data = action.data;

  switch (action.type) {
    case "createCard":
      return `${name} created card "${data?.card?.name}"`;
    case "updateCard":
      if (data?.listBefore && data?.listAfter) {
        return `${name} moved "${data.card?.name}" from "${data.listBefore.name}" to "${data.listAfter.name}"`;
      }
      if (data?.card?.closed === true) {
        return `${name} archived "${data.card?.name}"`;
      }
      if (data?.card?.closed === false) {
        return `${name} restored "${data.card?.name}"`;
      }
      return `${name} updated card "${data?.card?.name}"`;
    case "commentCard":
      return `${name} commented on "${data?.card?.name}"`;
    case "addMemberToCard":
      return `${name} added a member to "${data?.card?.name}"`;
    case "removeMemberFromCard":
      return `${name} removed a member from "${data?.card?.name}"`;
    case "addAttachmentToCard":
      return `${name} attached "${data?.attachment?.name}" to "${data?.card?.name}"`;
    case "deleteAttachmentFromCard":
      return `${name} removed attachment from "${data?.card?.name}"`;
    case "createList":
      return `${name} created list "${data?.list?.name}"`;
    case "updateList":
      return `${name} updated list "${data?.list?.name}"`;
    case "archiveList":
      return `${name} archived list "${data?.list?.name}"`;
    case "addChecklistToCard":
      return `${name} added checklist to "${data?.card?.name}"`;
    default:
      return `${name} performed action: ${action.type}`;
  }
}

export function ActivitySheet({ boardId }: ActivitySheetProps) {
  const [open, setOpen] = useState(false);
  const { data: boardActions = [], isLoading } = trpc.trello.getBoardActions.useQuery(
    { boardId },
    { enabled: open, refetchOnWindowFocus: false }
  );

  const actions = boardActions as TrelloAction[];

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button className="gap-1.5" size="sm" title="Board activity" variant="ghost">
          <Activity size={16} />
          <span className="hidden sm:inline">Activity</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Board Activity</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
          ) : actions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No recent activity
            </p>
          ) : (
            actions.map((action) => (
              <div className="flex gap-2.5" key={action.id}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                  {action.memberCreator?.fullName?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-snug text-foreground">
                    {actionSentence(action)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
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
