"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ClashWiki } from "@prisma/client";
import { Header } from "@/components/layout/Header";
import { trpc } from "@/lib/core/trpc";
import { useRole } from "@/hooks/use-role";
import { useEventSource } from "@/hooks/use-event-source";
import { cn } from "@/lib/core/utils";
import { DEFAULT_WIKI_SECTIONS, normalizeWikiSectionKey } from "@/lib/wiki/sections";
import {
  CheckCircle2,
  FileText,
  Tag,
  Users,
  ShieldCheck,
  FolderOpen,
  Plus,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { BrandLoading } from "@/components/ui/BrandLoading";
import { WikiEditorBoundary } from "@/components/clash/WikiEditorBoundary";

const WikiEditor = dynamic(
  () => import("@/components/clash/WikiEditor").then((m) => m.WikiEditor),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full w-full">
        <BrandLoading message="Initializing documentation context..." />
      </div>
    )
  }
);

const SECTION_ICONS: Record<string, LucideIcon> = {
  inputs: FolderOpen,
  naming: Tag,
  responsibilities: Users,
  "qa-gates": ShieldCheck,
  "acc-placement": FileText,
  "definition-of-done": CheckCircle2,
};

const WIKI_SECTIONS = DEFAULT_WIKI_SECTIONS.map((item) => ({
  ...item,
  icon: SECTION_ICONS[item.section] ?? FolderOpen,
}));

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Draft", color: "text-muted-foreground", bg: "bg-muted/50" },
  REVIEW: { label: "Review", color: "text-chart-5", bg: "bg-chart-5/10" },
  APPROVED: { label: "Approved", color: "text-chart-2", bg: "bg-chart-2/10" },
};

type DisplaySection = {
  id: string;
  section: string;
  title: string;
  content: string;
  status: string;
  order: number;
  updatedAt: Date;
  icon: LucideIcon;
};

type ClashStreamEvent =
  | {
      type: "wiki-upsert";
      projectId: string;
      wiki: {
        id: string;
        section: string;
        title: string;
        content: string;
        status: string;
        order: number;
        updatedAt: string;
      };
    }
  | {
      type: "wiki-status";
      projectId: string;
      wiki: {
        id: string;
        section: string;
        status: string;
        updatedAt: string;
      };
    }
  | {
      type: "wiki-deleted";
      projectId: string;
      section: string;
    }
  | {
      type: "wiki-list-reordered";
      projectId: string;
    };

function findSectionIndex(sections: ClashWiki[], incomingSection: string): number {
  const directMatch = sections.findIndex((item) => item.section === incomingSection);
  if (directMatch !== -1) return directMatch;
  const incomingKey = normalizeWikiSectionKey(incomingSection);
  return sections.findIndex((item) => normalizeWikiSectionKey(item.section) === incomingKey);
}

function applyWikiUpsert(
  current: ClashWiki[] | undefined,
  payload: Extract<ClashStreamEvent, { type: "wiki-upsert" }>,
  preserveContentForSection: string | null
) {
  if (!current) return current;
  if (current.length > 0 && current[0].projectId !== payload.projectId) return current;

  const next = [...current];
  const index = findSectionIndex(next, payload.wiki.section);
  const previous = index >= 0 ? next[index] : null;
  const incomingKey = normalizeWikiSectionKey(payload.wiki.section);
  const preserveContent = preserveContentForSection === incomingKey && Boolean(previous);

  const updated: ClashWiki = {
    id: payload.wiki.id,
    projectId: payload.projectId,
    section: payload.wiki.section,
    title: payload.wiki.title,
    content: preserveContent ? (previous?.content ?? payload.wiki.content) : payload.wiki.content,
    yjsState: previous?.yjsState ?? null,
    status: payload.wiki.status,
    order: payload.wiki.order,
    updatedAt: new Date(payload.wiki.updatedAt),
  };

  if (index >= 0) {
    next[index] = updated;
  } else {
    next.push(updated);
  }

  next.sort((a, b) => a.order - b.order);
  return next;
}

function applyWikiDelete(
  current: ClashWiki[] | undefined,
  payload: Extract<ClashStreamEvent, { type: "wiki-deleted" }>
) {
  if (!current) return current;
  if (current.length > 0 && current[0].projectId !== payload.projectId) return current;

  const incomingKey = normalizeWikiSectionKey(payload.section);
  return current.filter(
    (item) => normalizeWikiSectionKey(item.section) !== incomingKey
  );
}

