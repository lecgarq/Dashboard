"use client";

import { useState, useRef, useCallback } from "react";
import { trpc as trpcClient } from "@/lib/core/trpc";
import { useRole } from "@/hooks/use-role";
import { useTrelloLabelColor } from "@/lib/colors/useTrelloLabelColor";
import { LABEL_COLORS_LIGHT } from "@/lib/colors/trello";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ExternalLink,
  Archive,
  Plus,
  CheckSquare,
  MessageSquare,
  Users,
  Send,
  X,
  Tag,
  Paperclip,
  Link2,
  ImageIcon,
  Trash2,
  Pencil,
  Check,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/core/utils";

const COVER_COLORS = Object.keys(LABEL_COLORS_LIGHT);

type TrelloLabel = { id: string; name: string; color: string };
type TrelloMember = { id: string; fullName: string; username: string; avatarHash?: string; avatarUrl?: string };
type TrelloList = { id: string; name: string; pos: number };
type CheckItem = { id: string; name: string; state: "complete" | "incomplete" };
type Checklist = { id: string; name: string; checkItems: CheckItem[] };
type Attachment = { id: string; name: string; url: string; mimeType: string; previews?: { url: string }[] };

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
  idMembers?: string[];
  cover?: { color?: string; idAttachmentCover?: string };
};

interface CardDialogProps {
  card: TrelloCard;
  lists: TrelloList[];
  boardId: string;
  onClose: () => void;
  onRefetch: () => void;
}

