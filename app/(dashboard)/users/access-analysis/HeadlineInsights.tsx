// HeadlineInsights.tsx
"use client";

import { chartColor } from "./chartColors";
import type { InsightSeverity } from "./ChartPanel";

export interface HeadlineInsightItem {
  id: string;
  label: string;
  text: string;
  severity: InsightSeverity;
}

export interface HeadlineInsightsProps {
  items: HeadlineInsightItem[];
  onSelect?: (id: string) => void;
}

export function HeadlineInsights({ items, onSelect }: HeadlineInsightsProps) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect?.(item.id)}
          className="group flex flex-col gap-1 rounded-lg border bg-card p-4 text-left shadow-[var(--shadow-soft-sm)] transition-colors hover:bg-muted/40"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: chartColor(item.severity) }}
            />
            {item.label}
          </span>
          <span className="text-sm font-medium text-foreground/90">{item.text}</span>
        </button>
      ))}
    </div>
  );
}
