"use client";

import { useState } from "react";
import { trpc } from "@/lib/core/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, ListChecks, Calendar, Layers, CreditCard, CheckCircle2, Trello } from "lucide-react";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  onCreated?: () => void;
}

export function CreateCheckItemDialog({ open, onOpenChange, defaultDate, onCreated }: Props) {
  const [boardId, setBoardId] = useState("");
  const [listId, setListId] = useState("");
  const [cardId, setCardId] = useState("");
  const [checklistId, setChecklistId] = useState("");
  const [itemName, setItemName] = useState("");
  const [dueDate, setDueDate] = useState(
    defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
  );

  // Boards
  const { data: boards = [], isLoading: loadingBoards, error: boardsError } = trpc.trello.getBoards.useQuery(undefined, {
    enabled: open,
  });
  const needsTrelloConnect = boardsError?.message === "trello_access_required";

  // Lists + Cards for chosen board
  const { data: boardDetail, isLoading: loadingBoard } = trpc.trello.getBoardDetail.useQuery(
    { boardId },
    { enabled: open && !!boardId }
  );
  const lists = (boardDetail?.lists ?? []) as { id: string; name: string }[];
  const allCards = (boardDetail?.cards ?? []) as { id: string; name: string; idList: string }[];
  const cards = allCards.filter((c) => c.idList === listId);

  // Checklists for chosen card
  const { data: checklists = [], isLoading: loadingChecklists } = trpc.trello.getCardChecklists.useQuery(
    { cardId },
    { enabled: open && !!cardId }
  );

  const createCheckItemFull = trpc.trello.createCheckItemFull.useMutation({
    onSuccess: () => {
      onCreated?.();
      onOpenChange(false);
      reset();
    },
  });

  const reset = () => {
    setBoardId("");
    setListId("");
    setCardId("");
    setChecklistId("");
    setItemName("");
    setDueDate(format(new Date(), "yyyy-MM-dd"));
  };

  const handleCreate = () => {
    if (!checklistId || !itemName.trim()) return;
    const iso = dueDate ? new Date(dueDate + "T23:59:00").toISOString() : undefined;
    createCheckItemFull.mutate({
      checklistId,
      cardId,
      name: itemName.trim(),
      due: iso,
    });
  };

  const steps = [
    { icon: Layers, label: "Board", done: !!boardId, active: !boardId },
    { icon: ListChecks, label: "List", done: !!listId, active: !!boardId && !listId },
    { icon: CreditCard, label: "Card", done: !!cardId, active: !!listId && !cardId },
    { icon: CheckCircle2, label: "Checklist", done: !!checklistId, active: !!cardId && !checklistId },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-[420px] bg-background/80 backdrop-blur-3xl border-white/8 text-foreground rounded-2xl p-0 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle className="text-base font-[600] tracking-tight">Add To-Do Item</DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-0 mt-3 p-1 bg-white/[0.03] border border-white/5 rounded-xl">
            {steps.map((s, ix) => (
              <div key={s.label} className="flex items-center flex-1">
                <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg flex-1 transition-all ${
                  s.done ? "bg-primary/10" : s.active ? "bg-white/[0.05]" : ""
                }`}>
                  <s.icon className={`w-3 h-3 ${s.done ? "text-primary" : s.active ? "text-foreground/70" : "text-muted-foreground/30"}`} />
                  <span className={`text-[9px] font-[600] uppercase tracking-wider ${
                    s.done ? "text-primary" : s.active ? "text-foreground/70" : "text-muted-foreground/30"
                  }`}>
                    {s.label}
                  </span>
                </div>
                {ix < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/20 shrink-0 mx-0.5" />}
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="px-5 pb-5 space-y-2.5">
          {needsTrelloConnect && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Trello className="text-muted-foreground/20" size={32} />
              <div>
                <p className="text-sm font-medium text-foreground">Connect your Trello account</p>
                <p className="mt-1 text-xs text-muted-foreground">Grant access to create to-do items.</p>
              </div>
              <Button
                size="sm"
                onClick={() => { window.location.href = "/api/connect/trello?callbackUrl=/"; }}
              >
                Connect Trello
              </Button>
            </div>
          )}
          {!needsTrelloConnect && (<>
          {/* Board */}
          <Select value={boardId} onValueChange={(v) => { setBoardId(v); setListId(""); setCardId(""); setChecklistId(""); }}>
            <SelectTrigger className="bg-white/[0.03] border-white/5 h-9 rounded-xl text-sm">
              <SelectValue placeholder={loadingBoards ? "Loading…" : "Select Board"} />
            </SelectTrigger>
            <SelectContent className="bg-background/95 backdrop-blur-xl border-white/5 rounded-xl">
              {boards.map((b: { id: string; name: string }) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* List */}
          {boardId && (
            <Select
              value={listId}
              onValueChange={(v) => { setListId(v); setCardId(""); setChecklistId(""); }}
              disabled={loadingBoard}
            >
              <SelectTrigger className="bg-white/[0.03] border-white/5 h-9 rounded-xl text-sm">
                <SelectValue placeholder={loadingBoard ? "Loading…" : "Select List"} />
              </SelectTrigger>
              <SelectContent className="bg-background/95 backdrop-blur-xl border-white/5 rounded-xl">
                {lists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Card */}
          {listId && (
            <Select
              value={cardId}
              onValueChange={(v) => { setCardId(v); setChecklistId(""); }}
            >
              <SelectTrigger className="bg-white/[0.03] border-white/5 h-9 rounded-xl text-sm">
                <SelectValue placeholder={cards.length === 0 ? "No cards in this list" : "Select Card"} />
              </SelectTrigger>
              <SelectContent className="bg-background/95 backdrop-blur-xl border-white/5 rounded-xl">
                {cards.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Checklist */}
          {cardId && (
            <Select
              value={checklistId}
              onValueChange={setChecklistId}
              disabled={loadingChecklists}
            >
              <SelectTrigger className="bg-white/[0.03] border-white/5 h-9 rounded-xl text-sm">
                <SelectValue placeholder={loadingChecklists ? "Loading…" : checklists.length === 0 ? "No checklists on card" : "Select Checklist"} />
              </SelectTrigger>
              <SelectContent className="bg-background/95 backdrop-blur-xl border-white/5 rounded-xl">
                {(checklists as { id: string; name: string }[]).map((cl) => (
                  <SelectItem key={cl.id} value={cl.id}>{cl.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Item name + Due date (visible once checklist is selected) */}
          {checklistId && (
            <div className="space-y-2.5 pt-1 border-t border-white/5 mt-3">
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="What needs to be done?"
                className="bg-white/[0.03] border-white/5 h-9 rounded-xl placeholder:text-muted-foreground/40 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-[600] uppercase tracking-wider">Due</span>
                </div>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="bg-white/[0.03] border-white/5 h-8 rounded-lg text-xs flex-1"
                />
              </div>
            </div>
          )}

          <Button
            className="w-full h-9 rounded-xl font-[600] text-sm mt-1"
            onClick={handleCreate}
            disabled={!checklistId || !itemName.trim() || createCheckItemFull.isPending}
          >
            {createCheckItemFull.isPending ? "Adding…" : "Add To-Do Item"}
          </Button>
          </>)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