function applyWikiStatus(
  current: ClashWiki[] | undefined,
  payload: Extract<ClashStreamEvent, { type: "wiki-status" }>
) {
  if (!current) return current;
  if (current.length > 0 && current[0].projectId !== payload.projectId) return current;

  const next = [...current];
  const index = findSectionIndex(next, payload.wiki.section);
  if (index === -1) return current;

  next[index] = {
    ...next[index],
    id: payload.wiki.id,
    status: payload.wiki.status,
    updatedAt: new Date(payload.wiki.updatedAt),
  };

  return next;
}

export default function ClashDetectionPage() {
  const { isEditor } = useRole();
  const utils = trpc.useUtils();
  const { data: wikiSections = [] } = trpc.clash.getWikiSections.useQuery();

  const [activeWiki, setActiveWiki] = useState<string>("inputs");
  const [activeSectionDirty, setActiveSectionDirty] = useState(false);
  const activeWikiRef = useRef(activeWiki);
  const activeSectionDirtyRef = useRef(activeSectionDirty);

  activeWikiRef.current = activeWiki;
  activeSectionDirtyRef.current = activeSectionDirty;

  const handleClashEvent = useCallback(
    (payload: ClashStreamEvent) => {
      if (payload.type === "wiki-upsert") {
        const preserveContentForSection = activeSectionDirtyRef.current
          ? activeWikiRef.current
          : null;
        utils.clash.getWikiSections.setData(undefined, (current) =>
          applyWikiUpsert(current, payload, preserveContentForSection)
        );
      }
      if (payload.type === "wiki-status") {
        utils.clash.getWikiSections.setData(undefined, (current) =>
          applyWikiStatus(current, payload)
        );
      }
      if (payload.type === "wiki-deleted") {
        utils.clash.getWikiSections.setData(undefined, (current) =>
          applyWikiDelete(current, payload)
        );
      }
      if (payload.type === "wiki-list-reordered") {
        void utils.clash.getWikiSections.invalidate();
      }
    },
    [utils]
  );

  useEventSource<ClashStreamEvent>("/api/clash-updates", handleClashEvent);

  const displaySections = useMemo<DisplaySection[]>(() => {
    return wikiSections.map((s) => {
      const key = normalizeWikiSectionKey(s.section);
      const def = WIKI_SECTIONS.find((d) => d.section === key);
      return {
        id: s.id,
        section: key,
        title: s.title,
        content: s.content,
        status: s.status,
        order: s.order,
        updatedAt: s.updatedAt,
        icon: def?.icon ?? FolderOpen,
      };
    });
  }, [wikiSections]);

  useEffect(() => {
    if (displaySections.length === 0) return;
    if (!displaySections.some((item) => item.section === activeWiki)) {
      setActiveWiki(displaySections[0].section);
    }
  }, [activeWiki, displaySections]);

  useEffect(() => {
    setActiveSectionDirty(false);
  }, [activeWiki]);

  const activeSection = useMemo(
    () => displaySections.find((item) => item.section === activeWiki),
    [displaySections, activeWiki]
  );

  const upsertWikiSection = trpc.clash.upsertWikiSection.useMutation({
    onSuccess: () => {
       utils.clash.getWikiSections.invalidate();
    }
  });

  const deleteWikiSection = trpc.clash.deleteWikiSection.useMutation({
    onSuccess: () => {
       utils.clash.getWikiSections.invalidate();
    }
  });

  const [editingSection, setEditingSection] = useState<{ section: string; title: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    const slug = newTitle.toLowerCase().replace(/\s+/g, "-");
    upsertWikiSection.mutate({
      section: slug,
      title: newTitle,
      content: "",
      status: "DRAFT"
    });
    setNewTitle("");
    setIsAdding(false);
  };

  const handleRename = () => {
    if (!editingSection || !editingSection.title.trim()) return;
    // Find the actual section being renamed (not the active editor section)
    const targetSection = displaySections.find((s) => s.section === editingSection.section);
    upsertWikiSection.mutate({
      section: editingSection.section,
      title: editingSection.title,
      content: targetSection?.content || ""
    });
    setEditingSection(null);
  };

  const activeConf = activeSection
    ? STATUS_CONFIG[activeSection.status] ?? STATUS_CONFIG.DRAFT
    : STATUS_CONFIG.DRAFT;

  return (
    <div className="flex flex-col h-full">
      <Header title="Clash Detection" />

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[220px] border-r border-border/50 bg-card/30 backdrop-blur-sm shrink-0 flex flex-col">
          <div className="p-3 border-b border-border/30 flex items-center justify-between">
            <h3 className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.15em] px-2">
              Documentation
            </h3>
            {isEditor && (
              <button 
                onClick={() => setIsAdding(true)}
                className="p-1 hover:bg-primary/10 rounded text-primary transition-colors"
                title="Add Section"
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {isAdding && (
              <div className="px-3 py-2 space-y-2 mb-2 bg-primary/5 rounded-lg border border-primary/10">
                <Input 
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Section title..."
                  className="h-8 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                    if (e.key === "Escape") setIsAdding(false);
                  }}
                />
                <div className="flex gap-1 justify-end">
                  <Button size="xs" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                  <Button size="xs" onClick={handleAdd}>Add</Button>
                </div>
              </div>
            )}
            {displaySections.map((s) => {
              const active = activeWiki === s.section;
              const Icon = s.icon;
              const conf = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.DRAFT;

              return (
                <div key={s.section} className="group relative">
                  <button
                    onClick={() => setActiveWiki(s.section)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-smooth flex items-center gap-2.5 relative",
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full gradient-accent" />
                    )}
                    <Icon
                      size={15}
                      className={cn(
                        "shrink-0",
                        active ? "text-primary" : "text-muted-foreground/60"
                      )}
                    />
                    <span className="truncate flex-1">{s.title}</span>
                    <span
                      className={cn(
                        "text-[9px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 transition-opacity",
                        conf.bg,
                        conf.color,
                        (isEditor && !active) ? "group-hover:opacity-0" : ""
                      )}
                    >
                      {conf.label[0]}
                    </span>
                  </button>
                  
                  {isEditor && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-transparent">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSection({ section: s.section, title: s.title });
                        }}
                        className="p-1 hover:bg-background rounded text-muted-foreground hover:text-primary transition-colors"
                        title="Edit section"
                      >
                        <Pencil size={12} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete section "${s.title}"?`)) {
                            deleteWikiSection.mutate({ section: s.section });
                          }
                        }}
                        className="p-1 hover:bg-background rounded text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete section"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {editingSection && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-sm rounded-xl border border-border shadow-2xl p-6 space-y-4">
                <h3 className="text-lg font-semibold">Rename Section</h3>
                <Input 
                  value={editingSection.title}
                  onChange={(e) => setEditingSection({ ...editingSection, title: e.target.value })}
                  placeholder="New title..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") setEditingSection(null);
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setEditingSection(null)}>Cancel</Button>
                  <Button onClick={handleRename}>Save Changes</Button>
                </div>
              </div>
            </div>
          )}

          <div className="p-3 border-t border-border/30 space-y-1">
            {Object.entries(STATUS_CONFIG).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2 text-[10px]">
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    key === "DRAFT" && "bg-muted-foreground",
                    key === "REVIEW" && "bg-chart-5",
                    key === "APPROVED" && "bg-chart-2"
                  )}
                />
                <span className="text-muted-foreground/50">{val.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {activeSection && (
            <div className="px-8 py-4 border-b border-border/30 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <activeSection.icon size={18} className="text-primary" />
                <h2 className="text-base font-semibold text-foreground">
                  {activeSection.title}
                </h2>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-md",
                    activeConf.bg,
                    activeConf.color
                  )}
                >
                  {activeConf.label}
                </span>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            {activeSection ? (
              <WikiEditorBoundary key={activeSection.section}>
                <WikiEditor
                  section={activeSection}
                  module="clash"
                  isAdmin={isEditor}
                  onDirtyChange={setActiveSectionDirty}
                />
              </WikiEditorBoundary>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <FileText
                    size={32}
                    className="text-muted-foreground/20 mx-auto"
                  />
                  <p className="text-sm text-muted-foreground/40">
                    Select a section from the sidebar
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