function MemberAvatar({ member, size = "w-7 h-7" }: { member: TrelloMember; size?: string }) {
  const avatarUrl = member.avatarHash
    ? `https://trello-members.s3.amazonaws.com/${member.id}/${member.avatarHash}/30.png`
    : member.avatarUrl;

  return (
    <div
      className={`${size} rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden`}
      title={member.fullName}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={member.fullName} className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-primary">
          {member.fullName[0]?.toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ── Label Picker ──────────────────────────────────────────────────────────────

function LabelPicker({
  cardId,
  boardId,
  assignedLabels,
  onRefetch,
}: {
  cardId: string;
  boardId: string;
  assignedLabels: TrelloLabel[];
  onRefetch: () => void;
}) {
  const { isEditor } = useRole();
  const labelColor = useTrelloLabelColor();
  const [managing, setManaging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");

  const { data: boardLabels = [], refetch: refetchLabels } = trpcClient.trello.getBoardLabels.useQuery(
    { boardId },
    { refetchOnWindowFocus: false }
  );

  const addLabel = trpcClient.trello.addLabelToCard.useMutation({ onSuccess: onRefetch });
  const removeLabel = trpcClient.trello.removeLabelFromCard.useMutation({ onSuccess: onRefetch });
  const createLabel = trpcClient.trello.createLabel.useMutation({
    onSuccess: () => { setNewName(""); setNewColor("blue"); refetchLabels(); onRefetch(); },
  });
  const updateLabel = trpcClient.trello.updateLabel.useMutation({
    onSuccess: () => { setEditingId(null); refetchLabels(); onRefetch(); },
  });
  const deleteLabel = trpcClient.trello.deleteLabel.useMutation({
    onSuccess: () => { refetchLabels(); onRefetch(); },
  });

  const assignedIds = assignedLabels.map((l) => l.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          <Tag size={12} /> Labels
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 p-2" onCloseAutoFocus={(e) => e.preventDefault()}>
        {!managing ? (
          <>
            <DropdownMenuLabel className="text-xs px-1 pb-1">Board labels</DropdownMenuLabel>
            <div className="space-y-0.5">
              {(boardLabels as TrelloLabel[]).map((label) => {
                const assigned = assignedIds.includes(label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() =>
                      assigned
                        ? removeLabel.mutate({ cardId, labelId: label.id })
                        : addLabel.mutate({ cardId, labelId: label.id })
                    }
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted/50 text-xs"
                  >
                    <span
                      className="w-8 h-5 rounded shrink-0"
                      style={{ backgroundColor: labelColor(label.color) }}
                    />
                    <span className="flex-1 text-left truncate">{label.name || label.color}</span>
                    {assigned && <Check size={12} className="text-primary shrink-0" />}
                  </button>
                );
              })}
              {(boardLabels as TrelloLabel[]).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No labels on this board</p>
              )}
            </div>
            {isEditor && (
              <>
                <DropdownMenuSeparator className="my-2" />
                <button
                  onClick={() => setManaging(true)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground text-left px-2 py-1.5 rounded hover:bg-muted/50"
                >
                  + Manage labels
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 mb-2">
              <button
                onClick={() => { setManaging(false); setEditingId(null); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
              <span className="text-xs font-medium ml-1">Manage labels</span>
            </div>

            {/* Existing labels */}
            <div className="space-y-1 mb-3">
              {(boardLabels as TrelloLabel[]).map((label) => (
                <div key={label.id}>
                  {editingId === label.id ? (
                    <div className="space-y-1.5 p-1.5 bg-muted/30 rounded">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Label name"
                        className="h-7 text-xs"
                        autoFocus
                      />
                      <div className="flex flex-wrap gap-1">
                        {COVER_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setEditColor(c)}
                            className={cn("w-5 h-5 rounded", editColor === c && "ring-2 ring-primary ring-offset-1")}
                            style={{ backgroundColor: labelColor(c) }}
                            title={c}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="h-6 text-xs flex-1"
                          onClick={() => updateLabel.mutate({ labelId: label.id, name: editName, color: editColor })}
                          disabled={updateLabel.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 text-xs px-2"
                          onClick={() => deleteLabel.mutate({ labelId: label.id })}
                          disabled={deleteLabel.isPending}
                        >
                          <Trash2 size={11} />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingId(null)}>
                          <X size={11} />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="flex-1 px-2 py-1 rounded text-xs text-white font-medium truncate"
                        style={{ backgroundColor: labelColor(label.color) }}
                      >
                        {label.name || label.color}
                      </span>
                      <button
                        onClick={() => { setEditingId(label.id); setEditName(label.name); setEditColor(label.color); }}
                        className="p-1 text-muted-foreground hover:text-foreground rounded"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Create new */}
            <DropdownMenuSeparator className="mb-2" />
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-1">Create label</p>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Label name"
                className="h-7 text-xs"
              />
              <div className="flex flex-wrap gap-1 px-0.5">
                {COVER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={cn("w-5 h-5 rounded", newColor === c && "ring-2 ring-primary ring-offset-1")}
                    style={{ backgroundColor: labelColor(c) }}
                    title={c}
                  />
                ))}
              </div>
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => createLabel.mutate({ boardId, name: newName, color: newColor })}
                disabled={createLabel.isPending}
              >
                Create label
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Main Dialog ───────────────────────────────────────────────────────────────

export function CardDialog({ card, lists, boardId, onClose, onRefetch }: CardDialogProps) {
  const { isEditor } = useRole();
  const labelColor = useTrelloLabelColor();

  const [name, setName] = useState(card.name);
  const [desc, setDesc] = useState(card.desc ?? "");
  const [due, setDue] = useState(
    card.due ? card.due.slice(0, 16) : "" // "YYYY-MM-DDTHH:MM"
  );
  const [dueComplete, setDueComplete] = useState(card.dueComplete);
  const [selectedList, setSelectedList] = useState(card.idList);
  const [newChecklistName, setNewChecklistName] = useState("");
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newCheckItemNames, setNewCheckItemNames] = useState<Record<string, string>>({});
  const [addingCheckItem, setAddingCheckItem] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = useCallback(() => {
    if (!card.url) return;
    navigator.clipboard.writeText(card.url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }, [card.url]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: detail, refetch: refetchDetail } = trpcClient.trello.getCardDetail.useQuery(
    { cardId: card.id },
    { refetchOnWindowFocus: false }
  );
  const { data: actions = [], refetch: refetchActions } = trpcClient.trello.getCardActions.useQuery(
    { cardId: card.id },
    { refetchOnWindowFocus: false }
  );
  const { data: boardMembers = [] } = trpcClient.trello.getBoardMembers.useQuery(
    { boardId },
    { refetchOnWindowFocus: false }
  );

  const updateCard = trpcClient.trello.updateCard.useMutation({ onSuccess: onRefetch });
  const archiveCard = trpcClient.trello.archiveCard.useMutation({
    onSuccess: () => {
      onRefetch();
      onClose();
    },
  });
  const addComment = trpcClient.trello.addComment.useMutation({
    onSuccess: () => { setCommentText(""); refetchActions(); },
  });
  const addMember = trpcClient.trello.addMemberToCard.useMutation({ onSuccess: () => { refetchDetail(); } });
  const removeMember = trpcClient.trello.removeMemberFromCard.useMutation({ onSuccess: () => { refetchDetail(); } });
  const createChecklist = trpcClient.trello.createChecklist.useMutation({
    onSuccess: () => { setNewChecklistName(""); setAddingChecklist(false); refetchDetail(); },
  });
  const addCheckItem = trpcClient.trello.addCheckItem.useMutation({
    onSuccess: () => { setNewCheckItemNames({}); setAddingCheckItem(null); refetchDetail(); },
  });
  const updateCheckItem = trpcClient.trello.updateCheckItem.useMutation({ onSuccess: refetchDetail });
  const deleteCheckItem = trpcClient.trello.deleteCheckItem.useMutation({ onSuccess: refetchDetail });

  const addAttachment = trpcClient.trello.addAttachment.useMutation({ onSuccess: () => refetchDetail() });
  const addAttachmentByUrl = trpcClient.trello.addAttachmentByUrl.useMutation({
    onSuccess: () => { setUrlInput(""); setShowUrlInput(false); refetchDetail(); },
  });
  const deleteAttachment = trpcClient.trello.deleteAttachment.useMutation({ onSuccess: () => refetchDetail() });
  const setCardCover = trpcClient.trello.setCardCover.useMutation({ onSuccess: () => { refetchDetail(); } });

  function handleSave() {
    updateCard.mutate({
      cardId: card.id,
      name: name.trim() || card.name,
      desc,
      due: due ? new Date(due).toISOString() : null,
      dueComplete,
      idList: selectedList !== card.idList ? selectedList : undefined,
    });
  }

  const isDirty =
    name !== card.name ||
    desc !== (card.desc ?? "") ||
    due !== (card.due ? card.due.slice(0, 16) : "") ||
    dueComplete !== card.dueComplete ||
    selectedList !== card.idList;

  const checklists: Checklist[] = (detail as any)?.checklists ?? [];
  const members: TrelloMember[] = (detail as any)?.members ?? [];
  const attachments: Attachment[] = (detail as any)?.attachments ?? [];
  const assignedIds: string[] = (detail as any)?.idMembers ?? card.idMembers ?? [];
  const currentLabels: TrelloLabel[] = (detail as any)?.labels ?? card.labels ?? [];
  const currentCover = (detail as any)?.cover ?? card.cover;

  function checklistProgress(cl: Checklist) {
    const total = cl.checkItems.length;
    const done = cl.checkItems.filter((i) => i.state === "complete").length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      addAttachment.mutate({
        cardId: card.id,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="sr-only">Card details</DialogTitle>
        </DialogHeader>

        {/* Cover strip */}
        {currentCover?.color && (
          <div
            className="h-10 -mx-6 -mt-6 mb-2 rounded-t-lg"
            style={{ backgroundColor: labelColor(currentCover.color) }}
          />
        )}

        <div className="grid grid-cols-[1fr_180px] gap-6">
          {/* ── Main column ── */}
          <div className="space-y-5">
            {/* Title */}
            <div className="space-y-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isEditor}
                className="text-base font-semibold border-0 px-0 focus-visible:ring-0 bg-transparent shadow-none"
              />
              <p className="text-[11px] text-muted-foreground">
                in list <span className="font-medium text-foreground">{lists.find((l) => l.id === card.idList)?.name}</span>
              </p>
            </div>

            {/* Labels */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Labels</p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {currentLabels.map((label) => (
                  <span
                    key={label.id}
                    className="px-2.5 py-0.5 rounded text-white text-xs font-medium"
                    style={{ backgroundColor: labelColor(label.color) }}
                  >
                    {label.name || label.color}
                  </span>
                ))}
                {isEditor && (
                  <LabelPicker
                    cardId={card.id}
                    boardId={boardId}
                    assignedLabels={currentLabels}
                    onRefetch={() => { refetchDetail(); }}
                  />
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Description</p>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                disabled={!isEditor}
                rows={4}
                placeholder="Add a more detailed description…"
                className="resize-none bg-muted/30 border-border/50"
              />
            </div>

            {/* Checklists */}
            {checklists.map((cl) => {
              const { total, done, pct } = checklistProgress(cl);
              return (
                <div key={cl.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare size={15} className="text-muted-foreground shrink-0" />
                    <p className="text-sm font-semibold flex-1">{cl.name}</p>
                    <span className="text-[11px] text-muted-foreground">{done}/{total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-chart-2" : "bg-primary")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="space-y-1 pl-1">
                    {cl.checkItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 group py-0.5">
                        <Checkbox
                          checked={item.state === "complete"}
                          onCheckedChange={(v) =>
                            updateCheckItem.mutate({ cardId: card.id, checkItemId: item.id, state: v ? "complete" : "incomplete" })
                          }
                          disabled={!isEditor}
                          className="shrink-0"
                        />
                        <span className={cn("text-sm flex-1", item.state === "complete" && "line-through text-muted-foreground")}>
                          {item.name}
                        </span>
                        {isEditor && (
                          <button
                            onClick={() => deleteCheckItem.mutate({ checklistId: cl.id, checkItemId: item.id })}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-smooth"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}

                    {isEditor && (
                      addingCheckItem === cl.id ? (
                        <div className="flex gap-1.5 mt-1">
                          <Input
                            autoFocus
                            value={newCheckItemNames[cl.id] ?? ""}
                            onChange={(e) => setNewCheckItemNames((p) => ({ ...p, [cl.id]: e.target.value }))}
                            placeholder="Add an item…"
                            className="h-7 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newCheckItemNames[cl.id]?.trim())
                                addCheckItem.mutate({ checklistId: cl.id, name: newCheckItemNames[cl.id] });
                              if (e.key === "Escape") setAddingCheckItem(null);
                            }}
                          />
                          <Button size="sm" className="h-7 text-xs px-2" onClick={() => { if (newCheckItemNames[cl.id]?.trim()) addCheckItem.mutate({ checklistId: cl.id, name: newCheckItemNames[cl.id] }); }}>Add</Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAddingCheckItem(null)}><X size={12} /></Button>
                        </div>
                      ) : (
                        <button onClick={() => setAddingCheckItem(cl.id)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5 py-1">
                          <Plus size={11} /> Add an item
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {isEditor && (
              addingChecklist ? (
                <div className="flex gap-2 items-center">
                  <Input
                    autoFocus
                    value={newChecklistName}
                    onChange={(e) => setNewChecklistName(e.target.value)}
                    placeholder="Checklist title…"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newChecklistName.trim()) createChecklist.mutate({ cardId: card.id, name: newChecklistName });
                      if (e.key === "Escape") setAddingChecklist(false);
                    }}
                  />
                  <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => { if (newChecklistName.trim()) createChecklist.mutate({ cardId: card.id, name: newChecklistName }); }}>Add</Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={() => setAddingChecklist(false)}><X size={13} /></Button>
                </div>
              ) : (
                <button onClick={() => setAddingChecklist(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <CheckSquare size={13} /> Add checklist
                </button>
              )
            )}

            {/* Attachments */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Paperclip size={14} className="text-muted-foreground shrink-0" />
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest flex-1">Attachments</p>
                {isEditor && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1 px-2"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={addAttachment.isPending}
                      title="Attach file"
                    >
                      <Plus size={11} /> File
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1 px-2"
                      onClick={() => setShowUrlInput((v) => !v)}
                      title="Attach URL"
                    >
                      <Link2 size={11} /> URL
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                )}
              </div>

              {showUrlInput && isEditor && (
                <div className="flex gap-1.5">
                  <Input
                    autoFocus
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="Paste URL…"
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && urlInput.trim()) addAttachmentByUrl.mutate({ cardId: card.id, url: urlInput.trim() });
                      if (e.key === "Escape") setShowUrlInput(false);
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => { if (urlInput.trim()) addAttachmentByUrl.mutate({ cardId: card.id, url: urlInput.trim() }); }}
                    disabled={addAttachmentByUrl.isPending || !urlInput.trim()}
                  >
                    Attach
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowUrlInput(false)}>
                    <X size={12} />
                  </Button>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="space-y-1.5">
                  {attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/60 transition-smooth group">
                      {att.previews?.[0]?.url ? (
                        <img src={att.previews[0].url} alt="" className="w-10 h-8 object-cover rounded shrink-0" />
                      ) : (
                        <div className="w-10 h-8 bg-muted rounded shrink-0 flex items-center justify-center">
                          <ExternalLink size={12} className="text-muted-foreground" />
                        </div>
                      )}
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate flex-1 text-sm hover:underline"
                      >
                        {att.name}
                      </a>
                      {isEditor && (
                        <button
                          onClick={() => deleteAttachment.mutate({ cardId: card.id, attachmentId: att.id })}
                          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-smooth shrink-0"
                          title="Delete attachment"
                          disabled={deleteAttachment.isPending}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {attachments.length === 0 && !showUrlInput && (
                <p className="text-xs text-muted-foreground/40">No attachments</p>
              )}
            </div>

            {/* Comments */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={15} className="text-muted-foreground shrink-0" />
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Comments</p>
              </div>
              {isEditor && (
                <div className="flex gap-2">
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write a comment…"
                    rows={2}
                    className="resize-none bg-muted/30 border-border/50 text-sm flex-1"
                  />
                  <Button
                    size="sm"
                    className="self-end h-8 w-8 p-0 bg-primary text-primary-foreground hover:opacity-90"
                    disabled={!commentText.trim() || addComment.isPending}
                    onClick={() => addComment.mutate({ cardId: card.id, text: commentText })}
                  >
                    <Send size={13} />
                  </Button>
                </div>
              )}
              <div className="space-y-3">
                {(actions as any[]).map((action: any) => (
                  <div key={action.id} className="flex gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary">
                      {action.memberCreator?.fullName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold">{action.memberCreator?.fullName}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(action.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 mt-0.5 whitespace-pre-wrap">{action.data?.text}</p>
                    </div>
                  </div>
                ))}
                {actions.length === 0 && (
                  <p className="text-xs text-muted-foreground/40 text-center py-2">No comments yet</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-4">
            {/* Due date */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Due date</p>
              <Input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                disabled={!isEditor}
                className="h-8 text-xs bg-muted/30 border-border/50"
              />
              {due && (
                <div className="flex items-center gap-1.5">
                  <Checkbox checked={dueComplete} onCheckedChange={(v) => setDueComplete(!!v)} disabled={!isEditor} />
                  <label className="text-xs text-muted-foreground cursor-pointer">Complete</label>
                </div>
              )}
            </div>

            {/* Move to list */}
            {isEditor && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Move to</p>
                <Select value={selectedList} onValueChange={setSelectedList}>
                  <SelectTrigger className="h-8 text-xs bg-muted/30 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Cover */}
            {isEditor && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <ImageIcon size={12} className="text-muted-foreground" />
                  <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Cover</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {COVER_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() =>
                        currentCover?.color === c
                          ? setCardCover.mutate({ cardId: card.id })
                          : setCardCover.mutate({ cardId: card.id, color: c })
                      }
                      className={cn(
                        "w-6 h-6 rounded transition-transform hover:scale-110",
                        currentCover?.color === c && "ring-2 ring-primary ring-offset-1"
                      )}
                      style={{ backgroundColor: labelColor(c) }}
                      title={currentCover?.color === c ? `Remove ${c} cover` : `Set ${c} cover`}
                    />
                  ))}
                </div>
                {currentCover?.color && (
                  <button
                    onClick={() => setCardCover.mutate({ cardId: card.id })}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <X size={11} /> Remove cover
                  </button>
                )}
              </div>
            )}

            {/* Members */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Users size={12} className="text-muted-foreground" />
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Members</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {members.filter((m) => assignedIds.includes(m.id)).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => isEditor && removeMember.mutate({ cardId: card.id, memberId: m.id })}
                    className="relative group"
                    title={isEditor ? `Remove ${m.fullName}` : m.fullName}
                  >
                    <MemberAvatar member={m} />
                    {isEditor && (
                      <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-smooth">
                        <X size={10} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {isEditor && (boardMembers as TrelloMember[]).filter((m) => !assignedIds.includes(m.id)).length > 0 && (
                <div className="space-y-0.5 mt-1">
                  {(boardMembers as TrelloMember[]).filter((m) => !assignedIds.includes(m.id)).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => addMember.mutate({ cardId: card.id, memberId: m.id })}
                      className="flex items-center gap-1.5 w-full px-1.5 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-smooth"
                    >
                      <MemberAvatar member={m} size="w-5 h-5" />
                      <span className="truncate">{m.fullName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Open in Trello + Copy link */}
            {card.url && (
              <div className="flex items-center gap-2">
                <a href={card.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-smooth">
                  <ExternalLink size={12} /> Open in Trello
                </a>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-smooth"
                  title="Copy card link"
                >
                  {copiedLink
                    ? <><Check size={12} className="text-green-500" /> Copied!</>
                    : <><Copy size={12} /> Copy link</>}
                </button>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-1.5 pt-2 border-t border-border/40">
              {isEditor && (
                <Button className="w-full h-8 text-xs bg-primary text-primary-foreground hover:opacity-90" onClick={handleSave} disabled={!isDirty || updateCard.isPending}>
                  {updateCard.isPending ? "Saving…" : "Save changes"}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={onClose}>Close</Button>
              {isEditor && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5" disabled={archiveCard.isPending}>
                      <Archive size={13} /> Archive card
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive this card?</AlertDialogTitle>
                      <AlertDialogDescription>The card will be archived in Trello. You can restore it from archived items.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => archiveCard.mutate({ cardId: card.id })} className="bg-destructive hover:bg-destructive/90">Archive</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
