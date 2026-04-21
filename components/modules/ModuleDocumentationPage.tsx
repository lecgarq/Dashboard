"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ClashWiki, SimWiki } from "@prisma/client";
import {
  CheckCircle2,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  ShieldCheck,
  Tag,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";

import { WikiEditorBoundary } from "@/components/clash/WikiEditorBoundary";
import { Header } from "@/components/layout/Header";
import { BrandLoading } from "@/components/ui/BrandLoading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyModuleWikiDelete,
  applyModuleWikiStatus,
  applyModuleWikiUpsert,
  buildWikiSectionSlug,
  type ModuleStreamEvent,
  type ModuleWikiSection,
} from "@/lib/modules/documentation";
import { trpc } from "@/lib/core/trpc";
import { cn } from "@/lib/core/utils";
import { moduleKeySchema, type ModuleKey } from "@/lib/shared/module-schemas";
import { normalizeWikiSectionKey, DEFAULT_WIKI_SECTIONS } from "@/lib/wiki/sections";
import { useEventSource } from "@/hooks/use-event-source";
import { useRole } from "@/hooks/use-role";

const WikiEditor = dynamic(
  () => import("@/components/clash/WikiEditor").then((module) => module.WikiEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <BrandLoading message="Initializing documentation context..." />
      </div>
    ),
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

type WikiRecord = ClashWiki | SimWiki;

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

type ModuleDocumentationPageProps = {
  module: ModuleKey;
  title: string;
  streamUrl: string;
};

export function ModuleDocumentationPage({
  module,
  title,
  streamUrl,
}: ModuleDocumentationPageProps) {
  moduleKeySchema.parse(module);

  const { isEditor } = useRole();
  const utils = trpc.useUtils();
  const moduleApi = module === "clash" ? trpc.clash : trpc.sim;
  const moduleUtils = module === "clash" ? utils.clash : utils.sim;
  const { data: wikiSections = [] } = moduleApi.getWikiSections.useQuery();

  const [activeWiki, setActiveWiki] = useState<string>("inputs");
  const [activeSectionDirty, setActiveSectionDirty] = useState(false);
  const [editingSection, setEditingSection] = useState<{
    section: string;
    title: string;
  } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const activeWikiRef = useRef(activeWiki);
  const activeSectionDirtyRef = useRef(activeSectionDirty);

  activeWikiRef.current = activeWiki;
  activeSectionDirtyRef.current = activeSectionDirty;

  const handleStreamEvent = useCallback(
    (payload: ModuleStreamEvent) => {
      if (payload.type === "wiki-upsert") {
        const preserveContentForSection = activeSectionDirtyRef.current
          ? activeWikiRef.current
          : null;
        moduleUtils.getWikiSections.setData(undefined, (current) =>
          applyModuleWikiUpsert(
            current as WikiRecord[] | undefined,
            payload,
            preserveContentForSection
          )
        );
        return;
      }

      if (payload.type === "wiki-status") {
        moduleUtils.getWikiSections.setData(undefined, (current) =>
          applyModuleWikiStatus(current as WikiRecord[] | undefined, payload)
        );
        return;
      }

      if (payload.type === "wiki-deleted") {
        moduleUtils.getWikiSections.setData(undefined, (current) =>
          applyModuleWikiDelete(current as WikiRecord[] | undefined, payload)
        );
        return;
      }

      void moduleUtils.getWikiSections.invalidate();
    },
    [moduleUtils]
  );

  useEventSource<ModuleStreamEvent>(streamUrl, handleStreamEvent);

  const displaySections = useMemo<DisplaySection[]>(() => {
    return (wikiSections as ModuleWikiSection[]).map((section) => {
      const key = normalizeWikiSectionKey(section.section);
      const definition = WIKI_SECTIONS.find((item) => item.section === key);

      return {
        id: section.id,
        section: key,
        title: section.title,
        content: section.content,
        status: section.status,
        order: section.order,
        updatedAt: section.updatedAt,
        icon: definition?.icon ?? FolderOpen,
      };
    });
  }, [wikiSections]);

  useEffect(() => {
    if (displaySections.length === 0) return;
    if (!displaySections.some((item) => item.section === activeWiki)) {
      setActiveWiki(displaySections[0]!.section);
    }
  }, [activeWiki, displaySections]);

  useEffect(() => {
    setActiveSectionDirty(false);
  }, [activeWiki]);

  const activeSection = useMemo(
    () => displaySections.find((item) => item.section === activeWiki),
    [activeWiki, displaySections]
  );

  const activeConf = activeSection
    ? STATUS_CONFIG[activeSection.status] ?? STATUS_CONFIG.DRAFT
    : STATUS_CONFIG.DRAFT;

  const upsertWikiSection = moduleApi.upsertWikiSection.useMutation({
    onSuccess: () => {
      void moduleUtils.getWikiSections.invalidate();
    },
  });

  const deleteWikiSection = moduleApi.deleteWikiSection.useMutation({
    onSuccess: () => {
      void moduleUtils.getWikiSections.invalidate();
    },
  });

  function handleAddSection() {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;

    upsertWikiSection.mutate({
      section: buildWikiSectionSlug(trimmedTitle),
      title: trimmedTitle,
      content: "",
      status: "DRAFT",
    });
    setNewTitle("");
    setIsAdding(false);
  }

  function handleRenameSection() {
    if (!editingSection || !editingSection.title.trim()) return;

    const targetSection = displaySections.find(
      (section) => section.section === editingSection.section
    );

    upsertWikiSection.mutate({
      section: editingSection.section,
      title: editingSection.title.trim(),
      content: targetSection?.content ?? "",
    });
    setEditingSection(null);
  }

  return (
    <div className="flex h-full flex-col">
      <Header title={title} />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-[220px] shrink-0 flex-col border-r border-border/50 bg-card/30 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-border/30 p-3">
            <h3 className="px-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
              Documentation
            </h3>
            {isEditor && (
              <button
                className="rounded p-1 text-primary transition-colors hover:bg-primary/10"
                onClick={() => setIsAdding(true)}
                title="Add Section"
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {isAdding && (
              <div className="mb-2 space-y-2 rounded-lg border border-primary/10 bg-primary/5 px-3 py-2">
                <Input
                  autoFocus
                  className="h-8 text-xs"
                  onChange={(event) => setNewTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleAddSection();
                    if (event.key === "Escape") setIsAdding(false);
                  }}
                  placeholder="Section title..."
                  value={newTitle}
                />
                <div className="flex justify-end gap-1">
                  <Button onClick={() => setIsAdding(false)} size="xs" variant="ghost">
                    Cancel
                  </Button>
                  <Button onClick={handleAddSection} size="xs">
                    Add
                  </Button>
                </div>
              </div>
            )}

            {displaySections.map((section) => {
              const active = activeWiki === section.section;
              const Icon = section.icon;
              const statusConfig = STATUS_CONFIG[section.status] ?? STATUS_CONFIG.DRAFT;

              return (
                <div className="group relative" key={section.section}>
                  <button
                    className={cn(
                      "relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-smooth",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                    onClick={() => setActiveWiki(section.section)}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full gradient-accent" />
                    )}
                    <Icon
                      className={cn(
                        "shrink-0",
                        active ? "text-primary" : "text-muted-foreground/60"
                      )}
                      size={15}
                    />
                    <span className="flex-1 truncate">{section.title}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition-opacity",
                        statusConfig.bg,
                        statusConfig.color,
                        isEditor && !active ? "group-hover:opacity-0" : ""
                      )}
                    >
                      {statusConfig.label[0]}
                    </span>
                  </button>

                  {isEditor && (
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 bg-transparent opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-primary"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingSection({
                            section: section.section,
                            title: section.title,
                          });
                        }}
                        title="Edit section"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (confirm(`Delete section "${section.title}"?`)) {
                            // Switch away first so the editor unmounts cleanly before the
                            // section is removed from the cache, preventing the
                            // "Node.insertBefore" ProseMirror DOM sync error.
                            if (activeWiki === section.section) {
                              const next = displaySections.find(
                                (s) => s.section !== section.section
                              );
                              setActiveWiki(next?.section ?? "");
                            }
                            deleteWikiSection.mutate({ section: section.section });
                          }
                        }}
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

          <div className="space-y-1 border-t border-border/30 p-3">
            {Object.entries(STATUS_CONFIG).map(([key, value]) => (
              <div className="flex items-center gap-2 text-[10px]" key={key}>
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    key === "DRAFT" && "bg-muted-foreground",
                    key === "REVIEW" && "bg-chart-5",
                    key === "APPROVED" && "bg-chart-2"
                  )}
                />
                <span className="text-muted-foreground/50">{value.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {editingSection && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
              <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
                <h3 className="text-lg font-semibold">Rename Section</h3>
                <Input
                  autoFocus
                  onChange={(event) =>
                    setEditingSection((current) =>
                      current
                        ? { ...current, title: event.target.value }
                        : current
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleRenameSection();
                    if (event.key === "Escape") setEditingSection(null);
                  }}
                  placeholder="New title..."
                  value={editingSection.title}
                />
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setEditingSection(null)} variant="ghost">
                    Cancel
                  </Button>
                  <Button onClick={handleRenameSection}>Save Changes</Button>
                </div>
              </div>
            </div>
          )}

          {activeSection && (
            <div className="flex shrink-0 items-center justify-between border-b border-border/30 px-8 py-4">
              <div className="flex items-center gap-3">
                <activeSection.icon className="text-primary" size={18} />
                <h2 className="text-base font-semibold text-foreground">
                  {activeSection.title}
                </h2>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-semibold",
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
                  isAdmin={isEditor}
                  module={module}
                  onDirtyChange={setActiveSectionDirty}
                  section={activeSection}
                />
              </WikiEditorBoundary>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="space-y-2 text-center">
                  <FileText className="mx-auto text-muted-foreground/20" size={32} />
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
