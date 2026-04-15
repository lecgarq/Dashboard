"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Family } from "@prisma/client";
import { useRole } from "@/hooks/use-role";
import { Header } from "@/components/layout/Header";
import { FamilyCard } from "@/components/families/FamilyCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { CATEGORY_GROUPS, CATEGORY_GROUP_NAMES } from "@/lib/categories";
import {
  Plus,
  Filter,
  Box,
} from "lucide-react";

const FamilyDetailPanel = dynamic(
  () => import("@/components/families/FamilyDetailPanel").then((m) => m.FamilyDetailPanel),
  { ssr: false }
);

const ApsProjectBrowser = dynamic(
  () => import("@/components/families/ApsProjectBrowser").then((m) => m.ApsProjectBrowser),
  { ssr: false }
);

const PHASES = [
  { key: "TODO", label: "To Do" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "REVIEW", label: "Review" },
  { key: "DONE", label: "Done" },
];

const PHASE_COLORS: Record<string, string> = {
  TODO: "border-t-muted-foreground/50",
  IN_PROGRESS: "border-t-chart-1",
  REVIEW: "border-t-chart-5",
  DONE: "border-t-chart-2",
};

const PHASE_INDEX: Record<string, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  REVIEW: 2,
  DONE: 3,
};

function sortFamilies(items: Family[]) {
  return [...items].sort((a, b) => {
    const phaseDiff = (PHASE_INDEX[a.phase] ?? 99) - (PHASE_INDEX[b.phase] ?? 99);
    if (phaseDiff !== 0) return phaseDiff;
    return a.phaseOrder - b.phaseOrder;
  });
}

function applyFamilyPhaseMove(
  families: Family[],
  id: string,
  newPhase: string,
  newOrder: number
) {
  const current = families.map((family) => ({ ...family }));
  const moved = current.find((family) => family.id === id);
  if (!moved) return families;

  const previousPhase = moved.phase;
  const previousOrder = moved.phaseOrder;

  for (const family of current) {
    if (family.id === id) continue;

    if (previousPhase === newPhase) {
      if (newOrder > previousOrder) {
        if (
          family.phase === newPhase &&
          family.phaseOrder > previousOrder &&
          family.phaseOrder <= newOrder
        ) {
          family.phaseOrder -= 1;
        }
      } else if (
        family.phase === newPhase &&
        family.phaseOrder >= newOrder &&
        family.phaseOrder < previousOrder
      ) {
        family.phaseOrder += 1;
      }
      continue;
    }

    if (family.phase === previousPhase && family.phaseOrder > previousOrder) {
      family.phaseOrder -= 1;
    }
    if (family.phase === newPhase && family.phaseOrder >= newOrder) {
      family.phaseOrder += 1;
    }
  }

  moved.phase = newPhase;
  moved.phaseOrder = newOrder;

  return sortFamilies(current);
}

