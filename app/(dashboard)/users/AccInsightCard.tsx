"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/core/utils";

export type InsightCardVariant = "amber" | "blue" | "violet" | "red";

const VARIANT_CLASSES: Record<InsightCardVariant, { border: string; badge: string }> = {
  amber: {
    border: "border-amber-500/25",
    badge: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
  },
  blue: {
    border: "border-blue-500/25",
    badge: "bg-blue-500/15 text-blue-400 border border-blue-500/25",
  },
  violet: {
    border: "border-violet-500/25",
    badge: "bg-violet-500/15 text-violet-400 border border-violet-500/25",
  },
  red: {
    border: "border-red-500/25",
    badge: "bg-red-500/15 text-red-400 border border-red-500/25",
  },
};

interface AccInsightCardProps {
  title: string;
  count: number;
  description: string;
  variant: InsightCardVariant;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function AccInsightCard({
  title,
  count,
  description,
  variant,
  isExpanded,
  onToggle,
  children,
}: AccInsightCardProps) {
  const colors = VARIANT_CLASSES[variant];
  const hasItems = count > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card transition-all",
        hasItems ? colors.border : "border-border/30",
      )}
    >
      <button
        onClick={onToggle}
        disabled={!hasItems}
        className="w-full flex items-center gap-3 px-5 py-4 text-left disabled:cursor-default"
      >
        <span className="text-muted-foreground shrink-0">
          {isExpanded && hasItems ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className={cn("text-xs font-bold tabular-nums px-2 py-0.5 rounded-full", colors.badge)}>
              {count}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        </div>
      </button>

      {isExpanded && hasItems && (
        <div className="px-5 pb-5 border-t border-border/30 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}
