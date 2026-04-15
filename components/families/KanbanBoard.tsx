"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FamilyCard } from "./FamilyCard";
import { useRole } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Family, FamilyAttachment, FamilyChangelog, FamilyDeliverable } from "@prisma/client";

export type FamilyWithRelations = Family & {
  attachments: FamilyAttachment[];
  deliverables: FamilyDeliverable[];
  changelog: FamilyChangelog[];
};

const PHASES = [
  { id: "TODO", label: "To Do", color: "bg-gray-100 text-gray-600" },
  { id: "IN_PROGRESS", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { id: "REVIEW", label: "Review", color: "bg-amber-100 text-amber-700" },
  { id: "DONE", label: "Done", color: "bg-green-100 text-green-700" },
] as const;

export type Phase = (typeof PHASES)[number]["id"];

interface KanbanBoardProps {
  families: Family[];
  onMoveFamily: (id: string, newPhase: Phase, newOrder: number) => Promise<void>;
  onCardClick: (family: Family) => void;
}

function DroppableColumn({
  phase,
  families,
  collapsed,
  onToggleCollapse,
  onCardClick,
  onMoveFamily,
}: {
  phase: (typeof PHASES)[number];
  families: Family[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCardClick: (f: Family) => void;
  onMoveFamily: (id: string, newPhase: Phase, newOrder: number) => Promise<void>;
}) {
  return (
    <div
      className={cn(
        "flex flex-col bg-gray-50 border border-gray-200 rounded-lg transition-all",
        collapsed ? "w-10" : "min-w-52 w-64"
      )}
    >
      {/* Column header */}
      <div
        className={cn(
          "flex items-center gap-2 p-2 border-b border-gray-200 cursor-pointer select-none",
          collapsed && "flex-col py-3"
        )}
        onClick={onToggleCollapse}
      >
        {collapsed ? (
          <span className="[writing-mode:vertical-rl] text-xs font-medium text-gray-600 rotate-180">
            {phase.label} ({families.length})
          </span>
        ) : (
          <>
            <Badge className={`text-xs px-1.5 py-0 ${phase.color}`}>{phase.label}</Badge>
            <span className="text-xs text-gray-400 ml-auto">{families.length}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </>
        )}
      </div>

      {/* Cards */}
      {!collapsed && (
        <SortableContext items={families.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="flex-1 p-2 space-y-2 min-h-16" data-phase={phase.id}>
            {families.map((family) => (
              <FamilyCard 
                key={family.id} 
                family={family} 
                onClick={() => onCardClick(family)} 
                onChangePhase={(id, ph) => onMoveFamily(id, ph as Phase, family.phaseOrder)}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}