export default function FamiliesPage() {
  const { isEditor } = useRole();
  const utils = trpc.useUtils();
  const { data: families = [] } = trpc.families.getAll.useQuery();
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const { data: selectedFamily = null } = trpc.families.getById.useQuery(
    { id: selectedFamilyId! },
    { enabled: !!selectedFamilyId }
  );
  const createFamily = trpc.families.create.useMutation({
    onSuccess: (created) => {
      utils.families.getAll.setData(undefined, (current = []) =>
        sortFamilies([...current, created])
      );
      setCreateOpen(false);
      resetForm();
    },
  });
  const movePhase = trpc.families.movePhase.useMutation({
    onMutate: async (input) => {
      await utils.families.getAll.cancel();
      const previous = utils.families.getAll.getData();
      utils.families.getAll.setData(undefined, (current = []) =>
        applyFamilyPhaseMove(current, input.id, input.newPhase, input.newOrder)
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        utils.families.getAll.setData(undefined, context.previous);
      }
    },
    onSuccess: (updated) => {
      utils.families.getAll.setData(undefined, (current = []) =>
        sortFamilies(
          current.map((family) =>
            family.id === updated.id ? { ...family, ...updated } : family
          )
        )
      );
    },
  });


  const [createOpen, setCreateOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [apsOpen, setApsOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("Generic Models");
  const [formPhase, setFormPhase] = useState("TODO");
  const [formRequestDate, setFormRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [formCompletionDate, setFormCompletionDate] = useState("");
  const [formDescription, setFormDescription] = useState("");



  function resetForm() {
    setFormName("");
    setFormCategory("Generic Models");
    setFormPhase("TODO");
    setFormRequestDate(new Date().toISOString().split("T")[0]);
    setFormCompletionDate("");
    setFormDescription("");
  }

  function handleCreate() {
    createFamily.mutate({
      name: formName,
      category: formCategory,
      phase: formPhase as any,
      requestDate: formRequestDate ? new Date(formRequestDate) : undefined,
      completionDate: formCompletionDate ? new Date(formCompletionDate) : undefined,
      description: formDescription || undefined,
    });
  }

  function handleChangePhase(id: string, newPhase: string) {
    const count = families.filter((f) => f.phase === newPhase).length;
    movePhase.mutate({ id, newPhase: newPhase as any, newOrder: count });
  }

  const filtered = categoryFilter === "ALL"
    ? families
    : families.filter((f) => f.category === categoryFilter);



  // Unique categories used
  const usedCategories = [...new Set(families.map((f) => f.category))].sort();

  return (
    <div className="flex flex-col h-full">
      <Header title="Familias Paramétricas" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="border-b border-border/50 bg-card/30 backdrop-blur-sm px-6 py-3 flex items-center gap-3 flex-wrap shrink-0">

          {/* Category filter */}
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-muted-foreground" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-[200px] text-xs bg-secondary/50 border-border/50 text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border max-h-60">
                <SelectItem value="ALL" className="text-xs">All Categories</SelectItem>
                {usedCategories.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className="text-xs text-muted-foreground ml-1">
            {filtered.length} {filtered.length === 1 ? "family" : "families"}
          </span>

          {/* APS Project Browser */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setApsOpen(true)}
          >
            <Box size={14} /> APS Project Files
          </Button>
          {apsOpen && <ApsProjectBrowser onClose={() => setApsOpen(false)} />}

          {/* Create button */}
          {isEditor && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-auto h-8 text-xs gradient-accent text-white hover:opacity-90 gap-1.5 outline-none">
                  <Plus size={14} /> Request Family
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-card border-border text-foreground">
                <DialogHeader>
                  <DialogTitle>Request New Family</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Phase</label>
                    <Select value={formPhase} onValueChange={setFormPhase}>
                      <SelectTrigger className="h-10 bg-secondary/50 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PHASES.map((p) => (
                          <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">

                    <label className="text-xs font-medium text-muted-foreground">Name *</label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Family name"
                      className="h-10 bg-secondary/50 border-border/50"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Category *</label>
                    <Select value={formCategory} onValueChange={setFormCategory}>
                      <SelectTrigger className="h-10 bg-secondary/50 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border max-h-72">
                        {CATEGORY_GROUP_NAMES.map((group) => (
                          <div key={group}>
                            <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                              {group}
                            </div>
                            {CATEGORY_GROUPS[group].map((cat) => (
                              <SelectItem key={cat} value={cat} className="text-xs pl-4">
                                {cat}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Request Date</label>
                      <Input
                        type="date"
                        value={formRequestDate}
                        onChange={(e) => setFormRequestDate(e.target.value)}
                        className="h-10 bg-secondary/50 border-border/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Target Completion</label>
                      <Input
                        type="date"
                        value={formCompletionDate}
                        onChange={(e) => setFormCompletionDate(e.target.value)}
                        className="h-10 bg-secondary/50 border-border/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Optional details..."
                      rows={2}
                      className="w-full rounded-md px-3 py-2 text-sm bg-secondary/50 border border-border/50 placeholder:text-muted-foreground outline-none resize-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    />
                  </div>

                  <Button
                    onClick={handleCreate}
                    className="w-full h-10 gradient-accent text-white hover:opacity-90"
                    disabled={!formName.trim() || createFamily.isPending}
                  >
                    {createFamily.isPending ? "Creating…" : "Create Family Request"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* ── Board View ── */}
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-3 h-full min-w-max">
              {PHASES.map((phase) => {
                const phaseItems = filtered.filter((f) => f.phase === phase.key);
                return (
                  <div
                    key={phase.key}
                    className={`w-[260px] flex flex-col rounded-xl glass-card border-t-2 ${PHASE_COLORS[phase.key] ?? ""} shrink-0`}
                  >
                    {/* Column header */}
                    <div className="px-3 py-2.5 border-b border-border/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{phase.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          {phaseItems.length}
                        </span>
                      </div>
                      {phase.key === "DONE" && isEditor && (
                        <Button 
                          size="sm" 
                          className="h-6 text-[10px] gradient-accent text-white ml-2"
                          onClick={() => {
                            setFormPhase("DONE");
                            setCreateOpen(true);
                          }}
                        >
                          <Plus size={12} className="mr-1" />
                          Upload DONE
                        </Button>
                      )}
                    </div>
                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {phaseItems.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-[10px] text-muted-foreground/30">No families</p>
                        </div>
                      ) : (
                        phaseItems.map((fam) => (
                          <FamilyCard
                            key={fam.id}
                            family={fam}
                            onChangePhase={handleChangePhase}
                            onClick={() => setSelectedFamilyId(fam.id)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      </div>

      <FamilyDetailPanel
        open={!!selectedFamilyId}
        family={selectedFamily}
        onClose={() => setSelectedFamilyId(null)}
        onUpdate={() => {
          if (selectedFamilyId) {
            utils.families.getById.invalidate({ id: selectedFamilyId });
          }
        }}
      />
    </div>
  );
}
