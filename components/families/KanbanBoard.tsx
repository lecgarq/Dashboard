"use client";

import { useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/core/utils";
import { FAMILY_PHASES, getPhaseMetadata } from "@/lib/shared/family-config";
import type { FamilyPhase } from "@/lib/shared/family-config";
import type { Family, FamilyAttachment, FamilyChangelog, FamilyDeliverable } from "@prisma/client";

export type FamilyWithRelations = Family & {
  attachments: FamilyAttachment[];
  deliverables: FamilyDeliverable[];
  changelog: FamilyChangelog[];
};


const PHASES = FAMILY_PHASES.map(id => ({ id, ...getPhaseMetadata(id) }));
export type Phase = FamilyPhase;

interface KanbanBoardProps {
  families: Family[];
  onMoveFamily: (id: string, newPhase: Phase, newOrder: number) => Promise<void>;
  onCardClick: (family: Family) => void;
}

const CARD_ESTIMATE_SIZE = 88;

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
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: families.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_ESTIMATE_SIZE,
    overscan: 5,
  });

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

      {/* Virtualized cards */}
      {!collapsed && (
        <SortableContext items={families.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div
            ref={parentRef}
            className="flex-1 p-2 min-h-16 overflow-y-auto"
            style={{ maxHeight: "70vh" }}
            data-phase={phase.id}
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const family = families[virtualRow.index]!;
                return (
                  <div
                    key={family.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="mb-2">
                      <FamilyCard
                        family={family}
                        onClick={() => onCardClick(family)}
                        onChangePhase={(id, ph) => onMoveFamily(id, ph as Phase, virtualRow.index)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SortableContext>
      )}
    </div>
  );
}

export function KanbanBoard({ families, onMoveFamily, onCardClick }: KanbanBoardProps) {
  const { isAdmin } = useRole();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const byPhase = useCallback(
    (phaseId: string) => families.filter((f) => f.phase === phaseId),
    [families]
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(_event: DragOverEvent) {}

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const targetFamily = families.find((f) => f.id === over.id);
    if (!targetFamily) return;

    const sourceFamily = families.find((f) => f.id === active.id);
    if (!sourceFamily) return;

    void onMoveFamily(sourceFamily.id, targetFamily.phase as Phase, targetFamily.phaseOrder);
  }

  const activeFamily = families.find((f) => f.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PHASES.map((phase) => (
          <DroppableColumn
            key={phase.id}
            phase={phase}
            families={byPhase(phase.id)}
            collapsed={!!collapsed[phase.id]}
            onToggleCollapse={() =>
              setCollapsed((prev) => ({ ...prev, [phase.id]: !prev[phase.id] }))
            }
            onCardClick={onCardClick}
            onMoveFamily={onMoveFamily}
          />
        ))}
      </div>

      <DragOverlay>
        {activeFamily ? (
          <FamilyCard
            family={activeFamily}
            onClick={() => {}}
            onChangePhase={() => {}}
          />
        ) : null}
      </DragOverlay>

      {!isAdmin && (
        <div className="mt-4 text-xs text-gray-400 text-center">
          View-only mode — admin required to move cards
        </div>
      )}
    </DndContext>
  );
}





