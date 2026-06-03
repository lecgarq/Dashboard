"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/core/trpc";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useRole } from "@/hooks/use-role";
import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";
import type { FamilyWithRelations } from "./KanbanBoard";
import { BimViewer } from "./BimViewer";
import { Loader2, Box, Info } from "lucide-react";
import { clientLogger } from "@/lib/core/logger";
import { cn } from "@/lib/core/utils";
import { PanelErrorBoundary } from "@/components/ui/panel-error-boundary";
import { FAMILY_PHASE_METADATA, FAMILY_PHASES } from "@/lib/shared/family-config";
import type { FamilyPhase } from "@/lib/shared/family-config";

const PHASES = FAMILY_PHASES.map(id => ({ value: id, label: FAMILY_PHASE_METADATA[id].label }));

const ATTACHMENT_TYPE_LABELS: Record<string, string> = {
  IMAGE: "Image",
  VIDEO: "Video",
  FILE: "File",
};

interface FamilyDetailPanelProps {
  family: FamilyWithRelations | null;
  open: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

function TipTapEditor({
  content,
  onChange,
  placeholder,
  disabled,
}: {
  content: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? "Write something…" }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none min-h-[120px] p-3 text-sm text-foreground outline-none border border-border rounded-md focus:border-blue-400 transition-colors",
          disabled && "bg-muted/50 opacity-60 cursor-not-allowed"
        ),
      },
    },
  });

  return <EditorContent editor={editor} />;
}

