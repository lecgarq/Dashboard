"use client";

import { TIME_WINDOWS, type TimeWindow } from "@/lib/acc/accessAnalysisTypes";
import { useAccessAnalysis } from "./AccessAnalysisContext";
import { cn } from "@/lib/core/utils";

const LABELS: Record<TimeWindow, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
  "all": "All time",
};

export function TimeWindowSelector() {
  const { window, setWindow } = useAccessAnalysis();
  return (
    <div className="inline-flex rounded-md border border-input bg-background p-0.5 text-sm" role="group">
      {TIME_WINDOWS.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => setWindow(w)}
          className={cn(
            "px-3 py-1 rounded-sm transition-colors",
            window === w ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
          aria-pressed={window === w}
        >
          {LABELS[w]}
        </button>
      ))}
    </div>
  );
}
