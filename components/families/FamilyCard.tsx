"use client";

import { cn } from "@/lib/utils";
import { type Phase } from "./KanbanBoard";
import { useRole } from "@/hooks/use-role";
import {
  CircleDot,
  Clock,
  CheckCircle2,
  Calendar,
  ChevronDown,
  Box,
  Loader2,
} from "lucide-react";

const PHASE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  TODO: { label: "To Do", color: "text-muted-foreground", bg: "bg-muted/50" },
  IN_PROGRESS: { label: "In Progress", color: "text-chart-1", bg: "bg-chart-1/10" },
  REVIEW: { label: "Review", color: "text-chart-5", bg: "bg-chart-5/10" },
  DONE: { label: "Done", color: "text-chart-2", bg: "bg-chart-2/10" },
};

const PHASES: Phase[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

interface FamilyCardProps {
  family: {
    id: string;
    name: string;
    category: string;
    phase: string;
    requestDate?: Date | string | null;
    completionDate?: Date | string | null;
    dueDate?: Date | string | null;
    isBlocked?: boolean;
    apsUrn?: string | null;
    apsStatus?: string | null;
  };
  onChangePhase: (id: string, phase: Phase) => void;
  onClick?: () => void;
  compact?: boolean;
}

export function FamilyCard({ family, onChangePhase, onClick, compact }: FamilyCardProps) {
  const { isEditor } = useRole();
  const phaseConf = PHASE_CONFIG[family.phase] ?? PHASE_CONFIG.TODO;

  function formatDate(d: Date | string | null | undefined) {
    if (!d) return null;
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "glass-card p-3 transition-smooth group",
        family.isBlocked && "border-destructive/30 opacity-70"
      )}
    >
      {/* Title + Category */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-sm font-medium text-foreground truncate"
          )}>
            {family.name}
          </p>
          <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
            {family.category}
          </p>
        </div>
        {family.apsStatus === "PROCESSING" ? (
          <Loader2 size={12} className="text-primary animate-spin shrink-0 mt-1" />
        ) : family.apsUrn ? (
          <Box size={12} className="text-primary/60 shrink-0 mt-1" />
        ) : null}
      </div>

      {/* Dates */}
      {!compact && (family.requestDate || family.completionDate) && (
        <div className="flex items-center gap-3 mb-2">
          {family.requestDate && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock size={10} /> {formatDate(family.requestDate)}
            </span>
          )}
          {family.completionDate && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar size={10} /> {formatDate(family.completionDate)}
            </span>
          )}
        </div>
      )}

      {/* Phase selector */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${phaseConf.bg} ${phaseConf.color}`}>
          {phaseConf.label}
        </span>
        {isEditor && (
          <div className="relative">
            <select
              value={family.phase}
              onChange={(e) => onChangePhase(family.id, e.target.value as Phase)}
              className="appearance-none text-[10px] bg-transparent text-muted-foreground/50 hover:text-foreground transition-smooth cursor-pointer pr-4 opacity-0 group-hover:opacity-100 focus:opacity-100 outline-none"
            >
              {PHASES.map((p) => (
                <option key={p} value={p} className="bg-card text-foreground">
                  {PHASE_CONFIG[p]?.label ?? p}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none opacity-0 group-hover:opacity-100 transition-smooth"
            />
          </div>
        )}
      </div>
    </div>
  );
}