export function FamilyDetailPanel({
  family,
  open,
  onClose,
  onUpdate,
}: FamilyDetailPanelProps) {
  const { isEditor, isAdmin } = useRole();
  const [name, setName] = useState(family?.name ?? "");
  const [category, setCategory] = useState(family?.category ?? "");
  const [phase, setPhase] = useState<FamilyPhase>((family?.phase as FamilyPhase) ?? "TODO");
  const [owner, setOwner] = useState(family?.owner ?? "");
  const [nextSteps, setNextSteps] = useState(family?.nextSteps ?? "");
  const [description, setDescription] = useState(family?.description ?? "");
  const [isBlocked, setIsBlocked] = useState(family?.isBlocked ?? false);
  const [blockedBy, setBlockedBy] = useState(family?.blockedBy ?? "");
  const [dueDate, setDueDate] = useState(
    family?.dueDate ? new Date(family.dueDate).toISOString().split("T")[0] : ""
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState("");

  // Changelog form
  const [clVersion, setClVersion] = useState("");
  const [clAuthor, setClAuthor] = useState("");
  const [clMessage, setClMessage] = useState("");
  const [clImpact, setClImpact] = useState("");

  // Deliverable form
  const [newDeliverable, setNewDeliverable] = useState("");
  const familyId = family?.id ?? "";

  const utils = trpc.useUtils();
  const updateFamily = trpc.families.update.useMutation({
    onSuccess: (updated) => {
      utils.families.getAll.setData(undefined, (current = []) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item
        )
      );
      utils.families.getById.setData({ id: updated.id }, (current) =>
        current ? { ...current, ...updated } : current
      );
    },
  });
  const startAps = trpc.families.startApsTranslation.useMutation({
    onSuccess: (result, input) => {
      utils.families.getAll.setData(undefined, (current = []) =>
        current.map((item) =>
          item.id === input.familyId
            ? { ...item, apsUrn: result.urn, apsStatus: "PROCESSING" }
            : item
        )
      );
      utils.families.getById.setData({ id: input.familyId }, (current) =>
        current
          ? { ...current, apsUrn: result.urn, apsStatus: "PROCESSING" }
          : current
      );
    },
  });
  
  const { data: apsStatus } = trpc.families.getApsStatus.useQuery(
    { familyId, urn: family?.apsUrn ?? "" },
    { 
      enabled: !!family && family.apsStatus === "PROCESSING" && !!family.apsUrn,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "success" || status === "failed" ? false : 5000;
      },
    }
  );

  useEffect(() => {
    if (!family) return;
    if (apsStatus?.status !== "success" && apsStatus?.status !== "failed") return;

    const nextStatus = apsStatus.status === "success" ? "SUCCESS" : "FAILED";
    utils.families.getAll.setData(undefined, (current = []) =>
      current.map((item) =>
        item.id === family.id ? { ...item, apsStatus: nextStatus } : item
      )
    );
    utils.families.getById.setData({ id: family.id }, (current) =>
      current ? { ...current, apsStatus: nextStatus } : current
    );
    onUpdate?.();
  }, [apsStatus?.status, family, onUpdate, utils.families.getAll, utils.families.getById]);

  const addChangelog = trpc.families.addChangelog.useMutation({
    onSuccess: (entry) => {
      utils.families.getById.setData({ id: entry.familyId }, (current) =>
        current
          ? { ...current, changelog: [entry, ...current.changelog] }
          : current
      );
    },
  });
  const addAttachment = trpc.families.addAttachment.useMutation({
    onSuccess: (attachment) => {
      utils.families.getById.setData({ id: attachment.familyId }, (current) =>
        current
          ? { ...current, attachments: [...current.attachments, attachment] }
          : current
      );
    },
  });
  const deleteAttachment = trpc.families.deleteAttachment.useMutation({
    onSuccess: (deleted) => {
      utils.families.getById.setData({ id: familyId }, (current) =>
        current
          ? {
              ...current,
              attachments: current.attachments.filter(
                (attachment) => attachment.id !== deleted.id
              ),
            }
          : current
      );
    },
  });
  const addDeliverable = trpc.families.addDeliverable.useMutation({
    onSuccess: (deliverable) => {
      utils.families.getById.setData({ id: deliverable.familyId }, (current) =>
        current
          ? { ...current, deliverables: [...current.deliverables, deliverable] }
          : current
      );
    },
  });
  const updateDeliverable = trpc.families.updateDeliverable.useMutation({
    onSuccess: (deliverable) => {
      utils.families.getById.setData({ id: familyId }, (current) =>
        current
          ? {
              ...current,
              deliverables: current.deliverables.map((item) =>
                item.id === deliverable.id ? deliverable : item
              ),
            }
          : current
      );
    },
  });

  if (!family) return null;

  const handleSave = () => {
    updateFamily.mutate({
      id: family.id,
      name,
      category,
      phase,
      owner,
      nextSteps,
      description,
      isBlocked,
      blockedBy,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
  };

  const handleAddChangelog = () => {
    if (!clVersion || !clAuthor || !clMessage) return;
    addChangelog.mutate({
      familyId: family.id,
      version: clVersion,
      author: clAuthor,
      message: clMessage,
      impact: clImpact || undefined,
    });
    setClVersion(""); setClAuthor(""); setClMessage(""); setClImpact("");
  };

  const handleGenerateAI = async () => {
    setAiLoading(true);
    setAiText("");
    try {
      const res = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: family.name,
          category: family.category,
          phase: family.phase,
          changelog: family.changelog.slice(0, 5).map((c) => ({
            version: c.version,
            message: c.message,
            impact: c.impact,
          })),
        }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        full += chunk;
        setAiText(full);
      }
      setDescription(full);
    } catch (error) {
      clientLogger.error("[FamilyDetailPanel] Failed to generate AI description", error);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <PanelErrorBoundary label="family-detail">
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0" side="right">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-semibold text-foreground">{family.name}</SheetTitle>
              {isEditor && (
                <Button size="sm" onClick={handleSave} disabled={updateFamily.isPending}>
                  {updateFamily.isPending ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </SheetHeader>

          <Tabs defaultValue="details" className="flex-1">
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-card px-6 h-10">
              <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
              <TabsTrigger value="3d" className="text-xs font-bold text-primary flex items-center gap-1.5">
                <Box size={12} />
                3D View
              </TabsTrigger>
              <TabsTrigger value="changelog" className="text-xs">Changelog</TabsTrigger>
              <TabsTrigger value="deliverables" className="text-xs">Deliverables</TabsTrigger>
              <TabsTrigger value="media" className="text-xs">Media</TabsTrigger>
            </TabsList>

            {/* 3D VIEW TAB */}
            <TabsContent value="3d" className="px-6 py-4 space-y-4">
              {family.apsUrn ? (
                <div className="space-y-4">
                  <BimViewer urn={family.apsUrn} />
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 flex items-start gap-3">
                    <Info className="w-4 h-4 text-blue-500 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-blue-900 dark:text-blue-200 uppercase tracking-widest">3D Model Status</p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {family.apsStatus === "SUCCESS" 
                          ? "Model is fully synchronized with Autodesk APS." 
                          : "Model is currently being processed. It may take a few minutes."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-border/50 rounded-2xl bg-muted/50/50">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Box size={24} className="text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground mb-1">No 3D Model Found</h3>
                  <p className="text-xs text-muted-foreground text-center max-w-[240px] mb-6">
                    We need to generate a 3D viewable from an attached Revit family file.
                  </p>
                  {family.attachments.filter(a => a.name.toLowerCase().endsWith('.rfa')).length > 0 ? (
                    <Button 
                      size="sm" 
                      onClick={() => {
                          const rfa = family.attachments.find(a => a.name.toLowerCase().endsWith('.rfa'));
                          if (rfa) startAps.mutate({ familyId: family.id, attachmentId: rfa.id });
                      }}
                      disabled={startAps.isPending}
                    >
                      {startAps.isPending ? (
                        <>
                          <Loader2 size={14} className="animate-spin mr-2" />
                          Processing...
                        </>
                      ) : "Generate 3D Preview"}
                    </Button>
                  ) : (
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-tighter">
                      Please attach an .rfa file first
                    </p>
                  )}
                </div>
              )}
            </TabsContent>

            {/* DETAILS TAB */}
            <TabsContent value="details" className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" disabled={!isEditor} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 text-sm" disabled={!isEditor} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Phase</label>
                  <Select value={phase} onValueChange={(value) => setPhase(value as FamilyPhase)} disabled={!isEditor}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PHASES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Owner</label>
                  <Input value={owner} onChange={(e) => setOwner(e.target.value)} className="h-8 text-sm" disabled={!isEditor} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Due Date</label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="h-8 text-sm"
                    disabled={!isEditor}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Blocked</label>
                  <div className="flex items-center gap-2 h-8">
                    <input
                      type="checkbox"
                      checked={isBlocked}
                      onChange={(e) => setIsBlocked(e.target.checked)}
                      className="rounded"
                      disabled={!isEditor}
                    />
                    <span className="text-sm text-foreground/70">Is blocked</span>
                  </div>
                </div>
              </div>

              {isBlocked && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Blocked by</label>
                  <Input
                    value={blockedBy}
                    onChange={(e) => setBlockedBy(e.target.value)}
                    placeholder="Who or what is blocking this?"
                    className="h-8 text-sm"
                    disabled={!isEditor}
                  />
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  {isEditor && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={handleGenerateAI}
                      disabled={aiLoading}
                    >
                      {aiLoading ? (
                        <span className="flex items-center gap-1">
                          <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Generating…
                        </span>
                      ) : (
                        "✨ Generate with AI"
                      )}
                    </Button>
                  )}
                </div>
                {aiLoading && aiText && (
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border border-border whitespace-pre-wrap">
                    {aiText}
                  </div>
                )}
                <TipTapEditor
                  content={description}
                  onChange={setDescription}
                  placeholder="Describe this family…"
                  disabled={!isEditor}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Next Steps</label>
                <Textarea
                  value={nextSteps}
                  onChange={(e) => setNextSteps(e.target.value)}
                  placeholder="What needs to happen next?"
                  rows={3}
                  className="text-sm resize-none"
                  disabled={!isEditor}
                />
              </div>
            </TabsContent>

            {/* CHANGELOG TAB */}
            <TabsContent value="changelog" className="px-6 py-4 space-y-4">
              {isEditor && (
                <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/50">
                  <p className="text-xs font-medium text-muted-foreground">Add Entry</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={clVersion} onChange={(e) => setClVersion(e.target.value)} placeholder="Version (e.g. 1.2)" className="h-8 text-sm" />
                    <Input value={clAuthor} onChange={(e) => setClAuthor(e.target.value)} placeholder="Author" className="h-8 text-sm" />
                    <Input value={clMessage} onChange={(e) => setClMessage(e.target.value)} placeholder="Message" className="h-8 text-sm col-span-2" />
                    <Input value={clImpact} onChange={(e) => setClImpact(e.target.value)} placeholder="Impact (optional)" className="h-8 text-sm col-span-2" />
                  </div>
                  <Button size="sm" onClick={handleAddChangelog} disabled={addChangelog.isPending} className="h-7 text-xs">
                    Add Entry
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {family.changelog.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 text-center py-4">No changelog entries yet.</p>
                ) : (
                  family.changelog.map((entry) => (
                    <div key={entry.id} className="border border-border rounded p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className="text-xs bg-secondary text-foreground/80">v{entry.version}</Badge>
                        <span className="text-xs text-muted-foreground">{entry.author}</span>
                        <span className="text-xs text-muted-foreground/60 ml-auto">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80">{entry.message}</p>
                      {entry.impact && (
                        <p className="text-xs text-amber-600">Impact: {entry.impact}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* DELIVERABLES TAB */}
            <TabsContent value="deliverables" className="px-6 py-4 space-y-4">
              {isEditor && (
                <div className="flex gap-2">
                  <Input
                    value={newDeliverable}
                    onChange={(e) => setNewDeliverable(e.target.value)}
                    placeholder="Deliverable name (e.g. RFA package)"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newDeliverable.trim()) {
                        addDeliverable.mutate({ familyId: family.id, name: newDeliverable.trim() });
                        setNewDeliverable("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (newDeliverable.trim()) {
                        addDeliverable.mutate({ familyId: family.id, name: newDeliverable.trim() });
                        setNewDeliverable("");
                      }
                    }}
                    className="h-8"
                  >
                    Add
                  </Button>
                </div>
              )}

              <div className="space-y-1">
                {family.deliverables.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 text-center py-4">No deliverables defined.</p>
                ) : (
                  family.deliverables.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 py-2 border-b border-border/50">
                      <input
                        type="checkbox"
                        checked={d.done}
                        onChange={(e) => updateDeliverable.mutate({ id: d.id, done: e.target.checked })}
                        className="rounded"
                        disabled={!isEditor}
                      />
                      <span className={`text-sm ${d.done ? "line-through text-muted-foreground/60" : "text-foreground/80"}`}>
                        {d.name}
                      </span>
                      {d.fileUrl && (
                        <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-600 hover:underline">
                          View
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* MEDIA TAB */}
            <TabsContent value="media" className="px-6 py-4 space-y-4">
              {isEditor && family.phase === "DONE" ? (
                <UploadButton<OurFileRouter, "familyMedia">
                  endpoint="familyMedia"
                  onClientUploadComplete={(res) => {
                    res.forEach((file) => {
                      const isImage = file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                      const isVideo = file.name.match(/\.(mp4|mov|webm|avi)$/i);
                      addAttachment.mutate({
                        familyId: family.id,
                        type: isImage ? "IMAGE" : isVideo ? "VIDEO" : "FILE",
                        url: file.url,
                        name: file.name,
                      });
                    });
                  }}
                  onUploadError={(error) => alert(`Upload Error: ${error.message}`)}
                  appearance={{
                    button: "bg-blue-600 text-white text-xs px-3 py-1 rounded h-7 hover:bg-blue-700",
                    allowedContent: "text-xs text-muted-foreground/60",
                  }}
                />
              ) : isEditor ? (
                <div className="text-center p-4 border border-dashed rounded-md text-sm text-muted-foreground bg-muted/20">
                  You must move this family to DONE phase before uploading files.
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                {family.attachments.length === 0 ? (
                  <div className="col-span-2 text-sm text-muted-foreground/60 text-center py-6">No media uploaded.</div>
                ) : (
                  family.attachments.map((att) => (
                    <div key={att.id} className="relative group border border-border rounded overflow-hidden">
                      {att.type === "IMAGE" ? (
                        <img
                          src={att.url}
                          alt={att.name}
                          className="w-full h-32 object-cover"
                        />
                      ) : att.type === "VIDEO" ? (
                        <video src={att.url} className="w-full h-32 object-cover" controls />
                      ) : (
                        <a href={att.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center h-32 bg-muted/50 text-xs text-blue-600 hover:underline">
                          {att.name}
                        </a>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-card/90 px-2 py-1 flex items-center justify-between">
                        <span className="text-xs text-foreground/70 truncate">{att.name}</span>
                        <Badge className="text-xs bg-secondary text-muted-foreground px-1">
                          {ATTACHMENT_TYPE_LABELS[att.type]}
                        </Badge>
                      </div>
                      {isEditor && (
                        <button
                          className="absolute top-1 right-1 bg-card/90 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteAttachment.mutate({ id: att.id })}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </PanelErrorBoundary>
  );
}


