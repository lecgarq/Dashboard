"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Family } from "@prisma/client";
import { Header } from "@/components/layout/Header";
import { KanbanBoard } from "@/components/families/KanbanBoard";
import { useRole } from "@/hooks/use-role";
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
import { trpc } from "@/lib/core/trpc";
import { CATEGORY_GROUPS, CATEGORY_GROUP_NAMES } from "@/lib/shared/categories";
import type { FamilyPhase } from "@/lib/shared/module-schemas";
import { Box, Filter, Plus } from "lucide-react";

const FamilyDetailPanel = dynamic(
  () =>
    import("@/components/families/FamilyDetailPanel").then(
      (module) => module.FamilyDetailPanel
    ),
  { ssr: false }
);

const ApsProjectBrowser = dynamic(
  () =>
    import("@/components/families/ApsProjectBrowser").then(
      (module) => module.ApsProjectBrowser
    ),
  { ssr: false }
);

const PHASES = [
  { key: "TODO", label: "To Do" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "REVIEW", label: "Review" },
  { key: "DONE", label: "Done" },
] as const;

const PHASE_INDEX: Record<FamilyPhase, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  REVIEW: 2,
  DONE: 3,
};

function sortFamilies(items: Family[]) {
  return [...items].sort((a, b) => {
    const phaseDiff = (PHASE_INDEX[a.phase as FamilyPhase] ?? 99) - (PHASE_INDEX[b.phase as FamilyPhase] ?? 99);
    if (phaseDiff !== 0) return phaseDiff;
    return a.phaseOrder - b.phaseOrder;
  });
}

function applyFamilyPhaseMove(
  families: Family[],
  id: string,
  newPhase: FamilyPhase,
  newOrder: number
) {
  const current = families.map((family) => ({ ...family }));
  const moved = current.find((family) => family.id === id);
  if (!moved) return families;

  const previousPhase = moved.phase as FamilyPhase;
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

  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("Generic Models");
  const [formPhase, setFormPhase] = useState<FamilyPhase>("TODO");
  const [formRequestDate, setFormRequestDate] = useState(
    new Date().toISOString().split("T")[0] ?? ""
  );
  const [formCompletionDate, setFormCompletionDate] = useState("");
  const [formDescription, setFormDescription] = useState("");

  function resetForm() {
    setFormName("");
    setFormCategory("Generic Models");
    setFormPhase("TODO");
    setFormRequestDate(new Date().toISOString().split("T")[0] ?? "");
    setFormCompletionDate("");
    setFormDescription("");
  }

  function handleCreate() {
    createFamily.mutate({
      name: formName,
      category: formCategory,
      phase: formPhase,
      requestDate: formRequestDate ? new Date(formRequestDate) : undefined,
      completionDate: formCompletionDate ? new Date(formCompletionDate) : undefined,
      description: formDescription || undefined,
    });
  }

  const filtered =
    categoryFilter === "ALL"
      ? families
      : families.filter((family) => family.category === categoryFilter);

  const usedCategories = [...new Set(families.map((family) => family.category))].sort();

  return (
    <div className="flex h-full flex-col">
      <Header title="Familias Parametricas" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/50 bg-card/30 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Filter className="text-muted-foreground" size={14} />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-[200px] border-border/50 bg-secondary/50 text-xs text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60 border-border bg-card">
                <SelectItem className="text-xs" value="ALL">
                  All Categories
                </SelectItem>
                {usedCategories.map((category) => (
                  <SelectItem className="text-xs" key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className="ml-1 text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "family" : "families"}
          </span>

          <Button
            className="h-8 gap-1.5 text-xs"
            onClick={() => setApsOpen(true)}
            size="sm"
            variant="outline"
          >
            <Box size={14} /> APS Project Files
          </Button>
          {apsOpen && <ApsProjectBrowser onClose={() => setApsOpen(false)} />}

          {isEditor && (
            <Dialog onOpenChange={setCreateOpen} open={createOpen}>
              <DialogTrigger asChild>
                <Button className="ml-auto h-8 gap-1.5 text-xs text-white gradient-accent hover:opacity-90 outline-none" size="sm">
                  <Plus size={14} /> Request Family
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md border-border bg-card text-foreground">
                <DialogHeader>
                  <DialogTitle>Request New Family</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Phase</label>
                    <Select
                      onValueChange={(value) => setFormPhase(value as FamilyPhase)}
                      value={formPhase}
                    >
                      <SelectTrigger className="h-10 border-border/50 bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PHASES.map((phase) => (
                          <SelectItem key={phase.key} value={phase.key}>
                            {phase.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Name *</label>
                    <Input
                      autoFocus
                      className="h-10 border-border/50 bg-secondary/50"
                      onChange={(event) => setFormName(event.target.value)}
                      placeholder="Family name"
                      value={formName}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Category *</label>
                    <Select onValueChange={setFormCategory} value={formCategory}>
                      <SelectTrigger className="h-10 border-border/50 bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72 border-border bg-card">
                        {CATEGORY_GROUP_NAMES.map((group) => (
                          <div key={group}>
                            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                              {group}
                            </div>
                            {CATEGORY_GROUPS[group].map((category) => (
                              <SelectItem className="pl-4 text-xs" key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        Request Date
                      </label>
                      <Input
                        className="h-10 border-border/50 bg-secondary/50"
                        onChange={(event) => setFormRequestDate(event.target.value)}
                        type="date"
                        value={formRequestDate}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        Target Completion
                      </label>
                      <Input
                        className="h-10 border-border/50 bg-secondary/50"
                        onChange={(event) => setFormCompletionDate(event.target.value)}
                        type="date"
                        value={formCompletionDate}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <textarea
                      className="w-full resize-none rounded-md border border-border/50 bg-secondary/50 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      onChange={(event) => setFormDescription(event.target.value)}
                      placeholder="Optional details..."
                      rows={2}
                      value={formDescription}
                    />
                  </div>

                  <Button
                    className="h-10 w-full text-white gradient-accent hover:opacity-90"
                    disabled={!formName.trim() || createFamily.isPending}
                    onClick={handleCreate}
                  >
                    {createFamily.isPending ? "Creating..." : "Create Family Request"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="flex-1 overflow-hidden p-4">
          <KanbanBoard
            families={filtered}
            onCardClick={(family) => setSelectedFamilyId(family.id)}
            onMoveFamily={async (id, newPhase, newOrder) => {
              await movePhase.mutateAsync({ id, newPhase, newOrder });
            }}
          />
        </div>
      </div>

      <FamilyDetailPanel
        family={selectedFamily}
        onClose={() => setSelectedFamilyId(null)}
        onUpdate={() => {
          if (selectedFamilyId) {
            void utils.families.getById.invalidate({ id: selectedFamilyId });
          }
        }}
        open={!!selectedFamilyId}
      />
    </div>
  );
}
